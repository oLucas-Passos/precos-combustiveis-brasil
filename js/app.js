// Dashboard analítico. Dados gerados por `python -m combustiveis` (data/precos.json).
'use strict';

const PRODUTOS = {
  gasolina: { nome: 'Gasolina comum', curto: 'Gasolina', un: '/l', cor: '--gasolina' },
  etanol: { nome: 'Etanol hidratado', curto: 'Etanol', un: '/l', cor: '--etanol' },
  diesel: { nome: 'Diesel S10', curto: 'Diesel S10', un: '/l', cor: '--diesel' },
  glp: { nome: 'GLP 13 kg', curto: 'GLP', un: '/13kg', cor: '--glp' },
};
const PALETA = ['#c2410c', '#1864ab', '#2b8a3e', '#6741d9', '#e67700'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const cor = p => css(PRODUTOS[p].cor);
const nf = (v, d = 2) => v == null ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v, d = 2) => v == null ? '–' : 'R$ ' + nf(v, d);
const pct = (v, d = 0, sinal = true) => v == null ? '–' : (sinal && v > 0 ? '+' : '') + nf(v * 100, d) + '%';
const rMes = m => { const [a, mm] = m.split('-'); return `${MESES[+mm - 1]}/${a.slice(2)}`; };
const rMesL = m => { const [a, mm] = m.split('-'); return `${MESES[+mm - 1]}/${a}`; };
const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

let D, R;
const charts = {};
const st = { escala: 'real', evo: ['gasolina', 'etanol', 'diesel'], its: 'gasolina', escalaUf: 'nominal', prodUf: 'gasolina', ufs: ['SP', 'RJ', 'MG', 'BA', 'AM'] };

// ---------- Chart.js: plugins e opções base ----------
const pluginAnotacoes = {
  id: 'anotacoes',
  beforeDatasetsDraw(chart, _a, opts) {
    if (!opts || !opts.ativo) return;
    const { ctx, chartArea: ca, scales: { x } } = chart;
    const idx = m => D.meses.indexOf(m);
    ctx.save();
    for (const r of opts.faixas || []) {
      const x0 = x.getPixelForValue(Math.max(0, idx(r.inicio)));
      const x1 = x.getPixelForValue(r.fim ? idx(r.fim) : D.meses.length - 1);
      ctx.fillStyle = alpha(css('--ink-3'), 0.1);
      ctx.fillRect(x0, ca.top, x1 - x0, ca.bottom - ca.top);
    }
    ctx.font = `500 10.5px ${css('--sans')}`;
    ctx.textAlign = 'left';
    (opts.eventos || []).forEach((e, i) => {
      const px = x.getPixelForValue(idx(e.mes));
      if (px < ca.left || px > ca.right) return;
      ctx.strokeStyle = css('--ink-3');
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css('--ink-2');
      ctx.fillText(e.rotulo, px + 4, ca.top + 12 + (i % 3) * 13);
    });
    ctx.restore();
  },
};

const pluginErro = {
  id: 'barrasErro',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.erros) return;
      const meta = chart.getDatasetMeta(i);
      ctx.save();
      ctx.strokeStyle = css('--ink-2');
      ctx.lineWidth = 1;
      meta.data.forEach((bar, j) => {
        const v = ds.data[j], e = ds.erros[j];
        const y0 = chart.scales.y.getPixelForValue(v - e), y1 = chart.scales.y.getPixelForValue(v + e);
        ctx.beginPath();
        ctx.moveTo(bar.x, y0); ctx.lineTo(bar.x, y1);
        ctx.moveTo(bar.x - 3, y0); ctx.lineTo(bar.x + 3, y0);
        ctx.moveTo(bar.x - 3, y1); ctx.lineTo(bar.x + 3, y1);
        ctx.stroke();
      });
      ctx.restore();
    });
  },
};

function opts({ y = v => brl(v), tip = v => brl(v), legenda = true, extra = {} } = {}) {
  const g = css('--line'), t = css('--ink-2');
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legenda, align: 'start', labels: { color: t, usePointStyle: true, boxWidth: 7, boxHeight: 7, font: { size: 12 } } },
      tooltip: { callbacks: { label: c => `${c.dataset.label}: ${tip(c.parsed.y ?? c.parsed.x)}` } },
    },
    scales: {
      x: { grid: { color: g, drawTicks: false }, border: { display: false }, ticks: { color: t, maxTicksLimit: 9, padding: 6 } },
      y: { grid: { color: g, drawTicks: false }, border: { display: false }, ticks: { color: t, padding: 6, callback: y } },
    },
    ...extra,
  };
}

