// Gráficos do site. Os dados vêm de data/precos.json, gerado por `python -m combustiveis`.
'use strict';

const PRODUTOS = {
  gasolina: { nome: 'Gasolina comum', curto: 'Gasolina', un: '/litro', cor: '--gasolina' },
  etanol: { nome: 'Etanol', curto: 'Etanol', un: '/litro', cor: '--etanol' },
  diesel: { nome: 'Diesel S10', curto: 'Diesel S10', un: '/litro', cor: '--diesel' },
  glp: { nome: 'Gás de cozinha (13 kg)', curto: 'Gás', un: '/botijão', cor: '--glp' },
};
const CORES_UF = ['#c2410c', '#1864ab', '#2b8a3e', '#6741d9', '#e67700'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const $ = id => document.getElementById(id);
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const cor = p => cssVar(PRODUTOS[p].cor);
const num = (v, d = 2) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const reais = (v, d = 2) => (v == null ? '' : 'R$ ' + num(v, d));
const pct = (v, d = 0, sinal = true) => (v == null ? '' : (sinal && v > 0 ? '+' : '') + num(v * 100, d) + '%');
const mesCurto = m => { const [a, mm] = m.split('-'); return `${MESES[+mm - 1]}/${a.slice(2)}`; };
const mesAno = m => { const [a, mm] = m.split('-'); return `${MESES[+mm - 1]}/${a}`; };
const mesExtenso = m => { const [a, mm] = m.split('-'); return `${MESES_LONGOS[+mm - 1]} de ${a}`; };
const transparente = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const estreito = () => window.innerWidth < 560;

let D, R;
const graficos = {};
const estado = {
  escala: 'real', evo: ['gasolina', 'etanol', 'diesel'], its: 'gasolina',
  escalaUf: 'nominal', prodUf: 'gasolina', ufs: ['SP', 'RJ', 'MG', 'BA', 'AM'],
};

// Linhas verticais numeradas para os eventos e faixa sombreada para o período de paridade de importação.
const pluginEventos = {
  id: 'eventos',
  beforeDatasetsDraw(chart, _args, op) {
    if (!op || (!op.eventos && !op.faixa)) return;
    const { ctx, chartArea: area, scales: { x } } = chart;
    const pos = m => x.getPixelForValue(D.meses.indexOf(m));
    ctx.save();
    if (op.faixa) {
      const x0 = pos(op.faixa[0]), x1 = pos(op.faixa[1]);
      ctx.fillStyle = transparente(cssVar('--texto-3'), 0.1);
      ctx.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
    }
    let anterior = -Infinity, nivel = 0;
    (op.eventos || []).forEach((e, i) => {
      const px = pos(e.mes);
      nivel = px - anterior < 19 ? nivel + 1 : 0;
      anterior = px;
      const cy = area.top + 8 + nivel * 19;
      ctx.strokeStyle = cssVar('--texto-3');
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, op.numerar ? cy + 8 : area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
      ctx.setLineDash([]);
      if (op.numerar) {
        ctx.fillStyle = cssVar('--texto-2');
        ctx.beginPath(); ctx.arc(px, cy, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cssVar('--fundo');
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), px, cy + 0.5);
      }
    });
    ctx.restore();
  },
};

const pluginBarrasErro = {
  id: 'barrasErro',
  afterDatasetsDraw(chart) {
    const { ctx, scales: { y } } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.erros || chart.getDatasetMeta(i).hidden) return;
      ctx.save();
      ctx.strokeStyle = cssVar('--texto-2');
      ctx.lineWidth = 1;
      chart.getDatasetMeta(i).data.forEach((barra, j) => {
        const topo = y.getPixelForValue(ds.data[j] + ds.erros[j]);
        const base = y.getPixelForValue(ds.data[j] - ds.erros[j]);
        ctx.beginPath();
        ctx.moveTo(barra.x, topo); ctx.lineTo(barra.x, base);
        ctx.moveTo(barra.x - 3, topo); ctx.lineTo(barra.x + 3, topo);
        ctx.moveTo(barra.x - 3, base); ctx.lineTo(barra.x + 3, base);
        ctx.stroke();
      });
      ctx.restore();
    });
  },
};

