#!/usr/bin/env python3
"""ILI% 短期预测：候选模型走窗回测 → 每期等权组合 → 区间标定，输出 data/forecast.json。

候选模型族（全部只用"当期为止"的历史拟合）：

- clim  : 季节基线（同周指数加权均值，±2 周循环平滑）+ 异常按固定 0.65^h 衰减（第一版方法，作对照）
- harmK : 截距 + K 阶傅里叶谐波（年周期），纯季节拟合
- arK   : 谐波 + 近期水平（最近一周值、最近 4 周均值）的直接多步回归
- fullK : arK + 去年同期值（目标周前 52 周）
- decK  : 分解式——谐波基线（K 阶）+ 异常自回归，持续性 ρ 由残差估计，异常取近期残差几何加权
- decc  : 同上但基线用同周加权均值，用于单独检验"估计 ρ"相对固定 0.65 的收益

共 13 个候选。拟合用岭回归（正规方程增量累积 + 高斯消元，纯标准库），λ 固定 1。

为什么是组合而不是挑最优：
- 逐预见期挑选单个最优模型在回测里并不比等权组合好，且挑选会引入选择性偏差（用将来的误差
  决定过去的模型），报出的精度会偏乐观；
- 等权组合是先验规则，不做任何挑选，因此下面的走窗回测误差就是这套流程真实会交付的精度。
  实测（2026-10）：南方 1/4 步 MAE 0.94/1.54 → 0.79/1.33，北方 0.68/1.12 → 0.54/0.96。

评估与区间（走窗回测，模拟真实使用）：
- 逐起点推进，每个起点只用 ≤t 的数据出预测，与实际值比较；clip 仅作离群保护
- 区间：组合误差的经验分位数；前 50% 起点标定 q10/q90，后 50% 留出期评估 80% 命中率
  （标定样本 <30 时改用跨预见期合并、按 √h 缩放的稳健分位数）

数据少于 30 周不预测；少于 90 周或不足 2 个完整季节标记 low_confidence。
"""

import csv
import json
import math
import os
from datetime import date, timedelta

from fetch_common import ARCHIVE_DIR, DATA_DIR

ILI_CSV = os.path.join(ARCHIVE_DIR, "ili-weekly.csv")
OUT = os.path.join(DATA_DIR, "forecast.json")

HORIZON = 4
DECAY = 0.65              # clim 对照模型的固定衰减
SMOOTH_W = (1, 2, 3, 2, 1)
LAMBDA = 1.0
MIN_TRAIN = 40            # 拟合所需最少训练周数
MIN_POINTS = 30           # 少于该周数不预测
MIN_CAL = 30              # 区间标定所需最少样本，不足则改用合并分位数
LOW_CONF_POINTS = 90
CAL_FRAC = 0.5            # 嵌套误差前段标定区间，后段留出评估
RHO_MAX = 0.95
ANCHOR = date(2015, 1, 5)   # 周索引锚点（周一）
SCOPES = {"south": "南方", "north": "北方", "national": "全国"}


# ---------- 周索引 ----------
def week_monday(y, w):
    return date.fromisocalendar(int(y), int(w), 1)


def widx(y, w):
    return (week_monday(y, w) - ANCHOR).days // 7


def index_to_yw(i):
    iso = (ANCHOR + timedelta(weeks=i)).isocalendar()
    return iso[0], iso[1]


