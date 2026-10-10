/* 全国呼吸道传染病周报监测 —— 纯原生 JS，无外部依赖。数据：data/latest.json + data/trends.json */

const $ = (id) => document.getElementById(id);
const fmtPct = (v) => (v === null || v === undefined) ? "—" : v + "%";
const fmtDelta = (v) => {
  if (v === null || v === undefined) return "";
  const cls = v > 0 ? "up" : "down";
  const sign = v > 0 ? "+" : "";
  return `<span class="delta ${cls}">${sign}${v}</span>`;
};
const staleBadge = (d) => d && d.stale ? '<span class="badge-stale">沿用旧数据</span>' : "";

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/* ---------- 折线图 ---------- */
function lineChart(container, series, opts) {
  const W = 880, H = 260, P = { l: 42, r: 12, t: 12, b: 28 };
  const all = series.flatMap(s => s.points);
  if (!all.length) { container.textContent = "暂无足够历史数据，随每周抓取累积"; return; }
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y1 = Math.max(...ys) * 1.1 || 1;
  const X = (x) => P.l + (x1 === x0 ? W / 2 : (x - x0) / (x1 - x0) * (W - P.l - P.r));
  const Y = (y) => H - P.b - y / y1 * (H - P.t - P.b);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  for (let i = 0; i <= 4; i++) {
    const yv = y1 / 4 * i;
    svg.appendChild(svgEl("line", { x1: P.l, x2: W - P.r, y1: Y(yv), y2: Y(yv), stroke: "#e5e7eb" }));
    const t = svgEl("text", { x: P.l - 6, y: Y(yv) + 3, "text-anchor": "end", class: "axis-label" });
    t.textContent = yv.toFixed(1);
    svg.appendChild(t);
  }
  const xticks = [...new Set(xs)].filter((_, i, a) => i % Math.ceil(a.length / 8) === 0);
  for (const x of xticks) {
    const t = svgEl("text", { x: X(x), y: H - 8, "text-anchor": "middle", class: "axis-label" });
    t.textContent = opts.xLabel(x);
    svg.appendChild(t);
  }
  for (const s of series) {
    const pts = s.points.map(p => `${X(p.x)},${Y(p.y)}`).join(" ");
    svg.appendChild(svgEl("polyline", { points: pts, fill: "none", stroke: s.color, "stroke-width": 2 }));
    for (const p of s.points)
      svg.appendChild(svgEl("circle", { cx: X(p.x), cy: Y(p.y), r: 2.4, fill: s.color }));
  }
  container.appendChild(svg);
}

/* ---------- 横向条形图 ---------- */
function hBarChart(container, items, opts) {
  const rowH = opts.rowH || 30, W = 880, P = { l: opts.labelW || 110, r: 60, t: 6, b: 6 };
  const H = P.t + P.b + items.length * rowH;
  const max = Math.max(...items.flatMap(it => it.bars.map(b => b.value)), 0) || 1;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  const bw = (W - P.l - P.r) / (opts.stacked ? max : max);
  items.forEach((it, i) => {
    const y = P.t + i * rowH;
    const label = svgEl("text", { x: P.l - 8, y: y + rowH / 2 + 4, "text-anchor": "end", class: "bar-label" });
    label.textContent = it.label;
    svg.appendChild(label);
    if (opts.stacked) {
      let acc = 0;
      for (const b of it.bars) {
        const w = b.value * bw;
        svg.appendChild(svgEl("rect", { x: P.l + acc, y: y + 4, width: w, height: rowH - 8, fill: b.color, rx: 2 }));
        if (w > 34) {
          const t = svgEl("text", { x: P.l + acc + 4, y: y + rowH / 2 + 4, class: "bar-value", fill: "#fff" });
          t.textContent = b.text;
          svg.appendChild(t);
        }
        acc += w;
      }
    } else {
      const bh = (rowH - 8) / it.bars.length;
      it.bars.forEach((b, j) => {
        svg.appendChild(svgEl("rect", {
          x: P.l, y: y + 4 + j * bh, width: Math.max(b.value * bw, 0.5), height: bh - 2, fill: b.color, rx: 2 }));
        if (j === 0) {
          const t = svgEl("text", { x: P.l + Math.max(b.value * bw, 0.5) + 4, y: y + 4 + bh - 4, class: "bar-value" });
          t.textContent = b.text || "";
          svg.appendChild(t);
        }
      });
    }
  });
  container.appendChild(svg);
}

