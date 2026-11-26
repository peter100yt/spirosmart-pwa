// Cálculos derivados: idade, IMC, % do previsto, indicadores anuais etc.
import { zscores } from './growth.js';
import { SPIRO_PARAMS, PATOGENO_BY_KEY, SECTION_BY_TYPE } from './schema.js';

// ---------------------------------------------------------------- datas ----
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
export function dayNum(iso) {
  if (!isISODate(iso)) return NaN;
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
}
export function fmtDate(iso) {
  if (!isISODate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function yearOf(iso) {
  return isISODate(iso) ? Number(iso.slice(0, 4)) : NaN;
}

/** diferença em anos/meses completos entre duas datas ISO */
export function ageParts(birth, at) {
  if (!isISODate(birth) || !isISODate(at)) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ay, am, ad] = at.split('-').map(Number);
  let months = (ay - by) * 12 + (am - bm);
  if (ad < bd) months -= 1;
  if (months < 0) return null;
  return { y: Math.floor(months / 12), m: months % 12, days: dayNum(at) - dayNum(birth) };
}
export function ageYears(birth, at) {
  const p = ageParts(birth, at);
  return p ? p.days / 365.25 : null;
}
/** formato da planilha: "16a 1m" / "8m" */
export function fmtAge(birth, at) {
  const p = ageParts(birth, at || todayISO());
  if (!p) return '';
  if (p.y === 0) return `${p.m}m`;
  return p.m ? `${p.y}a ${p.m}m` : `${p.y}a`;
}
export function fmtAgeLong(birth, at) {
  const p = ageParts(birth, at || todayISO());
  if (!p) return '';
  const a = p.y === 1 ? '1 ano' : `${p.y} anos`;
  const m = p.m === 1 ? '1 mês' : `${p.m} meses`;
  return p.y ? (p.m ? `${a} e ${m}` : a) : m;
}
export function monthsBetween(a, b) {
  return (dayNum(b) - dayNum(a)) / 30.4375;
}
export function fmtSince(iso) {
  if (!isISODate(iso)) return '';
  const days = Math.round(dayNum(todayISO()) - dayNum(iso));
  if (days < 0) return 'data futura';
  if (days === 0) return 'hoje';
  if (days < 31) return `há ${days} dia${days > 1 ? 's' : ''}`;
  const m = Math.floor(days / 30.4375);
  if (m < 12) return `há ${m} ${m > 1 ? 'meses' : 'mês'}`;
  const y = Math.floor(m / 12), mm = m % 12;
  return `há ${y} ano${y > 1 ? 's' : ''}${mm ? ` e ${mm} ${mm > 1 ? 'meses' : 'mês'}` : ''}`;
}

// -------------------------------------------------------------- números ----
/** aceita "6,5", "6.5", "1.234,5"; devolve number ou null */
export function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** valor laboratorial: número quando possível, senão texto (ex.: "<15") */
export function parseVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseNum(s);
  return n === null ? s : n;
}
export function fmtNum(v, dec) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v !== 'number') return String(v);
  if (dec === undefined) {
    const abs = Math.abs(v);
    dec = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  }
  const s = v.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  return s;
}
const r1 = (x) => Math.round(x * 10) / 10;
const r0 = (x) => Math.round(x);
const has = (v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
export { has };

// --------------------------------------------------- campos calculados ----
export function computeRecord(rec, patient) {
  const out = {};
  const birth = patient?.dataNascimento;
  if (rec.date && birth) {
    out.idade = fmtAge(birth, rec.date);
    out.idadeAnos = ageYears(birth, rec.date);
  }
  switch (rec.type) {
    case 'antropometria': {
      if (rec.peso > 0 && rec.estatura > 0) out.imc = r1(rec.peso / Math.pow(rec.estatura / 100, 2));
      const z = zscores({ sexo: patient?.sexo, idadeAnos: out.idadeAnos, peso: rec.peso, estatura: rec.estatura });
      out.zCalc = z;
      break;
    }
    case 'funcao':
      for (const p of SPIRO_PARAMS) {
        const prev = rec[`${p.k}_prev`], pre = rec[`${p.k}_pre`], pos = rec[`${p.k}_pos`];
        if (prev > 0 && has(pre)) out[`${p.k}_ppre`] = r0((pre / prev) * 100);
        if (prev > 0 && has(pos)) out[`${p.k}_ppos`] = r0((pos / prev) * 100);
        if (pre > 0 && has(pos)) out[`${p.k}_bd`] = r1(((pos - pre) / pre) * 100);
      }
      break;
    case 'internamento':
      if (rec.date) {
        const end = rec.alta && isISODate(rec.alta) ? rec.alta : todayISO();
        const d = dayNum(end) - dayNum(rec.date) + 1;
        if (d > 0) out.diasInternacao = d;
      }
      break;
    case 'peakflow':
      if (rec.pfe > 0 && rec.pfePrev > 0) out.pfePct = r0((rec.pfe / rec.pfePrev) * 100);
      break;
    case 'tsl1min':
      if (rec.repeticoes > 0 && rec.repPrev > 0) out.tslPct = r0((rec.repeticoes / rec.repPrev) * 100);
      break;
    case 'caminhada': {
      let pred = rec.distPrev;
      if (!(pred > 0) && out.idadeAnos && (patient?.sexo === 'M' || patient?.sexo === 'F')) {
        const idade = Math.floor(out.idadeAnos);
        pred = r0(622.461 - 1.846 * idade + 61.503 * (patient.sexo === 'M' ? 1 : 0));
        out.distPreditaCalc = true;
      }
      if (pred > 0) out.distPredita = pred;
      if (pred > 0 && rec.distancia > 0) out.distPct = r0((rec.distancia / pred) * 100);
      break;
    }
    default:
  }
  return out;
}

/** valor de um campo (armazenado ou calculado) para exibição */
export function valueOf(rec, key, patient, cache) {
  const c = cache || computeRecord(rec, patient);
  if (key in c) return { v: c[key] };
  const v = rec[key];
  if (!has(v) && rec.type === 'antropometria' && c.zCalc && key in c.zCalc && c.zCalc[key] !== null) {
    return { v: c.zCalc[key], calc: true };
  }
  return { v };
}

export function pathogensLabel(keys, outro) {
  if (!keys || !keys.length) return '';
  return keys
    .map((k) => (k === 'outro' && outro ? outro : PATOGENO_BY_KEY[k]?.abbr || k))
    .join(' + ');
}

// ---------------------------------------------- consultas aos registros ----
export function byDateDesc(a, b) {
  return (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0);
}
export function ofType(records, type) {
  return records.filter((r) => r.type === type).sort(byDateDesc);
}
export function latestWith(records, type, key) {
  return ofType(records, type).find((r) => has(r[key])) || null;
}
/** registro mais próximo da data com o campo preenchido (até maxDays de distância) */
export function nearest(records, type, date, key, patient, maxDays = 180) {
  let best = null, bestD = Infinity;
  const t = dayNum(date);
  for (const r of records) {
    if (r.type !== type || !r.date) continue;
    const { v } = valueOf(r, key, patient);
    if (!has(v)) continue;
    const d = Math.abs(dayNum(r.date) - t);
    if (d < bestD) { best = { rec: r, v, days: d }; bestD = d; }
  }
  return best && best.days <= maxDays ? best : null;
}

export function lastActivity(records) {
  let max = '';
  for (const r of records) if (r.date && r.date > max) max = r.date;
  return max;
}

// ----------------------------------------------------- resumo / anual ----
export function annualIndicators(records, year) {
  const inYear = (r) => yearOf(r.date) === year;
  const ex = records.filter((r) => r.type === 'exacerbacao' && inYear(r));
  const oral = ex.filter((r) => r.tratamento === 'Oral');
  const iv = ex.filter((r) => r.tratamento === 'Intravenoso');
  const sumDias = (arr) => arr.reduce((s, r) => s + (Number(r.dias) || 0), 0);
  const err = records.filter((r) => r.type === 'erradicacao' && inYear(r));
  const intern = records.filter((r) => r.type === 'internamento' && inYear(r));
  const dias = (r) => computeRecord(r).diasInternacao || 0;
  const internOutras = intern.filter((r) => r.motivo !== 'Exacerbação pulmonar');
  const internPulm = intern.filter((r) => r.motivo === 'Exacerbação pulmonar');
  const cult = records.filter((r) => r.type === 'cultura' && inYear(r));
  const germCount = {};
  for (const c of cult) for (const g of c.germes || []) germCount[g] = (germCount[g] || 0) + 1;
  return {
    year,
    exacerbacoes: ex.length,
    oralN: oral.length, oralDias: sumDias(oral),
    ivN: iv.length, ivDias: sumDias(iv),
    erradicacoes: err.length,
    internacoes: intern.length,
    internacoesDias: intern.reduce((s, r) => s + dias(r), 0),
    internPulmN: internPulm.length, internPulmDias: internPulm.reduce((s, r) => s + dias(r), 0),
    internOutrasN: internOutras.length, internOutrasDias: internOutras.reduce((s, r) => s + dias(r), 0),
    culturas: cult.length,
    germCount,
  };
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Controle de exames": datas dos últimos exames-chave */
export function examControl(records, patient) {
  const items = [];
  const last = (type, pred) => ofType(records, type).find(pred || (() => true));
  const push = (label, rec, extra, warnMonths) => {
    const date = rec?.date || null;
    items.push({
      label, date, extra,
      warn: !!(warnMonths && (!date || monthsBetween(date, todayISO()) > warnMonths)),
    });
  };
  push('Cultura', last('cultura'), null, 6);
  push('Espirometria', last('funcao'), null, 6);
  push('Antropometria', last('antropometria'), null, 6);
  push('Laboratório', last('laboratorio'), null, 12);
  const img = last('imagem');
  push('Imagem / exames', img, img?.exame, null);
  const tc = last('imagem', (r) => /TOMOGRAFIA DE T[OÓ]RAX/i.test(r.exame || ''));
  push('TC de tórax', tc, null, null);
  push('Elastase fecal', last('laboratorio', (r) => has(r.elastase)), null, null);
  const suorLab = last('laboratorio', (r) => has(r.suor));
  let suor = suorLab;
  if (patient?.suorData && (!suor || patient.suorData > suor.date)) suor = { date: patient.suorData };
  push('Teste do suor', suor, null, null);
  if (patient?.modulador) push('Avaliação oftalmológica', last('modulador', (r) => r.oftalmo === 'Sim'), null, 12);
  return items;
}

export function firstAndLastAnthro(records) {
  const list = ofType(records, 'antropometria');
  return { first: list[list.length - 1] || null, last: list[0] || null };
}

export function sectionCount(records) {
  const out = {};
  for (const r of records) out[r.type] = (out[r.type] || 0) + 1;
  return out;
}

export function isValidSectionType(t) {
  return !!SECTION_BY_TYPE[t];
}
