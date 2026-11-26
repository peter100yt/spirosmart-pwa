// Painel inicial: indicadores do serviço, pontos de atenção por paciente, dicas e guia rápido.
import { html, useState, useMemo } from '../vendor/preact-htm.module.js';
import {
  todayISO, dayNum, fmtDate, fmtSince, fmtNum, monthsBetween, ageYears, ofType, computeRecord, valueOf, has,
  annualIndicators, plural, pathogensLabel,
} from './calc.js';
import { SECTION_BY_TYPE, PATOGENO_BY_KEY, MODULADORES } from './schema.js';
import * as db from './db.js';
import { Icon } from './ui.js';
import { LineChart } from './charts.js';
import { PatientList } from './pages.js';

// ------------------------------------------------------------ regras ----
// Referências usadas nos pontos de atenção. São rotinas de acompanhamento comumente adotadas
// (ajuste ao protocolo do serviço); quem decide a conduta é sempre a equipe.
export const LIMITES = {
  culturaMeses: 3,
  espiroMeses: 3,
  espiroIdadeMin: 6,
  antropoMeses: 3,
  labMeses: 12,
  hepMesesInicio: 3, // fígado: a cada 3 meses nos primeiros 18 meses de modulador…
  hepMesesDepois: 12, // …e anualmente depois
  hepJanelaMeses: 18,
  hepMesesSemInicio: 6,
  oftalmoMeses: 12, // menores de 18 anos em modulador
  zAtencao: -1,
  zAlerta: -2,
  quedaVef1: 10, // pontos percentuais entre duas espirometrias consecutivas
};
const GERMES_RELEVANTES = ['pa', 'pam', 'mrsa', 'bcc', 'mnt', 'achro', 'steno'];
const SEV = {
  alerta: { label: 'Alerta', rank: 0, cls: 'sev-alerta' },
  atencao: { label: 'Atenção', rank: 1, cls: 'sev-atencao' },
  info: { label: 'Informativo', rank: 2, cls: 'sev-info' },
};

const ativo = (p) => !p.situacao || p.situacao === 'Em acompanhamento';
const fmtMeses = (m) => (m >= 24 ? `${Math.floor(m / 12)} anos` : m >= 12 ? '1 ano' : `${Math.max(1, Math.round(m))} ${Math.round(m) <= 1 ? 'mês' : 'meses'}`);

