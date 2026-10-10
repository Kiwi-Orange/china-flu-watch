#!/usr/bin/env python3
"""主编排：抓取两个全国级周报源 + 已启用的城市级源，输出 data/latest.json、
data/trends.json 并维护 data/archive/ 下的 CSV 长期归档。

降级策略（沿用花粉项目原则）：
- 任一源失败 → 沿用上一份 latest.json 中对应部分，并标记 stale
- 全部失败 → 非零码退出，不覆盖旧数据
- 归档 CSV 按 (year, week, ...) 去重合并，原子重写

城市级源为可选模块 fetch_cities.py（香港/上海/广东/重庆等），不存在或失败不影响主流程。
"""

import csv
import importlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import fetch_cnic
import fetch_sentinel
from fetch_common import ARCHIVE_DIR, DATA_DIR, ROOT

BJT = timezone(timedelta(hours=8))
OUT_LATEST = os.path.join(DATA_DIR, "latest.json")
OUT_TRENDS = os.path.join(DATA_DIR, "trends.json")

ILI_CSV = os.path.join(ARCHIVE_DIR, "ili-weekly.csv")
PATHOGEN_CSV = os.path.join(ARCHIVE_DIR, "sentinel-pathogens.csv")
LAB_CSV = os.path.join(ARCHIVE_DIR, "lab-weekly.csv")
OUTBREAK_CSV = os.path.join(ARCHIVE_DIR, "outbreaks-weekly.csv")
CITY_TOP_CSV = os.path.join(ARCHIVE_DIR, "city-weekly-top.csv")
CITY_MONTH_CSV = os.path.join(ARCHIVE_DIR, "city-monthly-cases.csv")

# ili-weekly.csv 的 source 列优先级：本周值 > 前一周值 > 往年同期对照值
ILI_PRIORITY = {"current": 3, "prev_week": 2, "comparison": 1}


def now_bjt():
    return datetime.now(BJT).strftime("%Y-%m-%d %H:%M:%S +08:00")