/* ---------- 渲染 ---------- */
function renderKpis(d) {
  const s = d.sentinel || {}, c = d.cnic || {};
  const iliS = (c.ili || {}).south || {}, iliN = (c.ili || {}).north || {};
  const lab = (c.lab || {}).total || {};
  const ob = c.outbreaks_week || {};
  const cards = [
    { label: `全国 ILI%（${s.year}年第${s.week}周）`, value: fmtPct(s.ili_pct_national), sub: `南方 ${fmtPct(s.ili_pct_south)} / 北方 ${fmtPct(s.ili_pct_north)}` },
    { label: "南方 ILI%", value: fmtPct(iliS.current), sub: "上周 " + fmtPct(iliS.prev_week) },
    { label: "北方 ILI%", value: fmtPct(iliN.current), sub: "上周 " + fmtPct(iliN.prev_week) },
    { label: "流感病毒检测阳性率", value: fmtPct(lab.positive_pct), sub: `检测 ${lab.tested ?? "—"} 份（流感周报）` },
    { label: "本周暴发疫情", value: (ob.total ?? "—") + " 起", sub: "10 例及以上聚集性疫情" },
    { label: "门急诊首位病原体", value: (s.outpatient_top3 || [])[0]?.name || "—", sub: fmtPct((s.outpatient_top3 || [])[0]?.pct) },
  ];
  $("kpis").innerHTML = cards.map(k =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join("");
}

function renderIli(t) {
  const specs = [["south", "南方省份", "var(--south)"], ["north", "北方省份", "var(--north)"], ["national", "全国", "var(--national)"]];
  const series = [], legend = [];
  for (const [key, name, color] of specs) {
    const pts = (t.ili[key] || []).map(p => ({ x: p.year + (p.week - 1) / 52, y: p.pct }));
    if (pts.length) {
      series.push({ points: pts, color });
      legend.push(`<span style="color:${color}">${name}</span>`);
    }
  }
  lineChart($("ili-chart"), series, {
    xLabel: (x) => { const y = Math.floor(x); const w = Math.round((x - y) * 52) + 1; return `${y}W${w}`; }
  });
  $("ili-legend").innerHTML = legend.join("");
}

function renderPathogens(d) {
  const s = d.sentinel || {};
  $("pathogen-week").textContent = s.year ? `（${s.year}年第${s.week}周）` : "";
  const items = (s.pathogens || []).map(p => ({
    label: p.name,
    bars: [
      { value: p.outpatient ?? 0, color: "var(--flu)", text: `门急诊 ${p.outpatient}%（${fmtDelta(p.outpatient_wow)}）` },
      { value: p.inpatient ?? 0, color: "#f3b0a9" },
    ],
  })).sort((a, b) => b.bars[0].value - a.bars[0].value);
  // fmtDelta 返回 HTML，条形图 text 用纯文本
  for (const it of items) {
    const p = (s.pathogens || []).find(x => x.name === it.label);
    const w = p.outpatient_wow;
    it.bars[0].text = `门急诊 ${p.outpatient}%  ${w > 0 ? "↑" : w < 0 ? "↓" : "→"}${Math.abs(w ?? 0)}`;
    it.bars[1].text = "";
  }
  hBarChart($("pathogen-chart"), items, { rowH: 34, labelW: 120 });
}

function renderLab(d) {
  const c = d.cnic || {};
  $("lab-week").textContent = c.year ? `（${c.year}年第${c.week}周，第${c.issue ?? "?"}期）` : "";
  const lab = c.lab || {};
  const items = [];
  for (const [key, name] of [["south", "南方省份"], ["north", "北方省份"]]) {
    const r = lab[key];
    if (!r || !r.positive) continue;
    items.push({
      label: `${name}（阳性率 ${r.positive_pct}%）`,
      bars: [
        { value: r.h1n1pdm09 ?? 0, color: "#f59e0b", text: `H1N1 ${r.h1n1pdm09}` },
        { value: r.h3n2 ?? 0, color: "#dc2626", text: `H3N2 ${r.h3n2}` },
        { value: r.victoria ?? 0, color: "#2563eb", text: `Victoria ${r.victoria}` },
        { value: (r.yamagata ?? 0) + (r.a_unsubtyped ?? 0) + (r.b_unlineaged ?? 0), color: "var(--other)", text: "" },
      ],
    });
  }
  if (items.length) hBarChart($("lab-chart"), items, { stacked: true, rowH: 44, labelW: 200 });
  const t = lab.total || {};
  $("lab-detail").innerHTML = t.tested
    ? `<div>全国合计：检测 ${t.tested} 份，阳性 ${t.positive}（${t.positive_pct}%）；甲型 ${t.a}（其中 H1N1pdm09 ${t.h1n1pdm09}、H3N2 ${t.h3n2}），乙型 ${t.b}（Victoria ${t.victoria}）</div>`
    : "";
}

function renderOutbreaks(d) {
  const c = d.cnic || {};
  const wk = c.outbreaks_week || {}, se = c.outbreaks_season || {};
  $("outbreak-kpis").innerHTML = [
    { label: "本周暴发", value: (wk.total ?? "—") + " 起", sub: Object.entries(wk.by_type || {}).map(([k, v]) => `${k} ${v}`).join(" / ") },
    { label: `当季累计（第${se.start_week ?? "?"}–${se.end_week ?? "?"}周）`, value: (se.total ?? "—") + " 起", sub: `南方 ${se.south ?? "—"} / 北方 ${se.north ?? "—"}` },
  ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join("");
  const regions = Object.entries(se.by_region || {}).sort((a, b) => b[1] - a[1]);
  if (regions.length) {
    hBarChart($("outbreak-regions"), regions.map(([k, v]) => ({
      label: k, bars: [{ value: v, color: "var(--covid)", text: `${v} 起` }],
    })), { rowH: 28, labelW: 80 });
  }
}

function renderCities(d) {
  const cities = d.cities || {};
  const html = [];
  const cq = cities.chongqing;
  if (cq) {
    html.push(`<div class="city"><h3>重庆${staleBadge(cq)}</h3>
      <div class="meta">${cq.year}年第${cq.week}周（${cq.date_range || ""}）· 发布 ${cq.published || ""} · 周更</div>
      <div>门急诊前三：${(cq.outpatient_top || []).map(x => `${x.name} ${x.pct}%`).join("、") || "—"}</div>
      <div>住院前三：${(cq.inpatient_top || []).map(x => `${x.name} ${x.pct}%`).join("、") || "—"}</div>
      <div class="meta">${cq.analysis || ""}</div></div>`);
  }
  const sh = cities.shanghai;
  if (sh) {
    html.push(`<div class="city"><h3>上海${staleBadge(sh)}</h3>
      <div class="meta">${sh.year}年${sh.month}月法定传染病疫情 · 发布 ${sh.published || ""} · 月更</div>
      <div>流行性感冒：<b>${(sh.flu_cases ?? "—").toLocaleString?.() ?? sh.flu_cases}</b> 例</div>
      <div>新型冠状病毒感染：${(sh.covid_cases ?? "—").toLocaleString?.() ?? "—"} 例</div>
      <div class="meta">口径：法定传染病报告发病数（丙类含流感）。</div></div>`);
  }
  $("cities").innerHTML = html.join("") || "<p class='note'>城市数据暂不可用</p>";
}

function renderAnalysis(d) {
  const s = d.sentinel || {}, c = d.cnic || {};
  let html = "";
  if (s.analysis) html += `<h3>中疾控哨点监测周报 · 分析（${s.year}年第${s.week}周）${staleBadge(s)}</h3><p>${s.analysis}</p>`;
  if (c.summary) html += `<h3>国家流感中心 · 流感周报概要（截至${c.summary_as_of || ""}）${staleBadge(c)}</h3><p>${c.summary}</p>`;
  $("analysis").innerHTML = html;
}

async function main() {
  const [latest, trends] = await Promise.all([
    fetch("data/latest.json?_=" + Date.now()).then(r => r.json()),
    fetch("data/trends.json?_=" + Date.now()).then(r => r.json()).catch(() => null),
  ]);
  $("updated").textContent = `数据更新：${latest.updated}${(latest.sentinel?.stale || latest.cnic?.stale) ? "（部分源抓取失败，含旧数据）" : ""}`;
  renderKpis(latest);
  if (trends) renderIli(trends);
  renderPathogens(latest);
  renderLab(latest);
  renderOutbreaks(latest);
  renderCities(latest);
  renderAnalysis(latest);
}

main().catch(e => { $("updated").textContent = "数据加载失败: " + e.message; });