/** @returns {Array<{patient, items:[{rule, sev, text}]}>} só pacientes em acompanhamento com algum ponto */
export function buildAlerts(patients, recordsOf, today = todayISO()) {
  const out = [];
  for (const p of patients.filter(ativo)) {
    const recs = recordsOf(p.id);
    const items = [];
    const add = (rule, sev, text) => items.push({ rule, sev, text });
    const age = p.dataNascimento ? ageYears(p.dataNascimento, today) : null;
    const since = (rec) => (rec ? monthsBetween(rec.date, today) : Infinity);

    if (!p.sexo) add('cadastro', 'atencao', 'Sexo não informado — escores-Z não são calculados');

    const cult = ofType(recs, 'cultura')[0];
    if (!cult) add('cultura', 'atencao', 'Sem cultura registrada');
    else if (since(cult) > LIMITES.culturaMeses) add('cultura', 'atencao', `Cultura em atraso — última há ${fmtMeses(since(cult))}`);

    if (age === null || age >= LIMITES.espiroIdadeMin) {
      const sp = ofType(recs, 'funcao')[0];
      if (!sp) add('espirometria', 'atencao', 'Sem espirometria registrada');
      else if (since(sp) > LIMITES.espiroMeses) add('espirometria', 'atencao', `Espirometria em atraso — última há ${fmtMeses(since(sp))}`);
    }

    const an = ofType(recs, 'antropometria')[0];
    if (!an) add('antropometria', 'atencao', 'Sem antropometria registrada');
    else if (since(an) > LIMITES.antropoMeses) add('antropometria', 'atencao', `Antropometria em atraso — última há ${fmtMeses(since(an))}`);

    const lab = ofType(recs, 'laboratorio')[0];
    if (!lab) add('laboratorio', 'atencao', 'Sem exames laboratoriais registrados');
    else if (since(lab) > LIMITES.labMeses) add('laboratorio', 'atencao', `Laboratório em atraso — último há ${fmtMeses(since(lab))}`);

    if (p.modulador) {
      const mesesUso = p.moduladorInicio ? monthsBetween(p.moduladorInicio, today) : null;
      const limite = mesesUso === null ? LIMITES.hepMesesSemInicio : mesesUso <= LIMITES.hepJanelaMeses ? LIMITES.hepMesesInicio : LIMITES.hepMesesDepois;
      const hep = ofType(recs, 'laboratorio').find((r) => has(r.tgo) || has(r.tgp));
      if (!hep) add('figado', 'alerta', 'Modulador sem TGO/TGP registrados');
      else if (since(hep) > limite) add('figado', 'alerta', `TGO/TGP em atraso (modulador) — último há ${fmtMeses(since(hep))}`);
      if (age !== null && age < 18) {
        const of = ofType(recs, 'modulador').find((r) => r.oftalmo === 'Sim');
        if (!of) add('oftalmo', 'atencao', 'Menor de 18 anos em modulador sem avaliação oftalmológica registrada');
        else if (since(of) > LIMITES.oftalmoMeses) add('oftalmo', 'atencao', `Avaliação oftalmológica há ${fmtMeses(since(of))}`);
      }
    }

    if (an) {
      const c = computeRecord(an, p);
      const z = (k) => valueOf(an, k, p, c).v;
      const zimc = z('zimc'), zei = z('zei');
      if (has(zimc) && zimc <= LIMITES.zAlerta) add('nutricao', 'alerta', `Z IMC ${fmtNum(zimc, 2)} (≤ ${LIMITES.zAlerta}) em ${fmtDate(an.date)}`);
      else if (has(zimc) && zimc <= LIMITES.zAtencao) add('nutricao', 'atencao', `Z IMC ${fmtNum(zimc, 2)} (≤ ${LIMITES.zAtencao}) em ${fmtDate(an.date)}`);
      if (has(zei) && zei <= LIMITES.zAlerta) add('estatura', 'alerta', `Z E/I ${fmtNum(zei, 2)} (≤ ${LIMITES.zAlerta}) em ${fmtDate(an.date)}`);
    }

    const sps = ofType(recs, 'funcao').map((r) => ({ r, v: computeRecord(r, p).vef1_ppre })).filter((x) => has(x.v));
    if (sps.length >= 2) {
      const drop = sps[1].v - sps[0].v;
      if (drop >= LIMITES.quedaVef1) add('vef1', 'alerta', `Queda de ${fmtNum(drop, 0)} pontos no VEF1: ${fmtNum(sps[1].v, 0)}% → ${fmtNum(sps[0].v, 0)}% (${fmtDate(sps[0].r.date)})`);
    }

    if (cult && since(cult) <= 12) {
      const g = (cult.germes || []).filter((k) => GERMES_RELEVANTES.includes(k));
      if (g.length) add('germe', 'info', `Última cultura (${fmtDate(cult.date)}): ${pathogensLabel(cult.germes, cult.outroGerme)}`);
    }

    if (items.length) {
      items.sort((a, b) => SEV[a.sev].rank - SEV[b.sev].rank);
      out.push({ patient: p, items });
    }
  }
  out.sort((a, b) => SEV[a.items[0].sev].rank - SEV[b.items[0].sev].rank || b.items.length - a.items.length || a.patient.nome.localeCompare(b.patient.nome, 'pt-BR'));
  return out;
}

// -------------------------------------------------------- indicadores ----
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const latestPpFev = (p, recs) => ofType(recs, 'funcao').map((r) => computeRecord(r, p).vef1_ppre).find(has) ?? null;