function desenhar(chave, el, config) {
  if (charts[chave]) { charts[chave].data = config.data; charts[chave].options = config.options; charts[chave].update(); }
  else charts[chave] = new Chart($(el), config);
}

function segmento(id, itens, ativo, aoMudar, multi = false) {
  const el = $(id);
  const render = () => {
    el.innerHTML = itens.map(([v, r]) => {
      const on = multi ? ativo().includes(v) : ativo() === v;
      return `<button type="button" data-v="${v}" aria-pressed="${on}">${r}</button>`;
    }).join('');
  };
  render();
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    aoMudar(b.dataset.v); render();
  });
}

// ---------- Cabeçalho e KPIs ----------
function cabecalho() {
  const [ini, fim] = R.periodo;
  document.querySelectorAll('[data-ano-fim]').forEach(e => (e.textContent = fim.slice(0, 4)));
  document.querySelectorAll('[data-periodo]').forEach(e => (e.textContent = `${rMesL(ini)} – ${rMesL(fim)}`));
  document.querySelectorAll('[data-registros]').forEach(e => (e.textContent = R.registros.toLocaleString('pt-BR')));
  document.querySelectorAll('[data-base]').forEach(e => (e.textContent = rMesL(D.baseReal)));
}

function kpis() {
  const n = D.meses.length - 1;
  $('kpis').innerHTML = Object.entries(PRODUTOS).map(([p, i]) => {
    const s = D.brasil[p], v12 = s[n] / s[n - 12] - 1, vr = R.variacao_real[p];
    return `<div class="kpi" style="--c:var(${i.cor})">
      <div class="lbl">${i.nome}</div>
      <div class="val">${brl(s[n])}<small>${i.un}</small></div>
      <div class="rows">
        <span>12 meses <b class="${v12 > 0 ? 'up' : 'down'}">${pct(v12, 1)}</b></span>
        <span>real desde 2013 <b class="${vr > 0 ? 'up' : 'down'}">${pct(vr, 0)}</b></span>
      </div>
    </div>`;
  }).join('');
}

// ---------- 01 Evolução ----------
function evolucao() {
  const fonte = st.escala === 'real' ? D.brasilReal : D.brasil;
  const ds = st.evo.map(p => ({ label: PRODUTOS[p].nome, data: fonte[p], borderColor: cor(p), backgroundColor: cor(p), pointRadius: 0, borderWidth: 1.8, tension: 0.15, spanGaps: false }));
  const o = opts();
  o.plugins.anotacoes = { ativo: true, eventos: D.eventos, faixas: D.regimes.filter(r => r.nome.includes('PPI')) };
  desenhar('evo', 'chEvolucao', { type: 'line', data: { labels: D.meses.map(rMes), datasets: ds }, options: o, plugins: [pluginAnotacoes] });

  const vr = R.variacao_real, vn = R.variacao_nominal;
  $('findEvo').innerHTML = `Com IPCA acumulado de <b>${pct(R.ipca_acumulado)}</b>, a alta nominal da gasolina (${pct(vn.gasolina)}) corresponde a <b>${pct(vr.gasolina)}</b> em termos reais. O etanol está em <b>${pct(vr.etanol)}</b> real; os aumentos reais relevantes foram no <b>diesel S10 (${pct(vr.diesel)})</b> e no <b>GLP (${pct(vr.glp)})</b>. Pico real da gasolina: ${rMesL(R.pico_real.gasolina[0])}, ${brl(R.pico_real.gasolina[1])}/l a preços de hoje.`;
}