function opcoes({ eixoY = v => reais(v), dica = v => reais(v), legenda = true, extra = {} } = {}) {
  const grade = cssVar('--linha'), texto = cssVar('--texto-2');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legenda, align: 'start', labels: { color: texto, usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 12 } },
      tooltip: { callbacks: { label: c => `${c.dataset.label}: ${dica(c.parsed.y ?? c.parsed.x)}` } },
    },
    scales: {
      x: { grid: { color: grade, drawTicks: false }, border: { display: false }, ticks: { color: texto, padding: 6, maxRotation: 0, autoSkipPadding: 14, maxTicksLimit: estreito() ? 5 : 9 } },
      y: { grid: { color: grade, drawTicks: false }, border: { display: false }, ticks: { color: texto, padding: 6, callback: eixoY } },
    },
    ...extra,
  };
}

function linha(rotulo, dados, corLinha, extra = {}) {
  return { label: rotulo, data: dados, borderColor: corLinha, backgroundColor: corLinha, pointRadius: 0, borderWidth: 1.8, tension: 0.15, spanGaps: true, ...extra };
}

function desenhar(chave, canvas, config) {
  if (graficos[chave]) {
    graficos[chave].data = config.data;
    graficos[chave].options = config.options;
    graficos[chave].update();
  } else {
    graficos[chave] = new Chart($(canvas), config);
  }
}

function botoes(id, itens, ativo, aoMudar, multiplo = false) {
  const el = $(id);
  const render = () => {
    el.innerHTML = itens.map(([valor, rotulo]) => {
      const ligado = multiplo ? ativo().includes(valor) : ativo() === valor;
      return `<button type="button" data-v="${valor}" aria-pressed="${ligado}">${rotulo}</button>`;
    }).join('');
  };
  render();
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    aoMudar(b.dataset.v);
    render();
  });
}

// Arredonda o limite do eixo para um valor "redondo".
function limiteRedondo(v, paraBaixo) {
  const passo = v >= 50 ? 10 : v >= 5 ? 0.5 : 0.1;
  return (paraBaixo ? Math.floor(v / passo) : Math.ceil(v / passo)) * passo;
}

function passoRedondo(bruto) {
  const base = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / base;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * base;
}

function textos() {
  const [ini, fim] = R.periodo;
  document.querySelectorAll('[data-inicio]').forEach(e => (e.textContent = mesExtenso(ini)));
  document.querySelectorAll('[data-fim]').forEach(e => (e.textContent = mesExtenso(fim)));
}

function indicadores() {
  const n = D.meses.length - 1;
  $('kpis').innerHTML = Object.entries(PRODUTOS).map(([p, info]) => {
    const serie = D.brasil[p];
    const em12 = serie[n] / serie[n - 12] - 1;
    const real = R.variacao_real[p];
    return `<div class="kpi" style="--c: var(${info.cor})">
      <div class="nome">${info.nome}</div>
      <div class="valor">${reais(serie[n])}<small>${info.un}</small></div>
      <div class="linhas">
        <div>Em 12 meses: <span class="${em12 > 0 ? 'sobe' : 'desce'}">${pct(em12, 1)}</span></div>
        <div>Real desde 2013: <span class="${real > 0 ? 'sobe' : 'desce'}">${pct(real)}</span></div>
      </div>
    </div>`;
  }).join('');
}

