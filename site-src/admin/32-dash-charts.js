/* ==========================================================================
   Графики обзора. Ось одна, сетка — волосяные линии. Столбец не толще 24 px,
   скруглён только конец с данными (4 px), у основания — прямой. Части стопки
   разделены зазором 2 px цвета поверхности, не обводкой. Легенда — только
   для двух рядов и больше. Подсказка — на наведение и фокус (стрелки ведут
   по столбцам, в Tab график — одна остановка). У каждого графика — таблица
   с теми же цифрами. Цвета — --chart и --chart-2 (admin.css).
   ========================================================================== */
"use strict";

/* Ширина графика — по ширине карточки (мерится после отрисовки), чтобы
   подписи осей оставались 11 px и на телефоне. */
let FC_W = 720;
const FC_GAP = 2;

/* Легенда повторяет форму отметки: прямоугольник у столбцов. */
function dashLegend(series){
  if (series.length < 2) return "";
  return `<ul class="dlegend">${series.map(s => `<li><i class="dkey ${s.key}" aria-hidden="true"></i>${esc(s.name)}</li>`).join("")}</ul>`;
}
const partsAttr = (series, vals) => series.length > 1 ? ` data-parts="${esc(JSON.stringify(series.map((s, j) => [s.name, fmtUZS(vals[j]), s.key])))}"` : "";
const partsText = (series, vals) => series.length > 1 ? ` (${series.map((s, j) => `${s.name} ${fmtUZS(vals[j])}`).join(", ")})` : "";
const keysNote = id => `<div class="fc-tip" aria-hidden="true" hidden></div><p class="sr-only" id="${id}-keys">${esc(t("dash_keys"))}</p>`;

/* Столбцы, стопкой снизу вверх в порядке рядов. data: [{ x, d, vals }],
   x — подпись оси, d — дата в подсказке, vals — по ряду на значение. */
function colChart({ id, label, data, series, W = FC_W }){
  const H = W < 480 ? 200 : 220, L = 56, R = 8, T = 12, B = 26, base = H - B;
  const tot = x => x.vals.reduce((s, v) => s + v, 0), max = Math.max(1, ...data.map(tot));
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor((W - L) / 72))));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step, band = (W - L - R) / data.length, bw = Math.min(24, band - 2);
  const y = v => T + (H - T - B) * (1 - v / top);
  const ticks = []; for (let v = 0; v <= top + 1; v += step) ticks.push(v);
  const bar = (x, i) => {
    const bx = L + band * i + (band - bw) / 2, last = x.vals.reduce((k, v, j) => v > 0 ? j : k, -1);
    let yb = base, acc = 0, segs = "";
    x.vals.forEach((v, j) => {
      if (v <= 0) return;
      acc += v;
      const bottom = segs ? yb - FC_GAP : yb, yt = Math.min(y(acc), bottom - (segs ? 1 : 2)), h = bottom - yt;
      const r = j === last ? Math.min(4, h, bw / 2) : 0;
      const d = r ? `M${bx},${bottom}V${yt + r}Q${bx},${yt} ${bx + r},${yt}H${bx + bw - r}Q${bx + bw},${yt} ${bx + bw},${yt + r}V${bottom}Z`
        : `M${bx},${bottom}V${yt}H${bx + bw}V${bottom}Z`;
      segs += `<path class="fc-seg ${series[j].key}" d="${d}"/>`; yb = yt;
    });
    return `<g class="fc-bar" tabindex="${i === data.length - 1 ? 0 : -1}" role="img" aria-label="${esc(`${x.d}: ${fmtUZS(tot(x))}${partsText(series, x.vals)}`)}"
      data-d="${esc(x.d)}" data-v="${esc(fmtUZS(tot(x)))}"${partsAttr(series, x.vals)}><rect class="fc-hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"/>${segs}</g>`;
  };
  const labels = data.map((x, i) => (data.length - 1 - i) % every === 0 ? `<text class="fc-x" x="${L + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${esc(x.x)}</text>` : "").join("");
  return `<div class="fchart" data-w="${W}">${dashLegend(series)}<svg class="fc-plot" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(label)}" aria-describedby="${id}-keys">
      ${ticks.map(v => `<line class="fc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="fc-y" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compactUZS(v, top))}</text>`).join("")}
      ${data.map(bar).join("")}${labels}</svg>${keysNote(id)}</div>`;
}

/* Горизонтальные полосы — для длинных названий (направления, услуги).
   rows: [{ name, vals, end, d, v }], end — подпись у конца полосы. */
function hbarChart({ id, label, rows, series }){
  const tot = r => r.vals.reduce((s, v) => s + v, 0), max = Math.max(1, ...rows.map(tot));
  const row = (r, i) => {
    const nz = r.vals.filter(v => v > 0).length, last = r.vals.reduce((k, v, j) => v > 0 ? j : k, -1);
    const segs = r.vals.map((v, j) => v > 0 ? `<span class="hseg ${series[j].key}${j === last ? " end" : ""}" style="width:calc(${(v / max * 100).toFixed(2)}% - ${nz > 1 ? FC_GAP / 2 : 0}px)"></span>` : "").join("");
    return `<div class="fc-bar hrow" role="img" tabindex="${i ? -1 : 0}" aria-label="${esc(r.aria || `${r.name}: ${r.v}${partsText(series, r.vals)}`)}" data-d="${esc(r.d)}" data-v="${esc(r.v)}"${partsAttr(series, r.vals)}>
      <span class="hrow-h" aria-hidden="true"><span class="hrow-n">${esc(r.name)}</span><b class="hrow-v">${esc(r.end)}</b></span>
      <span class="hrow-track" aria-hidden="true">${segs}</span></div>`;
  };
  return `<div class="fchart hchart">${dashLegend(series)}<div class="fc-plot hbars" role="group" aria-label="${esc(label)}" aria-describedby="${id}-keys">${rows.map(row).join("")}</div>${keysNote(id)}</div>`;
}

/* Таблица-двойник графика: те же цифры без наведения, для диктора и для сверки. */
function chartTable(key, caption, head, rows, foot){
  const tr = (r, cell = "td") => `<tr>${r.map((c, i) => i ? `<${cell} class="num">${esc(c)}</${cell}>` : `<th scope="row">${esc(c)}</th>`).join("")}</tr>`;
  return `<details class="dtab" data-keep="${key}" ${M.ui[key] ? "open" : ""}><summary>${esc(t("dash_table"))}</summary>
    <div class="dtab-in" role="region" tabindex="0" aria-label="${esc(caption)}"><table class="dtable"><caption class="sr-only">${esc(caption)}</caption>
      <thead><tr>${head.map((h, i) => `<th scope="col"${i ? ` class="num"` : ""}>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => tr(r)).join("")}</tbody>${foot ? `<tfoot>${tr(foot)}</tfoot>` : ""}</table></div></details>`;
}
