#!/usr/bin/env python3
"""城市级数据源（辅助层）：重庆（周更哨点监测）、上海（月报流感病例数）、天津（月报流感病例数）。

设计原则与主源一致：单城市失败只影响该城市块（沿用旧数据并标 stale），
不影响全国数据。广东周报非流行季停发且链接不稳定、北京无任何城市级流感量化指标
（周报 2023 年底停发、月报仅总数与病种名称）、香港 chp.gov.hk 需境外网络可达
——均暂不接入，见 README。

天津站（wsjk.tj.gov.cn）有网宿 WAF，按低频率抓取并带浏览器 UA。
其月报正文只有分类合计与病种名称，**流感发病数在附件 DOCX 的分病种统计表里**。

输出结构：
{
  "updated": ...,
  "chongqing": {year, week, published, date_range, outpatient_top, inpatient_top, analysis, source_url},
  "shanghai":  {year, month, published, flu_cases, flu_deaths, covid_cases, total_cases, total_deaths, source_url},
  "tianjin":   {year, month, published, flu_cases, flu_deaths, total_cases, total_deaths,
                c_class_cases, top_b, top_c, docx_url, source_url}
}
"""

import html as html_mod
import io
import re
import sys
import time
import zipfile
from urllib.parse import urljoin

from fetch_common import fetch_bytes, fetch_text, html_to_text, to_float

CQ_LIST = "https://www.cqcdc.org/index.php?a=lists&catid=209"
CQ_LINK_RE = re.compile(
    r'<a\s+href="(/index\.php\?a=shows&catid=209&id=\d+)">'
    r'重庆市急性呼吸道传染病哨点监测情况（(\d{4})年第(\d+)周）'
    r'<span[^>]*>(\d{4}-\d{2}-\d{2})</span>')

SH_LIST = "https://wsjkw.sh.gov.cn/yqxx/index.html"
SH_LINK_RE = re.compile(
    r'<a[^>]*href="(/yqxx/(\d{8})/[0-9a-f]+\.html)"[^>]*>\s*'
    r'(\d{4})年(\d+)月上海市传染病疫情报告')

# 天津：疾控局子站（2026-06 起）+ 卫健委旧栏目（月报历史）
TJ_SITES = (
    "https://wsjk.tj.gov.cn/tjsjbyf/xwdt/gzdt/",
    "https://wsjk.tj.gov.cn/XWZX6600/YQFKDT1752/index.html",
)
TJ_PAGE_URL = lambda site, n: site if n == 0 else (
    site + "index_%d.html" % n if site.endswith("/") else site.replace("index.html", "index_%d.html" % n))
TJ_ITEM_RE = re.compile(r"<a\s+href='(\./\d{6}/t\d{8}_\d+\.html)'")
TJ_TITLE_RE = re.compile(r"title='([^']*)'")
TJ_DATE_RE = re.compile(r'<span class="wz-time">(\d{4}-\d{2}-\d{2})</span>')
TJ_REPORT_RE = re.compile(r"(\d{4})年(\d+)月天津市.*?传染病.*?(概况|情况|报告)")
TJ_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def _top_n(text):
    """'流感病毒（19%）、鼻病毒（15%）和副流感病毒（4%）' → 排行列表（顿号/和 分隔）。"""
    return [{"name": n.strip(), "pct": to_float(p)}
            for n, p in re.findall(r"([^、，\s（）()和]+)（\s*([\d.]+)\s*%\s*）", text or "")]


def fetch_chongqing():
    html = fetch_text(CQ_LIST)
    m = CQ_LINK_RE.search(html)
    if not m:
        raise RuntimeError("重庆列表页未找到哨点监测周报链接")
    url, year, week, published = urljoin(CQ_LIST, m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)
    text = html_to_text(fetch_text(url))

    out = {"name": "重庆", "source_url": url, "year": year, "week": week, "published": published}
    d = re.search(r"年第\d+周（([^）]+)）", text)
    if d:
        out["date_range"] = d.group(1)
    mo = re.search(r"门急诊流感样病例呼吸道样本检测阳性率前[三四五]位病原体为\s*([^；。]+)", text)
    if mo:
        out["outpatient_top"] = _top_n(mo.group(1))
    mi = re.search(r"住院严重急性呼吸道感染病例呼吸道样本检测阳性率前[三四五]位病原体为\s*([^；。]+)", text)
    if mi:
        out["inpatient_top"] = _top_n(mi.group(1))
    ma = re.search(r"二、分析及健康提示\s*(.*?)\s*建议公众采取", text) or \
        re.search(r"二、分析及健康提示\s*(.*?)\s*（一）", text)
    if ma:
        out["analysis"] = ma.group(1).strip()
    if not out.get("outpatient_top"):
        raise RuntimeError("重庆详情页未解析到病原体排行: %s" % url)
    return out