function evolucao() {
  const fonte = estado.escala === 'real' ? D.brasilReal : D.brasil;
  const ppi = D.regimes.find(r => r.inicio === '2016-10');
  const op = opcoes();
  op.plugins.eventos = { eventos: D.eventos, faixa: [ppi.inicio, ppi.fim], numerar: true };
  op.layout = { padding: { top: 6 } };
  desenhar('evo', 'chEvolucao', {
    type: 'line',
    data: { labels: D.meses.map(mesCurto), datasets: estado.evo.map(p => linha(PRODUTOS[p].nome, fonte[p], cor(p))) },
    options: op,
    plugins: [pluginEventos],
  });

  $('listaEventos').innerHTML = D.eventos.map((e, i) => `<li><b>${i + 1}</b>${e.rotulo} <span>(${mesAno(e.mes)})</span></li>`).join('')
    + '<li><i class="faixa-legenda"></i><span>Área cinza: período em que a Petrobras seguiu o preço internacional</span></li>';

  const vr = R.variacao_real, vn = R.variacao_nominal;
  $('txtEvo').textContent = `A inflação acumulada no período foi de ${pct(R.ipca_acumulado, 0, false)}. Descontado isso, a gasolina subiu ${pct(vr.gasolina, 0, false)} (no valor nominal, ${pct(vn.gasolina, 0, false)}) e o etanol está ${pct(-vr.etanol, 0, false)} mais barato do que em 2013. O que mais encareceu foi o diesel, com alta real de ${pct(vr.diesel, 0, false)}, e o gás de cozinha, com ${pct(vr.glp, 0, false)}. O pico da gasolina foi em ${mesExtenso(R.pico_real.gasolina[0])}: ${reais(R.pico_real.gasolina[1])} por litro em valores de hoje.`;
}

function volatilidade() {
  const periodos = Object.keys(R.volatilidade_regime);
  const rotulos = { 'Preço administrado': ['Até set/2016'], 'Paridade de importação (PPI)': ['Out/2016 a abr/2023', '(preço internacional)'], 'Nova política comercial': ['Desde mai/2023'] };
  const prods = ['gasolina', 'etanol', 'diesel'];

  const op = opcoes({ eixoY: v => num(v * 100, 0) + '%', dica: v => pct(v, 1, false) });
  op.scales.x.grid.display = false;
  desenhar('volReg', 'chVolRegime', {
    type: 'bar',
    data: {
      labels: periodos.map(p => rotulos[p] || p),
      datasets: prods.map(p => ({ label: PRODUTOS[p].curto, data: periodos.map(r => R.volatilidade_regime[r][p]), backgroundColor: cor(p), borderRadius: 3, maxBarThickness: 30 })),
    },
    options: op,
  });

  const ppi = D.regimes.find(r => r.inicio === '2016-10');
  const op2 = opcoes({ eixoY: v => num(v * 100, 0) + '%', dica: v => pct(v, 1, false) });
  op2.plugins.eventos = { faixa: [ppi.inicio, ppi.fim] };
  desenhar('volMov', 'chVolMovel', {
    type: 'line',
    data: { labels: D.meses.map(mesCurto), datasets: prods.map(p => linha(PRODUTOS[p].curto, D.volatilidadeMovel[p], cor(p), { borderWidth: 1.6 })) },
    options: op2,
    plugins: [pluginEventos],
  });

  const v = R.volatilidade_regime;
  const antes = v['Preço administrado'], ppiV = v['Paridade de importação (PPI)'], depois = v['Nova política comercial'];
  $('txtVol').textContent = `Medi a volatilidade como o quanto o preço varia de um mês para o outro, em base anual. Entre outubro de 2016 e abril de 2023, quando a Petrobras acompanhava o preço internacional, a gasolina oscilou ${num(ppiV.gasolina / antes.gasolina, 1)} vezes mais do que antes (${pct(ppiV.gasolina, 1, false)} contra ${pct(antes.gasolina, 1, false)} ao ano). Depois de maio de 2023 ela voltou a ficar estável (${pct(depois.gasolina, 1, false)}), mas o diesel continuou instável (${pct(depois.diesel, 1, false)}). Esses períodos também tiveram choques de fora, como a pandemia e a guerra na Ucrânia, então a comparação mostra o que mudou, sem provar a causa.`;
}

