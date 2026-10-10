#!/usr/bin/env python3
"""历史回补：枚举国家流感中心流感周报列表的历史页面，逐期下载 PDF 解析归档。

默认回补 2024 年及以后的周报（约 140 期）。由于每期周报正文含"前一周"与
"往年同期"对照值，回补 2024–2026 三期年度即可重建 2023–2026 完整周序列：

- 第 Y 年第 w 周的报告给出 (Y,w) 本周值、(Y,w-1) 前一周值、(Y-3..Y-1, w) 同期值
- 同键归并时 current > prev_week > comparison（见 fetch.py 的 ILI_PRIORITY）

用法：python3 backfill_cnic.py [--from-year 2024] [--delay 0.8]
已归档（ili-weekly.csv 中存在 current 记录）的期次自动跳过，可安全重跑。
"""

import argparse
import re
import sys
import time
from urllib.parse import urljoin

import fetch  # 复用 archive_cnic / merge_* / CSV 路径
import fetch_cnic
from fetch_common import fetch_bytes, fetch_text

LIST_URL = fetch_cnic.LIST_URL
# 列表分页：index.htm 为第 0 页，index_N.htm 为第 N 页，共 30 页（2015 年至今）
PAGE_URL = lambda n: urljoin(LIST_URL, "index.htm" if n == 0 else "index_%d.htm" % n)
LINK_RE = re.compile(
    r'<a\s+href="(\./\d{6}/t\d{8}_\d+\.htm)"[^>]*>\s*(\d{4})\s*第\s*(\d+)\s*周\s*</a>'
    r'</span>\s*<span[^>]*>\((\d{4}-\d{2}-\d{2})\)')
NUM_PAGES = 30


def list_reports(from_year):
    """枚举所有历史周报 (url, year, week, published)，新的在前。"""
    found = []
    for page in range(NUM_PAGES):
        html = fetch_text(PAGE_URL(page))
        items = [(urljoin(LIST_URL, h), int(y), int(w), p)
                 for h, y, w, p in LINK_RE.findall(html)]
        if not items:
            print("第 %d 页无条目，停止翻页" % page, file=sys.stderr)
            break
        found.extend(items)
        oldest = min(y for _, y, _, _ in items)
        if oldest < from_year:
            break
        time.sleep(0.3)
    # 去重（相邻页可能有重叠）并按时间倒序
    seen = {}
    for url, y, w, p in found:
        seen[(y, w)] = (url, y, w, p)
    return sorted(seen.values(), key=lambda t: (t[1], t[2]), reverse=True)


def archived_current_weeks():
    """ili-weekly.csv 中已有 current 记录的 (year, week) 集合。"""
    done = set()
    for r in fetch.read_csv_rows(fetch.ILI_CSV)[1:]:
        if len(r) == 5 and r[4] == "current":
            done.add((int(r[0]), int(r[1])))
    return done


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-year", type=int, default=2024)
    ap.add_argument("--delay", type=float, default=0.8)
    args = ap.parse_args()

    reports = [r for r in list_reports(args.from_year) if r[1] >= args.from_year]
    done = archived_current_weeks()
    todo = [r for r in reports if (r[1], r[2]) not in done]
    print("共发现 %d 期，已归档 %d 期，待回补 %d 期" % (len(reports), len(done & {(r[1], r[2]) for r in reports}), len(todo)))

    ok, fail = 0, 0
    for i, (url, year, week, published) in enumerate(todo, 1):
        try:
            html = fetch_text(url)
            m = re.search(r'href="(\./P\d+\.pdf)"', html)
            if not m:
                raise RuntimeError("无 PDF 附件")
            pdf_url = urljoin(url, m.group(1))
            warnings = []
            data = fetch_cnic.parse_pdf(fetch_bytes(pdf_url), warnings)
            data.update({"source_url": url, "pdf_url": pdf_url,
                         "year": year, "week": week, "published": published,
                         "warnings": warnings})
            fetch.archive_cnic(data)
            ok += 1
            print("[%d/%d] %d年第%d周 OK%s" % (i, len(todo), year, week,
                  "（警告 %d 项）" % len(warnings) if warnings else ""))
        except Exception as exc:
            fail += 1
            print("[%d/%d] %d年第%d周 失败: %s" % (i, len(todo), year, week, exc), file=sys.stderr)
        time.sleep(args.delay)

    fetch.build_trends()
    print("回补完成：成功 %d，失败 %d。trends.json 已重建。" % (ok, fail))
    sys.exit(0 if fail == 0 else 2)


if __name__ == "__main__":
    main()