export function buildStats(patients, recordsOf, today = todayISO()) {
  const act = patients.filter(ativo);
  const year = Number(today.slice(0, 4));
  const per = act.map((p) => ({ p, recs: recordsOf(p.id) }));
  const fevNow = per.map(({ p, recs }) => latestPpFev(p, recs)).filter(has);
  const zimcNow = per.map(({ p, recs }) => {
    const an = ofType(recs, 'antropometria')[0];
    return an ? valueOf(an, 'zimc', p).v : null;
  }).filter(has);
  let exac = 0, intern = 0, internDias = 0, erra = 0;
  for (const { recs } of per) {
    const ind = annualIndicators(recs, year);
    exac += ind.exacerbacoes; intern += ind.internacoes; internDias += ind.internacoesDias; erra += ind.erradicacoes;
  }

  // média anual do melhor VEF1 de cada paciente (todos os cadastrados)
  const byYear = new Map();
  for (const p of patients) {
    const best = new Map();
    for (const r of recordsOf(p.id)) {
      if (r.type !== 'funcao' || !r.date) continue;
      const v = computeRecord(r, p).vef1_ppre;
      if (!has(v)) continue;
      const y = Number(r.date.slice(0, 4));
      if (!best.has(y) || v > best.get(y)) best.set(y, v);
    }
    for (const [y, v] of best) { if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(v); }
  }
  const fevTrend = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, arr]) => ({ y, n: arr.length, v: Math.round(mean(arr) * 10) / 10 }));

  // germes na última cultura (últimos 12 meses) de cada paciente em acompanhamento
  const germ = {};
  let comCultura = 0;
  for (const { recs } of per) {
    const c = ofType(recs, 'cultura')[0];
    if (!c || monthsBetween(c.date, today) > 12) continue;
    comCultura++;
    for (const k of c.germes || []) germ[k] = (germ[k] || 0) + 1;
  }
  const germRows = Object.entries(germ).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));

  // faixa etária
  const faixas = [['0–5 anos', 0, 6], ['6–11 anos', 6, 12], ['12–17 anos', 12, 18], ['18 anos ou mais', 18, 200]].map(([label, lo, hi]) => ({
    label, n: act.filter((p) => { const a = p.dataNascimento ? ageYears(p.dataNascimento, today) : null; return a !== null && a >= lo && a < hi; }).length,
  }));

  // genótipo
  const f508 = (v) => /^f508del$/i.test(String(v || '').trim());
  const gen = { homo: 0, hetero: 0, outros: 0, semInfo: 0 };
  for (const p of act) {
    if (!p.variante1 && !p.variante2) gen.semInfo++;
    else if (f508(p.variante1) && f508(p.variante2)) gen.homo++;
    else if (f508(p.variante1) || f508(p.variante2)) gen.hetero++;
    else gen.outros++;
  }

  // mudança após o início do modulador (descritivo)
  const delta = { fev: [], zimc: [] };
  for (const { p, recs } of per) {
    if (!p.modulador || !p.moduladorInicio) continue;
    const ini = p.moduladorInicio;
    const sp = ofType(recs, 'funcao').map((r) => ({ d: r.date, v: computeRecord(r, p).vef1_ppre })).filter((x) => has(x.v));
    const antes = sp.find((x) => x.d <= ini), depois = sp[0];
    if (antes && depois && monthsBetween(ini, depois.d) >= 3) delta.fev.push(depois.v - antes.v);
    const an = ofType(recs, 'antropometria').map((r) => ({ d: r.date, v: valueOf(r, 'zimc', p).v })).filter((x) => has(x.v));
    const a0 = an.find((x) => x.d <= ini), a1 = an[0];
    if (a0 && a1 && monthsBetween(ini, a1.d) >= 3) delta.zimc.push(a1.v - a0.v);
  }

  return {
    ativos: act.length, total: patients.length, mod: act.filter((p) => p.modulador).length,
    fevMedio: mean(fevNow), fevN: fevNow.length, zimcMedio: mean(zimcNow), zimcN: zimcNow.length,
    exac, intern, internDias, erra, year, fevTrend, germRows, comCultura, faixas, gen,
    deltaFev: mean(delta.fev), deltaFevN: delta.fev.length, deltaZ: mean(delta.zimc), deltaZN: delta.zimc.length,
  };
}