// ---------- 02 Volatilidade ----------
function volatilidade() {
  const regs = Object.keys(R.volatilidade_regime);
  const prods = ['gasolina', 'etanol', 'diesel'];
  const o = opts({ y: v => nf(v * 100, 0) + '%', tip: v => pct(v, 1, false) });
  o.scales.x.grid.display = false;
  desenhar('volReg', 'chVolRegime', {
    type: 'bar',
    data: { labels: regs.map(r => r.replace(' (PPI)', '').split(' ')), datasets: prods.map(p => ({ label: PRODUTOS[p].curto, data: regs.map(r => R.volatilidade_regime[r][p]), backgroundColor: cor(p), borderRadius: 3, maxBarThickness: 34 })) },
    options: o,
  });

  const o2 = opts({ y: v => nf(v * 100, 0) + '%', tip: v => pct(v, 1, false) });
  o2.plugins.anotacoes = { ativo: true, eventos: [], faixas: D.regimes.filter(r => r.nome.includes('PPI')) };
  desenhar('volMov', 'chVolMovel', {
    type: 'line',
    data: { labels: D.meses.map(rMes), datasets: prods.map(p => ({ label: PRODUTOS[p].curto + ' (12m)', data: D.volatilidadeMovel[p], borderColor: cor(p), backgroundColor: cor(p), pointRadius: 0, borderWidth: 1.6, tension: 0.2 })) },
    options: o2, plugins: [pluginAnotacoes],
  });

  const v = R.volatilidade_regime, a = 'Preço administrado', b = 'Paridade de importação (PPI)', c = 'Nova política comercial';
  $('findVol').innerHTML = `Sob paridade de importação, a volatilidade da gasolina foi <b>${nf(v[b].gasolina / v[a].gasolina, 1)}×</b> a do regime anterior (${pct(v[b].gasolina, 1, false)} vs. ${pct(v[a].gasolina, 1, false)} a.a.). Após mai/2023 a gasolina voltou a ${pct(v[c].gasolina, 1, false)}, mas o <b>diesel seguiu volátil (${pct(v[c].diesel, 1, false)})</b>. Comparação descritiva: os regimes coincidem com choques externos.`;
}

// ---------- 03 Sazonalidade ----------
function sazonalidade() {
  const prods = ['etanol', 'gasolina'];
  const o = opts({ y: v => nf(v, 0) + '%', tip: v => (v > 0 ? '+' : '') + nf(v, 2) + '%' });
  o.scales.x.grid.display = false;
  desenhar('saz', 'chSaz', {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: prods.map(p => ({
        label: PRODUTOS[p].nome, data: D.sazonalidade[p].map(r => r.efeito_pct), erros: D.sazonalidade[p].map(r => 1.96 * r.erro_padrao),
        backgroundColor: alpha(cor(p), p === 'etanol' ? 0.9 : 0.45), borderRadius: 3, maxBarThickness: 22,
      })),
    },
    options: o, plugins: [pluginErro],
  });
  const e = D.sazonalidade.etanol, mx = e.reduce((a, b) => (b.efeito_pct > a.efeito_pct ? b : a)), mn = e.reduce((a, b) => (b.efeito_pct < a.efeito_pct ? b : a));
  $('findSaz').innerHTML = `O etanol fica <b>${nf(mx.efeito_pct, 1)}% acima da tendência em ${MESES[mx.m - 1]}</b> e <b>${nf(Math.abs(mn.efeito_pct), 1)}% abaixo em ${MESES[mn.m - 1]}</b>, amplitude de ${nf(mx.efeito_pct - mn.efeito_pct, 1)} p.p., em linha com a entressafra (dez–mar) e a safra (abr–nov) da cana no Centro-Sul. A gasolina não apresenta padrão sazonal relevante.`;
}

// ---------- 04 Etanol ----------
const razao = uf => D.series.etanol[uf].map((v, i) => (v != null && D.series.gasolina[uf][i] != null ? v / D.series.gasolina[uf][i] : null));

function etanolUf() {
  const uf = $('selUf').value, r = razao(uf), lim = D.limiteEtanol;
  const ok = cor('etanol'), bad = cor('gasolina');
  const o = opts({ y: v => nf(v * 100, 0) + '%', tip: v => pct(v, 1, false) });
  desenhar('razao', 'chRazao', {
    type: 'line',
    data: {
      labels: D.meses.map(rMes),
      datasets: [
        { label: 'Etanol ÷ gasolina', data: r, borderWidth: 1.8, pointRadius: 0, tension: 0.15, borderColor: css('--ink'), segment: { borderColor: c => (c.p1.parsed.y <= lim ? ok : bad) } },
        { label: 'Paridade (70%)', data: r.map(() => lim), borderColor: css('--ink-3'), borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0 },
      ],
    },
    options: o,
  });
  const atual = r.filter(v => v != null).at(-1), share = R.paridade_etanol[uf], nome = D.estados[uf].nome;
  $('noteUf').innerHTML = `${nome}: razão atual <b class="${atual <= lim ? 'ok' : 'bad'}">${pct(atual, 0, false)}</b> (${atual <= lim ? 'etanol competitivo' : 'gasolina mais vantajosa'}); etanol competitivo em <b>${pct(share, 0, false)}</b> dos meses desde 2013.`;
}

