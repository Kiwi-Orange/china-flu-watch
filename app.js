/* 全国呼吸道传染病周报监测 / China Respiratory Disease Weekly Monitor
   纯原生 JS，无外部依赖。数据：data/latest.json + data/trends.json + data/forecast.json */

/* ---------- 中英双语 ---------- */
const I18N = {
  zh: {
    title: "全国呼吸道传染病周报监测",
    subtitle: "中国疾控中心 · 国家流感中心公开周报聚合 | 数据仅供参考，不构成医疗建议",
    loading: "加载中…",
    updated: "数据更新：{ts}",
    stale_suffix: "（部分源抓取失败，含旧数据）",
    stale_badge: "沿用旧数据",
    kpi_nat: "全国<span class=\"term\" data-term=\"ili\">流感样病例</span>占比（{yw}）",
    kpi_nat_sub: "南方 {s} / 北方 {n}",
    kpi_south: "南方<span class=\"term\" data-term=\"ili\">流感样病例</span>占比",
    kpi_north: "北方<span class=\"term\" data-term=\"ili\">流感样病例</span>占比",
    kpi_prev: "上周 {v}",
    kpi_lab: "流感病毒<span class=\"term\" data-term=\"positivity\">检测阳性率</span>",
    kpi_lab_sub: "检测 {n} 份（流感周报）",
    kpi_top: "门急诊首位病原体",
    kpi_note: "<b>流感样病例</b>指发热（≥38℃）并伴咳嗽或咽痛、尚未确诊的病例；“占比”就是这类病例占门急诊就诊总人数的比例，用来衡量流感活跃程度，<b>不等于确诊流感的人数</b>。鼠标悬停带虚线的词可看解释。",
    trend_h2: "流感样病例占比趋势（<span class=\"term\" data-term=\"ilipct\">ILI%</span>）",
    trend_note: "哨点医院流感样病例占门急诊就诊总数比例。数据源：国家流感中心流感监测周报（南/北方）、中疾控哨点监测周报（全国）。历史数据随周报滚动累积，悬浮可逐周读数。",
    fc_h2: "流感样病例占比 · 短期预测",
    fc_range: "（生成于 {d}）",
    fc_note: "方法：13 个统计模型（季节基线、傅里叶谐波回归、谐波基线+异常自回归等）加权组合，权重按各模型的历史误差指数加权——误差越小的权重越高，且权重只用到当期为止的数据；区间由走窗回测残差标定。纯统计外推，不构成医疗建议。详见下方回测。",
    bt_h2: "预测回测（模型表现）",
    bt_note: "用走窗回测检验整套流程：每个起点只用当时可得的数据出预测，再与实际值比较——因此下面的误差就是这套流程当时会交付的精度。<span class=\"term\" data-term=\"weights\">组合权重</span>强度由回测自动挑选（近端更偏向历史误差小的模型，远端收缩回接近等权）。区间宽度在前半段标定，命中率在后半段（留出期）统计；留出样本不足 20 个时不报命中率。虚线为逐周的 1 步预测，阴影为其 80% 区间。",
    bt_mae1: "1 步<span class=\"term\" data-term=\"mae\">平均绝对误差</span>",
    bt_mae4: "4 步<span class=\"term\" data-term=\"mae\">平均绝对误差</span>",
    bt_cov1: "<span class=\"term\" data-term=\"coverage\">80% 区间命中率</span>（1 步）",
    bt_models: "每期组合模型数",
    bt_pts: "回测起点（1 步）",
    bt_obs: "实际",
    bt_pred: "1 步预测",
    bt_band: "80% 区间",
    bt_h: "<span class=\"term\" data-term=\"horizon\">预见期</span>",
    bt_mae: "<span class=\"term\" data-term=\"mae\">MAE</span>",
    bt_rmse: "RMSE",
    bt_cov: "<span class=\"term\" data-term=\"coverage\">命中率</span>",
    bt_hold: "留出样本",
    bt_base: "旧法 MAE",
    bt_cmp: "对照第一版方法（季节基线 + 固定 0.65 衰减）：1 步 MAE {b1} → {n1}（{d1}），4 步 {b4} → {n4}（{d4}）。",
    bt_improve: "降低 {p}%",
    bt_worse: "升高 {p}%",
    bt_same: "持平",
    bt_scope: "回测区间：{from} 起至 {to}，共 {n} 个起点。",
    inp: "个百分点",
    unit_pct: "%",
    fc_dir: "未来 4 周：{word}（{sign}{d} 个百分点）",
    fc_flat: "基本持平",
    fc_up: "小幅上升", fc_up_big: "明显上升",
    fc_down: "小幅下降", fc_down_big: "明显下降",
    fc_pos: "当前 {c}%，历年同期 {min}–{max}%（中位 {med}，{n} 年）",
    fc_peak_stat: "历年主高峰：多在 {from}–{to}（中位 {med}），峰值中位 {p}%（{n} 个流感季）",
    fc_week_note: "每格为接下来的一周（周一起算，悬浮看周次）；格内小字是该周的 80% 预测区间。",
    low_conf: "历史序列短，置信度低",
    env_h2: "本季走势 vs <span class=\"term\" data-term=\"fluSeason\">历年同期</span>",
    env_note: "横轴是本流感季的周次（自每年第 27 周起算，冬峰落在同一季内）。灰带＝历年同期的最高–最低范围，灰线＝历年同期中位数；彩色实线＝本季，虚线与浅色带＝未来 4 周预测及其 80% 区间。悬浮可看每周具体数值与历史区间。",
    hist_median: "历年同期（中位）",
    this_season: "本季",
    raw_show: "查看完整历史原始走势（每周数值，2019 年至今）",
    south: "南方", north: "北方", national: "全国",
    south_p: "南方省份", north_p: "北方省份",
    path_h2: "本周病原体<span class=\"term\" data-term=\"positivity\">检测阳性率</span> vs 去年同期",
    path_note: "全国哨点医院呼吸道样本核酸检测阳性率。灰带＝去年同期（同一日历年 ±3 周）的最高–最低范围，灰刻度＝中位；圆点＝本周数值，落在灰带之外即标出。两点说明：哨点周报只公布阳性率、不公布各病原体检测份数，因此算不出置信区间；归档目前只有约两年，参照集每周仅约 7 个周样本且来自单一季节，所以标记只作提示（悬浮可看参照窗口、样本数与分位）。",
    path_above: "↑ 高于去年同期",
    path_below: "↓ 低于去年同期",
    path_ref_head: "参照：去年同期同期段（同一日历年 ±3 周）",
    path_legend: "● 本周数值　▬ 去年同期范围（±3 周）　│ 去年同期中位",
    path_tip: "本周 {v}%",
    path_ref: "历年同期 {lo}–{hi}%（中位 {med}，{n} 个样本）",
    path_pct: "第 {p} 百分位",
    outp: "门急诊",
    hm_h2: "病原体<span class=\"term\" data-term=\"positivity\">阳性率</span>周度热力图",
    hm_note: "哨点周报各周核酸检测阳性率，颜色越红越高，灰色为无数据。悬浮可查看具体数值。",
    hm_out: "门急诊 ILI", hm_in: "住院 SARI",
    hm_tip: "阳性率 {v}%",
    no_data: "无数据",
    city_h2: "重点城市",
    city_cq_meta: "{y}年第{w}周（{range}）· 发布 {pub} · 周更",
    city_out3: "门急诊前三：{list}",
    city_in3: "住院前三：{list}",
    city_sh_meta: "{y}年{m}月法定传染病疫情 · 发布 {pub} · 月更",
    city_flu: "流行性感冒：{n} 例",
    city_flu_d: "流行性感冒：{n} 例（死亡 {d}）",
    city_covid: "新型冠状病毒感染：{n} 例",
    city_month_total: "全市法定传染病：{n} 例（死亡 {d}）",
    city_class_split: "乙类 {b} 例 · 丙类 {c} 例",
    city_top_c: "丙类发病数前三位：{list}",
    city_sh_note: "口径：<span class=\"term\" data-term=\"notifiable\">法定传染病</span>报告发病数（丙类含流感）。",
    city_none: "城市数据暂不可用",
    ana_h2: "官方分析与健康提示",
    ana_s: "中疾控哨点监测周报 · 分析（{yw}）",
    ana_c: "国家流感中心 · 流感周报概要（截至{d}）",
    ana_orig: "",
    glossary_h2: "术语说明",
    glossary_note: "带虚线的词可悬停或点击查看解释；这里是全部术语。",
    chart_empty: "暂无足够历史数据，随每周抓取累积",
    fc_dash_note: "虚线：未来 {h} 周预测，阴影为 80% 区间",
    forecast_tag: "（预测）",
    join: "；",
    footer_sources: '数据来源：<a href="https://www.chinacdc.cn/jksj/jksj04_14275/">中疾控 · 全国急性呼吸道传染病哨点监测情况</a>（每周）、<a href="https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/">国家流感中心 · 中国流感监测周报</a>（每周）、<a href="https://www.cqcdc.org/index.php?a=lists&catid=209">重庆疾控</a>（每周）、<a href="https://wsjkw.sh.gov.cn/yqxx/index.html">上海市卫健委</a>（每月）、<a href="https://wsjk.tj.gov.cn/tjsjbyf/xwdt/gzdt/">天津市疾控局</a>（每月）。原始数据归各发布机构所有。',
    footer_note: "本站为个人非营利信息展示项目，由 GitHub Actions 定时抓取公开网页生成；数据未经质控，如有出入以官方发布为准。",
  },
  en: {
    title: "China Respiratory Disease Weekly Monitor",
    subtitle: "Aggregated from public weekly reports by China CDC & National Influenza Center · For reference only — not medical advice",
    loading: "Loading…",
    updated: "Data updated: {ts}",
    stale_suffix: " (some sources failed; older data shown)",
    stale_badge: "older data",
    kpi_nat: "National <span class=\"term\" data-term=\"ili\">ILI</span> share ({yw})",
    kpi_nat_sub: "South {s} / North {n}",
    kpi_south: "South <span class=\"term\" data-term=\"ili\">ILI</span> share",
    kpi_north: "North <span class=\"term\" data-term=\"ili\">ILI</span> share",
    kpi_prev: "Last week {v}",
    kpi_lab: "Flu <span class=\"term\" data-term=\"positivity\">test positivity</span>",
    kpi_lab_sub: "{n} samples (weekly flu report)",
    kpi_top: "Top outpatient pathogen",
    kpi_note: "<b>Influenza-like illness (ILI)</b> means fever (≥38 °C) with cough or sore throat, without laboratory confirmation. The “share” is how many of all outpatient/emergency visits were ILI — a gauge of influenza activity, <b>not the number of confirmed influenza cases</b>. Hover the dotted terms for definitions.",
    trend_h2: "Influenza-like illness share (<span class=\"term\" data-term=\"ilipct\">ILI%</span>) trend",
    trend_note: "Share of outpatient visits that are influenza-like illness (ILI) at sentinel hospitals. Sources: National Influenza Center weekly reports (South/North); China CDC sentinel surveillance (National). History accumulates weekly — hover to read values.",
    fc_h2: "Influenza-like illness share · short-term forecast",
    fc_range: "(generated {d})",
    fc_note: "Method: 13 statistical models (seasonal baseline, Fourier-harmonic ridge, harmonic-baseline + AR-anomaly, …) combined with exponential weights on each model's historical error — smaller error, larger weight, using only data available at the time; intervals calibrated from walk-forward residuals. Pure statistical extrapolation — not medical advice. See the backtest below.",
    bt_h2: "Forecast Backtest (Model Performance)",
    bt_note: "The whole pipeline is checked by walk-forward backtest: at every origin it predicts using only data available then, and the result is compared with what actually happened — so the errors below are what this pipeline would have delivered at the time. The <span class=\"term\" data-term=\"weights\">weight strength</span> is picked automatically from the backtest (near horizons lean on the historically most accurate models; longer horizons shrink back toward equal weights). Interval widths are calibrated on the first half; hit rates are measured on the holdout half and are omitted when the holdout has fewer than 20 points. The dashed line is the weekly 1-step forecast; the band is its 80% interval.",
    bt_mae1: "1-step <span class=\"term\" data-term=\"mae\">mean abs. error</span>",
    bt_mae4: "4-step <span class=\"term\" data-term=\"mae\">mean abs. error</span>",
    bt_cov1: "<span class=\"term\" data-term=\"coverage\">80% interval hit rate</span> (1-step)",
    bt_models: "Models combined per step",
    bt_pts: "Backtest origins (1-step)",
    bt_obs: "Actual",
    bt_pred: "1-step forecast",
    bt_band: "80% interval",
    bt_h: "<span class=\"term\" data-term=\"horizon\">Horizon</span>",
    bt_mae: "MAE",
    bt_rmse: "RMSE",
    bt_cov: "Hit rate",
    bt_hold: "Holdout n",
    bt_base: "Baseline MAE",
    bt_cmp: "Versus the first version (seasonal baseline + fixed 0.65 decay): 1-step MAE {b1} → {n1} ({d1}), 4-step {b4} → {n4} ({d4}).",
    bt_improve: "{p}% lower",
    bt_worse: "{p}% higher",
    bt_same: "unchanged",
    bt_scope: "Backtest window: {from} to {to}, {n} origins.",
    inp: "pct points",
    unit_pct: "%",
    fc_dir: "Next 4 weeks: {word} ({sign}{d} pct points)",
    fc_flat: "roughly flat",
    fc_up: "slight rise", fc_up_big: "clear rise",
    fc_down: "slight fall", fc_down_big: "clear fall",
    fc_pos: "Currently {c}%; same week in past seasons {min}–{max}% (median {med}, {n} seasons)",
    fc_peak_stat: "Main peak in past seasons: usually {from}–{to} (median {med}), median peak {p}% ({n} seasons)",
    fc_week_note: "each cell is the coming week (starting Monday; hover for the ISO week); the small range below is its 80% forecast interval.",
    low_conf: "Short history — low confidence",
    env_h2: "This season vs <span class=\"term\" data-term=\"fluSeason\">previous seasons</span>",
    env_note: "The x-axis runs through the current flu season (starting at week 27, so the winter peak stays inside one season). Gray band = highest–lowest range across previous seasons at the same week; gray line = their median; colored solid line = this season; dashed line and shaded area = 4-week forecast with its 80% interval. Hover for weekly values and the historical range.",
    hist_median: "Previous seasons (median)",
    this_season: "This season",
    raw_show: "Show the full raw history (weekly values, 2019 onwards)",
    south: "South", north: "North", national: "National",
    south_p: "South", north_p: "North",
    path_h2: "Pathogen <span class=\"term\" data-term=\"positivity\">test positivity</span> this week vs last year",
    path_note: "Nucleic-acid test positivity at national sentinel hospitals. Gray band = highest–lowest range in the same weeks (±3) of last season, gray tick = its median; the dot is this week's value and is flagged when it falls outside the band. Two caveats: the sentinel report publishes positivity only, not test counts per pathogen, so no confidence interval can be computed; and the archive only spans about two years, so the reference is ~7 weekly samples from a single season — treat the flag as a hint (hover for the reference window, sample size and percentile).",
    path_above: "↑ above last year",
    path_below: "↓ below last year",
    path_ref_head: "Reference: the same weeks (±3) of last season",
    path_legend: "● this week　▬ last year's range (±3 weeks)　│ last year's median",
    path_tip: "This week {v}%",
    path_ref: "Same weeks of past seasons {lo}–{hi}% (median {med}, n={n})",
    path_pct: "percentile {p}",
    outp: "Outp.",
    hm_h2: "Weekly pathogen <span class=\"term\" data-term=\"positivity\">positivity</span> heatmap",
    hm_note: "Weekly nucleic-acid positivity from sentinel reports; darker red = higher, gray = no data. Hover for values.",
    hm_out: "Outpatient ILI", hm_in: "Inpatient SARI",
    hm_tip: "Positivity {v}%",
    no_data: "No data",
    city_h2: "Key Cities",
    city_cq_meta: "{yw} ({range}) · published {pub} · weekly",
    city_out3: "Top outpatient: {list}",
    city_in3: "Top inpatient: {list}",
    city_sh_meta: "{y}-{m} notifiable disease report · published {pub} · monthly",
    city_flu: "Influenza: {n} cases",
    city_flu_d: "Influenza: {n} cases ({d} deaths)",
    city_covid: "COVID-19: {n} cases",
    city_month_total: "All notifiable diseases: {n} cases ({d} deaths)",
    city_class_split: "Class B {b} · Class C {c}",
    city_top_c: "Top 3 Class C: {list}",
    city_sh_note: "Basis: <span class=\"term\" data-term=\"notifiable\">notifiable disease</span> reports (Class C incl. influenza).",
    city_none: "City data unavailable",
    ana_h2: "Official Analysis & Health Notes",
    ana_s: "China CDC Sentinel Weekly · Analysis ({yw})",
    ana_c: "National Influenza Center · Weekly Summary (as of {d})",
    ana_orig: " (official text, Chinese only)",
    glossary_h2: "Glossary",
    glossary_note: "Dotted terms show a definition on hover or tap; all of them are listed here.",
    chart_empty: "Not enough history yet — accumulates weekly",
    fc_dash_note: "Dashed: {h}-week forecast, shaded 80% interval",
    forecast_tag: " (forecast)",
    join: "; ",
    footer_sources: 'Sources: <a href="https://www.chinacdc.cn/jksj/jksj04_14275/">China CDC · National Acute Respiratory Disease Sentinel Surveillance</a> (weekly), <a href="https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/">National Influenza Center · China Weekly Influenza Report</a> (weekly), <a href="https://www.cqcdc.org/index.php?a=lists&catid=209">Chongqing CDC</a> (weekly), <a href="https://wsjkw.sh.gov.cn/yqxx/index.html">Shanghai Health Commission</a> (monthly), <a href="https://wsjk.tj.gov.cn/tjsjbyf/xwdt/gzdt/">Tianjin CDC Bureau</a> (monthly). All source data belong to the original publishers.',
    footer_note: "A personal non-profit project: data fetched on a schedule by GitHub Actions from public web pages, without quality control. Official releases prevail in case of discrepancies.",
  },
};
const qpLang = new URLSearchParams(location.search).get("lang");
let LANG = (qpLang === "en" || qpLang === "zh") ? qpLang
  : (localStorage.getItem("flu-lang") || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en"));
const t = (k) => I18N[LANG][k] ?? I18N.zh[k] ?? k;
function tf(k, vars) { let s = t(k); for (const v in vars) s = s.split("{" + v + "}").join(vars[v]); return s; }
const fmtYW = (y, w) => LANG === "en" ? `${y} W${w}` : `${y}年第${w}周`;

const PATHOGEN_EN = {
  "鼻病毒": "Rhinovirus", "流感病毒": "Influenza", "新型冠状病毒": "SARS-CoV-2",
  "人偏肺病毒": "HMPV", "副流感病毒": "Parainfluenza", "肠道病毒": "Enterovirus",
  "博卡病毒": "Bocavirus", "呼吸道合胞病毒": "RSV", "腺病毒": "Adenovirus",
  "普通冠状病毒": "Common coronavirus", "肺炎支原体": "M. pneumoniae",
};
const DISEASE_EN = {
  "流行性感冒": "Influenza", "其他感染性腹泻病": "Other infectious diarrhea",
  "手足口病": "Hand, foot and mouth disease", "新型冠状病毒感染": "COVID-19",
  "病毒性肝炎": "Viral hepatitis", "肺结核": "Tuberculosis", "梅毒": "Syphilis",
  "细菌性和阿米巴性痢疾": "Bacillary & amoebic dysentery", "流行性腮腺炎": "Mumps",
  "水痘": "Chickenpox", "猩红热": "Scarlet fever", "布鲁氏菌病": "Brucellosis",
  "艾滋病": "HIV/AIDS", "淋病": "Gonorrhea", "登革热": "Dengue", "猴痘": "Mpox",
  "麻疹": "Measles", "百日咳": "Pertussis", "伤寒和副伤寒": "Typhoid & paratyphoid",
  "疟疾": "Malaria", "血吸虫病": "Schistosomiasis", "流行性出血热": "Hemorrhagic fever with renal syndrome",
  "流行性乙型脑炎": "Japanese encephalitis", "狂犬病": "Rabies",
};
const pName = (n) => LANG === "en" ? (PATHOGEN_EN[n] || DISEASE_EN[n] || n) : n;

const $ = (id) => document.getElementById(id);
const fmtPct = (v) => (v === null || v === undefined) ? "—" : v + "%";
const fmtNum = (v) => (v === null || v === undefined) ? "—" : Number(v).toLocaleString();
const staleBadge = (d) => d && d.stale ? `<span class="badge-stale">${t("stale_badge")}</span>` : "";

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/* ---------- 术语解释（悬停/点击 .term 显示） ---------- */const GLOSSARY = {
  zh: {
    ili: ["流感样病例（ILI）", "发热（体温 ≥38℃）并伴咳嗽或咽痛、尚未确诊的病例。哨点医院按这一标准上报，用来代表流感等呼吸道疾病的活跃程度。"],
    ilipct: ["ILI%（流感样病例占比）", "流感样病例占门急诊就诊总人数的比例。例如 4% 表示每 100 个门急诊病人中约有 4 个是流感样病例。它衡量流感活跃程度，不等于确诊流感的人数。"],
    sari: ["SARI（住院严重急性呼吸道感染）", "需要住院的严重呼吸道感染病例，病情比流感样病例更重。"],
    positivity: ["检测阳性率", "送检的呼吸道样本中检出某种病原体的比例，反映该病原体实际的流行强度。"],
    notifiable: ["法定传染病", "法律规定必须上报的传染病。流行性感冒属丙类；月报中的数字是“报告发病数”，与哨点监测口径不同，不可直接比较。"],
    fluSeason: ["流感季", "本站指“当年第 27 周至次年第 26 周”——这样冬季高峰落在同一季内，便于逐年对比。"],
    horizon: ["预见期", "预测提前的周数：1 步＝预测下一周，4 步＝预测四周以后。"],
    coverage: ["区间命中率", "实际值落入预测区间的比例。80% 区间长期命中率接近 80%，才说明区间宽度合适。"],
    mae: ["MAE（平均绝对误差）", "预测值与实际值之差绝对值的平均，单位为百分点。例如 0.7 表示平均偏差约 0.7 个百分点。"],
    weights: ["组合权重", "本站不是只用一个模型，而是把 13 个模型加权平均：权重 w ∝ exp(−γ·MAE)，即历史误差越小的模型权重越高。MAE 与权重强度 γ 都只用“当时已能观测到”的误差估计，不看未来。"],
  },
  en: {
    ili: ["Influenza-like illness (ILI)", "Fever (≥38 °C) with cough or sore throat, without laboratory confirmation. Sentinel hospitals report cases by this definition to gauge how active influenza and other respiratory infections are."],
    ilipct: ["ILI%", "Share of outpatient/emergency visits that are influenza-like illness. 4% means roughly 4 of every 100 visits were ILI. It measures influenza activity, not the number of confirmed cases."],
    sari: ["SARI", "Severe acute respiratory infection requiring hospitalisation — more severe than ILI."],
    positivity: ["Test positivity", "Share of tested respiratory samples that are positive for a given pathogen; reflects how intensely it is circulating."],
    notifiable: ["Notifiable disease", "A disease that must be reported by law. Influenza is Class C. Monthly figures are reported case counts — a different basis from sentinel surveillance, not directly comparable."],
    fluSeason: ["Flu season", "In this project: week 27 of a year through week 26 of the next, so the winter peak stays inside one season and seasons can be compared."],
    horizon: ["Horizon", "How far ahead the forecast goes: 1-step = next week, 4-step = four weeks ahead."],
    coverage: ["Interval hit rate", "Share of actual values that fell inside the forecast interval. An 80% interval should hit about 80% of the time over the long run."],
    mae: ["MAE (mean absolute error)", "Average absolute difference between forecast and actual, in percentage points. 0.7 means an average miss of about 0.7 p.p."],
    weights: ["Combination weights", "The forecast is not a single model: 13 models are averaged with weights w ∝ exp(−γ·MAE) — historically more accurate models get more weight. Both the MAEs and the weight strength γ are estimated only from errors observable at the time, never from the future."],
  },
};

let tipShownAt = 0;

function showTermTip(el, x, y) {
  const g = GLOSSARY[LANG][el.dataset.term] || GLOSSARY.zh[el.dataset.term];
  if (!g) return;
  showTip(x, y, `<b>${g[0]}</b><br>${g[1]}`, true);
  if (tipEl) {
    tipEl.dataset.term = el.dataset.term;
    tipShownAt = Date.now();
  }
}

document.addEventListener("mouseover", (e) => {
  const el = e.target.closest && e.target.closest(".term");
  if (el) showTermTip(el, e.pageX, e.pageY);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest && e.target.closest(".term")) hideTip();
});
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest(".term");
  if (!el) return;
  // 移动端点按会先触发 mouseover 再触发 click：同一次点按不重复处理
  if (Date.now() - tipShownAt < 400 && tipEl && tipEl.dataset.term === el.dataset.term) return;
  // 已显示同一术语时，点击收起并跳到术语表该条；否则显示释义
  if (tipEl && tipEl.style.display === "block" && tipEl.dataset.term === el.dataset.term) {
    hideTip();
    const target = document.getElementById("glossary-" + el.dataset.term);
    if (target) target.scrollIntoView({ block: "center" });
  } else {
    showTermTip(el, e.pageX, e.pageY);
  }
});