def fetch_shanghai():
    html = fetch_text(SH_LIST)
    m = SH_LINK_RE.search(html)
    if not m:
        raise RuntimeError("上海列表页未找到月度疫情报告链接")
    url, pub, year, month = urljoin(SH_LIST, m.group(1)), m.group(2), int(m.group(3)), int(m.group(4))
    published = "%s-%s-%s" % (pub[:4], pub[4:6], pub[6:8])
    text = html_to_text(fetch_text(url))

    out = {"name": "上海", "source_url": url, "year": year, "month": month, "published": published}
    mf = re.search(r"流行性感冒\s+(\d+)\s+(\d+)", text)
    if not mf:
        raise RuntimeError("上海详情页未解析到流行性感冒病例数: %s" % url)
    out["flu_cases"], out["flu_deaths"] = int(mf.group(1)), int(mf.group(2))
    mc = re.search(r"新型冠状病毒感染\s+(\d+)\s+(\d+)", text)
    if mc:
        out["covid_cases"] = int(mc.group(1))
    mt = re.search(r"甲乙丙类总计\s+(\d+)\s+(\d+)", text)
    if mt:
        out["total_cases"], out["total_deaths"] = int(mt.group(1)), int(mt.group(2))
    return out


def _tj_list_items(html):
    """列表页 → [(url, title, date)]，按 </li> 切块逐条解析（页面 href 用单引号）。"""
    items = []
    for chunk in html.split("</li>"):
        href = TJ_ITEM_RE.search(chunk)
        if not href:
            continue
        title = TJ_TITLE_RE.search(chunk)
        date = TJ_DATE_RE.search(chunk)
        items.append((href.group(1), title.group(1).strip() if title else "",
                      date.group(1) if date else ""))
    return items


def _docx_rows(docx_bytes):
    """DOCX 的 word/document.xml → 表格行 [[单元格文本]]（标准库，无需 poppler）。"""
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        xml = z.read("word/document.xml").decode("utf-8", errors="replace")
    rows = []
    for tr in re.findall(r"<w:tr[ >].*?</w:tr>", xml, flags=re.S):
        cells = []
        for tc in re.findall(r"<w:tc>.*?</w:tc>", tr, flags=re.S):
            txt = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", tc))
            cells.append(re.sub(r"\s+", "", html_mod.unescape(txt)))
        rows.append(cells)
    return rows


def _docx_value(rows, label):
    """分病种表里取某病种的 (发病数, 死亡数)；病种名可能带脚注数字。"""
    for cells in rows:
        if len(cells) >= 3 and re.sub(r"\d+$", "", cells[0]) == label:
            try:
                return int(cells[1]), int(cells[2])
            except ValueError:
                return None
    return None


def _tj_looks_blocked(text):
    """网宿 WAF 限速时会返回 JS 挑战页（纯 urllib 无法执行脚本，只能退避）。"""
    return "Please enable JavaScript" in text or "enable JavaScript and refresh" in text


