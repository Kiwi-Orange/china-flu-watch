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

/* ---------- 悬浮提示 ---------- */
let tipEl = null;
function showTip(x, y, html) {
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "chart-tip"; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.style.display = "block";
  tipEl.style.left = Math.min(x + 12, window.innerWidth + window.scrollX - tipEl.offsetWidth - 8) + "px";
  tipEl.style.top = (y + 14) + "px";
}
function hideTip() { if (tipEl) tipEl.style.display = "none"; }

/* ---------- 折线图（支持置信带、虚线、悬浮十字线） ---------- */
function lineChart(container, series, opts) {
  const W = 880, H = opts.height || 260, P = { l: 42, r: 12, t: 12, b: 28 };
  const all = series.flatMap(s => s.points.concat(s.band ? s.band.hi.concat(s.band.lo) : []));
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
        if (p) html += `<br><span style="color:${s.color}">■</span> ${s.name || ""}${s.dash ? "（预测）" : ""} ${p.y}%`;
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
        showTip(e.pageX, e.pageY, `<b>${rl}</b> · ${opts.colLabel(ck)}<br>阳性率 ${v === null || v === undefined ? "无数据" : v + "%"}`));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
    });
  });
  const step = Math.ceil(cols.length / 11);
  cols.forEach((ck, j) => {
    if (j % step) return;
    const t = svgEl("text", { x: P.l + j * cw + cw / 2, y: P.t + rows.length * rh + 13, "text-anchor": "middle", class: "axis-label" });
    t.textContent = opts.colLabel(ck);
    svg.appendChild(t);
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

function renderIli(t, f) {
  const specs = [["south", "南方省份", "var(--south)"], ["north", "北方省份", "var(--north)"], ["national", "全国", "var(--national)"]];
  const series = [], legend = [];
  const fx = (p) => p.year + (p.week - 1) / 52;
  let hasForecast = false;
  for (const [key, name, color] of specs) {
    const pts = (t.ili[key] || []).map(p => ({ x: fx(p), y: p.pct }));
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
  lineChart($("ili-chart"), series, {
    xLabel: (x) => { const y = Math.floor(x); const w = Math.round((x - y) * 52) + 1; return `${y}W${w}`; }
  });
  if (hasForecast)
    legend.push(`<span class="dash-note">虚线：未来 ${f.horizon} 周预测，阴影为 80% 区间</span>`);
  $("ili-legend").innerHTML = legend.join("");
}

function renderForecast(f, t) {
  const names = { south: "南方省份", north: "北方省份", national: "全国" };
  const colors = { south: "var(--south)", north: "var(--north)", national: "var(--national)" };
  $("forecast-section").style.display = "";
  $("forecast-range").textContent = f.generated ? `（生成于 ${f.generated}）` : "";

  // 近 26 周 + 未来 4 周放大图
  const fx = (p) => p.year + (p.week - 1) / 52;
  const series = [], legend = [];
  for (const key of ["south", "north", "national"]) {
    const r = f.regions[key];
    const obs = ((t && t.ili[key]) || []).map(p => ({ x: fx(p), y: p.pct }));
    if (!r || !r.points.length || !obs.length) continue;
    const recent = obs.slice(-26);
    const anchor = [obs[obs.length - 1]];
    series.push({ points: recent, color: colors[key], name: names[key] });
    series.push({
      points: anchor.concat(r.points.map(p => ({ x: fx(p), y: p.pct }))),
      color: colors[key], dash: true, name: names[key],
      band: {
        hi: anchor.concat(r.points.map(p => ({ x: fx(p), y: p.hi }))),
        lo: anchor.concat(r.points.map(p => ({ x: fx(p), y: p.lo }))),
      },
    });
    legend.push(`<span style="color:${colors[key]}">${names[key]}</span>`);
  }
  lineChart($("forecast-chart"), series, {
    xLabel: (x) => { const y = Math.floor(x); const w = Math.round((x - y) * 52) + 1; return `${y}W${w}`; }
  });
  if (legend.length)
    legend.push(`<span class="dash-note">虚线：未来 ${f.horizon} 周预测，阴影为 80% 区间</span>`);
  $("forecast-legend").innerHTML = legend.join("");

  const html = [];
  for (const key of ["south", "north", "national"]) {
    const r = f.regions[key];
    if (!r) continue;
    const seq = r.points.map(p =>
      `<div class="fc-step"><div class="fc-week">${p.year}W${p.week}</div>` +
      `<div class="fc-val">${p.pct}%</div><div class="fc-range">${p.lo}–${p.hi}</div></div>`).join("");
    const delta = r.current - r.baseline_now;
    const vsHist = `当前 ${r.current}%，${delta >= 0 ? "高" : "低"}于历史同期基线 ${r.baseline_now}%`;
    const seasons = (r.seasons || []).map(s =>
      `${s.season} 季高峰 ${s.peak_year}W${s.peak_week}（${s.peak_pct}%）`).join("；");
    html.push(`<div class="fc-card"><h3>${names[key]}${r.low_confidence ? '<span class="badge-stale">历史序列短，置信度低</span>' : ""}</h3>
      <div class="meta">${vsHist}</div>
      <div class="fc-seq">${seq}</div>
      ${seasons ? `<div class="meta">往季主高峰：${seasons}</div>` : ""}</div>`);
  }
  $("forecast-cards").innerHTML = html.join("");
}

/* 各流感季 ILI% 对比：流感季自当年 W27 起算（冬峰落在同一季内） */
function renderSeasons(t, scope) {
  const pts = t.ili[scope] || [];
  const seasons = new Map();
  for (const p of pts) {
    const sy = p.week >= 27 ? p.year : p.year - 1;
    const sw = Math.round((isoDate(p.year, p.week) - isoDate(sy, 27)) / 6048e5);
    if (sw < 0 || sw > 53) continue;
    if (!seasons.has(sy)) seasons.set(sy, []);
    seasons.get(sy).push({ x: sw, y: p.pct });
  }
  const keys = [...seasons.keys()].filter(k => seasons.get(k).length >= 8).sort((a, b) => a - b);
  const cur = keys[keys.length - 1];
  const vivid = { south: "var(--south)", north: "var(--north)", national: "var(--national)" }[scope];
  const grays = { 1: "#6b7280", 2: "#9ca3af", 3: "#d1d5db" };
  const series = [], legend = [];
  for (const sy of keys) {
    const isCur = sy === cur;
    const color = isCur ? vivid : (grays[cur - sy] || "#e5e7eb");
    const label = `${sy}–${String(sy + 1).slice(2)} 季`;
    series.push({ points: seasons.get(sy), color, name: label, thin: !isCur });
    legend.push(`<span style="color:${color}">${label}${isCur ? "（本季）" : ""}</span>`);
  }
  $("season-chart").innerHTML = "";
  lineChart($("season-chart"), series, {
    xLabel: (x) => { let w = x + 27; if (w > 52) w -= 52; return "W" + w; }
  });
  $("season-legend").innerHTML = legend.join("");
}

/* 病原体阳性率周度热力图 */
function renderHeatmap(t, scene) {
  const ph = t.pathogens || {};
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
  heatmap($("pathogen-heatmap"), names, weeks,
    (i, j) => { const v = idx[names[i]][weeks[j]]; return v === undefined ? null : v; },
    { vmax, colLabel: (k) => weekMap.get(k) });
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

let TRENDS = null;
async function main() {
  const [latest, trends, forecast] = await Promise.all([
    fetch("data/latest.json?_=" + Date.now()).then(r => r.json()),
    fetch("data/trends.json?_=" + Date.now()).then(r => r.json()).catch(() => null),
    fetch("data/forecast.json?_=" + Date.now()).then(r => r.json()).catch(() => null),
  ]);
  TRENDS = trends;
  $("updated").textContent = `数据更新：${latest.updated}${(latest.sentinel?.stale || latest.cnic?.stale) ? "（部分源抓取失败，含旧数据）" : ""}`;
  renderKpis(latest);
  if (trends) {
    renderIli(trends, forecast);
    renderSeasons(trends, "south");
    renderHeatmap(trends, "outpatient");
  }
  if (forecast) renderForecast(forecast, trends);
  renderPathogens(latest);
  renderLab(latest);
  renderOutbreaks(latest);
  renderCities(latest);
  renderAnalysis(latest);
  for (const [id, fn] of [["season-scope", (k) => renderSeasons(TRENDS, k)],
                          ["heatmap-scene", (k) => renderHeatmap(TRENDS, k)]]) {
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

main().catch(e => { $("updated").textContent = "数据加载失败: " + e.message; });
