#!/usr/bin/env python3
"""抓取中疾控《全国急性呼吸道传染病哨点监测情况》周报（纯 HTML，无需鉴权）。

列表页取最新一期，详情页解析正文（ILI%、前三位病原体、分析提示）与 3 张表格
（病原体阳性率 / 南北方前三位 / 年龄组前三位）。单字段解析失败记 warnings，
页面整体抓取失败才抛异常，由 fetch.py 决定是否沿用旧数据。
"""

import re
from urllib.parse import urljoin

from fetch_common import fetch_text, html_to_text, parse_tables, to_float

LIST_URL = "https://www.chinacdc.cn/jksj/jksj04_14275/"
LINK_RE = re.compile(
    r'<a\s+href="(\./\d{6}/t\d{8}_\d+\.html)"[^>]*>'
    r'([^<]*哨点监测情况[^<]*第\s*(\d+)\s*周[^<]*)'
    r'(?:<span>\s*(\d{4}-\d{2}-\d{2})\s*</span>)?</a>')


def find_latest():
    """从列表页找最新一期的 (详情页URL, 年, 周, 发布日期)。"""
    html = fetch_text(LIST_URL)
    for href, text, week, pub in LINK_RE.findall(html):
        m = re.search(r"(\d{4})\s*年第\s*" + week + r"\s*周", text)
        if m:
            return urljoin(LIST_URL, href), int(m.group(1)), int(week), pub or None
    raise RuntimeError("哨点监测列表页未找到周报链接: %s" % LIST_URL)


def _top3(text):
    """'鼻病毒（14.2%）、流感病毒（11.6%）' → [{'name':..,'pct':..}]"""
    return [{"name": n.strip(), "pct": to_float(p)}
            for n, p in re.findall(r"([^、，\s（）()]+)（\s*([\d.]+)\s*%\s*）", text or "")]


def _parse_pathogen_table(rows):
    """表1：病原体 | 门急诊本周 | 较上周 | 住院本周 | 较上周。"""
    out = []
    for cells in rows:
        cells = [c for c in cells if c]
        if len(cells) >= 5 and to_float(cells[1]) is not None:
            out.append({
                "name": cells[0].replace(" ", ""),
                "outpatient": to_float(cells[1]),
                "outpatient_wow": to_float(cells[2]),
                "inpatient": to_float(cells[3]),
                "inpatient_wow": to_float(cells[4]),
            })
    return out


def _parse_region_table(rows):
    """表2：南方/北方省份 × 门急诊/住院 前三位病原体。"""
    result = {}
    for cells in rows:
        cells = [c for c in cells if c]
        if len(cells) >= 7 and cells[0] in ("南方省份", "北方省份"):
            key = "south" if cells[0].startswith("南") else "north"
            result[key] = {"outpatient": cells[1:4], "inpatient": cells[4:7]}
    return result


def _parse_age_table(rows):
    """表3：年龄组（跨行合并，首行 3 格、续行 2 格）× 门急诊/住院 前三位。"""
    groups = []
    for cells in rows:
        cells = [c for c in cells if c]
        if len(cells) >= 3 and "岁" in cells[0]:
            groups.append({"group": cells[0], "out_raw": cells[1], "in_raw": cells[2]})
        elif len(cells) == 2 and groups:
            groups[-1]["out_raw"] += cells[0]
            groups[-1]["in_raw"] += cells[1]
    for g in groups:
        g["outpatient"] = re.findall(r"[①②③④]([^①②③④]+)", g.pop("out_raw"))
        g["inpatient"] = re.findall(r"[①②③④]([^①②③④]+)", g.pop("in_raw"))
    return groups


class _Fields:
    """逐字段提取：取不到记 warning 并给 None，不中断整体解析。"""

    def __init__(self, text):
        self.text = text
        self.warnings = []

    def grab(self, label, pattern, cast=to_float):
        m = re.search(pattern, self.text)
        if not m:
            self.warnings.append("缺少字段: %s" % label)
            return None
        return cast(m.group(1))

    def grab_text(self, label, pattern):
        m = re.search(pattern, self.text)
        if not m:
            self.warnings.append("缺少字段: %s" % label)
            return None
        return m.group(1).strip()


def parse_detail(html, url, year, week, published=None):
    text = html_to_text(html)
    tables = parse_tables(html)
    f = _Fields(text)

    data = {
        "source_url": url,
        "year": year,
        "week": week,
        "date_range": f.grab_text("监测日期范围", r"（(\d{4}年[^）]*—[^）]*)）"),
        "published": published or f.grab_text("发布时间", r"时间：\s*(\d{4}-\d{2}-\d{2})"),
        "ili_pct_national": f.grab("全国ILI%", r"流感样病例百分比）为\s*([\d.]+)\s*%"),
        "ili_pct_south": f.grab("南方ILI%", r"南方省份（\s*([\d.]+)\s*%\s*）"),
        "ili_pct_north": f.grab("北方ILI%", r"北方省份（\s*([\d.]+)\s*%\s*）"),
        "hospitals_multipathogen": f.grab("监测医院数", r"(\d+)\s*家开展呼吸道多病原监测", int),
    }

    m = re.search(r"门急诊流感样病例呼吸道样本检测阳性率前三位病原体为\s*([^；。]+)", text)
    if m:
        data["outpatient_top3"] = _top3(m.group(1))
    else:
        f.warnings.append("缺少字段: 门急诊前三位")
        data["outpatient_top3"] = []
    m = re.search(r"住院严重急性呼吸道感染病例呼吸道样本检测阳性率前三位病原体为\s*([^；。]+)", text)
    if m:
        data["inpatient_top3"] = _top3(m.group(1))
    else:
        f.warnings.append("缺少字段: 住院前三位")
        data["inpatient_top3"] = []

    m = re.search(r"二、分析及健康提示\s*(.*?)\s*为防范呼吸道传染病疫情", text) or \
        re.search(r"二、分析及健康提示\s*(.*?)\s*（1）", text)
    data["analysis"] = m.group(1).strip() if m else None
    if not data["analysis"]:
        f.warnings.append("缺少字段: 分析提示")

    if len(tables) >= 3:
        data["pathogens"] = _parse_pathogen_table(tables[0])
        data["region_top3"] = _parse_region_table(tables[1])
        data["age_top3"] = _parse_age_table(tables[2])
        if not data["pathogens"]:
            f.warnings.append("表1(病原体阳性率)解析为空")
    else:
        data["pathogens"], data["region_top3"], data["age_top3"] = [], {}, []
        f.warnings.append("表格数量不足: 期望3张, 实际%d张" % len(tables))

    data["warnings"] = f.warnings
    return data


def fetch_latest():
    """返回最新一期哨点监测数据的 dict；抓取失败抛异常。"""
    url, year, week, published = find_latest()
    html = fetch_text(url)
    return parse_detail(html, url, year, week, published)


if __name__ == "__main__":
    import json
    print(json.dumps(fetch_latest(), ensure_ascii=False, indent=1))