def _tj_get(url, tries=2, wait=25):
    """天津站抓取（带 cookie）：识别 WAF 挑战页并退避重试，最终显式报错以便沿用旧数据。"""
    last = None
    for i in range(tries):
        try:
            text = fetch_text(url, headers=TJ_UA)
            if _tj_looks_blocked(text):
                last = RuntimeError("WAF JS 挑战页")
            else:
                return text
        except Exception as exc:
            last = exc
        if i < tries - 1:
            print("天津请求退避 %ds 后重试 %s" % (wait, url), file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("天津站不可用（可能被 WAF 限速）%s: %s" % (url, last))


def fetch_tianjin():
    """天津月报：正文取合计与分类，附件 DOCX 的分病种表取流感发病数/死亡数。"""
    candidates = []
    for site in TJ_SITES:
        for n in (0, 1, 2):
            try:
                page = _tj_get(TJ_PAGE_URL(site, n))
            except Exception as exc:
                print("天津列表页失败 %s: %s" % (TJ_PAGE_URL(site, n), exc), file=sys.stderr)
                break
            for href, title, date in _tj_list_items(page):
                m = TJ_REPORT_RE.search(title)
                if m:
                    candidates.append((int(m.group(1)), int(m.group(2)),
                                       urljoin(TJ_PAGE_URL(site, n), href), date))
            if candidates:
                break
        if candidates:
            break
    if not candidates:
        raise RuntimeError("天津列表页未找到月度传染病疫情报告")
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    year, month, url, list_date = candidates[0]

    page = _tj_get(url)
    text = html_to_text(page)
    out = {"name": "天津", "source_url": url, "year": year, "month": month}
    m = re.search(r'<meta name="PubDate" content=[\'"]([^\'" ]+)', page)
    out["published"] = m.group(1) if m else list_date

    mt = re.search(r"共报告法定传染病\s*(\d+)\s*例[^。]*?(无死亡报告|死亡\s*(\d+)\s*例)", text)
    if mt:
        out["total_cases"] = int(mt.group(1))
        out["total_deaths"] = int(mt.group(3)) if mt.group(3) else 0
    mb = re.search(r"乙类传染病共报告发病\s*(\d+)\s*例", text)
    if mb:
        out["b_class_cases"] = int(mb.group(1))
        top = re.search(r"居前\s*5\s*位的病种依次为([^。]+?)[，,]?占", text) or \
            re.search(r"居前\s*5\s*位的病种依次为([^。]+)", text)
        if top:
            out["top_b"] = [x.strip() for x in re.split(r"[、，]", top.group(1)) if x.strip()]
    mc = re.search(r"丙类传染病共报告发病\s*(\d+)\s*例", text)
    if mc:
        out["c_class_cases"] = int(mc.group(1))
        top = re.search(r"居前\s*3\s*位的病种依次为([^。]+?)[，,]?占", text) or \
            re.search(r"居前\s*3\s*位的病种依次为([^。]+)", text)
        if top:
            out["top_c"] = [x.strip() for x in re.split(r"[、，]", top.group(1)) if x.strip()]

    docx = re.search(r"href=['\"]([^'\"]+\.docx)['\"]", page)
    if docx:
        out["docx_url"] = urljoin(url, docx.group(1))
        try:
            rows = _docx_rows(fetch_bytes(out["docx_url"], headers=TJ_UA))
            flu = _docx_value(rows, "流行性感冒")
            if flu:
                out["flu_cases"], out["flu_deaths"] = flu
            total = _docx_value(rows, "甲乙丙类传染病总计")
            if total:
                out.setdefault("total_cases", total[0])
                out.setdefault("total_deaths", total[1])
        except Exception as exc:
            print("天津 DOCX 解析失败(不阻断): %s" % exc, file=sys.stderr)
    if out.get("flu_cases") is None:
        print("天津月报未取到流感发病数（%d年%d月，可能该月无附件）" % (year, month), file=sys.stderr)
    return out


def fetch_latest(prev):
    """抓取所有城市源；单城市失败沿用 prev 中对应块并标 stale。"""
    prev = prev or {}
    cities = {}
    for key, fn in (("chongqing", fetch_chongqing), ("shanghai", fetch_shanghai),
                    ("tianjin", fetch_tianjin)):
        try:
            cities[key] = fn()
            cities[key]["stale"] = False
            print("城市源 %s 抓取成功" % key)
        except Exception as exc:
            print("城市源 %s 抓取失败: %s" % (key, exc), file=sys.stderr)
            if prev.get(key):
                cities[key] = dict(prev[key], stale=True)
    if cities:
        from datetime import datetime, timedelta, timezone
        cities["updated"] = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S +08:00")
    return cities


if __name__ == "__main__":
    import json
    print(json.dumps(fetch_latest({}), ensure_ascii=False, indent=1))