/* ---------- 悬浮提示 ---------- */
let tipEl = null;
function showTip(x, y, html, wide) {
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "chart-tip"; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.classList.toggle("wide", !!wide);
  if (!wide) tipEl.dataset.term = "";
  tipEl.style.display = "block";
  tipEl.style.left = Math.min(x + 12, window.innerWidth + window.scrollX - tipEl.offsetWidth - 8) + "px";
  tipEl.style.top = (y + 14) + "px";
}
function hideTip() { if (tipEl) tipEl.style.display = "none"; }

/* ---------- 折线图（支持置信带、虚线、悬浮十字线） ---------- */
function lineChart(container, series, opts) {
  const W = 880, H = opts.height || 260, P = { l: 42, r: 12, t: 12, b: 28 };
  const all = series.flatMap(s => s.points.concat(s.band ? s.band.hi.concat(s.band.lo) : []));
  if (!all.length) { container.textContent = t("chart_empty"); return; }
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y1 = Math.max(...ys) * 1.1 || 1;
  const X = (x) => P.l + (x1 === x0 ? W / 2 : (x - x0) / (x1 - x0) * (W - P.l - P.r));
  const Y = (y) => H - P.b - y / y1 * (H - P.t - P.b);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  for (let i = 0; i <= 4; i++) {
    const yv = y1 / 4 * i;
    svg.appendChild(svgEl("line", { x1: P.l, x2: W - P.r, y1: Y(yv), y2: Y(yv), stroke: "#e5e7eb" }));
    const txt = svgEl("text", { x: P.l - 6, y: Y(yv) + 3, "text-anchor": "end", class: "axis-label" });
    txt.textContent = yv.toFixed(1);
    svg.appendChild(txt);
  }
  const xticks = [...new Set(xs)].filter((_, i, a) => i % Math.ceil(a.length / 8) === 0);
  for (const x of xticks) {
    const txt = svgEl("text", { x: X(x), y: H - 8, "text-anchor": "middle", class: "axis-label" });
    txt.textContent = opts.xLabel(x);
    svg.appendChild(txt);
  }
  for (const s of series) {
    if (s.band) {
      const up = s.band.hi.map(p => `${X(p.x)},${Y(p.y)}`);
      const dn = s.band.lo.map(p => `${X(p.x)},${Y(p.y)}`).reverse();
      svg.appendChild(svgEl("polygon", { points: up.concat(dn).join(" "), fill: s.color, "fill-opacity": 0.12 }));
    }
  }
  for (const s of series) {
    const pts = s.points.map(p => `${X(p.x)},${Y(p.y)}`).join(" ");
    const attrs = { points: pts, fill: "none", stroke: s.color, "stroke-width": s.thin ? 1.2 : 2 };
    if (s.dash) attrs["stroke-dasharray"] = "5 4";
    if (s.thin) attrs["stroke-opacity"] = 0.55;
    svg.appendChild(svgEl("polyline", attrs));
    if (s.points.length <= 60 && !s.thin)
      for (const p of s.points)
        svg.appendChild(svgEl("circle", { cx: X(p.x), cy: Y(p.y), r: s.dash ? 2 : 2.4, fill: s.color }));
  }
  if (opts.hover !== false) {
    const guide = svgEl("line", { y1: P.t, y2: H - P.b, stroke: "#9ca3af", "stroke-dasharray": "3 3", visibility: "hidden" });
    svg.appendChild(guide);
    svg.style.cursor = "crosshair";
    svg.addEventListener("mousemove", (e) => {
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width * W;
      const fx = x0 + (mx - P.l) / (W - P.l - P.r) * (x1 - x0);
      let best = null, bd = Infinity;
      for (const s of series) for (const p of s.points) {
        const d = Math.abs(p.x - fx);
        if (d < bd) { bd = d; best = p.x; }
      }
      if (best === null) return;
      guide.setAttribute("x1", X(best)); guide.setAttribute("x2", X(best));
      guide.setAttribute("visibility", "visible");
      let html = `<b>${opts.xLabel(best)}</b>`;
      for (const s of series) {
        const p = s.points.find(q => q.x === best);
        if (!p) continue;
        let line = `<br><span style="color:${s.color}">■</span> ${s.name || ""}${s.dash ? t("forecast_tag") : ""} ${p.y}%`;
        if (s.bandTip && s.band) {
          const lo = s.band.lo.find(q => q.x === best), hi = s.band.hi.find(q => q.x === best);
          if (lo && hi) line += `（${lo.y}–${hi.y}%）`;
        }
        html += line;
      }
      showTip(e.pageX, e.pageY, html);
    });
    svg.addEventListener("mouseleave", () => { guide.setAttribute("visibility", "hidden"); hideTip(); });
  }
  container.appendChild(svg);
}

