# 全国呼吸道传染病周报监测

一个纯静态网站，聚合中国官方每周发布的呼吸道传染病监测数据：全国及南北方流感样病例（ILI%）水平、11 种呼吸道病原体检测阳性率、流感病毒型别构成、暴发疫情与重点城市动态。

- 数据来源（均为公开页面，免鉴权）：
  - [中国疾控中心 · 全国急性呼吸道传染病哨点监测情况](https://www.chinacdc.cn/jksj/jksj04_14275/)（每周，HTML 表格）
  - [国家流感中心 · 中国流感监测周报](https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/)（每周，HTML 摘要 + PDF 全文）
  - [重庆疾控 · 急性呼吸道传染病哨点监测](https://www.cqcdc.org/index.php?a=lists&catid=209)（每周，城市级）
  - [上海市卫健委 · 传染病疫情报告](https://wsjkw.sh.gov.cn/yqxx/index.html)（每月，含流感病例数，城市级）
- 更新机制：GitHub Actions 每周五凌晨（北京时间）运行 `fetch.py`，周六上午补抓一次（应对迟发），抓取数据并提交 `data/` 到仓库（见 `.github/workflows/update.yml`，也可在 Actions 页面手动触发）
- 前端：原生 HTML/CSS/JS，无任何外部依赖和 CDN，图表为手写 SVG

## 本地开发

```bash
# 需要 Python 3 标准库 + 系统 pdftotext（macOS: brew install poppler；Debian/Ubuntu: apt install poppler-utils）
python3 fetch.py               # 抓取数据，生成 data/latest.json、data/trends.json 并归档 CSV
python3 -m http.server 8000    # 本地预览
# 打开 http://localhost:8000
```

## 部署

推送到 GitHub 后，在仓库 Settings → Pages 中选择从 `main` 分支根目录（`/`）部署即可。

## 代码结构

- `fetch.py`：主编排。调度各抓取模块，写 `data/latest.json` / `data/trends.json`，维护 `data/archive/` 归档
- `fetch_common.py`：HTTP 重试、HTML 表格解析、pdftotext 封装
- `fetch_sentinel.py`：中疾控哨点监测周报（全国 + 南北方，11 种病原体）
- `fetch_cnic.py`：国家流感中心流感周报 PDF（ILI% 含往年同期、实验室检测、暴发疫情）
- `fetch_cities.py`：城市级源（重庆周更、上海月更）

## 降级与容错

- 单个字段解析失败只记入 `warnings`，不中断整体
- 单个数据源失败时沿用上一份 `latest.json` 中对应部分并标记 `stale`（页面显示"沿用旧数据"）
- 全国两个源同时失败时任务以非零码退出，不覆盖旧数据；城市源失败不影响全国数据
- 归档 CSV 按键去重合并、原子重写，某次运行失败产生的缺口会在后续运行自动回补

## 数据归档（data/archive/）

所有时间为北京时间，均为公开页面的原始归档，未做质量控制：

- `ili-weekly.csv`：ILI% 长表。列：`year,week,scope,pct,source`。scope ∈ national（哨点周报口径）/ south / north（流感周报口径）；source 标记该值来自当周报告（current）、下周报告回述（prev_week）还是往年同期对照（comparison）——同一 (year,week,scope) 只保留优先级最高的来源
- `sentinel-pathogens.csv`：哨点周报 11 种病原体阳性率。列：`year,week,pathogen,outpatient_pct,outpatient_wow,inpatient_pct,inpatient_wow`（outpatient = 门急诊 ILI 病例，inpatient = 住院 SARI 病例，wow = 较上周百分点变化）
- `lab-weekly.csv`：流感周报表 1 实验室检测。列：`year,week,region(south/north/total),tested,positive,positive_pct,a,h1n1pdm09,h3n2,a_unsubtyped,b,b_unlineaged,victoria,yamagata`
- `outbreaks-weekly.csv`：暴发疫情。列：`year,week,week_total,week_by_type_json,season_total,season_south,season_north,season_regions_json`（暴发定义：一周内同一地区/单位 10 例及以上 ILI）
- `city-weekly-top.csv`：城市周排行长表。列：`city,year,week,scene(outpatient/inpatient),rank,pathogen,pct`
- `city-monthly-cases.csv`：城市月度法定传染病。列：`city,year,month,flu_cases,flu_deaths,covid_cases,total_cases,total_deaths`

### 口径注意

- 哨点周报"全国 ILI%"与流感周报"南/北方 ILI%"来自两套监测网络，数值略有差异属正常
- 上海月度"流行性感冒"为法定传染病报告发病数（丙类），与哨点阳性率口径完全不同，不可直接比较
- 重庆为周更但发布滞后全国约 1–2 周
- 上海卫健委站点仅境内网络可达：GitHub Actions 抓取会因 TLS 握手失败而沿用旧数据（标记 stale），上海数据靠境内本地运行 `python3 fetch.py` 刷新（月度更新，每月跑一次即可）

### 未接入的源（调研结论）

- 北京：疾控周报 2023 年底停发，现仅有月度概况且无流感单病种数字
- 广东：省周报在 2026 年非流行季暂停，且历史文章链接不稳定
- 深圳：自有流感指数 2022 年停发，现仅转载省报
- 香港：CHP 流感速递每周更新且有 CSV（`chp.gov.hk/files/misc/flux_data.csv`），但该站需要境外网络可达；本机与部分网络环境访问失败，待验证后接入
- 成都/杭州：未找到 2026 年仍在更新的城市级公开源

## 免责声明 / Disclaimer

本站为个人非营利信息展示项目，数据仅供参考，不构成医疗建议。原始数据归中国疾控中心、国家流感中心及各地方发布机构所有，如有出入以官方发布为准。

This is a personal, non-profit project aggregating publicly released weekly respiratory-disease surveillance reports in China. Data are for reference only and do not constitute medical advice; all rights belong to the original publishers.
