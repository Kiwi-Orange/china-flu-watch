#!/usr/bin/env python3
"""抓取国家流感中心《中国流感监测周报》（HTML 摘要页 + PDF 全文）。

列表页取最新一期；详情页拿 PDF 链接；PDF 用系统 pdftotext -layout 转文本后解析：
南/北方 ILI%（含前一周与往年同期对照）、表1 实验室检测结果、本周与当季暴发疫情、
分地区暴发起数。PDF 解析依赖 pdftotext（poppler-utils），缺失时本模块抛异常，
由 fetch.py 沿用旧数据。单字段失败记 warnings，不中断整体。
"""

import re
from urllib.parse import urljoin

from fetch_common import fetch_bytes, fetch_text, html_to_text, norm_pdf_text, pdf_to_text, to_float

LIST_URL = "https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/"
LINK_RE = re.compile(
    r'<a\s+href="(\./\d{6}/t\d{8}_\d+\.htm)"[^>]*>\s*(\d{4})\s*第\s*(\d+)\s*周\s*</a>'
    r'</span>\s*<span[^>]*>\((\d{4}-\d{2}-\d{2})\)')

LAB_ROWS = [  # (行前缀, 归档键); 阳性数带百分比，其余为计数(占比)
    ("检测数", "tested"),
    ("阳性数", "positive"),
    ("A型", "a"),
    ("A(H1N1)pdm09", "h1n1pdm09"),
    ("A(H3N2)", "h3n2"),
    ("A(unsubtyped)", "a_unsubtyped"),
    ("B型", "b"),
    ("B 未分系", "b_unlineaged"),
    ("Victoria", "victoria"),
    ("Yamagata", "yamagata"),
]

REGIONS = ("西南", "西北", "华东", "华中", "东北", "华北", "华南")


def find_latest():
    """从列表页找最新一期的 (详情页URL, 年, 周, 发布日期)。"""
    html = fetch_text(LIST_URL)
    m = LINK_RE.search(html)
    if not m:
        raise RuntimeError("流感周报列表页未找到周报链接: %s" % LIST_URL)
    href, year, week, published = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    return urljoin(LIST_URL, href), year, week, published


def _parse_ili_sentence(flat, region):
    """解析 'X方省份哨点医院报告的 ILI%为 …同期水平（…）。' 一句。"""
    m = re.search(region + r"方省份哨点医院报告的\s*ILI%为\s*([\d.]+)\s*%([^。]*)。", flat)
    if not m:
        return None
    rest = m.group(2)
    out = {"current": float(m.group(1))}
    p = re.search(r"前一周水平（\s*([\d.]+)\s*%\s*）", rest)
    if p:
        out["prev_week"] = float(p.group(1))
    prior = {}
    for years_txt, pct_txt in re.findall(r"((?:\d{4}\s*年[、和]?\s*)+)同期水平（([^）]*)）", rest):
        years = re.findall(r"\d{4}", years_txt)
        pcts = re.findall(r"[\d.]+", pct_txt)
        for y, v in zip(years, pcts):
            prior[int(y)] = float(v)
    if prior:
        out["same_week_prior_years"] = prior
    return out


def _parse_lab_table(lines):
    """表1 流感样病例监测实验室检测结果：按行前缀取 南方/北方/合计 三列。"""
    start = next((i for i, ln in enumerate(lines) if "流感样病例监测实验室检测结果" in ln), None)
    if start is None:
        return None
    table = {"south": {}, "north": {}, "total": {}}
    regions = ["south", "north", "total"]
    for prefix, key in LAB_ROWS:
        row = next((ln for ln in lines[start:start + 25] if ln.startswith(prefix)), None)
        if not row:
            continue
        body = row[len(prefix):]
        cells = re.findall(r"(\d+)\s*\(\s*([\d.]+)\s*%\s*\)|(\d+)", body)
        vals = []
        for cnt, pct, bare in cells[:3]:
            n = int(cnt or bare)
            vals.append({"count": n, "pct": float(pct)} if pct else {"count": n})
        for reg, v in zip(regions, vals):
            table[reg][key] = v["count"]
            if "pct" in v:
                table[reg][key + "_pct"] = v["pct"]
    return table


