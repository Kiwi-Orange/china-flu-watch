#!/usr/bin/env python3
"""历史回补：中疾控《全国急性呼吸道传染病哨点监测情况》周报。

哨点监测系列自 2024 年第 46 周起发布（列表共 8 页）。纯 HTML 页面，轻量。
已归档（sentinel-pathogens.csv 中存在该年周的记录）的期次自动跳过，可安全重跑。

注意：本脚本与 backfill_cnic.py 都会写 ili-weekly.csv，请勿并发运行。

用法：python3 backfill_sentinel.py [--delay 0.4]
"""

import argparse
import re
import sys
import time
from urllib.parse import urljoin

import fetch
import fetch_sentinel
from fetch_common import fetch_text

LIST_URL = fetch_sentinel.LIST_URL
PAGE_URL = lambda n: urljoin(LIST_URL, "index.html" if n == 0 else "index_%d.html" % n)
LINK_RE = fetch_sentinel.LINK_RE
NUM_PAGES = 8


def list_reports():
    found = []
    for page in range(NUM_PAGES):
        html = fetch_text(PAGE_URL(page))
        items = LINK_RE.findall(html)
        if not items:
            break
        for href, text, week, pub in items:
            m = re.search(r"(\d{4})\s*年第\s*" + week + r"\s*周", text)
            if m:
                found.append((urljoin(LIST_URL, href), int(m.group(1)), int(week), pub or None))
        time.sleep(0.3)
    seen = {(y, w): (url, y, w, p) for url, y, w, p in found}
    return sorted(seen.values(), key=lambda t: (t[1], t[2]), reverse=True)


def archived_weeks():
    done = set()
    for r in fetch.read_csv_rows(fetch.PATHOGEN_CSV)[1:]:
        if len(r) == 7:
            done.add((int(r[0]), int(r[1])))
    return done


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=0.4)
    args = ap.parse_args()

    reports = list_reports()
    done = archived_weeks()
    todo = [r for r in reports if (r[1], r[2]) not in done]
    print("共发现 %d 期，待回补 %d 期" % (len(reports), len(todo)))

    ok, fail = 0, 0
    for i, (url, year, week, published) in enumerate(todo, 1):
        try:
            html = fetch_text(url)
            data = fetch_sentinel.parse_detail(html, url, year, week, published)
            fetch.archive_sentinel(data)
            ok += 1
            print("[%d/%d] %d年第%d周 OK%s" % (i, len(todo), year, week,
                  "（警告 %d 项）" % len(data["warnings"]) if data["warnings"] else ""))
        except Exception as exc:
            fail += 1
            print("[%d/%d] %d年第%d周 失败: %s" % (i, len(todo), year, week, exc), file=sys.stderr)
        time.sleep(args.delay)

    fetch.build_trends()
    print("回补完成：成功 %d，失败 %d。trends.json 已重建。" % (ok, fail))
    sys.exit(0 if fail == 0 else 2)


if __name__ == "__main__":
    main()