function sazonalidade() {
  const prods = ['etanol', 'gasolina'];
  const conjuntos = prods.map(p => ({
    label: PRODUTOS[p].nome,
    data: D.sazonalidade[p].map(r => r.efeito_pct),
    erros: D.sazonalidade[p].map(r => 1.96 * r.erro_padrao),
    backgroundColor: transparente(cor(p), p === 'etanol' ? 0.9 : 0.45),
    borderRadius: 3,
    maxBarThickness: 22,
  }));
  const extremos = conjuntos.flatMap(c => c.data.flatMap((v, i) => [v + c.erros[i], v - c.erros[i]]));
  const op = opcoes({ eixoY: v => num(v, 0) + '%', dica: v => (v > 0 ? '+' : '') + num(v, 1) + '%' });
  op.scales.x.grid.display = false;
  op.scales.x.ticks = { ...op.scales.x.ticks, autoSkip: false, maxTicksLimit: 12 };
  op.scales.y.min = Math.floor(Math.min(...extremos) / 2) * 2;
  op.scales.y.max = Math.ceil(Math.max(...extremos) / 2) * 2;
  op.scales.y.ticks.stepSize = 2;
  op.plugins.tooltip.callbacks.label = c => `${c.dataset.label}: ${(c.parsed.y > 0 ? '+' : '') + num(c.parsed.y, 1)}% (intervalo de ${num(c.parsed.y - c.dataset.erros[c.dataIndex], 1)}% a ${num(c.parsed.y + c.dataset.erros[c.dataIndex], 1)}%)`;
  desenhar('saz', 'chSaz', { type: 'bar', data: { labels: MESES, datasets: conjuntos }, options: op, plugins: [pluginBarrasErro] });

  const e = D.sazonalidade.etanol;
  const alto = e.reduce((a, b) => (b.efeito_pct > a.efeito_pct ? b : a));
  const baixo = e.reduce((a, b) => (b.efeito_pct < a.efeito_pct ? b : a));
  $('txtSaz').textContent = `Sim. Tirando a tendência de longo prazo, o etanol costuma ficar ${num(alto.efeito_pct, 1)}% mais caro em ${MESES_LONGOS[alto.m - 1]} e ${num(Math.abs(baixo.efeito_pct), 1)}% mais barato em ${MESES_LONGOS[baixo.m - 1]}. Isso bate com o calendário da cana no Centro-Sul: a entressafra vai de dezembro a março e a safra, de abril a novembro. A gasolina não tem um padrão parecido. As barras pretas mostram o intervalo de 95%.`;
}

const razaoEtanol = uf => D.series.etanol[uf].map((v, i) => {
  const g = D.series.gasolina[uf][i];
  return v != null && g != null ? v / g : null;
});

function etanolPorEstado() {
  const uf = $('selUf').value, r = razaoEtanol(uf), limite = D.limiteEtanol;
  const bom = cor('etanol'), ruim = cor('gasolina');
  const op = opcoes({ eixoY: v => num(v * 100, 0) + '%', dica: v => pct(v, 0, false) });
  desenhar('razao', 'chRazao', {
    type: 'line',
    data: {
      labels: D.meses.map(mesCurto),
      datasets: [
        linha('Etanol em % da gasolina', r, cssVar('--texto'), { segment: { borderColor: c => (c.p1.parsed.y <= limite ? bom : ruim) } }),
        linha('Limite de 70%', r.map(() => limite), cssVar('--texto-3'), { borderDash: [5, 4], borderWidth: 1.2 }),
      ],
    },
    options: op,
  });
  const atual = r.filter(v => v != null).at(-1);
  const meses = R.paridade_etanol[uf];
  const nome = D.estados[uf].nome;
  $('txtUf').innerHTML = atual <= limite
    ? `Em ${nome}, o etanol custa hoje <span class="desce">${pct(atual, 0, false)}</span> do preço da gasolina, então compensa. Isso aconteceu em ${pct(meses, 0, false)} dos meses desde 2013.`
    : `Em ${nome}, o etanol custa hoje <span class="sobe">${pct(atual, 0, false)}</span> do preço da gasolina, então a gasolina sai mais em conta. O etanol só compensou em ${pct(meses, 0, false)} dos meses desde 2013.`;
}