def load_previous():
    try:
        with open(OUT_LATEST, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def atomic_write(path, content):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    os.replace(tmp, path)


def read_csv_rows(path):
    try:
        with open(path, encoding="utf-8", newline="") as f:
            return list(csv.reader(f))
    except OSError:
        return []


def _sort_key(row, idx):
    """排序键：数值列按数值排，其余按字符串排（新旧行类型混杂时安全）。"""
    key = []
    for i in idx:
        v = row[i]
        try:
            key.append((0, int(v), ""))
        except (TypeError, ValueError):
            key.append((1, 0, str(v)))
    return tuple(key)


def merge_csv(path, header, key_idx, new_rows, sort_idx=None):
    """按键列去重合并（新行覆盖同键旧行），写回整表。sort_idx 指定排序列。"""
    rows = read_csv_rows(path)
    if rows and rows[0] == header:
        rows = rows[1:]
    table = {tuple(r[i] for i in key_idx): r for r in rows if len(r) == len(header)}
    for r in new_rows:
        table[tuple(str(r[i]) for i in key_idx)] = ["" if v is None else str(v) for v in r]
    out = list(table.values())
    if sort_idx is not None:
        out.sort(key=lambda r: _sort_key(r, sort_idx))
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(out)
    atomic_write(path, buf.getvalue())
    return len(out)


def merge_ili(new_rows):
    """ILI 归并不简单覆盖：source 列优先级高的胜出（本周值覆盖对照值）。"""
    header = ["year", "week", "scope", "pct", "source"]
    rows = read_csv_rows(ILI_CSV)
    if rows and rows[0] == header:
        rows = rows[1:]
    table = {}
    for r in rows:
        if len(r) == len(header):
            table[(r[0], r[1], r[2])] = r
    for r in new_rows:
        key = (str(r[0]), str(r[1]), r[2])
        old = table.get(key)
        if old is None or ILI_PRIORITY.get(r[4], 0) >= ILI_PRIORITY.get(old[4], 0):
            table[key] = [str(r[0]), str(r[1]), r[2], str(r[3]), r[4]]
    out = sorted(table.values(), key=lambda r: (r[0], int(r[1]), r[2]))
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(out)
    atomic_write(ILI_CSV, buf.getvalue())
    return len(out)


def archive_sentinel(d):
    """哨点源归档：病原体阳性率表 + 全国 ILI%（current）。"""
    rows = [[d["year"], d["week"], p["name"], p.get("outpatient"), p.get("outpatient_wow"),
             p.get("inpatient"), p.get("inpatient_wow")] for p in d.get("pathogens", [])]
    n = merge_csv(PATHOGEN_CSV,
                  ["year", "week", "pathogen", "outpatient_pct", "outpatient_wow",
                   "inpatient_pct", "inpatient_wow"],
                  key_idx=[0, 1, 2], new_rows=rows, sort_idx=[0, 1, 2])
    ili_rows = []
    for scope, val in (("national", d.get("ili_pct_national")),
                       ("south", d.get("ili_pct_south")),
                       ("north", d.get("ili_pct_north"))):
        if val is not None:
            ili_rows.append([d["year"], d["week"], scope, val, "current"])
    m = merge_ili(ili_rows)
    print("哨点归档: 病原体 %d 行累计, ILI %d 行累计" % (n, m))


def archive_cnic(d):
    """流感周报归档：ILI（本周/前一周/往年同期）、实验室检测、暴发疫情。"""
    ili_rows = []
    for scope in ("south", "north"):
        blk = (d.get("ili") or {}).get(scope) or {}
        if blk.get("current") is not None:
            ili_rows.append([d["year"], d["week"], scope, blk["current"], "current"])
        if blk.get("prev_week") is not None and d["week"] > 1:
            ili_rows.append([d["year"], d["week"] - 1, scope, blk["prev_week"], "prev_week"])
        for y, v in (blk.get("same_week_prior_years") or {}).items():
            ili_rows.append([y, d["week"], scope, v, "comparison"])
    n_ili = merge_ili(ili_rows)

    lab_rows = []
    for region in ("south", "north", "total"):
        r = (d.get("lab") or {}).get(region)
        if r:
            lab_rows.append([d["year"], d["week"], region, r.get("tested"), r.get("positive"),
                             r.get("positive_pct"), r.get("a"), r.get("h1n1pdm09"), r.get("h3n2"),
                             r.get("a_unsubtyped"), r.get("b"), r.get("b_unlineaged"),
                             r.get("victoria"), r.get("yamagata")])
    n_lab = merge_csv(LAB_CSV,
                      ["year", "week", "region", "tested", "positive", "positive_pct",
                       "a", "h1n1pdm09", "h3n2", "a_unsubtyped", "b", "b_unlineaged",
                       "victoria", "yamagata"],
                      key_idx=[0, 1, 2], new_rows=lab_rows, sort_idx=[0, 1, 2])

    ob_rows = []
    wk, se = d.get("outbreaks_week"), d.get("outbreaks_season")
    if wk or se:
        ob_rows.append([d["year"], d["week"],
                        (wk or {}).get("total"), json.dumps((wk or {}).get("by_type") or {}, ensure_ascii=False),
                        (se or {}).get("total"), (se or {}).get("south"), (se or {}).get("north"),
                        json.dumps((se or {}).get("by_region") or {}, ensure_ascii=False)])
    n_ob = merge_csv(OUTBREAK_CSV,
                     ["year", "week", "week_total", "week_by_type_json",
                      "season_total", "season_south", "season_north", "season_regions_json"],
                     key_idx=[0, 1], new_rows=ob_rows, sort_idx=[0, 1])
    print("周报归档: ILI %d 行累计, 实验室 %d 行累计, 暴发 %d 行累计" % (n_ili, n_lab, n_ob))


def archive_cities(cities):
    """城市源归档：重庆周排行（长表）、上海月度病例数。"""
    rows = []
    cq = cities.get("chongqing")
    if cq and not cq.get("stale") and cq.get("year"):
        for scene, key in (("outpatient", "outpatient_top"), ("inpatient", "inpatient_top")):
            for rank, item in enumerate(cq.get(key) or [], 1):
                rows.append(["chongqing", cq["year"], cq["week"], scene, rank, item["name"], item.get("pct")])
    if rows:
        merge_csv(CITY_TOP_CSV,
                  ["city", "year", "week", "scene", "rank", "pathogen", "pct"],
                  key_idx=[0, 1, 2, 3, 4], new_rows=rows, sort_idx=[1, 2, 3, 4])
    sh = cities.get("shanghai")
    if sh and not sh.get("stale") and sh.get("year"):
        merge_csv(CITY_MONTH_CSV,
                  ["city", "year", "month", "flu_cases", "flu_deaths", "covid_cases",
                   "total_cases", "total_deaths"],
                  key_idx=[0, 1, 2],
                  new_rows=[["shanghai", sh["year"], sh["month"], sh.get("flu_cases"),
                             sh.get("flu_deaths"), sh.get("covid_cases"),
                             sh.get("total_cases"), sh.get("total_deaths")]],
                  sort_idx=[1, 2])


def build_trends():
    """从归档 CSV 生成前端用的 data/trends.json。"""
    ili = {}
    for r in read_csv_rows(ILI_CSV)[1:]:
        if len(r) == 5:
            ili.setdefault(r[2], []).append({"year": int(r[0]), "week": int(r[1]), "pct": float(r[3])})
    for v in ili.values():
        v.sort(key=lambda x: (x["year"], x["week"]))

    pathogens = {}
    for r in read_csv_rows(PATHOGEN_CSV)[1:]:
        if len(r) == 7:
            pathogens.setdefault(r[2], []).append({
                "year": int(r[0]), "week": int(r[1]),
                "outpatient": float(r[3]) if r[3] else None,
                "inpatient": float(r[5]) if r[5] else None})
    for v in pathogens.values():
        v.sort(key=lambda x: (x["year"], x["week"]))

    lab = []
    for r in read_csv_rows(LAB_CSV)[1:]:
        if len(r) == 14 and r[2] == "total":
            lab.append({"year": int(r[0]), "week": int(r[1]),
                        "positive_pct": float(r[5]) if r[5] else None,
                        "h1n1pdm09": int(r[7]) if r[7] else None,
                        "h3n2": int(r[8]) if r[8] else None,
                        "victoria": int(r[12]) if r[12] else None,
                        "yamagata": int(r[13]) if r[13] else None})
    lab.sort(key=lambda x: (x["year"], x["week"]))

    trends = {"ili": ili, "pathogens": pathogens, "lab": lab}
    atomic_write(OUT_TRENDS, json.dumps(trends, ensure_ascii=False, separators=(",", ":")))
    return trends


def main():
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    prev = load_previous()
    latest = {"updated": now_bjt()}
    failures = []

    for name, mod in (("sentinel", fetch_sentinel), ("cnic", fetch_cnic)):
        try:
            data = mod.fetch_latest()
            latest[name] = data
            latest[name]["stale"] = False
            if name == "sentinel":
                archive_sentinel(data)
            else:
                archive_cnic(data)
            print("%s: %s年第%s周抓取成功%s" % (
                name, data.get("year"), data.get("week"),
                "（警告: %s）" % "；".join(data["warnings"]) if data.get("warnings") else ""))
        except Exception as exc:
            failures.append(name)
            print("%s 抓取失败: %s" % (name, exc), file=sys.stderr)
            if prev.get(name):
                latest[name] = prev[name]
                latest[name]["stale"] = True
                print("%s: 沿用上一份数据" % name, file=sys.stderr)

    if len(failures) == 2:
        print("所有数据源均失败，退出且不改写数据", file=sys.stderr)
        sys.exit(1)

    try:
        cities_mod = importlib.import_module("fetch_cities")
        latest["cities"] = cities_mod.fetch_latest(latest.get("cities") or prev.get("cities") or {})
        archive_cities(latest["cities"])
    except ImportError:
        if prev.get("cities"):
            latest["cities"] = prev["cities"]
    except Exception as exc:
        print("城市级源失败(不阻断): %s" % exc, file=sys.stderr)
        if prev.get("cities"):
            latest["cities"] = prev["cities"]
            latest["cities"]["stale"] = True

    build_trends()
    atomic_write(OUT_LATEST, json.dumps(latest, ensure_ascii=False, indent=1))
    print("latest.json 已更新 @ %s" % latest["updated"])


if __name__ == "__main__":
    main()