function etanolGeral() {
  const lista = Object.entries(R.paridade_etanol).sort((a, b) => b[1] - a[1]);
  const o = opts({ legenda: false, y: v => v, tip: v => pct(v, 0, false), extra: { indexAxis: 'y', interaction: { mode: 'nearest', intersect: true } } });
  o.scales.x = { ...o.scales.x, max: 1, ticks: { ...o.scales.x.ticks, callback: v => nf(v * 100, 0) + '%' } };
  o.scales.y = { grid: { display: false }, border: { display: false }, ticks: { color: css('--ink-2'), autoSkip: false, font: { size: 10.5, family: css('--mono') } } };
  o.plugins.title = { display: true, text: '% dos meses com etanol ≤ 70% da gasolina', align: 'start', color: css('--ink-2'), font: { size: 12, weight: 500 } };
  desenhar('share', 'chShare', {
    type: 'bar',
    data: { labels: lista.map(x => x[0]), datasets: [{ label: 'Competitivo', data: lista.map(x => x[1]), backgroundColor: lista.map(x => (x[1] >= 0.5 ? cor('etanol') : alpha(cor('gasolina'), 0.75))), borderRadius: 2 }] },
    options: o,
  });

  // mapa de calor UF x ano
  const anos = [...new Set(D.meses.map(m => m.slice(0, 4)))];
  const escala = v => {
    const t = Math.min(1, Math.max(0, (v - 0.55) / 0.30));
    const stops = [[26, 152, 80], [217, 239, 139], [254, 224, 139], [252, 141, 89], [215, 48, 39]];
    const k = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(k)), f = k - i;
    return `rgb(${stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * f)).join(',')})`;
  };
  let html = '<thead><tr><th></th>' + anos.map(a => `<th>${a.slice(2)}</th>`).join('') + '</tr></thead><tbody>';
  for (const [uf] of lista) {
    const r = razao(uf);
    html += `<tr><th class="uf" title="${D.estados[uf].nome}">${uf}</th>` + anos.map(a => {
      const vals = r.filter((v, i) => v != null && D.meses[i].startsWith(a));
      if (!vals.length) return '<td></td>';
      const m = vals.reduce((s, v) => s + v, 0) / vals.length;
      return `<td style="background:${escala(m)}" title="${uf} ${a}: ${pct(m, 1, false)}">${Math.round(m * 100)}</td>`;
    }).join('') + '</tr>';
  }
  $('heat').innerHTML = html + '</tbody>';
}

// ---------- 05 Dispersão ----------
function dispersao() {
  const y = D.dispersao, pts = y.map((v, i) => [i, v]).filter(p => p[1] != null);
  const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const o = opts({ y: v => nf(v * 100, 1) + '%', tip: v => pct(v, 2, false) });
  o.plugins.anotacoes = { ativo: true, eventos: D.eventos.filter(e => e.mes.startsWith('2022-07')), faixas: [] };
  desenhar('disp', 'chDisp', {
    type: 'line',
    data: {
      labels: D.meses.map(rMes),
      datasets: [
        { label: 'CV entre UFs', data: y, borderColor: cor('gasolina'), backgroundColor: cor('gasolina'), pointRadius: 0, borderWidth: 1.7, tension: 0.15 },
        { label: `Tendência (${b * 12 * 100 > 0 ? '+' : ''}${nf(b * 12 * 100, 2)} p.p./ano)`, data: y.map((_, i) => a + b * i), borderColor: css('--ink-3'), borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0 },
      ],
    },
    options: o, plugins: [pluginAnotacoes],
  });
  const media = arr => arr.filter(v => v != null).reduce((s, v, _, A) => s + v / A.length, 0);
  const ini = media(y.slice(0, 12)), fim = media(y.slice(-12)), dg = R.dispersao_gasolina_atual;
  $('findDisp').innerHTML = `A dispersão entre estados está em alta: CV médio de <b>${pct(ini, 1, false)}</b> em 2013 para <b>${pct(fim, 1, false)}</b> nos últimos 12 meses. Entre nov/2021 e dez/2022, com o ICMS congelado e depois limitado, ficou perto de 4%. Hoje a amplitude é de <b>${brl(dg.amplitude)}/l</b> entre ${D.estados[dg.max[0]].nome} (${brl(dg.max[1])}) e ${D.estados[dg.min[0]].nome} (${brl(dg.min[1])}).`;
}