/* ---------- 热力图 ---------- */
function lerpColor(c0, c1, t) {
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function heatmap(container, rows, cols, cell, opts) {
  const cw = opts.cellW || 9, rh = opts.rowH || 22, P = { l: opts.labelW || 110, t: 8, r: 8, b: 44 };
  const W = P.l + cols.length * cw + P.r, H = P.t + rows.length * rh + P.b;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  rows.forEach((rl, i) => {
    const y = P.t + i * rh;
    const label = svgEl("text", { x: P.l - 8, y: y + rh / 2 + 4, "text-anchor": "end", class: "bar-label" });
    label.textContent = rl;
    svg.appendChild(label);
    cols.forEach((ck, j) => {
      const v = cell(i, j);
      const fill = v === null || v === undefined ? "#f3f4f6"
        : lerpColor([255, 255, 255], [220, 38, 38], Math.min(Math.sqrt(v / opts.vmax), 1));
      const rect = svgEl("rect", { x: P.l + j * cw, y: y + 1, width: cw - 0.6, height: rh - 2, fill, rx: 1 });
      rect.addEventListener("mousemove", (e) =>
        showTip(e.pageX, e.pageY, `<b>${rl}</b> · ${opts.colLabel(ck)}<br>${v === null || v === undefined ? t("no_data") : tf("hm_tip", { v })}`));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
    });
  });
  const step = Math.ceil(cols.length / 11);
  cols.forEach((ck, j) => {
    if (j % step) return;
    const txt = svgEl("text", { x: P.l + j * cw + cw / 2, y: P.t + rows.length * rh + 13, "text-anchor": "middle", class: "axis-label" });
    txt.textContent = opts.colLabel(ck);
    svg.appendChild(txt);
  });
  const lw = 120, lx = W - P.r - lw, ly = H - 9;
  for (let i = 0; i < 24; i++)
    svg.appendChild(svgEl("rect", { x: lx + i * lw / 24, y: ly, width: lw / 24 + 0.6, height: 7, fill: lerpColor([255, 255, 255], [220, 38, 38], Math.sqrt(i / 23)) }));
  const g0 = svgEl("text", { x: lx, y: ly - 2, class: "axis-label", "text-anchor": "start" });
  g0.textContent = "0%";
  svg.appendChild(g0);
  const g1 = svgEl("text", { x: lx + lw, y: ly - 2, class: "axis-label", "text-anchor": "end" });
  g1.textContent = `≥${opts.vmax}%`;
  svg.appendChild(g1);
  container.appendChild(svg);
}

/* ISO 周的周一日期 */
function isoDate(y, w) {
  const d = new Date(Date.UTC(y, 0, 4));
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() || 7) + 1 + (w - 1) * 7);
  return d;
}

