const $ = id => document.getElementById(id);
const fmt = n => n == null || !isFinite(n) ? '—' : Number(n.toFixed(2)).toString();
const pctTxt = n => n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + fmt(n) + '%';
const pages = { overview: 'Overview', image: 'Find tumor (model)', entry: 'Scans & review', results: 'Results', graph: 'Growth graph', guide: 'Methods & guide' };
let scans = [];
const MIN_MM = 10; // RANO: both diameters >= 10 mm to be measurable

function go(id) {
  document.querySelectorAll('.page').forEach(p => p.hidden = p.id !== id);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.go === id));
  $('heading').textContent = $('crumb').textContent = pages[id];
  render(); window.scrollTo(0, 0);
}
$('nav').innerHTML = Object.entries(pages).map(([id, name], i) => `<button data-go="${id}">${['◫', '◎', '⊕', '▤', '⌁', 'ⓘ'][i]} &nbsp;${name}</button>`).join('');
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });
$('theme').onclick = () => document.body.classList.toggle('dark');

// Sample case = worked example in the proposal (Table 5)
const sample = [
  { date: '2026-01-01', lesions: [[30, 20]], noTumor: false, vol: null, review: 'accepted' },
  { date: '2026-03-01', lesions: [[24, 15]], noTumor: false, vol: null, review: 'accepted' },
  { date: '2026-05-01', lesions: [[26, 18]], noTumor: false, vol: null, review: 'accepted' }];
$('demo').onclick = () => { scans = sample.map(x => ({ ...x, lesions: x.lesions.map(l => [...l]) })); $('caseid').value = 'DEMO-001'; go('results'); };

// ---------- adding a scan ----------
$('notumor').onchange = () => ['l1a', 'l1b', 'l2a', 'l2b', 'l3a', 'l3b'].forEach(id => { $(id).disabled = $('notumor').checked; });
$('scanform').onsubmit = e => {
  e.preventDefault();
  const date = $('date').value, noTumor = $('notumor').checked;
  const volRaw = $('vol').value, vol = volRaw === '' ? null : +volRaw;
  const lesions = []; let err = '';
  if (!noTumor) {
    for (const k of [1, 2, 3]) {
      const ra = $('l' + k + 'a').value, rb = $('l' + k + 'b').value;
      if (ra === '' && rb === '') continue;
      const a = +ra, b = +rb;
      if (ra === '' || rb === '') err = `Lesion ${k}: enter both d1 and d2.`;
      else if (!(a > 0) || !(b > 0)) err = `Lesion ${k}: diameters must be positive.`;
      else if (a < b) err = `Lesion ${k}: d1 must be the longest diameter (d1 ≥ d2).`;
      else lesions.push([a, b]);
    }
    if (!err && !lesions.length) err = 'Enter at least lesion 1, or tick "No enhancing tumor left".';
  }
  if (!err && !$('caseid').value.trim()) err = 'Enter an anonymous case ID.';
  if (!err && !date) err = 'Choose the scan date.';
  if (!err && vol !== null && !(vol >= 0)) err = 'Volume must be zero or positive.';
  if (!err && scans.length && date <= scans.at(-1).date) err = 'Dates must be strictly increasing.';
  $('entrymsg').textContent = err || 'Scan added. Review it in the table below.';
  $('entrymsg').className = err ? 'error' : '';
  if (err) return;
  scans.push({ date, lesions, noTumor, vol, review: 'pending' });
  $('scanform').reset(); $('notumor').onchange(); render();
};
$('clear').onclick = () => { if (confirm('Clear all scans?')) { scans = []; render(); } };
$('scans').onclick = e => {
  const r = e.target.closest('[data-remove]'), rv = e.target.closest('[data-review]');
  if (r) scans.splice(+r.dataset.remove, 1);
  if (rv) scans[+rv.dataset.i].review = rv.dataset.review;
  if (r || rv) render();
};