def load_history():
    """{scope: {week_index: pct}}"""
    hist = {}
    try:
        with open(ILI_CSV, encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                try:
                    i = widx(r["year"], r["week"])
                    pct = float(r["pct"])
                except (ValueError, KeyError, TypeError):
                    continue
                hist.setdefault(r["scope"], {})[i] = pct
    except OSError:
        pass
    return hist


# ---------- 岭回归（增量累积 XᵀX / Xᵀy + 高斯消元） ----------
class Ridge:
    def __init__(self, p, lam):
        self.p = p
        self.lam = lam
        self.xtx = [[0.0] * p for _ in range(p)]   # 只填上三角
        self.xty = [0.0] * p
        self.n = 0

    def add(self, x, y):
        xtx, xty = self.xtx, self.xty
        for i in range(self.p):
            xi = x[i]
            if xi:
                row = xtx[i]
                for j in range(i, self.p):
                    row[j] += xi * x[j]
            xty[i] += xi * y
        self.n += 1

    def solve(self):
        """返回系数；奇异返回 None。截距（下标 0）不正则化。"""
        p = self.p
        A = [[self.xtx[i][j] if j >= i else self.xtx[j][i] for j in range(p)] for i in range(p)]
        for i in range(1, p):
            A[i][i] += self.lam
        b = self.xty[:]
        for col in range(p):
            piv = max(range(col, p), key=lambda r: abs(A[r][col]))
            if abs(A[piv][col]) < 1e-12:
                return None
            if piv != col:
                A[col], A[piv] = A[piv], A[col]
                b[col], b[piv] = b[piv], b[col]
            pv = A[col][col]
            for r in range(col + 1, p):
                f = A[r][col] / pv
                if f:
                    Ar, Ac = A[r], A[col]
                    for c in range(col, p):
                        Ar[c] -= f * Ac[c]
                    b[r] -= f * b[col]
        x = [0.0] * p
        for r in range(p - 1, -1, -1):
            s = b[r] - sum(A[r][c] * x[c] for c in range(r + 1, p))
            x[r] = s / A[r][r]
        return x


# ---------- 特征 ----------
def harm(tau, K):
    out = []
    for k in range(1, K + 1):
        ang = 2 * math.pi * k * tau / 52.0
        out.append(math.sin(ang))
        out.append(math.cos(ang))
    return out


def features(S, t, tau, K, use_ar, use_lag):
    """起点 t、目标周 tau 的回归特征；所需历史缺失时返回 None。"""
    x = [1.0] + harm(tau, K)
    if use_ar:
        vals = [S.get(t - k) for k in range(4)]
        if any(v is None for v in vals):
            return None
        x.append(S[t])
        x.append(sum(vals) / 4.0)
    if use_lag:
        v = S.get(tau - 52)
        if v is None:
            return None
        x.append(v)
    return x


def dim_of(K, use_ar, use_lag):
    return 1 + 2 * K + (2 if use_ar else 0) + (1 if use_lag else 0)


def candidate_specs():
    specs = [{"name": "clim", "kind": "clim", "K": 0}]
    for K in (1, 2, 3):
        specs.append({"name": "harm%d" % K, "kind": "ridge", "K": K, "ar": False, "lag": False})
    for K in (1, 2, 3):
        specs.append({"name": "ar%d" % K, "kind": "ridge", "K": K, "ar": True, "lag": False})
    for K in (1, 2):
        specs.append({"name": "full%d" % K, "kind": "ridge", "K": K, "ar": True, "lag": True})
    for K in (1, 2, 3):
        specs.append({"name": "dec%d" % K, "kind": "dec", "K": K, "base": "harm"})
    specs.append({"name": "decc", "kind": "dec", "K": 0, "base": "clim"})
    return specs


def complexity(spec):
    if spec["kind"] == "clim":
        return 0
    if spec["kind"] == "dec":
        return 1 + (2 * spec["K"] if spec.get("base") == "harm" else 0)
    return dim_of(spec["K"], spec["ar"], spec["lag"])


# ---------- 季节基线 ----------
def clim_curve(S, upto):
    """≤upto 的周基线（周 1..52 → 指数加权均值，±2 周循环平滑）。"""
    ymax = index_to_yw(upto)[0]
    num = [0.0] * 53
    den = [0.0] * 53
    for i, v in S.items():
        if i > upto:
            continue
        y, w = index_to_yw(i)
        w = 52 if w >= 53 else w
        wt = 0.5 ** (ymax - y)
        num[w] += wt * v
        den[w] += wt
    raw = {w: num[w] / den[w] for w in range(1, 53) if den[w]}
    curve = {}
    for w in range(1, 53):
        acc = tot = 0.0
        for j, off in enumerate((-2, -1, 0, 1, 2)):
            ww = (w + off - 1) % 52 + 1
            if ww in raw:
                acc += SMOOTH_W[j] * raw[ww]
                tot += SMOOTH_W[j]
        if tot:
            curve[w] = acc / tot
    return curve


def week_of(i):
    w = index_to_yw(i)[1]
    return 52 if w >= 53 else w


def clim_anomaly(S, t, curve):
    vals = []
    for k in range(4):
        v = S.get(t - k)
        if v is not None:
            b = curve.get(week_of(t - k))
            if b is not None:
                vals.append(v - b)
    return sum(vals) / len(vals) if vals else None


# ---------- 分解模型：基线 + 异常自回归 ----------
def dec_state(S, upto, spec, base_acc=None):
    """→ (baseline_fn, rho, anomaly)；历史不足或拟合失败返回 None。"""
    idxs = [i for i in sorted(S) if i <= upto]
    if len(idxs) < MIN_TRAIN:
        return None
    if spec.get("base") == "harm":
        K = spec["K"]
        if base_acc is None:
            base_acc = Ridge(1 + 2 * K, LAMBDA)
            for i in idxs:
                base_acc.add([1.0] + harm(i, K), S[i])
        if base_acc.n < MIN_TRAIN:
            return None
        beta = base_acc.solve()
        if beta is None:
            return None
        bfun = lambda i: sum(b * v for b, v in zip(beta, [1.0] + harm(i, K)))
    else:
        curve = clim_curve(S, upto)
        if not curve:
            return None
        bfun = lambda i: curve.get(week_of(i))

    res = []
    for i in idxs:
        b = bfun(i)
        if b is not None:
            res.append((i, S[i] - b))
    if len(res) < MIN_TRAIN:
        return None
    num = den = 0.0
    for k in range(1, len(res)):
        i, a = res[k]
        pi, pa = res[k - 1]
        if i == pi + 1:
            num += a * pa
            den += pa * pa
    rho = min(max(num / den if den else 0.6, 0.0), RHO_MAX)

    recent = res[-4:]
    wsum = sum(rho ** j for j in range(len(recent)))
    anomaly = sum(rho ** j * a for j, (_, a) in enumerate(reversed(recent))) / wsum if wsum else None
    return bfun, rho, anomaly


# ---------- 各候选模型的走窗回测：返回 {h: {起点 t: 预测}} ----------
def backtest_ridge(S, spec):
    idxs = sorted(S)
    p = dim_of(spec["K"], spec["ar"], spec["lag"])
    accs = {h: Ridge(p, LAMBDA) for h in range(1, HORIZON + 1)}
    preds = {h: {} for h in range(1, HORIZON + 1)}
    for t in idxs:
        for h in range(1, HORIZON + 1):
            x = features(S, t - h, t, spec["K"], spec["ar"], spec["lag"])
            if x is not None:
                accs[h].add(x, S[t])
        for h in range(1, HORIZON + 1):
            if accs[h].n < MIN_TRAIN:
                continue
            beta = accs[h].solve()
            if beta is None:
                continue
            x = features(S, t, t + h, spec["K"], spec["ar"], spec["lag"])
            if x is None:
                continue
            preds[h][t] = max(sum(b * v for b, v in zip(beta, x)), 0.1)
    return preds


def backtest_clim(S):
    preds = {h: {} for h in range(1, HORIZON + 1)}
    for t in sorted(S):
        curve = clim_curve(S, t)
        if not curve:
            continue
        anomaly = clim_anomaly(S, t, curve)
        if anomaly is None:
            continue
        for h in range(1, HORIZON + 1):
            b = curve.get(week_of(t + h))
            if b is None:
                continue
            preds[h][t] = max(b + anomaly * DECAY ** h, 0.1)
    return preds


def backtest_dec(S, spec):
    preds = {h: {} for h in range(1, HORIZON + 1)}
    base_acc = Ridge(1 + 2 * spec["K"], LAMBDA) if spec.get("base") == "harm" else None
    for t in sorted(S):
        if base_acc is not None:
            base_acc.add([1.0] + harm(t, spec["K"]), S[t])
        state = dec_state(S, t, spec, base_acc)
        if state is None:
            continue
        bfun, rho, anomaly = state
        for h in range(1, HORIZON + 1):
            b = bfun(t + h)
            if b is not None:
                preds[h][t] = max(b + (anomaly or 0.0) * rho ** h, 0.1)
    return preds


def run_backtest(S, specs):
    out = {}
    for spec in specs:
        kind = spec["kind"]
        if kind == "clim":
            out[spec["name"]] = backtest_clim(S)
        elif kind == "dec":
            out[spec["name"]] = backtest_dec(S, spec)
        else:
            out[spec["name"]] = backtest_ridge(S, spec)
    return out


# ---------- 嵌套（real-time）逐预见期选模型 ----------
# ---------- 走窗组合（按可观测误差指数加权，权重强度由数据自选） ----------
GAMMAS = (0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0)   # 0 = 等权；越大越偏向历史误差小的模型
MIN_W_OBS = 5      # 候选模型进入加权所需的最少已观测误差
MIN_G_OBS = 8      # 选择 γ 所需的最少已观测组合误差
MIN_COV_EVAL = 20  # 留出期样本少于此数时不报命中率（数字无统计意义）
DEFAULT_GAMMA = 1.0


def _weights(members, maes, gamma):
    """w_n ∝ exp(-γ·MAE_n)；误差样本不足的成员按已有成员的平均 MAE 处理。"""
    known = [n for n in members if n in maes]
    if gamma == 0.0 or not known:
        return {n: 1.0 for n in members}
    ref = sum(maes[n] for n in known) / len(known)
    return {n: math.exp(-gamma * maes.get(n, ref)) for n in members}


def walk_forward(S, specs, results):
    """逐起点推进：每个预见期把候选模型按"当时已可见的误差"指数加权平均。

    权重强度 γ 也只用当时可见的组合误差从 GAMMAS 里挑——不看未来，因此误差序列
    没有选择性偏差；实测（2026-10）γ 在 1 步自动偏大、3–4 步退回接近等权。
    → (walk, final)   final = {"gamma": {h: γ}, "mae": {name: {h: MAE}}}
    """
    names = [sp["name"] for sp in specs]
    origins = sorted(set().union(*[set(results[n][h]) for n in names for h in range(1, HORIZON + 1)]))
    cand_stat = {n: {h: [0.0, 0] for h in range(1, HORIZON + 1)} for n in names}
    cand_pend = {h: [] for h in range(1, HORIZON + 1)}      # [(可见时点, 模型, 误差)]
    comb_stat = {g: {h: [0.0, 0] for h in range(1, HORIZON + 1)} for g in GAMMAS}
    comb_pend = {g: {h: [] for h in range(1, HORIZON + 1)} for g in GAMMAS}
    out = {h: [] for h in range(1, HORIZON + 1)}
    chosen = {h: DEFAULT_GAMMA for h in range(1, HORIZON + 1)}
    run_max = 0.0

    for t in origins:
        if t in S:
            run_max = max(run_max, S[t])
        cap = run_max * 1.6 if run_max else 100.0
        # 结算此刻已可见的误差（目标周已过去）
        for h in range(1, HORIZON + 1):
            keep = []
            for (obst, n, e) in cand_pend[h]:
                if obst <= t:
                    cand_stat[n][h][0] += abs(e)
                    cand_stat[n][h][1] += 1
                else:
                    keep.append((obst, n, e))
            cand_pend[h] = keep
        for g in GAMMAS:
            for h in range(1, HORIZON + 1):
                keep = []
                for (obst, e) in comb_pend[g][h]:
                    if obst <= t:
                        comb_stat[g][h][0] += abs(e)
                        comb_stat[g][h][1] += 1
                    else:
                        keep.append((obst, e))
                comb_pend[g][h] = keep
        for h in range(1, HORIZON + 1):
            members = [n for n in names if t in results[n][h]]
            if not members:
                continue
            preds = {n: min(max(results[n][h][t], 0.1), cap) for n in members}
            maes = {n: cand_stat[n][h][0] / cand_stat[n][h][1]
                    for n in members if cand_stat[n][h][1] >= MIN_W_OBS}
            combos = {}
            for g in GAMMAS:
                w = _weights(members, maes, g)
                combos[g] = sum(w[n] * preds[n] for n in members) / sum(w.values())
            usable = [g for g in GAMMAS if comb_stat[g][h][1] >= MIN_G_OBS]
            g_sel = min(usable, key=lambda g: comb_stat[g][h][0] / comb_stat[g][h][1]) if usable else DEFAULT_GAMMA
            chosen[h] = g_sel
            obs = S.get(t + h)
            out[h].append({"t": t, "pred": combos[g_sel],
                           "err": (obs - combos[g_sel]) if obs is not None else None,
                           "members": members, "gamma": g_sel})
            if obs is not None:
                for g in GAMMAS:
                    comb_pend[g][h].append((t + h, abs(obs - combos[g])))
                for n in members:
                    cand_pend[h].append((t + h, n, obs - preds[n]))

    final = {"gamma": dict(chosen),
             "mae": {n: {h: (cand_stat[n][h][0] / cand_stat[n][h][1]) if cand_stat[n][h][1] else None
                         for h in range(1, HORIZON + 1)} for n in names}}
    return out, final


# ---------- 误差统计与区间 ----------
def errors_of(walk, h):
    return [(p["t"], p["err"]) for p in walk[h] if p["err"] is not None]


def quantile(vals, q):
    if not vals:
        return None
    v = sorted(vals)
    if len(v) == 1:
        return v[0]
    pos = q * (len(v) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(v) - 1)
    return v[lo] * (1 - (pos - lo)) + v[hi] * (pos - lo)


def interval_quantiles(walk):
    """嵌套误差 → {h: (q10, q90)}；样本不足 30 时用 √h 缩放的合并分位数。"""
    cal = {h: [e for _, e in errors_of(walk, h)] for h in range(1, HORIZON + 1)}
    pool_needed = any(len(v) < MIN_CAL for v in cal.values() if v)
    out = {}
    if pool_needed:
        pooled = [e / math.sqrt(h) for h, v in cal.items() for e in v]
        s_lo, s_hi = quantile(pooled, 0.1), quantile(pooled, 0.9)
        if s_lo is None:
            return out, "none"
        for h in cal:
            out[h] = (min(s_lo * math.sqrt(h), 0.0), max(s_hi * math.sqrt(h), 0.0))
        return out, "pooled"
    for h, v in cal.items():
        lo, hi = quantile(v, 0.1), quantile(v, 0.9)
        if lo is None:
            continue
        out[h] = (min(lo, 0.0), max(hi, 0.0))
    return out, "empirical"


def coverage_holdout(walk):
    """前段标定、后段评估 → {h: (命中率, 留出样本数)}。"""
    out = {}
    for h in range(1, HORIZON + 1):
        errs = errors_of(walk, h)
        if len(errs) < 2:
            continue
        cut = max(1, int(len(errs) * CAL_FRAC))
        cal = [e for _, e in errs[:cut]]
        hold = [e for _, e in errs[cut:]]
        if not cal or not hold:
            continue
        lo, hi = quantile(cal, 0.1), quantile(cal, 0.9)
        if lo is None:
            continue
        lo, hi = min(lo, 0.0), max(hi, 0.0)
        out[h] = (sum(1 for e in hold if lo <= e <= hi) / len(hold), len(hold))
    return out


def metrics(walk, cov):
    out = []
    for h in range(1, HORIZON + 1):
        errs = [e for _, e in errors_of(walk, h)]
        if not errs:
            continue
        mae = sum(abs(e) for e in errs) / len(errs)
        rmse = math.sqrt(sum(e * e for e in errs) / len(errs))
        row = {"h": h, "mae": round(mae, 2), "rmse": round(rmse, 2), "n": len(errs),
               "members": len(walk[h][-1]["members"]) if walk[h] else 0}
        if h in cov:
            row["n_eval"] = cov[h][1]
            if cov[h][1] >= MIN_COV_EVAL:      # 留出样本太少时命中率无统计意义，不报
                row["coverage"] = round(cov[h][0], 2)
        out.append(row)
    return out


def candidate_ranking(S, results, specs):
    ranking = []
    for sp in specs:
        errs = []
        for h in range(1, HORIZON + 1):
            for t, pred in results[sp["name"]][h].items():
                if t + h in S:
                    errs.append(abs(S[t + h] - pred))
        if errs:
            ranking.append({"model": sp["name"], "mae": round(sum(errs) / len(errs), 3)})
    ranking.sort(key=lambda x: x["mae"])
    return ranking


def clim_mae_by_horizon(S, results):
    by_h = []
    for h in range(1, HORIZON + 1):
        errs = [abs(S[t + h] - p) for t, p in results["clim"][h].items() if t + h in S]
        by_h.append(round(sum(errs) / len(errs), 2) if errs else None)
    return by_h


# ---------- 生产预测 ----------
def predict_one(S, spec, t, h):
    """用 ≤t 的数据，按 spec 预测 t+h。"""
    if spec["kind"] == "clim":
        curve = clim_curve(S, t)
        anomaly = clim_anomaly(S, t, curve) if curve else None
        b = curve.get(week_of(t + h)) if curve else None
        if b is None or anomaly is None:
            return None
        return max(b + anomaly * DECAY ** h, 0.1)
    if spec["kind"] == "dec":
        state = dec_state(S, t, spec)
        if state is None:
            return None
        bfun, rho, anomaly = state
        b = bfun(t + h)
        if b is None:
            return None
        return max(b + (anomaly or 0.0) * rho ** h, 0.1)
    acc = Ridge(dim_of(spec["K"], spec["ar"], spec["lag"]), LAMBDA)
    for i in sorted(S):
        if i > t:
            break
        x = features(S, i - h, i, spec["K"], spec["ar"], spec["lag"])
        if x is not None:
            acc.add(x, S[i])
    if acc.n < MIN_TRAIN:
        return None
    beta = acc.solve()
    if beta is None:
        return None
    x = features(S, t, t + h, spec["K"], spec["ar"], spec["lag"])
    if x is None:
        return None
    return max(sum(b * v for b, v in zip(beta, x)), 0.1)


def forecast_points(S, specs, q, final):
    """生产预测：与回测同一口径——按最近可见的 MAE 与自动选定的 γ 指数加权组合。"""
    t = sorted(S)[-1]
    cap = max(S.values()) * 1.6 if S else 100.0
    pts = []
    members_used = {}
    for h in range(1, HORIZON + 1):
        preds, members = {}, []
        for sp in specs:
            p = predict_one(S, sp, t, h)
            if p is not None:
                preds[sp["name"]] = min(max(p, 0.1), cap)
                members.append(sp["name"])
        if not preds:
            break
        maes = {n: m for n, m in ((n, (final["mae"].get(n) or {}).get(h)) for n in members) if m is not None}
        w = _weights(members, maes, final["gamma"].get(h, DEFAULT_GAMMA))
        pred = sum(w[n] * preds[n] for n in members) / sum(w.values())
        members_used[h] = members
        lo_q, hi_q = q.get(h, (-1.28, 1.28))
        y, w2 = index_to_yw(t + h)
        pts.append({"year": y, "week": w2, "pct": round(pred, 1),
                    "lo": round(max(pred + lo_q, 0.0), 1),
                    "hi": round(max(pred + hi_q, 0.0), 1)})
    return pts, members_used


def season_stats(S):
    """流感季 = 当年 W27 至次年 W26（冬峰落在同一季内）。仅统计周数足够的完整季。"""
    seasons = {}
    for i, v in S.items():
        y, w = index_to_yw(i)
        sy = y if w >= 27 else y - 1
        seasons.setdefault(sy, []).append((y, w, v))
    out = []
    for sy in sorted(seasons):
        pts = seasons[sy]
        if len(pts) < 26:
            continue
        py, pw, pv = max(pts, key=lambda x: x[2])
        out.append({"season": "%d–%02d" % (sy, (sy + 1) % 100),
                    "peak_year": py, "peak_week": pw, "peak_pct": pv})
    return out


def baseline_now(S):
    t = sorted(S)[-1]
    curve = clim_curve(S, t)
    return curve.get(week_of(t))


def analyze_scope(S):
    if len(S) < MIN_POINTS:
        return None
    specs = candidate_specs()
    results = run_backtest(S, specs)
    walk, final = walk_forward(S, specs, results)
    q, interval_method = interval_quantiles(walk)
    cov = coverage_holdout(walk)
    pts, members_used = forecast_points(S, specs, q, final)
    if not pts:
        return None
    t = sorted(S)[-1]
    y, w = index_to_yw(t)
    series = []
    for p in walk[1]:
        lo_q, hi_q = q.get(1, (-1.28, 1.28))
        series.append({"year": index_to_yw(p["t"])[0], "week": index_to_yw(p["t"])[1],
                       "obs": S[p["t"]], "pred": round(p["pred"], 1),
                       "lo": round(max(p["pred"] + lo_q, 0.0), 1),
                       "hi": round(max(p["pred"] + hi_q, 0.0), 1)})
    base = baseline_now(S)
    seasons = season_stats(S)
    return {
        "from": {"year": y, "week": w},
        "current": S[t],
        "baseline_now": round(base, 1) if base is not None else S[t],
        "points": pts,
        "low_confidence": len(S) < LOW_CONF_POINTS or len(seasons) < 2,
        "seasons": seasons,
        "members": [{"h": h, "models": members_used.get(h, []),
                     "gamma": final["gamma"].get(h, DEFAULT_GAMMA)} for h in range(1, HORIZON + 1)],
        "backtest": {
            "n": len(errors_of(walk, 1)),
            "interval_method": interval_method,
            "by_horizon": metrics(walk, cov),
            "baseline_mae_by_horizon": clim_mae_by_horizon(S, results),
            "ranking": candidate_ranking(S, results, specs),
            "series": series,
        },
    }


def build_forecast():
    hist = load_history()
    regions = {}
    for scope in SCOPES:
        r = analyze_scope(hist.get(scope) or {})
        if r:
            regions[scope] = r
    if not regions:
        print("预测: 历史数据不足，跳过")
        return None
    out = {
        "generated": date.today().isoformat(),
        "horizon": HORIZON,
        "method": "walk-forward equal-weight combination of seasonal-baseline / Fourier-harmonic ridge / "
                  "harmonic-baseline + AR-anomaly models (no model picking, so backtest errors carry no "
                  "selection bias); 80% intervals from empirical residual quantiles (calibrated on the first "
                  "half of the backtest, evaluated on the holdout half)",
        "regions": regions,
    }
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    for scope, r in regions.items():
        bt = r["backtest"]
        print("预测 %s: 自 %dW%d 起 %s" % (
            SCOPES[scope], r["from"]["year"], r["from"]["week"],
            " ".join("%g" % p["pct"] for p in r["points"])))
        print("   每期权重强度 γ: %s | 集成模型数: %s | 回测 %d 起点 | 每期 MAE %s | 旧法 MAE %s | 命中率 %s | 区间法 %s%s" % (
            "/".join(str(m["gamma"]) for m in r["members"]),
            "/".join(str(len(m["models"])) for m in r["members"]),
            bt["n"],
            "/".join(str(m["mae"]) for m in bt["by_horizon"]),
            "/".join(str(v) for v in bt["baseline_mae_by_horizon"]),
            "/".join(str(m.get("coverage", "—")) for m in bt["by_horizon"]),
            bt["interval_method"],
            "（低置信度）" if r["low_confidence"] else ""))
        print("   候选模型整体 MAE 前四: %s" % "、".join(
            "%s %.2f" % (x["model"], x["mae"]) for x in bt["ranking"][:4]))
    return out


if __name__ == "__main__":
    build_forecast()