/* ---------- 渲染 ---------- */
function renderKpis(d) {
  const s = d.sentinel || {}, c = d.cnic || {};
  const iliS = (c.ili || {}).south || {}, iliN = (c.ili || {}).north || {};
  const lab = (c.lab || {}).total || {};
  const top = (s.outpatient_top3 || [])[0] || {};
  const cards = [
    { label: tf("kpi_nat", { yw: fmtYW(s.year, s.week), y: s.year, w: s.week }), value: fmtPct(s.ili_pct_national), sub: tf("kpi_nat_sub", { s: fmtPct(s.ili_pct_south), n: fmtPct(s.ili_pct_north) }) },
    { label: t("kpi_south"), value: fmtPct(iliS.current), sub: tf("kpi_prev", { v: fmtPct(iliS.prev_week) }) },
    { label: t("kpi_north"), value: fmtPct(iliN.current), sub: tf("kpi_prev", { v: fmtPct(iliN.prev_week) }) },
    { label: t("kpi_lab"), value: fmtPct(lab.positive_pct), sub: tf("kpi_lab_sub", { n: fmtNum(lab.tested) }) },
    { label: t("kpi_top"), value: top.name ? pName(top.name) : "—", sub: fmtPct(top.pct) },
  ];
  $("kpis").innerHTML = cards.map(k =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join("");
}

const fx = (p) => p.year + (p.week - 1) / 52;
const wxLabel = (x) => { const y = Math.floor(x); const w = Math.round((x - y) * 52) + 1; return `${y}W${w}`; };

function renderIli(tr, f) {
  const specs = [["south", t("south_p"), "var(--south)"], ["north", t("north_p"), "var(--north)"], ["national", t("national"), "var(--national)"]];
  const series = [], legend = [];
  let hasForecast = false;
  for (const [key, name, color] of specs) {
    const pts = (tr.ili[key] || []).map(p => ({ x: fx(p), y: p.pct }));
    if (pts.length) {
      series.push({ points: pts, color, name });
      legend.push(`<span style="color:${color}">${name}</span>`);
    }
    const fr = f && f.regions && f.regions[key];
    if (fr && fr.points.length && pts.length) {
      const last = pts[pts.length - 1];
      const anchor = [{ x: last.x, y: last.y }];
      series.push({
        points: anchor.concat(fr.points.map(p => ({ x: fx(p), y: p.pct }))),
        color, dash: true, name,
        band: {
          hi: anchor.concat(fr.points.map(p => ({ x: fx(p), y: p.hi }))),
          lo: anchor.concat(fr.points.map(p => ({ x: fx(p), y: p.lo }))),
        },
      });
      hasForecast = true;
    }
  }
  $("ili-chart").innerHTML = "";
  lineChart($("ili-chart"), series, { xLabel: wxLabel });
  if (hasForecast)
    legend.push(`<span class="dash-note">${tf("fc_dash_note", { h: f.horizon })}</span>`);
  $("ili-legend").innerHTML = legend.join("");
}

/* 日期与统计辅助：周次→日期、历年同期分布、历年主高峰摘要 */
const weekStart = (y, w) => isoDate(y, w);
const fmtDate = (d) => LANG === "en"
  ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  : `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
const addDays = (d, n) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };

function seasonIndex(tr, scope) {
  const m = new Map();
  for (const p of ((tr && tr.ili[scope]) || [])) {
    const sy = p.week >= 27 ? p.year : p.year - 1;
    const sw = seasonWeek(p.year, p.week, sy);
    if (sw < 0 || sw > 53) continue;
    if (!m.has(sy)) m.set(sy, new Map());
    m.get(sy).set(sw, p.pct);
  }
  return m;
}

const median = (v) => {
  if (!v.length) return null;
  const a = v.slice().sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

const wkIdx = (y, w) => Math.round(isoDate(y, w).getTime() / 604800000);

/* 历年同期参照分布：同一日历年 ±3 周、且排除最近 6 周（避免与本周自身比较）。
   哨点周报只公布阳性率、不公布各病原体检测份数，因此这里给"范围+中位+分位"而非置信区间。 */
function seasonalRef(pathogens, name, scene, year, week, curVal, win = 3, exclude = 6) {
  const all = (pathogens[name] || []).filter(p => p[scene] != null);
  if (all.length < 8) return null;
  const cur = wkIdx(year, week);
  const vals = [];
  for (const p of all) {
    const i = wkIdx(p.year, p.week);
    if (cur - i < exclude) continue;                 // 最近 6 周不看（避免与本周自身比较）
    const d = Math.abs(i - cur) % 52;
    if (Math.min(d, 52 - d) > win) continue;         // 只看同一日历年同期
    vals.push(p[scene]);
  }
  if (vals.length < 5) return null;
  vals.sort((a, b) => a - b);
  const acc = [];                                   // 参照窗口的起止（归档仅约两年，需精确标注）
  for (const p of all) {
    const i = wkIdx(p.year, p.week);
    if (cur - i < exclude) continue;
    const d = Math.abs(i - cur) % 52;
    if (Math.min(d, 52 - d) > win) continue;
    acc.push([p.year, p.week]);
  }
  acc.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    lo: vals[0], hi: vals[vals.length - 1],
    med: Math.round(median(vals) * 10) / 10, n: vals.length,
    from: acc[0], to: acc[acc.length - 1],
    pct: Math.round(100 * vals.filter(v => v <= curVal).length / vals.length),
  };
}

/* 当前值在历年同期的位置：范围与中位（比只跟均值比更有信息量） */
function histSameWeek(tr, scope, curSy, sw0) {
  const idx = seasonIndex(tr, scope);
  const vals = [];
  for (const [sy, m] of idx) {
    if (sy === curSy) continue;
    const v = m.get(sw0);
    if (v !== undefined) vals.push(v);
  }
  if (vals.length < 2) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), med: Math.round(median(vals) * 10) / 10, n: vals.length };
}

/* 历年主高峰的统计摘要：把"哪一年哪一周"这种流水账换成中位时间/峰值 */
function peakStats(seasons) {
  const idxs = [], pcts = [];
  for (const s of seasons || []) {
    const sy = parseInt(String(s.season).slice(0, 4), 10);
    const sw = seasonWeek(s.peak_year, s.peak_week, sy);
    if (sw < 0 || sw > 53) continue;
    idxs.push(sw);
    pcts.push(s.peak_pct);
  }
  if (!idxs.length) return null;
  return {
    minIdx: Math.min(...idxs), maxIdx: Math.max(...idxs),
    medIdx: Math.round(median(idxs)),
    medPct: Math.round(median(pcts) * 10) / 10,
    n: idxs.length,
  };
}

function renderForecast(f, tr) {
  const names = { south: t("south_p"), north: t("north_p"), national: t("national") };
  $("forecast-section").style.display = "";
  $("forecast-range").textContent = f.generated ? tf("fc_range", { d: f.generated }) : "";
  $("fc-week-note").textContent = t("fc_week_note");

  const html = [];
  for (const key of ["south", "north", "national"]) {
    const r = f.regions[key];
    if (!r) continue;
    const curSy = r.from.week >= 27 ? r.from.year : r.from.year - 1;
    const sw0 = seasonWeek(r.from.year, r.from.week, curSy);

    // 方向判断：以 4 周后的点估计与当前值之差为准
    const last = r.points[r.points.length - 1];
    const delta = last ? last.pct - r.current : 0;
    const word = Math.abs(delta) < 0.15 ? t("fc_flat")
      : delta > 0 ? (delta >= 0.5 ? t("fc_up_big") : t("fc_up"))
      : (delta <= -0.5 ? t("fc_down_big") : t("fc_down"));
    const dir = tf("fc_dir", { word, sign: delta >= 0 ? "+" : "−", d: Math.abs(delta).toFixed(1) });

    // 历年同期位置
    const h = histSameWeek(tr, key, curSy, sw0);
    const pos = h ? tf("fc_pos", { c: r.current, min: h.min, max: h.max, med: h.med, n: h.n }) : "";

    // 逐周（日期为主，周次放悬浮提示）
    const seq = r.points.map(p => {
      const d = weekStart(p.year, p.week);
      return `<div class="fc-step" title="${fmtYW(p.year, p.week)} ${fmtDate(d)}–${fmtDate(addDays(d, 6))}">` +
        `<div class="fc-week">${fmtDate(d)}</div>` +
        `<div class="fc-val">${p.pct}%</div><div class="fc-range">${p.lo}–${p.hi}</div></div>`;
    }).join("");

    // 历年主高峰（统计摘要）
    const pk = peakStats(r.seasons);
    const base = isoDate(curSy, 27);
    const peakLine = (pk && pk.n >= 2) ? tf("fc_peak_stat", {
      from: fmtDate(addDays(base, pk.minIdx * 7)),
      to: fmtDate(addDays(base, pk.maxIdx * 7)),
      med: fmtDate(addDays(base, pk.medIdx * 7)),
      p: pk.medPct, n: pk.n,
    }) : "";

    html.push(`<div class="fc-card"><h3>${names[key]}${r.low_confidence ? `<span class="badge-stale">${t("low_conf")}</span>` : ""}</h3>
      <div class="fc-dir">${dir}</div>
      ${pos ? `<div class="meta">${pos}</div>` : ""}
      <div class="fc-seq">${seq}</div>
      ${peakLine ? `<div class="meta">${peakLine}</div>` : ""}</div>`);
  }
  $("forecast-cards").innerHTML = html.join("");
}

/* 预测回测：实际值 vs 逐周 1 步预测 + 分预见期精度表 */
function renderBacktest(f, tr, scope) {
  const sec = $("backtest-section");
  const r = f && f.regions && f.regions[scope];
  if (!r || !r.backtest) { sec.style.display = "none"; return; }
  sec.style.display = "";
  const bt = r.backtest;
  const m1 = bt.by_horizon.find(m => m.h === 1) || {};
  const m4 = bt.by_horizon.find(m => m.h === 4) || {};
  const bm = bt.baseline_mae_by_horizon || [];
  const pctDiff = (b, n) => (b && n != null) ? Math.round(Math.abs(b - n) / b * 100) : null;
  const compare = (b, n) => {
    const d = pctDiff(b, n);
    if (d == null) return "—";
    return n <= b ? tf("bt_improve", { p: d }) : tf("bt_worse", { p: d });
  };

  $("backtest-kpis").innerHTML = [
    { label: t("bt_mae1"), value: m1.mae + " " + t("inp"), sub: `RMSE ${m1.rmse} · ${t("bt_pts")} ${m1.n}` },
    { label: t("bt_mae4"), value: m4.mae + " " + t("inp"), sub: `RMSE ${m4.rmse} · n ${m4.n}` },
    { label: t("bt_cov1"), value: m1.coverage != null ? Math.round(m1.coverage * 100) + "%" : "—", sub: `${t("bt_hold")} ${m1.n_eval ?? "—"}` },
    { label: t("bt_models"), value: m1.members ?? "—", sub: `h = 1…4` },
  ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join("");

  const all = bt.series || [];
  const view = all.slice(-104);
  const obs = [], pred = [], hi = [], lo = [];
  for (const p of view) {
    const x = p.year + (p.week - 1) / 52;
    obs.push({ x, y: p.obs });
    pred.push({ x, y: p.pred });
    hi.push({ x, y: p.hi });
    lo.push({ x, y: p.lo });
  }
  const color = { south: "var(--south)", north: "var(--north)", national: "var(--national)" }[scope];
  $("backtest-chart").innerHTML = "";
  lineChart($("backtest-chart"), [
    { points: obs, color, name: t("bt_obs") },
    { points: pred, color, name: t("bt_pred"), dash: true, band: { hi, lo } },
  ], { xLabel: wxLabel });
  $("backtest-legend").innerHTML =
    `<span style="color:${color}">${t("bt_obs")}</span>` +
    `<span style="color:${color}">${t("bt_pred")}</span>` +
    `<span class="dash-note">${t("bt_band")}</span>`;

  const rows = bt.by_horizon.map((m, i) => `<tr><td>${m.h}</td><td>${m.mae}</td><td>${m.rmse}</td>` +
    `<td>${m.coverage != null ? Math.round(m.coverage * 100) + "%" : "—"}</td>` +
    `<td>${m.n_eval ?? "—"}</td><td>${bm[i] ?? "—"}</td></tr>`).join("");
  $("backtest-table").innerHTML =
    `<thead><tr><th>${t("bt_h")}</th><th>${t("bt_mae")}</th><th>${t("bt_rmse")}</th>` +
    `<th>${t("bt_cov")}</th><th>${t("bt_hold")}</th><th>${t("bt_base")}</th></tr></thead><tbody>${rows}</tbody>`;

  const f0 = all[0], f1 = all[all.length - 1];
  $("backtest-scope-note").textContent = f0
    ? tf("bt_scope", { from: `${f0.year}W${f0.week}`, to: `${f1.year}W${f1.week}`, n: bt.n }) : "";
  $("backtest-cmp").textContent = tf("bt_cmp", {
    b1: bm[0], n1: m1.mae, d1: compare(bm[0], m1.mae),
    b4: bm[3], n4: m4.mae, d4: compare(bm[3], m4.mae),
  });
}

/* 本季 vs 历年同期：灰带＝历年同期最高–最低，灰线＝中位，彩色线＝本季 + 未来 4 周预测 */
const seasonWeek = (year, week, sy) => Math.round((isoDate(year, week) - isoDate(sy, 27)) / 6048e5);

function renderSeasons(tr, scope, f) {
  const pts = tr.ili[scope] || [];
  const seasons = new Map();
  for (const p of pts) {
    const sy = p.week >= 27 ? p.year : p.year - 1;
    const sw = seasonWeek(p.year, p.week, sy);
    if (sw < 0 || sw > 53) continue;
    if (!seasons.has(sy)) seasons.set(sy, []);
    seasons.get(sy).push({ x: sw, y: p.pct });
  }
  const keys = [...seasons.keys()].filter(k => seasons.get(k).length >= 8).sort((a, b) => a - b);
  if (!keys.length) return;
  const cur = keys[keys.length - 1];
  const past = keys.filter(k => k !== cur);

  const byWeek = new Map();
  for (const k of past)
    for (const p of seasons.get(k)) {
      if (!byWeek.has(p.x)) byWeek.set(p.x, []);
      byWeek.get(p.x).push(p.y);
    }
  const med = [], hi = [], lo = [];
  for (const sw of [...byWeek.keys()].sort((a, b) => a - b)) {
    const v = byWeek.get(sw).slice().sort((a, b) => a - b);
    const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    med.push({ x: sw, y: Math.round(m * 10) / 10 });
    lo.push({ x: sw, y: v[0] });
    hi.push({ x: sw, y: v[v.length - 1] });
  }

  const vivid = { south: "var(--south)", north: "var(--north)", national: "var(--national)" }[scope];
  const curPts = seasons.get(cur).slice().sort((a, b) => a.x - b.x).map(p => ({ x: p.x, y: p.y }));
  const series = [], legend = [];
  series.push({ points: med, color: "#9ca3af", thin: true, name: t("hist_median"),
                band: { lo, hi }, bandTip: true });
  legend.push(`<span style="color:#9ca3af">${t("hist_median")}</span>`);
  series.push({ points: curPts, color: vivid, name: t("this_season") });
  legend.push(`<span style="color:${vivid}">${t("this_season")}</span>`);

  const fr = f && f.regions && f.regions[scope];
  if (fr && fr.points.length && curPts.length) {
    const anchor = [curPts[curPts.length - 1]];
    const fc = [];
    for (const p of fr.points) {
      const x = seasonWeek(p.year, p.week, cur);
      if (x < 0 || x > 60) continue;
      fc.push({ x, y: p.pct, lo: p.lo, hi: p.hi });
    }
    if (fc.length) {
      series.push({
        points: anchor.concat(fc.map(p => ({ x: p.x, y: p.y }))),
        color: vivid, dash: true, name: t("this_season"),
        band: { hi: anchor.map(p => ({ x: p.x, y: p.y })).concat(fc.map(p => ({ x: p.x, y: p.hi }))),
                lo: anchor.map(p => ({ x: p.x, y: p.y })).concat(fc.map(p => ({ x: p.x, y: p.lo }))) },
      });
      legend.push(`<span class="dash-note">${tf("fc_dash_note", { h: f.horizon })}</span>`);
    }
  }

  $("season-chart").innerHTML = "";
  lineChart($("season-chart"), series, {
    xLabel: (x) => { let w = x + 27; if (w > 52) w -= 52; return "W" + w; }
  });
  $("season-legend").innerHTML = legend.join("");
}

/* 病原体阳性率周度热力图 */
function renderHeatmap(tr, scene) {
  const ph = tr.pathogens || {};
  const names = Object.keys(ph).filter(n => ph[n].some(p => p[scene] !== null));
  if (!names.length) return;
  const weekMap = new Map();
  for (const n of names)
    for (const p of ph[n])
      if (p[scene] !== null && !weekMap.has(p.year * 100 + p.week))
        weekMap.set(p.year * 100 + p.week, `${p.year}W${p.week}`);
  const weeks = [...weekMap.keys()].sort((a, b) => a - b);
  const lastVal = (n) => { const a = ph[n].filter(p => p[scene] !== null); return a.length ? a[a.length - 1][scene] : -1; };
  names.sort((a, b) => lastVal(b) - lastVal(a));
  const idx = {};
  for (const n of names) { idx[n] = {}; for (const p of ph[n]) idx[n][p.year * 100 + p.week] = p[scene]; }
  let vmax = 1;
  for (const n of names) for (const p of ph[n]) if (p[scene] !== null) vmax = Math.max(vmax, p[scene]);
  vmax = Math.ceil(vmax / 5) * 5;
  $("pathogen-heatmap").innerHTML = "";
  heatmap($("pathogen-heatmap"), names.map(pName), weeks,
    (i, j) => { const v = idx[names[i]][weeks[j]]; return v === undefined ? null : v; },
    { vmax, colLabel: (k) => weekMap.get(k), labelW: 132 });
}

/* 点＋历年同期区间图：圆点＝本周值，灰带＝历年同期最高–最低，灰刻度＝中位 */
function dotRangeChart(container, rows) {
  const W = 880, rowH = 32, P = { l: 132, r: 168, t: 22, b: 8 };
  const H = P.t + P.b + rows.length * rowH;
  const xmax = Math.max(1, ...rows.flatMap(r => [r.value, r.hi == null ? 0 : r.hi])) * 1.08;
  const X = (v) => P.l + v / xmax * (W - P.l - P.r);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  const step = xmax > 24 ? 10 : xmax > 10 ? 5 : 2;
  for (let v = 0; v <= xmax; v += step) {
    svg.appendChild(svgEl("line", { x1: X(v), x2: X(v), y1: P.t - 8, y2: H - P.b, stroke: "#e5e7eb" }));
    const tk = svgEl("text", { x: X(v), y: P.t - 12, "text-anchor": "middle", class: "axis-label" });
    tk.textContent = v + "%";
    svg.appendChild(tk);
  }
  rows.forEach((r, i) => {
    const yc = P.t + i * rowH + rowH / 2;
    const lab = svgEl("text", { x: P.l - 8, y: yc + 4, "text-anchor": "end", class: "bar-label" });
    lab.textContent = r.label;
    svg.appendChild(lab);
    if (r.lo != null && r.hi != null) {
      svg.appendChild(svgEl("rect", { x: X(r.lo), y: yc - 4, width: Math.max(X(r.hi) - X(r.lo), 1.5),
                                     height: 8, rx: 4, fill: "#e5e7eb" }));
      if (r.med != null)
        svg.appendChild(svgEl("line", { x1: X(r.med), x2: X(r.med), y1: yc - 7, y2: yc + 7,
                                        stroke: "#9ca3af", "stroke-width": 1.5 }));
    }
    const color = r.flag === "high" ? "#b91c1c" : r.flag === "low" ? "#1d4ed8" : "var(--flu)";
    svg.appendChild(svgEl("circle", { cx: X(r.value), cy: yc, r: 5, fill: color }));
    const anchor = Math.max(X(r.value), r.hi != null ? X(r.hi) : 0) + 9;
    const val = svgEl("text", { x: anchor, y: yc + 4, class: "bar-value" });
    val.textContent = `${r.value}%` +
      (r.wow == null ? "" : `  ${r.wow > 0 ? "↑" : r.wow < 0 ? "↓" : "→"}${Math.abs(r.wow)}`);
    svg.appendChild(val);
    if (r.flag) {
      const tag = svgEl("text", { x: W - 6, y: yc + 4, "text-anchor": "end", class: "flag-tag" });
      tag.setAttribute("fill", r.flag === "high" ? "#b91c1c" : "#1d4ed8");
      tag.textContent = t(r.flag === "high" ? "path_above" : "path_below");
      svg.appendChild(tag);
    }
    const hit = svgEl("rect", { x: P.l, y: P.t + i * rowH, width: W - P.l, height: rowH, fill: "transparent" });
    hit.addEventListener("mousemove", (e) => showTip(e.pageX, e.pageY, pathogenTip(r)));
    hit.addEventListener("mouseleave", hideTip);
    svg.appendChild(hit);
  });
  container.appendChild(svg);
}

function pathogenTip(r) {
  let html = `<b>${r.label}</b><br>${tf("path_tip", { v: r.value })}`;
  if (r.wow != null) html += `　${r.wow > 0 ? "↑" : r.wow < 0 ? "↓" : "→"}${Math.abs(r.wow)}`;
  if (r.lo != null) {
    const span = r.from ? `（${fmtDate(isoDate(r.from[0], r.from[1]))}–${fmtDate(isoDate(r.to[0], r.to[1]))}）` : "";
    html += `<br>${t("path_ref_head")}${span}<br>${tf("path_ref", { lo: r.lo, hi: r.hi, med: r.med, n: r.n })}` +
            (r.pct == null ? "" : `<br>${tf("path_pct", { p: r.pct })}`);
  }
  return html;
}

/* 本周病原体阳性率：与历年同期比，而不是只看排名 */
function renderPathogens(d, tr, scene) {
  const s = d.sentinel || {};
  $("pathogen-week").textContent = s.year ? `（${fmtYW(s.year, s.week)}）` : "";
  const ph = (tr && tr.pathogens) || {};
  const rows = [];
  for (const p of s.pathogens || []) {
    if (p[scene] == null) continue;
    const ref = seasonalRef(ph, p.name, scene, s.year, s.week, p[scene]);
    const flag = ref ? (p[scene] > ref.hi ? "high" : p[scene] < ref.lo ? "low" : null) : null;
    rows.push({
      label: pName(p.name), value: p[scene],
      wow: scene === "outpatient" ? p.outpatient_wow : p.inpatient_wow,
      lo: ref ? ref.lo : null, hi: ref ? ref.hi : null, med: ref ? ref.med : null,
      n: ref ? ref.n : null, pct: ref ? ref.pct : null,
      from: ref ? ref.from : null, to: ref ? ref.to : null, flag,
    });
  }
  rows.sort((a, b) => b.value - a.value);
  $("pathogen-chart").innerHTML = "";
  if (rows.length) dotRangeChart($("pathogen-chart"), rows);
  $("pathogen-legend").innerHTML = `<span class="dash-note">${t("path_legend")}</span>`;
}

function renderCities(d) {
  const cities = d.cities || {};
  const html = [];
  const cq = cities.chongqing;
  if (cq) {
    const fmtList = (l) => (l || []).map(x => `${pName(x.name)} ${x.pct}%`).join(LANG === "en" ? ", " : "、");
    html.push(`<div class="city"><h3>${LANG === "en" ? "Chongqing" : "重庆"}${staleBadge(cq)}</h3>
      <div class="meta">${tf("city_cq_meta", { yw: fmtYW(cq.year, cq.week), y: cq.year, w: cq.week, range: cq.date_range || "", pub: cq.published || "" })}</div>
      <div>${tf("city_out3", { list: fmtList(cq.outpatient_top) || "—" })}</div>
      <div>${tf("city_in3", { list: fmtList(cq.inpatient_top) || "—" })}</div>
      <div class="meta">${cq.analysis || ""}</div></div>`);
  }
  const sh = cities.shanghai;
  if (sh) {
    html.push(`<div class="city"><h3>${LANG === "en" ? "Shanghai" : "上海"}${staleBadge(sh)}</h3>
      <div class="meta">${tf("city_sh_meta", { y: sh.year, m: sh.month, pub: sh.published || "" })}</div>
      <div>${tf("city_flu", { n: fmtNum(sh.flu_cases) })}</div>
      <div>${tf("city_covid", { n: fmtNum(sh.covid_cases) })}</div>
      <div class="meta">${t("city_sh_note")}</div></div>`);
  }
  const tj = cities.tianjin;
  if (tj) {
    const flu = tj.flu_deaths != null
      ? tf("city_flu_d", { n: fmtNum(tj.flu_cases), d: fmtNum(tj.flu_deaths) })
      : tf("city_flu", { n: fmtNum(tj.flu_cases) });
    html.push(`<div class="city"><h3>${LANG === "en" ? "Tianjin" : "天津"}${staleBadge(tj)}</h3>
      <div class="meta">${tf("city_sh_meta", { y: tj.year, m: tj.month, pub: tj.published || "" })}</div>
      <div>${flu}</div>
      <div>${tf("city_month_total", { n: fmtNum(tj.total_cases), d: fmtNum(tj.total_deaths) })}</div>
      ${tj.b_class_cases != null || tj.c_class_cases != null
        ? `<div>${tf("city_class_split", { b: fmtNum(tj.b_class_cases), c: fmtNum(tj.c_class_cases) })}</div>` : ""}
      ${(tj.top_c || []).length
        ? `<div class="meta">${tf("city_top_c", { list: tj.top_c.map(pName).join(LANG === "en" ? ", " : "、") })}</div>` : ""}
      <div class="meta">${t("city_sh_note")}</div></div>`);
  }
  $("cities").innerHTML = html.join("") || `<p class="note">${t("city_none")}</p>`;
}

function renderAnalysis(d) {
  const s = d.sentinel || {}, c = d.cnic || {};
  let html = "";
  if (s.analysis) html += `<h3>${tf("ana_s", { yw: fmtYW(s.year, s.week) })}${staleBadge(s)}${t("ana_orig")}</h3><p>${s.analysis}</p>`;
  if (c.summary) html += `<h3>${tf("ana_c", { d: c.summary_as_of || "" })}${staleBadge(c)}${t("ana_orig")}</h3><p>${c.summary}</p>`;
  $("analysis").innerHTML = html;
}

/* 术语表（底部）：GLOSSARY 全量列出，与悬停气泡同源 */
function renderGlossary() {
  const g = GLOSSARY[LANG] || GLOSSARY.zh;
  $("glossary").innerHTML = Object.keys(g).map(k =>
    `<div class="gl-item" id="glossary-${k}"><div class="gl-term">${g[k][0]}</div>` +
    `<div class="gl-def">${g[k][1]}</div></div>`).join("");
}

/* ---------- 语言切换 ---------- */
function translateStatic() {
  document.documentElement.lang = LANG === "en" ? "en" : "zh-CN";
  document.title = t("title");
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const b of document.querySelectorAll("#lang-switch button")) b.classList.toggle("on", b.dataset.l === LANG);
}

let LATEST = null, TRENDS = null, FORECAST = null;
let seasonScope = "south", heatScene = "outpatient", backtestScope = "south", pathScene = "outpatient";

function renderAll() {
  translateStatic();
  renderGlossary();
  if (!LATEST) return;
  $("updated").textContent = tf("updated", { ts: LATEST.updated }) +
    ((LATEST.sentinel?.stale || LATEST.cnic?.stale) ? t("stale_suffix") : "");
  renderKpis(LATEST);
  $("kpi-note").innerHTML = t("kpi_note");
  if (TRENDS) {
    renderIli(TRENDS, FORECAST);
    renderSeasons(TRENDS, seasonScope, FORECAST);
    renderHeatmap(TRENDS, heatScene);
  }
  if (FORECAST) {
    renderForecast(FORECAST, TRENDS);
    renderBacktest(FORECAST, TRENDS, backtestScope);
  }
  renderPathogens(LATEST, TRENDS, pathScene);
  renderCities(LATEST);
  renderAnalysis(LATEST);
}

function setLang(l) {
  LANG = l;
  localStorage.setItem("flu-lang", l);
  renderAll();
}

async function main() {
  const [latest, trends, forecast] = await Promise.all([
    fetch("data/latest.json?_=" + Date.now()).then(r => r.json()),
    fetch("data/trends.json?_=" + Date.now()).then(r => r.json()).catch(() => null),
    fetch("data/forecast.json?_=" + Date.now()).then(r => r.json()).catch(() => null),
  ]);
  LATEST = latest; TRENDS = trends; FORECAST = forecast;
  renderAll();
  $("lang-switch").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setLang(b.dataset.l);
  });
  for (const [id, fn] of [["season-scope", (k) => { seasonScope = k; renderSeasons(TRENDS, k, FORECAST); }],
                          ["heatmap-scene", (k) => { heatScene = k; renderHeatmap(TRENDS, k); }],
                          ["pathogen-scene", (k) => { pathScene = k; renderPathogens(LATEST, TRENDS, k); }],
                          ["backtest-scope", (k) => { backtestScope = k; renderBacktest(FORECAST, TRENDS, k); }]]) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !TRENDS) return;
      for (const x of el.querySelectorAll("button")) x.classList.toggle("on", x === b);
      fn(b.dataset.k);
    });
  }
}

main().catch(e => { $("updated").textContent = "数据加载失败 / Failed to load: " + e.message; });