// -------------------------------------------------------------- dicas ----
const DICAS = [
  { t: 'Registre a consulta de uma vez', x: 'Em "Registrar consulta" (na página do paciente) você lança antropometria, espirometria, cultura, laboratório e visita do modulador com uma só data. Seções em branco são ignoradas.' },
  { t: 'Preencha o sexo no cadastro', x: 'Sem o sexo, o sistema não calcula os escores-Z (E/I, IMC, P/I). As planilhas importadas não trazem esse campo — o painel avisa os pacientes que ainda estão sem ele.' },
  { t: 'Atalhos para ganhar tempo', x: 'Na lista de pacientes, "/" abre a busca. Nos formulários, Enter vai para o próximo campo (como na planilha) e Ctrl+Enter salva.' },
  { t: 'Valores digitados prevalecem', x: 'Se você digitar um escore-Z, o sistema mantém o seu valor. Quando o campo fica em branco, ele é calculado pela referência da OMS e aparece em itálico na tabela.' },
  { t: 'Faça backup toda semana', x: 'Os dados ficam só neste navegador. Em "Dados e backup", baixe um backup protegido por senha e guarde em local seguro. A barra superior avisa quando há alterações sem backup.' },
  { t: 'Visitas do modulador já vêm preenchidas', x: 'Peso, Z, VEF1, cultura e exames da visita são trazidos do registro mais próximo da data (até 6 meses). Basta registrar peso e espirometria no mesmo dia para que apareçam.' },
  { t: 'Relatório anual e pesquisa', x: 'O "Relatório anual" resume cada paciente no ano e exporta para Excel. Para pesquisa, exporte a base pseudonimizada em "Dados e backup": sai sem nome, prontuário e data de nascimento.' },
  { t: 'Reimportar atualiza o paciente', x: 'Ao importar de novo uma planilha de um paciente que já está cadastrado (mesmo nome e nascimento), o sistema oferece atualizar em vez de duplicar.' },
  { t: 'Instale como aplicativo', x: 'No Chrome ou Edge, use "Instalar" na barra de endereços; no celular, "Adicionar à tela inicial". Depois de aberto uma vez, funciona sem internet.' },
  { t: 'Imprima o resumo do paciente', x: 'O botão "Imprimir" na página do paciente gera um resumo de uma página (A4) com diagnóstico, medicamentos, exames e gráficos — útil para levar à consulta ou ao prontuário.' },
];

const GUIA = [
  { t: 'VEF1 (% do previsto)', rows: [['≥ 90', 'Normal'], ['70 – 89', 'Redução leve'], ['40 – 69', 'Redução moderada'], ['< 40', 'Redução grave']], note: 'Classificação usual por faixas do % do previsto.' },
  { t: 'Escore-Z (OMS)', rows: [['−1 a +1', 'Faixa esperada'], ['< −1', 'Atenção'], ['≤ −2', 'Déficit (baixo peso / baixa estatura)']], note: 'IMC/idade, estatura/idade e peso/idade.' },
  { t: 'Peak flow (% do previsto)', rows: [['≥ 80%', 'Controle adequado'], ['50 – 79%', 'Atenção'], ['< 50%', 'Alerta']], note: 'Mesmas faixas da planilha original.' },
];

// ------------------------------------------------------------- tela ----
function Kpi({ label, value, sub, tone }) {
  return html`<div class=${'kpi' + (tone ? ' kpi-' + tone : '')}><span class="kpi-l">${label}</span><span class="kpi-v">${value}</span>${sub && html`<span class="kpi-s">${sub}</span>`}</div>`;
}