def _by_type(text):
    """'1 起为 A(H3N2)，…，1 起暂未获得病原检测结果' → dict。容忍换行空格。"""
    by_type = {}
    for n, t in re.findall(r"(\d+)\s*起\s*为\s*([^，,。]+)", text):
        by_type[re.sub(r"\s+", " ", t).strip()] = int(n)
    p = re.search(r"(\d+)\s*起\s*暂\s*未\s*获\s*得\s*病\s*原\s*检\s*测\s*结\s*果", text)
    if p:
        by_type["未检测"] = int(p.group(1))
    return by_type


def _parse_outbreaks_week(flat):
    m = re.search(r"全国共报告\s*(\d+)\s*起流感样病例暴发疫情。经检测，([^。]+)。", flat)
    if not m:
        return None
    return {"total": int(m.group(1)), "by_type": _by_type(m.group(2))}


def _parse_outbreaks_season(flat):
    m = re.search(r"(\d{4})\s*年第\s*(\d+)\s*-\s*(\d+)\s*周[^。]*全国报告流感样病例暴发疫情（[^）]*例\s*及\s*以\s*上[^）]*）\s*(\d+)\s*起[^。]*经实验室检测，([^。]+)。", flat)
    if not m:
        return None
    out = {"year": int(m.group(1)), "start_week": int(m.group(2)),
           "end_week": int(m.group(3)), "total": int(m.group(4))}
    by_type = _by_type(m.group(5))
    if by_type:
        out["by_type"] = by_type
    p = re.search(r"南方省份共报告\s*(\d+)\s*起\s*ILI\s*暴发疫情", flat)
    if p:
        out["south"] = int(p.group(1))
    p = re.search(r"北方省份共报告\s*(\d+)\s*起\s*ILI\s*暴发疫情", flat)
    if p:
        out["north"] = int(p.group(1))
    seg = re.search(r"各地区报告暴发疫情起数(.*?)注：暴发疫情报告", flat, re.S)
    if seg:
        out["by_region"] = {r: int(n) for r, n in
                            re.findall(r"(西南|西北|华东|华中|东北|华北|华南)地区\s+(\d+)", seg.group(1))}
    return out


def parse_pdf(pdf_bytes, warnings):
    """解析 PDF 全文，返回结构化字段。"""
    text = pdf_to_text(pdf_bytes)
    if text is None:
        raise RuntimeError("pdftotext 不可用，无法解析流感周报 PDF")
    norm = norm_pdf_text(text)
    flat = re.sub(r"\s+", " ", norm)
    lines = [ln for ln in norm.splitlines() if ln]
    out = {}

    def take(key, label, fn, *args):
        v = fn(*args)
        if v is None:
            warnings.append("缺少字段: %s" % label)
        else:
            out[key] = v

    m = re.search(r"第\s*(\d+)\s*期", flat)
    if m:
        out["issue"] = int(m.group(1))
    else:
        warnings.append("缺少字段: 期号")

    m = re.search(r"中国流感流行情况概要（截至\s*([^）]+)）(.*?)摘\s*要", flat)
    if m:
        out["summary_as_of"] = m.group(1).strip()
        out["summary"] = re.sub(r"\s*·\s*", "\n· ", m.group(2)).strip()
    else:
        warnings.append("缺少字段: 概要")

    ili = {}
    for region, key in (("南", "south"), ("北", "north")):
        v = _parse_ili_sentence(flat, region)
        if v:
            ili[key] = v
        else:
            warnings.append("缺少字段: %s方ILI%%" % region)
    if ili:
        out["ili"] = ili

    take("lab", "表1实验室检测", _parse_lab_table, lines)
    take("outbreaks_week", "本周暴发疫情", _parse_outbreaks_week, flat)
    take("outbreaks_season", "当季暴发疫情", _parse_outbreaks_season, flat)
    return out


def fetch_latest():
    """返回最新一期流感周报 dict；页面或 PDF 抓取失败抛异常。"""
    url, year, week, published = find_latest()
    html = fetch_text(url)
    m = re.search(r'href="(\./P\d+\.pdf)"', html)
    if not m:
        raise RuntimeError("详情页未找到 PDF 附件: %s" % url)
    pdf_url = urljoin(url, m.group(1))
    warnings = []
    data = parse_pdf(fetch_bytes(pdf_url), warnings)
    data.update({
        "source_url": url, "pdf_url": pdf_url,
        "year": year, "week": week, "published": published,
        "warnings": warnings,
    })
    return data


if __name__ == "__main__":
    import json
    print(json.dumps(fetch_latest(), ensure_ascii=False, indent=1))
