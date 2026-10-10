#!/usr/bin/env python3
"""公共工具：HTTP 抓取与 HTML 表格解析。

仅使用 Python 3 标准库。PDF 文本提取依赖系统 pdftotext（poppler-utils），
缺失时相关数据源降级而不是整体失败。
"""

import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import os

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ChinaFluWatch/1.0; +github-actions)"}
TIMEOUT = 20
RETRIES = 3

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")


def fetch_bytes(url):
    """GET 字节流，20s 超时，最多 3 次重试，指数退避。"""
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.read()
        except Exception as exc:
            last_err = exc
            print("请求失败(%d/%d) %s: %s" % (attempt + 1, RETRIES, url, exc), file=sys.stderr)
            if attempt < RETRIES - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError("多次请求失败 %s: %s" % (url, last_err))


def fetch_text(url, encoding="utf-8"):
    return fetch_bytes(url).decode(encoding, errors="replace")


TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"[\s ]+")


def html_to_text(html):
    """去 script/style/标签，折叠空白为单空格，供正则提取。"""
    t = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S | re.I)
    t = TAG_RE.sub(" ", t)
    import html as html_mod
    t = html_mod.unescape(t)
    return SPACE_RE.sub(" ", t)


def parse_tables(html):
    """把页面中的 <table> 解析为二维文本数组列表（不处理跨行合并，调用方自行处理）。"""
    tables = []
    for tb in re.findall(r"<table.*?</table>", html, re.S | re.I):
        rows = []
        for tr in re.findall(r"<tr.*?</tr>", tb, re.S | re.I):
            cells = []
            for td in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I):
                t = html_to_text(td).strip()
                cells.append(t)
            rows.append(cells)
        tables.append(rows)
    return tables


def to_float(s):
    """从 '4.8'、'+0.5'、'-1.9'、'4.8%' 等文本取浮点数；失败返回 None。"""
    if s is None:
        return None
    m = re.search(r"[+-]?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def pdftotext_available():
    return shutil.which("pdftotext") is not None


def pdf_to_text(pdf_bytes):
    """pdftotext -layout 转文本；不可用时返回 None。"""
    if not pdftotext_available():
        print("警告：未找到 pdftotext，跳过 PDF 解析（apt install poppler-utils 可提供）", file=sys.stderr)
        return None
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf_bytes)
        pdf_path = f.name
    txt_path = pdf_path + ".txt"
    try:
        subprocess.run(["pdftotext", "-layout", pdf_path, txt_path],
                       check=True, timeout=120, capture_output=True)
        with open(txt_path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as exc:
        print("pdftotext 解析失败: %s" % exc, file=sys.stderr)
        return None
    finally:
        for p in (pdf_path, txt_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def norm_pdf_text(t):
    """折叠每行内部空白为单空格（pdftotext -layout 的列对齐），保留换行。"""
    return "\n".join(re.sub(r"[ \t ]+", " ", line).strip() for line in t.splitlines())