function Bars({ rows, total, fmt }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return html`<ul class="bars">${rows.map((r) => html`<li>
    <span class="bar-l">${r.label}</span>
    <span class="bar-track"><span class="bar-fill" style=${{ width: `${(r.n / max) * 100}%` }}></span></span>
    <span class="bar-n">${fmt ? fmt(r) : r.n}${total ? html` <small class="muted">${Math.round((r.n / total) * 100)}%</small>` : ''}</span>
  </li>`)}</ul>`;
}

function Alerts({ alerts }) {
  const [filter, setFilter] = useState('todos');
  const [all, setAll] = useState(false);
  const count = (s) => alerts.reduce((n, a) => n + a.items.filter((i) => i.sev === s).length, 0);
  const rows = alerts
    .map((a) => ({ ...a, items: filter === 'todos' ? a.items : a.items.filter((i) => i.sev === filter) }))
    .filter((a) => a.items.length);
  const shown = all ? rows : rows.slice(0, 8);
  const chip = (k, label, n) => html`<button class=${'chip-btn' + (filter === k ? ' on' : '')} aria-pressed=${filter === k} onClick=${() => setFilter(k)}>${label} <span class="n">${n}</span></button>`;
  if (!alerts.length) {
    return html`<section class="card wide-card"><div class="card-head"><h3><${Icon} name="check" size=${17} /> Pontos de atenção</h3></div>
      <p class="muted">Nenhum ponto de atenção no momento: exames em dia e sem alterações nos limites configurados.</p></section>`;
  }
  return html`<section class="card wide-card">
    <div class="card-head"><h3><${Icon} name="alert" size=${17} /> Pontos de atenção <span class="count">${alerts.length} paciente${alerts.length === 1 ? '' : 's'}</span></h3></div>
    <div class="chips filter-row">${chip('todos', 'Todos', count('alerta') + count('atencao') + count('info'))}${chip('alerta', 'Alertas', count('alerta'))}${chip('atencao', 'Atenção', count('atencao'))}${chip('info', 'Informativos', count('info'))}</div>
    ${rows.length ? html`<ul class="alert-list">${shown.map((a) => html`<li key=${a.patient.id}>
      <a class="alert-pt" href=${`#/p/${a.patient.id}`}>${a.patient.nome}${a.patient.modulador ? html` <span class="badge badge-mod">${MODULADORES.find((m) => m.v === a.patient.modulador)?.v || a.patient.modulador}</span>` : ''}</a>
      <ul class="alert-items">${a.items.map((i) => html`<li><span class=${'sev ' + SEV[i.sev].cls}>${SEV[i.sev].label}</span><span>${i.text}</span></li>`)}</ul>
    </li>`)}</ul>
    ${rows.length > 8 && html`<button class="btn btn-sm" onClick=${() => setAll(!all)}>${all ? 'Mostrar menos' : `Mostrar todos (${rows.length})`}</button>`}`
    : html`<p class="muted">Nenhum ponto neste filtro.</p>`}
    <p class="hint">Limites usados: cultura e espirometria a cada ${LIMITES.culturaMeses} meses; antropometria a cada ${LIMITES.antropoMeses} meses; laboratório a cada ${LIMITES.labMeses} meses; TGO/TGP em modulador a cada ${LIMITES.hepMesesInicio} meses nos primeiros ${LIMITES.hepJanelaMeses} meses de uso e a cada ${LIMITES.hepMesesDepois} depois; avaliação oftalmológica anual em menores de 18 anos em modulador; Z ≤ ${LIMITES.zAtencao} atenção e ≤ ${LIMITES.zAlerta} alerta; queda de ${LIMITES.quedaVef1} pontos no VEF1. São referências gerais — ajuste ao protocolo do serviço.</p>
  </section>`;
}

function Tips() {
  const day = Math.floor(dayNum(todayISO()));
  const [i, setI] = useState(day % DICAS.length);
  const [list, setList] = useState(false);
  const d = DICAS[i];
  return html`<section class="card tip-card">
    <div class="card-head"><h3><${Icon} name="clipboard" size=${17} /> Dica do dia</h3>
      <span class="tip-nav"><button class="icon-btn" aria-label="Dica anterior" onClick=${() => setI((i + DICAS.length - 1) % DICAS.length)}><${Icon} name="back" size=${16} /></button>
      <span class="muted small">${i + 1}/${DICAS.length}</span>
      <button class="icon-btn" aria-label="Próxima dica" onClick=${() => setI((i + 1) % DICAS.length)}><${Icon} name="chevron" size=${16} /></button></span></div>
    <h4 class="tip-t">${d.t}</h4><p>${d.x}</p>
    <button class="btn btn-sm" onClick=${() => setList(!list)}>${list ? 'Ocultar lista' : 'Ver todas as dicas'}</button>
    ${list && html`<ol class="tip-list">${DICAS.map((x, k) => html`<li key=${k}><button class="link-btn" onClick=${() => { setI(k); }}>${x.t}</button></li>`)}</ol>`}
  </section>`;
}

function Recent({ patients }) {
  const byId = new Map(patients.map((p) => [p.id, p]));
  const recs = [...db.store.records.values()].filter((r) => byId.has(r.patientId)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
  if (!recs.length) return null;
  return html`<section class="card"><div class="card-head"><h3>Atividade recente</h3></div>
    <ul class="list-plain">${recs.map((r) => {
      const p = byId.get(r.patientId);
      return html`<li key=${r.id}><a class="alert-pt" href=${`#/p/${p.id}`}>${p.nome}</a>
        <span class="muted small">${SECTION_BY_TYPE[r.type]?.singular || r.type} · ${fmtDate(r.date)}</span>
        <span class="right muted small">${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('pt-BR') : ''}</span></li>`;
    })}</ul></section>`;
}

export function DashboardPage() {
  const patients = [...db.store.patients.values()];
  const data = useMemo(() => ({
    alerts: buildAlerts(patients, db.patientRecords),
    st: buildStats(patients, db.patientRecords),
  }), [db.store.rev]);
  if (!patients.length) return html`<${PatientList} />`;
  const { alerts, st } = data;
  const hojeRaw = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hoje = hojeRaw.charAt(0).toUpperCase() + hojeRaw.slice(1);
  const nAlertas = alerts.reduce((n, a) => n + a.items.filter((i) => i.sev !== 'info').length, 0);
  const trend = st.fevTrend.map((t) => ({ x: dayNum(`${t.y}-07-01`), y: t.v }));
  const gen = st.gen;
  const sinal = (v, d = 1) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), d)}`);

  return html`<div class="page dash">
    <div class="page-head">
      <div><h1>Painel</h1><p class="muted dash-date">${hoje}</p></div>
      <div class="page-actions">
        <a class="btn" href="#/relatorio"><${Icon} name="report" size=${16} /> Relatório anual</a>
        <a class="btn btn-primary" href="#/pacientes"><${Icon} name="users" size=${16} /> Ver pacientes</a>
      </div>
    </div>

    <div class="kpis">
      <${Kpi} label="Em acompanhamento" value=${st.ativos} sub=${st.total > st.ativos ? `${st.total} cadastrados` : null} />
      <${Kpi} label="Em uso de modulador" value=${st.mod} sub=${st.ativos ? `${Math.round((st.mod / st.ativos) * 100)}% dos pacientes` : null} />
      <${Kpi} label=${`Exacerbações em ${st.year}`} value=${st.exac} sub=${st.erra ? plural(st.erra, 'erradicação', 'erradicações') : 'sem erradicações'} />
      <${Kpi} label=${`Internações em ${st.year}`} value=${st.intern} sub=${st.intern ? plural(st.internDias, 'dia', 'dias') + ' internado' + (st.internDias === 1 ? '' : 's') : null} />
      <${Kpi} label="VEF1 médio (% prev.)" value=${st.fevMedio === null ? '—' : fmtNum(st.fevMedio, 0)} sub=${st.fevN ? `última espirometria · ${st.fevN} pac.` : 'sem espirometrias'} />
      <${Kpi} label="Z IMC médio" value=${st.zimcMedio === null ? '—' : fmtNum(st.zimcMedio, 2)} sub=${st.zimcN ? `última medida · ${st.zimcN} pac.` : 'sem medidas'} />
      <${Kpi} label="Pontos de atenção" value=${nAlertas} tone=${nAlertas ? 'warn' : 'ok'} sub=${alerts.length ? plural(alerts.length, 'paciente', 'pacientes') : 'tudo em dia'} />
    </div>

    <${Alerts} alerts=${alerts} />

    <div class="grid-2 dash-grid">
      ${trend.length > 1 ? html`<div>
        <${LineChart} title="VEF1 médio por ano (% do previsto)" subtitle="melhor VEF1 de cada paciente no ano" series=${[{ label: 'VEF1 médio', points: trend }]} yFmt=${(v) => v.toFixed(0)} height=${210} />
        <p class="hint">Pacientes por ano: ${st.fevTrend.map((t) => `${t.y} (${t.n})`).join(' · ')}.</p>
      </div>` : html`<section class="card"><div class="card-head"><h3>VEF1 médio por ano</h3></div><p class="muted small">Aparece quando houver espirometrias em pelo menos dois anos.</p></section>`}

      <section class="card">
        <div class="card-head"><h3>Após o início do modulador</h3></div>
        ${st.deltaFevN || st.deltaZN ? html`<div class="delta-row">
          <div><span class="delta-v">${sinal(st.deltaFev, 1)}</span><span class="delta-l">pontos de VEF1 (% prev.)<br/><small class="muted">${st.deltaFevN} paciente${st.deltaFevN === 1 ? '' : 's'}</small></span></div>
          <div><span class="delta-v">${sinal(st.deltaZ, 2)}</span><span class="delta-l">Z IMC<br/><small class="muted">${st.deltaZN} paciente${st.deltaZN === 1 ? '' : 's'}</small></span></div>
        </div>
        <p class="hint">Média da diferença entre a última medida e a medida anterior ao início do modulador, nos pacientes com pelo menos 3 meses de uso. É um resumo descritivo, não uma análise estatística.</p>`
        : html`<p class="muted small">Aparece quando houver pacientes com data de início do modulador e medidas antes e depois (mínimo de 3 meses de uso).</p>`}
      </section>
    </div>

    <div class="grid-3 dash-grid">
      <section class="card"><div class="card-head"><h3>Último isolamento na cultura</h3><span class="muted small">${st.comCultura} paciente${st.comCultura === 1 ? '' : 's'} · últimos 12 meses</span></div>
        ${st.germRows.length ? html`<${Bars} rows=${st.germRows.map((g) => ({ label: PATOGENO_BY_KEY[g.k]?.label || g.k, n: g.n }))} total=${st.comCultura} />` : html`<p class="muted small">Sem culturas nos últimos 12 meses.</p>`}</section>
      <section class="card"><div class="card-head"><h3>Faixa etária</h3></div><${Bars} rows=${st.faixas} /></section>
      <section class="card"><div class="card-head"><h3>Genótipo</h3></div>
        <${Bars} rows=${[{ label: 'F508del / F508del', n: gen.homo }, { label: 'F508del / outra', n: gen.hetero }, { label: 'Outras variantes', n: gen.outros }, { label: 'Sem informação', n: gen.semInfo }].filter((r) => r.n)} />
        <p class="hint">Útil para planejar a elegibilidade a moduladores.</p></section>
    </div>

    <div class="grid-3 dash-grid">
      <${Tips} />
      <section class="card guide"><div class="card-head"><h3>Guia rápido</h3></div>
        ${GUIA.map((g) => html`<div class="guide-block" key=${g.t}><h4>${g.t}</h4>
          <table class="mini"><tbody>${g.rows.map(([a, b]) => html`<tr><th>${a}</th><td>${b}</td></tr>`)}</tbody></table>
          <p class="hint">${g.note}</p></div>`)}
      </section>
      <${Recent} patients=${patients} />
    </div>
  </div>`;
}