function etanolGeral() {
  const lista = Object.entries(R.paridade_etanol).sort((a, b) => b[1] - a[1]);
  const op = opcoes({ legenda: false, eixoY: v => v, extra: { indexAxis: 'y', interaction: { mode: 'nearest', intersect: true } } });
  op.scales.x = { ...op.scales.x, min: 0, max: 1, ticks: { ...op.scales.x.ticks, maxTicksLimit: 6, callback: v => num(v * 100, 0) + '%' } };
  op.scales.y = { grid: { display: false }, border: { display: false }, ticks: { color: cssVar('--texto-2'), autoSkip: false, font: { size: 11 } } };
  op.plugins.tooltip.callbacks.label = c => `${D.estados[lista[c.dataIndex][0]].nome}: ${pct(c.parsed.x, 0, false)} dos meses`;
  desenhar('share', 'chShare', {
    type: 'bar',
    data: {
      labels: lista.map(x => x[0]),
      datasets: [{ data: lista.map(x => x[1]), backgroundColor: lista.map(x => (x[1] >= 0.5 ? cor('etanol') : transparente(cor('gasolina'), 0.7))), borderRadius: 2, minBarLength: 2 }],
    },
    options: op,
  });

  const anos = [...new Set(D.meses.map(m => m.slice(0, 4)))];
  const corEscala = v => {
    const t = Math.min(1, Math.max(0, (v - 0.55) / 0.3));
    const paradas = [[26, 152, 80], [217, 239, 139], [254, 224, 139], [252, 141, 89], [215, 48, 39]];
    const k = t * (paradas.length - 1), i = Math.min(paradas.length - 2, Math.floor(k)), f = k - i;
    return `rgb(${paradas[i].map((c, j) => Math.round(c + (paradas[i + 1][j] - c) * f)).join(',')})`;
  };
  let html = '<thead><tr><th></th>' + anos.map(a => `<th>${a}</th>`).join('') + '</tr></thead><tbody>';
  for (const [uf] of lista) {
    const r = razaoEtanol(uf);
    html += `<tr><th class="uf" title="${D.estados[uf].nome}">${uf}</th>`;
    html += anos.map(a => {
      const valores = r.filter((v, i) => v != null && D.meses[i].startsWith(a));
      if (!valores.length) return '<td></td>';
      const media = valores.reduce((s, v) => s + v, 0) / valores.length;
      return `<td style="background:${corEscala(media)}" title="${D.estados[uf].nome}, ${a}: ${pct(media, 0, false)}">${Math.round(media * 100)}</td>`;
    }).join('') + '</tr>';
  }
  $('heat').innerHTML = html + '</tbody>';
}

function dispersao() {
  const y = D.dispersao;
  const pts = y.map((v, i) => [i, v]).filter(p => p[1] != null);
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;

  const op = opcoes({ eixoY: v => num(v * 100, 1) + '%', dica: v => pct(v, 1, false) });
  op.plugins.eventos = { faixa: ['2021-11', '2022-12'] };
  desenhar('disp', 'chDisp', {
    type: 'line',
    data: {
      labels: D.meses.map(mesCurto),
      datasets: [
        linha('Diferença entre estados', y, cor('gasolina')),
        linha('Tendência', y.map((_, i) => a + b * i), cssVar('--texto-3'), { borderDash: [5, 4], borderWidth: 1.2 }),
      ],
    },
    options: op,
    plugins: [pluginEventos],
  });

  const media = arr => { const v = arr.filter(x => x != null); return v.reduce((s, x) => s + x, 0) / v.length; };
  const g = R.dispersao_gasolina_atual;
  $('txtDisp').textContent = `O coeficiente de variação mede o quanto os preços dos estados se afastam da média. Ele passou de ${pct(media(y.slice(0, 12)), 1, false)} em 2013 para ${pct(media(y.slice(-12)), 1, false)} nos últimos 12 meses. A exceção foi a área em cinza, de novembro de 2021 a dezembro de 2022, quando os estados congelaram o ICMS e depois veio o teto: nesse período a diferença caiu para perto de 4%. Isso sugere que o imposto estadual é um dos principais motivos da diferença de preço. Hoje o litro da gasolina custa ${reais(g.max[1])} em ${D.estados[g.max[0]].nome} e ${reais(g.min[1])} no ${D.estados[g.min[0]].nome}, uma diferença de ${reais(g.amplitude)}.`;
}