// ---------- 06 ICMS ----------
function icms() {
  const p = st.its, s = D.icms[p];
  const o = opts({ tip: v => brl(v) });
  const linhaIntervencao = {
    id: 'intervencao',
    beforeDatasetsDraw(c) {
      const { ctx, chartArea: ca, scales: { x } } = c, px = x.getPixelForValue(s.meses.indexOf(D.icms.intervencao));
      ctx.save();
      ctx.strokeStyle = css('--ink-3'); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = css('--ink-2'); ctx.font = `500 10.5px ${css('--sans')}`;
      ctx.fillText('LC 194/2022', px + 4, ca.top + 12);
      ctx.restore();
    },
  };
  desenhar('its', 'chIts', {
    type: 'line',
    data: {
      labels: s.meses.map(rMes),
      datasets: [
        { label: 'Observado (R$ reais)', data: s.observado, showLine: false, pointRadius: 3, pointBackgroundColor: cor(p), borderColor: cor(p) },
        { label: 'Ajuste do modelo', data: s.ajuste, borderColor: cor(p), pointRadius: 0, borderWidth: 2 },
        { label: 'Tendência pré-intervenção', data: s.contrafactual, borderColor: css('--ink-3'), borderDash: [5, 4], pointRadius: 0, borderWidth: 1.3 },
      ],
    },
    options: o,
    plugins: [linhaIntervencao],
  });
  const its = R.its_icms;
  $('tblIts').innerHTML = '<thead><tr><th>Produto</th><th>β₂ nível</th><th>IC 95%</th><th>p</th></tr></thead><tbody>' +
    ['gasolina', 'etanol', 'diesel'].map(k => {
      const r = its[k], sig = r.p_valor < 0.05;
      return `<tr><td>${PRODUTOS[k].curto}</td><td class="${sig ? 'sig' : 'nsig'}">${nf(r.mudanca_nivel_pct, 1)}%</td><td>[${nf(r.ic95[0], 1)}; ${nf(r.ic95[1], 1)}]</td><td>${r.p_valor < 0.001 ? '&lt;0,001' : nf(r.p_valor, 3)}</td></tr>`;
    }).join('') + '</tbody>';
  const rob = R.its_icms_robustez, jan = Object.keys(rob.gasolina);
  $('tblRob').innerHTML = '<thead><tr><th>Janela</th>' + jan.map(j => `<th>±${j}m</th>`).join('') + '</tr></thead><tbody>' +
    ['gasolina', 'etanol', 'diesel'].map(k => `<tr><td>${PRODUTOS[k].curto}</td>${jan.map(j => `<td>${nf(rob[k][j], 1)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('findIts').innerHTML = `Quebra de nível de <b>${nf(its.gasolina.mudanca_nivel_pct, 1)}%</b> na gasolina e <b>${nf(its.etanol.mudanca_nivel_pct, 1)}%</b> no etanol (p &lt; 0,001), robusta entre janelas de 6 e 24 meses; <b>sem quebra no diesel</b>, cuja alíquota de ICMS já era menor. <b>Identificação:</b> no mesmo período houve cortes de preço da Petrobras e queda do petróleo, então β₂ mede a variação total associada à intervenção, não o efeito isolado do imposto.`;
}

// ---------- 07 Estados ----------
function ranking() {
  const p = st.prodUf, fonte = st.escalaUf === 'real' ? D.seriesReal : D.series, n = D.meses.length - 1;
  const lista = Object.keys(D.estados).map(uf => [uf, fonte[p][uf][n]]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
  const media = D.brasil[p][n];
  const o = opts({ legenda: false, y: v => v, extra: { indexAxis: 'y', interaction: { mode: 'nearest', intersect: true } } });
  o.scales.x = { ...o.scales.x, min: Math.floor(lista.at(-1)[1] * 0.92 * 10) / 10, ticks: { ...o.scales.x.ticks, callback: v => brl(v) } };
  o.scales.y = { grid: { display: false }, border: { display: false }, ticks: { color: css('--ink-2'), autoSkip: false, font: { size: 11 } } };
  o.plugins.tooltip.callbacks.label = c => `${D.estados[lista[c.dataIndex][0]].nome}: ${brl(c.parsed.x)}`;
  desenhar('rank', 'chRank', {
    type: 'bar',
    data: { labels: lista.map(x => x[0]), datasets: [{ label: PRODUTOS[p].nome, data: lista.map(x => x[1]), backgroundColor: lista.map(x => (x[1] >= media ? cor(p) : alpha(cor(p), 0.45))), borderRadius: 2 }] },
    options: o,
  });
}

function comparar() {
  const p = st.prodUf, fonte = st.escalaUf === 'real' ? D.seriesReal : D.series;
  desenhar('comp', 'chComp', {
    type: 'line',
    data: { labels: D.meses.map(rMes), datasets: st.ufs.map((uf, i) => ({ label: D.estados[uf].nome, data: fonte[p][uf], borderColor: PALETA[i], backgroundColor: PALETA[i], pointRadius: 0, borderWidth: 1.7, tension: 0.15 })) },
    options: opts(),
  });
}

function chips() {
  const el = $('chips');
  const render = () => {
    el.innerHTML = Object.keys(D.estados).map(uf => {
      const i = st.ufs.indexOf(uf);
      return `<button type="button" data-uf="${uf}" title="${D.estados[uf].nome}" aria-pressed="${i >= 0}" style="--c:${i >= 0 ? PALETA[i] : 'transparent'}">${uf}</button>`;
    }).join('');
  };
  render();
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const uf = b.dataset.uf, i = st.ufs.indexOf(uf);
    if (i >= 0) { if (st.ufs.length > 1) st.ufs.splice(i, 1); } else { if (st.ufs.length >= 5) st.ufs.shift(); st.ufs.push(uf); }
    render(); comparar();
  });
}

// ---------- Inicialização ----------
async function iniciar() {
  D = await fetch('data/precos.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  R = D.resumo;
  Chart.defaults.font.family = css('--sans');
  Chart.defaults.font.size = 11.5;

  cabecalho();
  kpis();

  segmento('segEscala', [['real', 'Real (IPCA)'], ['nominal', 'Nominal']], () => st.escala, v => { st.escala = v; evolucao(); });
  segmento('segProdutoEvo', Object.entries(PRODUTOS).filter(([p]) => p !== 'glp').map(([p, i]) => [p, i.curto]), () => st.evo,
    v => { const i = st.evo.indexOf(v); if (i >= 0 && st.evo.length > 1) st.evo.splice(i, 1); else if (i < 0) st.evo.push(v); evolucao(); }, true);
  evolucao();

  volatilidade();
  sazonalidade();

  const sel = $('selUf');
  sel.innerHTML = Object.entries(D.estados).sort((a, b) => a[1].nome.localeCompare(b[1].nome)).map(([uf, e]) => `<option value="${uf}"${uf === 'SP' ? ' selected' : ''}>${e.nome}</option>`).join('');
  sel.addEventListener('change', etanolUf);
  etanolUf();
  etanolGeral();

  dispersao();

  segmento('segIts', ['gasolina', 'etanol', 'diesel'].map(p => [p, PRODUTOS[p].curto]), () => st.its, v => { st.its = v; icms(); });
  icms();

  segmento('segEscalaUf', [['nominal', 'Nominal'], ['real', 'Real']], () => st.escalaUf, v => { st.escalaUf = v; ranking(); comparar(); });
  segmento('segProdutoUf', Object.entries(PRODUTOS).map(([p, i]) => [p, i.curto]), () => st.prodUf, v => { st.prodUf = v; ranking(); comparar(); });
  chips();
  ranking();
  comparar();
}

iniciar().catch(err => {
  document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="finding warn">Falha ao carregar data/precos.json (${err.message}). Sirva o projeto com <code>python -m http.server</code>.</div>`);
});