// ---------- calculation (simplified RANO, proposal v3) ----------
function measure(s) {
  const lesions = s.lesions.map(([a, b]) => ({ a, b, product: a * b, measurable: a >= MIN_MM && b >= MIN_MM }));
  const targets = lesions.filter(l => l.measurable).sort((x, y) => y.product - x.product).slice(0, 3);
  const spd = targets.reduce((t, l) => t + l.product, 0);
  return { lesions, targets, spd, anyTumor: !s.noTumor && lesions.length > 0, anyMeasurable: targets.length > 0 };
}
function calculate(list) {
  const out = [];
  const usable = list.filter(s => s.review !== 'flagged');
  const base = usable[0];
  const baseM = base ? measure(base) : null;
  const baseSpd = baseM && baseM.anyMeasurable ? baseM.spd : null;
  list.forEach(s => {
    const m = measure(s);
    const r = { ...s, ...m, spdValue: m.anyMeasurable ? m.spd : (m.anyTumor ? null : 0), confirm: false, steps: [] };
    out.push(r);
    if (s.review === 'flagged') { r.cat = 'Needs expert review'; r.rule = 'The outline was flagged as wrong, so this scan is left out.'; return; }
    if (s === base) { r.cat = baseSpd !== null ? 'Baseline' : 'Baseline (no measurable lesion)'; r.rule = baseSpd !== null ? 'First usable scan; its SPD is the reference for response.' : 'The first usable scan has no measurable lesion, so later scans cannot be classified by size.'; return; }
    if (baseSpd === null) { r.cat = 'Not classified'; r.rule = 'The baseline has no measurable lesion.'; return; }
    const earlier = out.filter(x => x !== r && x.review !== 'flagged' && x.spdValue !== null);
    const nadir = earlier.length ? Math.min(...earlier.map(x => x.spdValue)) : null;
    r.base = baseSpd; r.nadir = nadir;
    if (r.spdValue !== null) r.baseChange = (r.spdValue - baseSpd) / baseSpd * 100;
    if (r.spdValue !== null && nadir > 0) r.nadirChange = (r.spdValue - nadir) / nadir * 100;
    if (!m.anyTumor) { r.steps.push('Q1. Any enhancing tumor left? No.'); r.cat = 'Complete response'; r.confirm = true; r.rule = 'No enhancing tumor is left.'; return; }
    r.steps.push('Q1. Any enhancing tumor left? Yes.');
    if (!m.anyMeasurable) { r.steps.push(`Q2. Any measurable lesion (d1 and d2 ≥ ${MIN_MM} mm)? No.`); r.cat = 'Non-measurable'; r.rule = 'Tumor is present but no lesion is measurable, so the scan is not classified by size.'; return; }
    r.steps.push(`Q2. Any measurable lesion? Yes; SPD = ${fmt(m.spd)} mm².`);
    if (!(nadir > 0)) { r.cat = 'Needs expert review'; r.rule = 'An earlier scan had SPD 0, so the % change from the nadir is undefined.'; return; }
    const prog = r.nadirChange >= 25 - 1e-9;
    r.steps.push(`Q3. Grown ≥ 25% vs nadir (${fmt(nadir)} mm²)? ${pctTxt(r.nadirChange)} → ${prog ? 'Yes' : 'No'}.`);
    if (prog) { r.cat = 'Progression'; r.confirm = true; r.rule = 'SPD increased by 25% or more compared with the nadir.'; return; }
    const resp = r.baseChange <= -50 + 1e-9;
    r.steps.push(`Q4. Shrunk ≥ 50% vs baseline (${fmt(baseSpd)} mm²)? ${pctTxt(r.baseChange)} → ${resp ? 'Yes' : 'No'}.`);
    if (resp) { r.cat = 'Response'; r.confirm = true; r.rule = 'SPD decreased by 50% or more compared with the baseline.'; return; }
    r.cat = 'Stable'; r.rule = 'Neither threshold was met.';
  });
  return out;
}

