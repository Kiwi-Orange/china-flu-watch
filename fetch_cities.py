#!/usr/bin/env python3
"""城市级数据源（辅助层）：重庆（周更哨点监测）、上海（月报流感病例数）。

设计原则与主源一致：单城市失败只影响该城市块（沿用旧数据并标 stale），
不影响全国数据。广东周报非流行季停发且链接不稳定、北京只有无分病种数字的月报、
香港 chp.gov.hk 需境外网络可达——均暂不接入，见 README。

输出结构：
{
  "updated": ...,
  "chongqing": {year, week, published, date_range, outpatient_top, inpatient_top, analysis, source_url},
  "shanghai":  {year, month, published, flu_cases, flu_deaths, covid_cases, source_url}
}
"""

import re
import sys
from urllib.parse import urljoin

from fetch_common import fetch_text, html_to_text, to_float

CQ_LIST = "https://www.cqcdc.org/index.php?a=lists&catid=209"
CQ_LINK_RE = re.compile(
    r'<a\s+href="(/index\.php\?a=shows&catid=209&id=\d+)">'
    r'重庆市急性呼吸道传染病哨点监测情况（(\d{4})年第(\d+)周）'
    r'<span[^>]*>(\d{4}-\d{2}-\d{2})</span>')

SH_LIST = "https://wsjkw.sh.gov.cn/yqxx/index.html"
SH_LINK_RE = re.compile(
    r'<a[^>]*href="(/yqxx/(\d{8})/[0-9a-f]+\.html)"[^>]*>\s*'
    r'(\d{4})年(\d+)月上海市传染病疫情报告')


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


def fetch_latest(prev):
    """抓取所有城市源；单城市失败沿用 prev 中对应块并标 stale。"""
    prev = prev or {}
    cities = {}
    for key, fn in (("chongqing", fetch_chongqing), ("shanghai", fetch_shanghai)):
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