function icms() {
  const p = estado.its, s = D.icms[p];
  const valores = [...s.observado, ...s.ajuste];
  const op = opcoes();
  op.scales.y.min = limiteRedondo(Math.min(...valores) * 0.97, true);
  op.scales.y.max = limiteRedondo(Math.max(...valores) * 1.03, false);
  const linhaLei = {
    id: 'linhaLei',
    beforeDatasetsDraw(c) {
      const { ctx, chartArea: area, scales: { x } } = c;
      const px = x.getPixelForValue(D.icms[estado.its].meses.indexOf(D.icms.intervencao));
      ctx.save();
      ctx.strokeStyle = cssVar('--texto-3');
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--texto-2');
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('jul/2022', px + 5, area.top + 12);
      ctx.restore();
    },
  };
  desenhar('its', 'chIts', {
    type: 'line',
    data: {
      labels: s.meses.map(mesCurto),
      datasets: [
        { label: 'Preço real', data: s.observado, showLine: false, pointRadius: 3, pointBackgroundColor: cor(p), borderColor: cor(p), backgroundColor: cor(p) },
        linha('Modelo', s.ajuste, cor(p), { borderWidth: 2, tension: 0 }),
        linha('Se nada tivesse mudado', s.contrafactual, cssVar('--texto-3'), { borderDash: [5, 4], borderWidth: 1.3, tension: 0 }),
      ],
    },
    options: op,
    plugins: [linhaLei],
  });

  const res = R.its_icms;
  $('tblIts').innerHTML = '<thead><tr><th>Combustível</th><th>Mudança</th><th>Intervalo de 95%</th><th>p-valor</th></tr></thead><tbody>'
    + ['gasolina', 'etanol', 'diesel'].map(k => {
      const r = res[k];
      return `<tr><td>${PRODUTOS[k].curto}</td><td class="${r.p_valor < 0.05 ? 'signif' : 'nao-signif'}">${num(r.mudanca_nivel_pct, 1)}%</td><td>${num(r.ic95[0], 1)} a ${num(r.ic95[1], 1)}</td><td>${r.p_valor < 0.001 ? '< 0,001' : num(r.p_valor, 2)}</td></tr>`;
    }).join('') + '</tbody>';

  const rob = R.its_icms_robustez, janelas = Object.keys(rob.gasolina);
  $('tblRob').innerHTML = '<thead><tr><th>Janela (meses)</th>' + janelas.map(j => `<th>${j}</th>`).join('') + '</tr></thead><tbody>'
    + ['gasolina', 'etanol', 'diesel'].map(k => `<tr><td>${PRODUTOS[k].curto}</td>${janelas.map(j => `<td>${num(rob[k][j], 0)}%</td>`).join('')}</tr>`).join('') + '</tbody>';

  $('txtIts').textContent = `Logo depois da lei, o preço real da gasolina caiu ${num(Math.abs(res.gasolina.mudanca_nivel_pct), 1)}% e o do etanol, ${num(Math.abs(res.etanol.mudanca_nivel_pct), 1)}%, e o resultado se mantém quando mudo o tamanho da janela. No diesel não houve queda significativa, o que faz sentido porque o ICMS dele já era bem menor. Um cuidado: na mesma época a Petrobras reduziu o preço nas refinarias e o petróleo caiu, então esses números mostram a queda total do período, e não só o efeito do imposto.`;
}