// ---------- rendering ----------
function table(headers, rows) { return `<div class="scroll"><table><thead><tr>${headers.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
const lesionTxt = v => v.noTumor ? 'No tumor' : v.lesions.map(l => `${fmt(l.a)} × ${fmt(l.b)}${l.measurable ? '' : ' (not measurable)'}`).join('<br>');
const reviewTxt = { pending: 'Not yet reviewed', accepted: 'Accepted', flagged: 'Flagged' };
const tag = v => `<span class="tag ${v.cat.split(' ')[0]}">${v.cat}${v.confirm ? ' *' : ''}</span>${v.confirm ? '<div class="muted small">confirm on next scan</div>' : ''}`;
function render() {
  const r = calculate(scans), last = r.at(-1), base = r.find(v => v.cat === 'Baseline');
  $('stats').innerHTML = [['Scans', r.length], ['Baseline SPD', base ? fmt(base.spd) + ' mm²' : '—'], ['Latest SPD', last && last.spdValue != null ? fmt(last.spdValue) + ' mm²' : '—'], ['Latest result', last ? last.cat + (last.confirm ? ' *' : '') : '—']].map(([a, b]) => `<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join('');
  $('scans').innerHTML = r.length ? table(['Date', 'Lesions d1 × d2 (mm)', 'Volume (mL)', 'Review', 'Action'], r.map((v, i) => [v.date, lesionTxt(v), fmt(v.vol), `<span class="tag ${v.review}">${reviewTxt[v.review]}</span>`,
    `<button class="secondary" data-review="accepted" data-i="${i}">✓ Accept</button> <button class="secondary" data-review="flagged" data-i="${i}">⚑ Flag</button> <button class="secondary" data-remove="${i}">Remove</button>`])) : '<p>No scans yet. Add a scan or load the sample case.</p>';
  $('resulttable').innerHTML = r.length ? table(['Date', 'Review', 'Target lesions (mm)', 'SPD mm²', 'vs baseline', 'vs nadir', 'Volume mL', 'Result'], r.map(v => [v.date, reviewTxt[v.review], v.review === 'flagged' ? '—' : lesionTxt(v), v.review === 'flagged' ? '—' : fmt(v.spdValue), pctTxt(v.baseChange), pctTxt(v.nadirChange), fmt(v.vol), tag(v)])) : '<p>No scans to calculate.</p>';
  const prev = $('explainselect').value;
  $('explainselect').innerHTML = r.map((v, i) => `<option value="${i}">${v.date}</option>`).join('');
  $('explainselect').value = prev !== '' && +prev < r.length ? prev : String(r.length - 1);
  explain(); chart(r);
}
$('explainselect').onchange = explain;
function explain() {
  const r = calculate(scans), v = r[+$('explainselect').value];
  if (!v) { $('explain').innerHTML = '<p>Add scans to see the working.</p>'; return; }
  let h = `<h3>${v.date} · ${v.cat}${v.confirm ? ' *' : ''}</h3>`;
  if (v.review === 'flagged') { $('explain').innerHTML = h + `<p>${v.rule}</p>`; return; }
  h += v.noTumor ? '<p>1. No enhancing tumor in the model output.</p>' : `<p>1. Lesions: ${v.lesions.map((l, i) => `#${i + 1} ${fmt(l.a)} × ${fmt(l.b)} = ${fmt(l.product)} mm² (${l.measurable ? 'measurable' : 'not measurable: a diameter is below ' + MIN_MM + ' mm'})`).join('; ')}.</p>`;
  h += v.targets.length ? `<p>2. SPD = ${v.targets.map(l => `${fmt(l.a)} × ${fmt(l.b)}`).join(' + ')} = <strong>${fmt(v.spd)} mm²</strong></p>` : '<p>2. SPD: no measurable target lesion.</p>';
  if (v.base !== undefined) {
    h += `<p>3. Baseline SPD = ${fmt(v.base)} mm²; change = ${pctTxt(v.baseChange)}.</p><p>4. Nadir (lowest earlier SPD, including baseline) = ${fmt(v.nadir)} mm²; change = ${pctTxt(v.nadirChange)}.</p>`;
    if (v.steps.length) h += `<p>5. Rules in order:</p><ol>${v.steps.map(s => `<li>${s}</li>`).join('')}</ol>`;
  }
  h += `<p><strong>Result:</strong> ${v.cat}. ${v.rule}${v.confirm ? ' Confirm on the next scan.' : ''}</p>`;
  if (v.vol != null) h += `<p class="muted">Volume ${fmt(v.vol)} mL (information only, not used for classification).</p>`;
  $('explain').innerHTML = h;
}
function chart(r) {
  const svg = $('chart');
  const pts = r.map((v, i) => ({ v, i })).filter(p => p.v.review !== 'flagged' && p.v.spdValue != null);
  const base = r.find(v => v.cat === 'Baseline');
  if (!pts.length || !base) { svg.innerHTML = '<text x="30" y="50" fill="currentColor">No measurable scans available</text>'; return; }
  const max = Math.max(1, ...pts.map(p => p.v.spdValue), ...r.map(v => (v.nadir || 0) * 1.25)) * 1.12;
  const x = i => 65 + i * 620 / Math.max(1, r.length - 1), y = v => 280 - v / max * 240;
  let out = '';
  for (let i = 0; i <= 4; i++) { const v = max * i / 4; out += `<path d="M65 ${y(v)} H700" stroke="currentColor" opacity=".15"/><text x="55" y="${y(v) + 4}" text-anchor="end" fill="currentColor" font-size="11">${fmt(Math.round(v))}</text>`; }
  out += `<path d="M65 ${y(base.spd * .5)} H700" stroke="#239e81" stroke-dasharray="6 5" fill="none"/>`;
  r.forEach((v, i) => { if (i && v.nadir > 0) out += `<path d="M${x(i - 1)} ${y(v.nadir * 1.25)} H${x(i)}" stroke="#df6471" stroke-dasharray="6 5"/>`; });
  out += `<polyline points="${pts.map(p => `${x(p.i)},${y(p.v.spdValue)}`).join(' ')}" fill="none" stroke="#258fdb" stroke-width="3"/>`;
  pts.forEach(p => out += `<circle cx="${x(p.i)}" cy="${y(p.v.spdValue)}" r="5" fill="${p.v.cat === 'Progression' ? '#df6471' : '#258fdb'}"/><text x="${x(p.i)}" y="${y(p.v.spdValue) - 12}" text-anchor="middle" fill="currentColor" font-size="12">${fmt(p.v.spdValue)}</text>`);
  r.forEach((v, i) => out += `<text x="${x(i)}" y="305" text-anchor="middle" fill="currentColor" font-size="10">${v.date}</text><text x="${x(i)}" y="320" text-anchor="middle" fill="currentColor" font-size="10">${v.cat}${v.confirm ? ' *' : ''}</text>`);
  svg.innerHTML = out;
}
$('csv').onclick = () => {
  const r = calculate(scans); if (!r.length) return alert('Add scans first.');
  const q = s => /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const data = ['date,review,lesions_d1xd2_mm,spd_mm2,baseline_change_pct,nadir_change_pct,volume_ml,category,confirm_on_next_scan',
    ...r.map(v => [v.date, v.review, q(v.noTumor ? 'no tumor' : v.lesions.map(l => l.a + 'x' + l.b).join('; ')), v.spdValue ?? '', v.baseChange == null ? '' : v.baseChange.toFixed(1), v.nadirChange == null ? '' : v.nadirChange.toFixed(1), v.vol ?? '', v.cat, v.confirm ? 'yes' : 'no'].join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' })), a = document.createElement('a');
  a.href = url; a.download = 'tumortrack.csv'; a.click(); URL.revokeObjectURL(url);
};

// ---------- Find tumor page: simulated model output (framework) ----------
const canvas = $('mri'), ctx = canvas.getContext('2d');
let measurement = null;
// lesion in the synthetic slice (pixels): centre and radii; the "model output" is this region
const LES = { cx: 261, cy: 171, rx: 37.6, ry: 25.4 };
function drawSynthetic(withOutline) {
  const im = ctx.createImageData(400, 400);
  for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
    const X = x - 200, Y = y - 200, brain = (X / 155) ** 2 + (Y / 174) ** 2 < 1;
    const inLes = ((x + .5 - LES.cx) / LES.rx) ** 2 + ((y + .5 - LES.cy) / LES.ry) ** 2 < 1;
    let v = brain ? 90 + 18 * Math.sin(x * .15) * Math.cos(y * .13) + 12 * Math.sin(y * .27) : 8;
    if (brain && Math.abs(X) < 14 && Math.abs(Y) < 50) v = 39;
    if (inLes) v = 218 + 8 * Math.sin(x);
    const i = (y * 400 + x) * 4;
    if (withOutline && inLes) im.data.set([255, v * .52, v * .52, 255], i); else im.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(im, 0, 0);
}
function line(a, b, color) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
$('synthetic').onclick = () => {
  const s = +$('spacing').value;
  if (!(s > 0)) { $('measuremsg').textContent = 'Enter a positive pixel spacing.'; return; }
  drawSynthetic(true);
  // measure the (axis-aligned) simulated outline: extent in x = d1, extent in y = d2
  let minX = 400, maxX = -1, minY = 400, maxY = -1;
  for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if (((x + .5 - LES.cx) / LES.rx) ** 2 + ((y + .5 - LES.cy) / LES.ry) ** 2 < 1) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
  line([minX, cy], [maxX + 1, cy], '#00e5ff'); line([cx, minY], [cx, maxY + 1], '#ffe06b');
  const w = (maxX - minX + 1) * s, h = (maxY - minY + 1) * s;
  measurement = [Math.max(w, h), Math.min(w, h)];
  $('measuremsg').innerHTML = `Simulated model outline (red). Lesion 1: d1 = <b>${fmt(measurement[0])} mm</b>, d2 = <b>${fmt(measurement[1])} mm</b>, d1 × d2 = ${fmt(measurement[0] * measurement[1])} mm². Measurable: ${measurement[1] >= MIN_MM ? 'yes' : 'no'}.`;
  $('accept').disabled = $('flagimg').disabled = false;
};
$('accept').onclick = () => { if (!measurement) return; go('entry'); $('l1a').value = measurement[0].toFixed(1); $('l1b').value = measurement[1].toFixed(1); $('entrymsg').className = ''; $('entrymsg').textContent = 'Model measurements copied to lesion 1. Choose a date and add the scan.'; };
$('flagimg').onclick = () => { measurement = null; $('accept').disabled = $('flagimg').disabled = true; $('measuremsg').textContent = 'Outline flagged as wrong: this scan needs expert review and its measurements are not used.'; };
drawSynthetic(false);
go('overview');
