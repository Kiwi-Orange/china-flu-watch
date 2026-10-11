# 全国呼吸道传染病周报监测

一个纯静态网站，聚合中国官方每周发布的呼吸道传染病监测数据：全国及南北方流感样病例（ILI%）水平、11 种呼吸道病原体检测阳性率与周度热力图、各流感季对比、重点城市动态，并基于多年历史序列给出 ILI% 未来 4 周统计预测。页面右上角可切换中英文（英文说明见文末 English 段）。

- 数据来源（均为公开页面，免鉴权）：
  - [中国疾控中心 · 全国急性呼吸道传染病哨点监测情况](https://www.chinacdc.cn/jksj/jksj04_14275/)（每周，HTML 表格）
  - [国家流感中心 · 中国流感监测周报](https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/)（每周，HTML 摘要 + PDF 全文）
  - [重庆疾控 · 急性呼吸道传染病哨点监测](https://www.cqcdc.org/index.php?a=lists&catid=209)（每周，城市级）
  - [上海市卫健委 · 传染病疫情报告](https://wsjkw.sh.gov.cn/yqxx/index.html)（每月，含流感病例数，城市级）
- 更新机制：GitHub Actions 每周五凌晨（北京时间）运行 `fetch.py`，周六上午补抓一次（应对迟发），抓取数据并提交 `data/` 到仓库（见 `.github/workflows/update.yml`，也可在 Actions 页面手动触发）
- 前端：原生 HTML/CSS/JS，无任何外部依赖和 CDN，图表为手写 SVG（折线图支持悬浮十字线读数；含预测回测诊断图、各流感季对比视图与病原体阳性率周度热力图）；界面中英双语，语言选择记入 localStorage

## 本地开发

```bash
# 需要 Python 3 标准库 + 系统 pdftotext（macOS: brew install poppler；Debian/Ubuntu: apt install poppler-utils）
python3 fetch.py               # 抓取数据，生成 data/latest.json、trends.json、forecast.json 并归档 CSV
python3 -m http.server 8000    # 本地预览
# 打开 http://localhost:8000
```

## 部署

推送到 GitHub 后，在仓库 Settings → Pages 中选择从 `main` 分支根目录（`/`）部署即可。

## 代码结构

- `fetch.py`：主编排。调度各抓取模块，写 `data/latest.json` / `data/trends.json`，维护 `data/archive/` 归档，并调用 `predict.py` 生成 `data/forecast.json`
- `fetch_common.py`：HTTP 重试、HTML 表格解析、pdftotext 封装
- `fetch_sentinel.py`：中疾控哨点监测周报（全国 + 南北方，11 种病原体）
- `fetch_cnic.py`：国家流感中心流感周报 PDF（ILI% 含往年同期、实验室检测、暴发疫情）
- `fetch_cities.py`：城市级源（重庆周更、上海月更）
- `predict.py`：ILI% 短期预测（纯标准库统计外推，失败不阻断主流程）

## ILI% 短期预测与回测（forecast.json）

**候选模型族**（共 13 个，全部只用"当期为止"的历史拟合）：

| 族 | 说明 |
|---|---|
| `clim` | 季节基线（同周指数加权均值 + 循环平滑）+ 异常按固定 0.65^h 衰减——第一版方法，留作对照 |
| `harmK` | 截距 + K 阶傅里叶谐波（年周期），纯季节拟合 |
| `arK` | 谐波 + 近期水平（最近一周值、最近 4 周均值）的直接多步回归 |
| `fullK` | `arK` + 去年同期值（目标周前 52 周） |
| `decK` | 分解式：谐波基线 + 异常自回归，持续性 ρ 由残差估计，异常取近期残差几何加权 |
| `decc` | 同上但基线用同周加权均值，用于单独检验"估计 ρ"相对固定 0.65 的收益 |

拟合用岭回归（正规方程增量累积 + 高斯消元，纯标准库，无第三方依赖），λ 固定 1。

**为什么是等权组合而不是挑最优模型**：逐预见期挑选单个最优模型在回测里并不比等权组合更好，而且挑选会用"将来的误差"决定"过去的模型"，报出的精度偏乐观。等权组合是先验规则，不做任何挑选，因此回测误差就是这套流程当时真实会交付的精度。

**走窗回测**：逐起点推进，每个起点只用 ≤t 的数据出预测，再与实际值比较。预测区间取组合误差的经验分位数，前 50% 起点标定 q10/q90，后 50% 作为留出期评估 80% 命中率（标定样本 <30 时改用按 √h 缩放的合并分位数）。

2026-10 回测结果（每期组合全部 13 个模型，起点数：南方 250 / 北方 241）：

| 区域 | 1 步 MAE（旧法 → 现流程） | 4 步 MAE | 80% 命中率（1/4 步，留出期） |
|---|---|---|---|
| 南方 | 0.94 → **0.77**（-18%） | 1.54 → **1.32** | 74% / 67% |
| 北方 | 0.65 → **0.53**（-18%） | 1.13 → **0.97** | 73% / 71% |

区间略偏窄（名义 80%、实测 67–76%），原因是留出期包含冬季大峰、误差大于标定前半段；页面上如实展示实测命中率，不做粉饰。

预测结果随每周抓取自动重算。ILI% 受气候、流行毒株、假期就诊行为等影响，短期外推无法预判突发波动，仅供参考。

## 降级与容错

- 单个字段解析失败只记入 `warnings`，不中断整体
- 单个数据源失败时沿用上一份 `latest.json` 中对应部分并标记 `stale`（页面显示"沿用旧数据"）
- 全国两个源同时失败时任务以非零码退出，不覆盖旧数据；城市源失败不影响全国数据
- 归档 CSV 按键去重合并、原子重写，某次运行失败产生的缺口会在后续运行自动回补

## 历史回补

两个一次性回补脚本（可安全重跑，已归档期次自动跳过）：

```bash
python3 backfill_cnic.py                # 流感周报 PDF，默认 2024 年起（约 140 期）
python3 backfill_cnic.py --from-year 2023   # 可继续前推
python3 backfill_sentinel.py            # 哨点监测周报，2024W46 起约 100 期
```

注意：两个脚本都会写 `ili-weekly.csv`，请勿并发运行。流感周报正文含"前一周 / 往年同期"对照值，回补 2024 年以来的全部周报即可重建 2023–2026 年的南北方 ILI% 完整周序列（`source` 列区分本周值 / 前一周值 / 同期对照值）。

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

---

# English

A static site aggregating China's official weekly respiratory-disease surveillance data, with a Chinese/English toggle in the page header (choice is remembered; `?lang=en` or `?lang=zh` forces a language).

## What the site shows

- **ILI% trend** — influenza-like illness share of outpatient visits (South / North from the National Influenza Center weekly report; National from China CDC sentinel surveillance), with a 5-year history that accumulates weekly
- **ILI% short-term forecast** — 4-week point estimates with 80% intervals, plus past-season peak statistics
- **ILI% by flu season** — seasons aligned from week 27 so the winter peak stays in one season; current season highlighted
- **Pathogen test positivity** — 11 respiratory pathogens from sentinel hospitals, outpatient ILI and inpatient SARI
- **Weekly pathogen positivity heatmap** — the same data as a weekly heatmap (88+ weeks × 11 pathogens)
- **Key cities** — Chongqing (weekly) and Shanghai (monthly)
- **Official analysis** — verbatim Chinese text from the source reports, marked as such in English mode

All charts support hover readouts.

## Data sources (public pages, no auth)

- [China CDC · National acute respiratory disease sentinel surveillance](https://www.chinacdc.cn/jksj/jksj04_14275/) (weekly, HTML tables)
- [National Influenza Center · China weekly influenza report](https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/) (weekly, HTML summary + PDF)
- [Chongqing CDC](https://www.cqcdc.org/index.php?a=lists&catid=209) (weekly, city level)
- [Shanghai Health Commission](https://wsjkw.sh.gov.cn/yqxx/index.html) (monthly, city level)

## How it updates

GitHub Actions runs `fetch.py` every Friday early morning (Beijing time) with a Saturday retry, commits the refreshed `data/` back to the repo, and GitHub Pages redeploys automatically (see `.github/workflows/update.yml`; can also be triggered manually from the Actions tab).

## Local development

```bash
# Requires Python 3 standard library + system pdftotext
# (macOS: brew install poppler; Debian/Ubuntu: apt install poppler-utils)
python3 fetch.py               # fetch data → data/latest.json, trends.json, forecast.json, archive CSVs
python3 -m http.server 8000    # preview at http://localhost:8000
```

## Code structure

- `fetch.py` — orchestrator: schedules the fetchers, writes `data/latest.json` / `trends.json`, maintains `data/archive/`, calls `predict.py`
- `fetch_common.py` — HTTP retry, HTML table parsing, pdftotext wrapper
- `fetch_sentinel.py` — China CDC sentinel weekly report (national + South/North, 11 pathogens)
- `fetch_cnic.py` — National Influenza Center weekly report PDF (ILI% incl. prior-year comparison, lab testing, outbreaks)
- `fetch_cities.py` — city-level sources (Chongqing weekly, Shanghai monthly)
- `predict.py` — ILI% short-term forecast (pure-stdlib statistical extrapolation; failure never blocks the main pipeline)
- `backfill_cnic.py` / `backfill_sentinel.py` — one-off history backfill scripts (safe to re-run)

## Forecast & backtest (`data/forecast.json`)

**13 candidate models**, each fit only on data available at the time: a seasonal baseline with fixed anomaly decay (`clim`, the first version — kept as reference), Fourier-harmonic ridge regressions (`harmK`), harmonic + recent-level direct regressions (`arK`), the same plus last-year's same week (`fullK`), and decomposition models — harmonic baseline plus an AR anomaly whose persistence ρ is estimated from the data (`decK` / `decc`). All fitting is ridge regression solved by incremental normal equations and Gaussian elimination — pure standard library, no third-party dependencies.

**Why an equal-weight combination instead of picking the best model**: per-horizon model picking did not beat equal-weight combination in the backtest, and picking uses future errors to choose past models, which flatters the reported accuracy. Equal weighting is an a priori rule, so the walk-forward errors are exactly what this pipeline would have delivered at the time.

**Walk-forward backtest**: at every origin the pipeline predicts using only data available then; intervals come from empirical quantiles of the combined errors (calibrated on the first half of origins, hit rate measured on the holdout half).

October 2026 backtest (all 13 models combined; 250 origins for South, 241 for North):

| Region | 1-step MAE (v1 → now) | 4-step MAE | 80% interval hit rate (1/4-step, holdout) |
|---|---|---|---|
| South | 0.94 → **0.77** (−18%) | 1.54 → **1.32** | 74% / 67% |
| North | 0.65 → **0.53** (−18%) | 1.13 → **0.97** | 73% / 71% |

Intervals run a little narrow (nominal 80%, measured 67–76%) because the holdout window contains a winter peak with larger errors than the calibration half; the site reports the measured hit rate as-is.

Series with fewer than 30 weeks are not forecast; fewer than 90 weeks or fewer than 2 complete seasons are flagged `low_confidence` (currently only the national series, which starts at 2025W24). Season peaks are computed per flu season (week 27 through week 26 of the next year).

## Data archive (`data/archive/`)

Raw public data, all times Beijing time, no quality control: `ili-weekly.csv` (long-format ILI% with a `source` column: current / prev_week / comparison), `sentinel-pathogens.csv`, `lab-weekly.csv`, `outbreaks-weekly.csv`, `city-weekly-top.csv`, `city-monthly-cases.csv`. Column details are in the Chinese section above.

Note: the national sentinel "ILI%" and the influenza-report "South/North ILI%" come from two different surveillance networks — small differences are expected. Shanghai's monthly "influenza" figure is a notifiable-disease case count (Class C) and is not comparable to sentinel positivity rates. The Shanghai source is only reachable from mainland China networks, so the GitHub Actions run keeps older data (marked stale); refresh it by running `python3 fetch.py` locally.
