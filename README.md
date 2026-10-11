# 全国呼吸道传染病周报监测

一个纯静态网站，聚合中国官方每周发布的呼吸道传染病监测数据：全国及南北方流感样病例（ILI%）水平、11 种呼吸道病原体检测阳性率（与去年同期对照）与近一年走势小图、各流感季对比、重点城市动态，并基于多年历史序列给出 ILI% 未来 4 周统计预测。页面右上角可切换中英文（英文说明见文末 English 段）。

- 数据来源（均为公开页面，免鉴权）：
  - [中国疾控中心 · 全国急性呼吸道传染病哨点监测情况](https://www.chinacdc.cn/jksj/jksj04_14275/)（每周，HTML 表格）
  - [国家流感中心 · 中国流感监测周报](https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/)（每周，HTML 摘要 + PDF 全文）
  - [重庆疾控 · 急性呼吸道传染病哨点监测](https://www.cqcdc.org/index.php?a=lists&catid=209)（每周，城市级）
  - [上海市卫健委 · 传染病疫情报告](https://wsjkw.sh.gov.cn/yqxx/index.html)（每月，含流感病例数，城市级）
  - [天津市疾控局 · 工作动态](https://wsjk.tj.gov.cn/tjsjbyf/xwdt/gzdt/)（每月，流感病例数在月报附件的分病种统计表 DOCX 里，城市级）
- 更新机制：GitHub Actions 每周五凌晨（北京时间）运行 `fetch.py`，周六上午补抓一次（应对迟发），抓取数据并提交 `data/` 到仓库（见 `.github/workflows/update.yml`，也可在 Actions 页面手动触发）
- 前端：原生 HTML/CSS/JS，无任何外部依赖和 CDN，图表为手写 SVG（折线图支持悬浮十字线读数；主图为「本季 vs 历年同期」包络图——灰带＝历年同期最高–最低、灰线＝中位，彩色线为本季 + 4 周预测；完整历史原始走势收在折叠区；另有预测回测诊断图、病原体阳性率「本周点 + 去年同期区间」图与「每个病原体一条迷你走势（近一年 vs 去年同期）」小倍数图；每张图的完整密集版本（原始周序列、周度热力图）分别收在折叠区）；界面中英双语，语言选择记入 localStorage

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

**怎么组合（权重怎么算）**：每个预见期把当时能出预测的候选模型加权平均，权重 `w_i ∝ exp(−γ·MAE_i)`——历史误差越小的模型权重越高。其中

- `MAE_i` 只用"该起点当时已经能观测到"的误差估计（误差要等目标周过去才可见），因此不看未来、没有选择性偏差；
- 权重强度 `γ` 也由数据自选：每个起点在 `γ ∈ {0, 0.5, 1, 2, 3, 5, 8}` 里挑"当时可见误差最小"的那个（`γ = 0` 即等权）。实测结果是 1 步自动偏大（南方 γ=5、北方 γ=8）、3–4 步退回接近等权（γ≤1），这与"权重估计噪声大时应向等权收缩"的经典结论一致；
- 集成成员不足 5 个观测误差的模型按已入选成员的平均 MAE 处理。

实测：按此加权后 1 步 MAE 从等权的 0.71/0.52（南方/北方）降到 **0.60/0.45**；而"逐预见期挑单个最优模型"在 2 步以上反而更差（南方 4 步 1.41 vs 加权 1.28），所以没有采用挑选。

**走窗回测**：逐起点推进，每个起点只用 ≤t 的数据出预测，再与实际值比较。预测区间取组合误差的经验分位数，前 50% 起点标定 q10/q90，后 50% 作为留出期评估 80% 命中率（标定样本 <30 时改用按 √h 缩放的合并分位数）。

2026-10 回测结果（13 个候选模型按上述加权组合，起点数：南方 277 / 北方 274）：

| 区域 | 各预见期 MAE：旧法 → 现流程 | 80% 命中率（1/2/3/4 步，留出期） |
|---|---|---|
| 南方 | 0.93 → **0.60** / 1.22 → **0.93** / 1.43 → **1.17** / 1.47 → **1.28**（-35%/-24%/-18%/-13%） | 89% / 77% / 84% / 78% |
| 北方 | 0.65 → **0.45** / 0.84 → **0.68** / 1.00 → **0.83** / 1.02 → **0.88**（-31%/-19%/-17%/-14%） | 88% / 84% / 83% / 83% |

（冬季大峰落在留出期时命中率会低于名义 80%，页面按预见期如实展示实测值。）

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
- `city-monthly-cases.csv`：城市月度法定传染病。列：`city,year,month,flu_cases,flu_deaths,covid_cases,total_cases,total_deaths`（`city` 为 shanghai / tianjin；天津的 `flu_cases` 来自月报附件的分病种统计表 DOCX，上海的来自月报正文表格）

### 口径注意

- 哨点周报"全国 ILI%"与流感周报"南/北方 ILI%"来自两套监测网络，数值略有差异属正常
- 上海、天津的月度"流行性感冒"为法定传染病报告发病数（丙类），与哨点阳性率口径完全不同，不可直接比较
- 重庆为周更但发布滞后全国约 1–2 周；天津月报在次月中旬发布，且其站点（网宿 WAF）对高频抓取会返回 JS 挑战页，脚本已做 cookie 回带与退避重试
- 上海卫健委、天津疾控局站点均仅境内网络可达：GitHub Actions 抓取会因 TLS/重定向失败而沿用旧数据（标记 stale），这些城市数据靠境内本地运行 `python3 fetch.py` 刷新（月度更新，每月跑一次即可）

### 未接入的源（调研结论）

- **北京**：全市公开渠道**没有任何城市级流感量化指标**。呼吸道传染病周报 2023 年底停发（最后一期覆盖 2023-12-25~12-31，之后未恢复）；现行《北京市法定传染病报告情况》月报正文只有"共报告法定传染病 N 种 X 例，死亡 Y 例"+ 主要病种**名称**列表（含"流行性感冒"但无数字），拿不到发病数/ILI%/阳性率；`bjcdc.org` 本机与 Actions 均不可达（站点本身活着，只是转载卫健委月报）。故不接入（可选方案是新增一个口径不同的"法定传染病总量"指标，已放弃）。
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
- **This season vs previous seasons** — seasons aligned from week 27 (so the winter peak stays inside one season); a gray band shows the highest–lowest range across previous seasons at the same week, a gray line their median, and the colored line is this season plus its 4-week forecast (the full raw weekly history sits behind a collapsible section)
- **Pathogen test positivity vs last year** — 11 respiratory pathogens from sentinel hospitals (outpatient ILI and inpatient SARI); each is drawn as a dot against the same weeks (±3) of last season (band) plus its median, so an unusual level is visible instead of having to be inferred from a ranking. Caveats stated on the card: the sentinel report publishes positivity only, so no confidence interval is computable, and with ~2 years of archive the reference set is thin (~7 weekly samples from one season)
- **Pathogen positivity trend (small multiples)** — one mini chart per pathogen: last 52 weeks against the same weeks a year earlier, each row with its own y-scale; the dense weekly heatmap (88+ weeks × 11 pathogens) is kept behind a collapsible section
- **Key cities** — Chongqing (weekly), Shanghai and Tianjin (monthly notifiable-disease reports, including influenza case counts)
- **Official analysis** — verbatim Chinese text from the source reports, marked as such in English mode

All charts support hover readouts.

Municipality coverage: Chongqing, Shanghai and Tianjin are connected. Beijing is not — it publishes no city-level quantitative influenza indicator at all (the weekly respiratory report stopped at the end of 2023 and has not resumed; the current monthly report gives only the total notifiable-disease count plus a list of disease *names* that includes "influenza" without a number), so adding it would mean showing a non-comparable metric.

## Data sources (public pages, no auth)

- [China CDC · National acute respiratory disease sentinel surveillance](https://www.chinacdc.cn/jksj/jksj04_14275/) (weekly, HTML tables)
- [National Influenza Center · China weekly influenza report](https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/) (weekly, HTML summary + PDF)
- [Chongqing CDC](https://www.cqcdc.org/index.php?a=lists&catid=209) (weekly, city level)
- [Shanghai Health Commission](https://wsjkw.sh.gov.cn/yqxx/index.html) (monthly, city level)
- [Tianjin CDC Bureau](https://wsjk.tj.gov.cn/tjsjbyf/xwdt/gzdt/) (monthly; the influenza figure lives in a DOCX attachment of the monthly report, city level)

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

**How the models are combined (how the weights are computed)**: at each horizon the candidates are averaged with weights `w_i ∝ exp(−γ·MAE_i)` — models with smaller historical errors get more weight, where

- `MAE_i` uses only errors that were *observable at that origin* (an error becomes visible once its target week has passed), so nothing future is used and there is no selection bias;
- the weight strength `γ` is itself chosen from `{0, 0.5, 1, 2, 3, 5, 8}` per origin and horizon by the smallest observable combined error (`γ = 0` means equal weights). In practice the 1-step horizon picks large γ (South 5, North 8) while 3–4-step horizons shrink back to near-equal weights (γ ≤ 1) — matching the classical result that noisy weight estimates should be shrunk toward equal weights;
- members with fewer than 5 observed errors are assigned the average MAE of those that qualify.

Measured: this weighting cuts 1-step MAE from 0.71/0.52 (equal weights, South/North) to **0.60/0.45**; picking the single best model per horizon is worse beyond 2 steps (South 4-step 1.41 vs 1.28), so it was not used.

**Walk-forward backtest**: at every origin the pipeline predicts using only data available then; intervals come from empirical quantiles of the combined errors (calibrated on the first half of origins, hit rate measured on the holdout half).

October 2026 backtest (13 candidates combined with the weights above; 277 origins for South, 274 for North):

| Region | MAE per horizon: v1 → now | 80% interval hit rate (1/2/3/4-step, holdout) |
|---|---|---|
| South | 0.93 → **0.60** / 1.22 → **0.93** / 1.43 → **1.17** / 1.47 → **1.28** (−35%/−24%/−18%/−13%) | 89% / 77% / 84% / 78% |
| North | 0.65 → **0.45** / 0.84 → **0.68** / 1.00 → **0.83** / 1.02 → **0.88** (−31%/−19%/−17%/−14%) | 88% / 84% / 83% / 83% |

(When a winter peak falls inside the holdout window, coverage drops below the nominal 80%; the site reports the measured value per horizon.)

Series with fewer than 30 weeks are not forecast; fewer than 90 weeks or fewer than 2 complete seasons are flagged `low_confidence` (currently only the national series, which starts at 2025W24). Season peaks are computed per flu season (week 27 through week 26 of the next year).

## Data archive (`data/archive/`)

Raw public data, all times Beijing time, no quality control: `ili-weekly.csv` (long-format ILI% with a `source` column: current / prev_week / comparison), `sentinel-pathogens.csv`, `lab-weekly.csv`, `outbreaks-weekly.csv`, `city-weekly-top.csv`, `city-monthly-cases.csv`. Column details are in the Chinese section above.

Note: the national sentinel "ILI%" and the influenza-report "South/North ILI%" come from two different surveillance networks — small differences are expected. Shanghai's monthly "influenza" figure is a notifiable-disease case count (Class C) and is not comparable to sentinel positivity rates. The Shanghai source is only reachable from mainland China networks, so the GitHub Actions run keeps older data (marked stale); refresh it by running `python3 fetch.py` locally.