function ranking() {
  const p = estado.prodUf, fonte = estado.escalaUf === 'real' ? D.seriesReal : D.series, n = D.meses.length - 1;
  const lista = Object.keys(D.estados).map(uf => [uf, fonte[p][uf][n]]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
  const media = D.brasil[p][n];
  const op = opcoes({ legenda: false, eixoY: v => v, extra: { indexAxis: 'y', interaction: { mode: 'nearest', intersect: true } } });
  const maior = lista[0][1], menor = lista.at(-1)[1];
  const passo = passoRedondo((maior - menor * 0.9) / (estreito() ? 3 : 4));
  op.scales.x = {
    ...op.scales.x,
    min: Math.floor((menor * 0.95) / passo) * passo,
    max: Math.ceil((maior * 1.02) / passo) * passo,
    ticks: { ...op.scales.x.ticks, stepSize: passo, callback: v => reais(v, passo >= 1 ? 0 : 2) },
  };
  op.scales.y = { grid: { display: false }, border: { display: false }, ticks: { color: cssVar('--texto-2'), autoSkip: false, font: { size: 11 } } };
  op.plugins.tooltip.callbacks.label = c => `${D.estados[lista[c.dataIndex][0]].nome}: ${reais(c.parsed.x)}`;
  desenhar('rank', 'chRank', {
    type: 'bar',
    data: {
      labels: lista.map(x => x[0]),
      datasets: [{ data: lista.map(x => x[1]), backgroundColor: lista.map(x => (x[1] >= media ? cor(p) : transparente(cor(p), 0.45))), borderRadius: 2 }],
    },
    options: op,
  });
}

function comparar() {
  const p = estado.prodUf, fonte = estado.escalaUf === 'real' ? D.seriesReal : D.series;
  desenhar('comp', 'chComp', {
    type: 'line',
    data: { labels: D.meses.map(mesCurto), datasets: estado.ufs.map((uf, i) => linha(D.estados[uf].nome, fonte[p][uf], CORES_UF[i], { borderWidth: 1.7 })) },
    options: opcoes({ dica: v => reais(v) }),
  });
}

function seletorEstados() {
  const el = $('chips');
  const render = () => {
    el.innerHTML = Object.keys(D.estados).map(uf => {
      const i = estado.ufs.indexOf(uf);
      return `<button type="button" data-uf="${uf}" title="${D.estados[uf].nome}" aria-pressed="${i >= 0}" style="--c:${i >= 0 ? CORES_UF[i] : 'transparent'}">${uf}</button>`;
    }).join('');
  };
  render();
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const uf = b.dataset.uf, i = estado.ufs.indexOf(uf);
    if (i >= 0) {
      if (estado.ufs.length > 1) estado.ufs.splice(i, 1);
    } else {
      if (estado.ufs.length >= 5) estado.ufs.shift();
      estado.ufs.push(uf);
    }
    render();
    comparar();
  });
}

async function iniciar() {
  const resp = await fetch('data/precos.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  D = await resp.json();
  R = D.resumo;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;

  textos();
  indicadores();

  botoes('segEscala', [['real', 'Real'], ['nominal', 'Nominal']], () => estado.escala, v => { estado.escala = v; evolucao(); });
  botoes('segProdutoEvo', ['gasolina', 'etanol', 'diesel'].map(p => [p, PRODUTOS[p].curto]), () => estado.evo, v => {
    const i = estado.evo.indexOf(v);
    if (i >= 0 && estado.evo.length > 1) estado.evo.splice(i, 1);
    else if (i < 0) estado.evo.push(v);
    evolucao();
  }, true);
  evolucao();

  volatilidade();
  sazonalidade();

  const sel = $('selUf');
  sel.innerHTML = Object.entries(D.estados)
    .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
    .map(([uf, e]) => `<option value="${uf}"${uf === 'SP' ? ' selected' : ''}>${e.nome}</option>`).join('');
  sel.addEventListener('change', etanolPorEstado);
  etanolPorEstado();
  etanolGeral();

  dispersao();

  botoes('segIts', ['gasolina', 'etanol', 'diesel'].map(p => [p, PRODUTOS[p].curto]), () => estado.its, v => { estado.its = v; icms(); });
  icms();

  botoes('segEscalaUf', [['nominal', 'Nominal'], ['real', 'Real']], () => estado.escalaUf, v => { estado.escalaUf = v; ranking(); comparar(); });
  botoes('segProdutoUf', Object.entries(PRODUTOS).map(([p, i]) => [p, i.curto]), () => estado.prodUf, v => { estado.prodUf = v; ranking(); comparar(); });
  seletorEstados();
  ranking();
  comparar();
}

iniciar().catch(err => {
  console.error(err);
  document.querySelector('main').insertAdjacentHTML('afterbegin', '<p class="texto">Não foi possível carregar os dados. Se estiver rodando localmente, use um servidor (por exemplo, <code>python -m http.server</code>).</p>');
});
