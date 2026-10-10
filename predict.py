#!/usr/bin/env python3
"""ILI% 短期预测 + 季节高峰统计，输出 data/forecast.json。

方法（纯统计外推，仅标准库）：
- 季节基线：历史同一 ISO 周的指数加权平均（年份权重半衰期 1 年），±2 周循环平滑
- 异常回归：最近 4 周观测相对基线的偏差，按 0.65^h 随预见期衰减
- 置信带：历史残差标准差随预见期放大，取 80% 区间（±1.28σ）
历史少于 30 周的序列不预测；少于 90 周或不足 2 个完整季节的标记 low_confidence。
"""

import csv
import json
import math
import os
import statistics
from datetime import date, timedelta

from fetch_common import ARCHIVE_DIR, DATA_DIR

ILI_CSV = os.path.join(ARCHIVE_DIR, "ili-weekly.csv")
OUT = os.path.join(DATA_DIR, "forecast.json")

HORIZON = 4
DECAY = 0.65
HALF_LIFE_YEARS = 1.0
SMOOTH_W = (1, 2, 3, 2, 1)
SCOPES = {"south": "南方", "north": "北方", "national": "全国"}


def week_date(y, w):
    return date.fromisocalendar(int(y), int(w), 1)


def add_weeks(y, w, n):
    iso = (week_date(y, w) + timedelta(weeks=n)).isocalendar()
    return iso[0], iso[1]


def load_history():
    hist = {}
    try:
        with open(ILI_CSV, encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                try:
                    y, w, pct = int(r["year"]), int(r["week"]), float(r["pct"])
                    week_date(y, w)
                except (ValueError, KeyError, TypeError):
                    continue
                hist.setdefault(r["scope"], {})[(y, w)] = pct
    except OSError:
        pass
    return hist


def climatology(points):
    """{(y,w): pct} → (mu, sd, nobs)：周 1..52 的加权基线、离散度、样本年数。"""
    ymax = max(y for y, _ in points)
    raw = {}
    for w in range(1, 53):
        obs = [(y, v) for (y, ww), v in points.items() if ww == w or (ww == 53 and w == 52)]
        if not obs:
            continue
        ws = [0.5 ** ((ymax - y) / HALF_LIFE_YEARS) for y, _ in obs]
        sw = sum(ws)
        mean = sum(wt * v for wt, (_, v) in zip(ws, obs)) / sw
        var = sum(wt * (v - mean) ** 2 for wt, (_, v) in zip(ws, obs)) / sw
        raw[w] = (mean, math.sqrt(var), len(obs))
    mu, sd, nobs = {}, {}, {}
    for w in range(1, 53):
        num = den = 0.0
        for i, off in enumerate((-2, -1, 0, 1, 2)):
            ww = (w + off - 1) % 52 + 1
            if ww in raw:
                num += SMOOTH_W[i] * raw[ww][0]
                den += SMOOTH_W[i]
        if den:
            mu[w] = num / den
    for w, (_, s, n) in raw.items():
        sd[w] = s
        nobs[w] = n
    return mu, sd, nobs


def season_stats(points):
    """流感季 = 当年 W27 至次年 W26（冬峰落在同一季内）。仅统计周数足够的季。"""
    seasons = {}
    for (y, w), v in points.items():
        sy = y if w >= 27 else y - 1
        seasons.setdefault(sy, []).append((y, w, v))
    out = []
    for sy in sorted(seasons):
        pts = seasons[sy]
        if len(pts) < 26:
            continue
        py, pw, pv = max(pts, key=lambda t: t[2])
        out.append({"season": "%d–%02d" % (sy, (sy + 1) % 100),
                    "peak_year": py, "peak_week": pw, "peak_pct": pv})
    return out


def forecast_scope(points):
    if len(points) < 30:
        return None
    ly, lw = max(points, key=lambda k: week_date(*k))
    mu, sd, nobs = climatology(points)
    if not mu:
        return None
    resid = [v - mu[min(w, 52)] for (_, w), v in points.items() if min(w, 52) in mu]
    resid_sd = statistics.pstdev(resid) if len(resid) > 1 else 0.5
    recent = sorted(points, key=lambda k: week_date(*k))[-4:]
    anomaly = sum(points[k] - mu.get(min(k[1], 52), points[k]) for k in recent) / len(recent)
    fc = []
    for h in range(1, HORIZON + 1):
        fy, fw = add_weeks(ly, lw, h)
        base = mu.get(min(fw, 52))
        if base is None:
            break
        est = max(base + anomaly * DECAY ** h, 0.1)
        sigma = resid_sd * (1 + 0.3 * h)
        fc.append({"year": fy, "week": fw, "pct": round(est, 1),
                   "lo": round(max(est - 1.28 * sigma, 0), 1),
                   "hi": round(est + 1.28 * sigma, 1)})
    if not fc:
        return None
    seasons = season_stats(points)
    return {
        "from": {"year": ly, "week": lw},
        "current": points[(ly, lw)],
        "baseline_now": round(mu.get(min(lw, 52), points[(ly, lw)]), 1),
        "points": fc,
        "low_confidence": len(points) < 90 or len(seasons) < 2,
        "seasons": seasons,
    }


def build_forecast():
    hist = load_history()
    regions = {}
    for scope in SCOPES:
        r = forecast_scope(hist.get(scope) or {})
        if r:
            regions[scope] = r
    if not regions:
        print("预测: 历史数据不足，跳过")
        return None
    out = {
        "generated": date.today().isoformat(),
        "horizon": HORIZON,
        "method": "季节基线（历史同周指数加权，半衰期1年，±2周平滑）+ 近期异常按 0.65^h 衰减回归；"
                  "区间为 80% 置信带。纯统计外推，仅供参考，不构成医疗建议。",
        "regions": regions,
    }
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    for scope, r in regions.items():
        print("预测 %s: 自 %dW%d 起 %d 周 → %s%s" % (
            SCOPES[scope], r["from"]["year"], r["from"]["week"], len(r["points"]),
            " ".join("%g" % p["pct"] for p in r["points"]),
            "（低置信度）" if r["low_confidence"] else ""))
    return out


if __name__ == "__main__":
    build_forecast()
