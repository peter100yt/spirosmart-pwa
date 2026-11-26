// Linha do relatório anual consolidado (um paciente, um ano).
import {
  annualIndicators, ofType, computeRecord, valueOf, yearOf, ageYears, todayISO, has, fmtDate,
} from './calc.js';
import { PATOGENOS, MODULADORES } from './schema.js';

const GERMES_RELATORIO = PATOGENOS.filter((p) => p.k !== 'flora');

export const ANNUAL_COLUMNS = [
  { key: 'nome', label: 'Paciente', group: 'Paciente', text: true },
  { key: 'prontuario', label: 'Prontuário', group: 'Paciente', text: true },
  { key: 'sexo', label: 'Sexo', group: 'Paciente', text: true },
  { key: 'idade', label: 'Idade (anos)', group: 'Paciente', dec: 1 },
  { key: 'situacao', label: 'Situação', group: 'Paciente', text: true },
  { key: 'variante1', label: 'Variante 1', group: 'Genética', text: true },
  { key: 'variante2', label: 'Variante 2', group: 'Genética', text: true },
  { key: 'modulador', label: 'Modulador', group: 'Modulador', text: true },
  { key: 'moduladorInicio', label: 'Início', group: 'Modulador', date: true },
  { key: 'antroData', label: 'Data', group: 'Antropometria (última do ano)', date: true },
  { key: 'peso', label: 'Peso (kg)', group: 'Antropometria (última do ano)', dec: 1 },
  { key: 'estatura', label: 'Estatura (cm)', group: 'Antropometria (última do ano)', dec: 1 },
  { key: 'imc', label: 'IMC', group: 'Antropometria (última do ano)', dec: 1 },
  { key: 'zei', label: 'Z E/I', group: 'Antropometria (última do ano)', dec: 2 },
  { key: 'zimc', label: 'Z IMC', group: 'Antropometria (última do ano)', dec: 2 },
  { key: 'espiroN', label: 'Nº espirometrias', group: 'Função pulmonar', dec: 0 },
  { key: 'vef1Melhor', label: 'Melhor VEF1 (% prev.)', group: 'Função pulmonar', dec: 0 },
  { key: 'cvfMelhor', label: 'CVF (% prev.) na mesma prova', group: 'Função pulmonar', dec: 0 },
  { key: 'culturas', label: 'Nº culturas', group: 'Microbiologia (nº de culturas positivas no ano)', dec: 0 },
  ...GERMES_RELATORIO.map((g) => ({ key: `g_${g.k}`, label: g.abbr, title: g.label, group: 'Microbiologia (nº de culturas positivas no ano)', dec: 0 })),
  { key: 'exacerbacoes', label: 'Exacerbações', group: 'Exacerbações e tratamentos', dec: 0 },
  { key: 'oralN', label: 'ATB oral (episódios)', group: 'Exacerbações e tratamentos', dec: 0 },
  { key: 'oralDias', label: 'ATB oral (dias)', group: 'Exacerbações e tratamentos', dec: 0 },
  { key: 'ivN', label: 'ATB IV (episódios)', group: 'Exacerbações e tratamentos', dec: 0 },
  { key: 'ivDias', label: 'ATB IV (dias)', group: 'Exacerbações e tratamentos', dec: 0 },
  { key: 'erradicacoes', label: 'Erradicações', group: 'Exacerbações e tratamentos', dec: 0 },
  { key: 'internacoes', label: 'Internações', group: 'Internações', dec: 0 },
  { key: 'internacoesDias', label: 'Dias internado', group: 'Internações', dec: 0 },
  { key: 'internOutrasN', label: 'Por outras causas', group: 'Internações', dec: 0 },
  { key: 'internOutrasDias', label: 'Dias (outras causas)', group: 'Internações', dec: 0 },
  { key: 'alfadornase', label: 'Alfadornase', group: 'Medicamentos em uso (cadastro atual)', text: true },
  { key: 'salina', label: 'Salina hipertônica', group: 'Medicamentos em uso (cadastro atual)', text: true },
  { key: 'atbInalatorio', label: 'ATB inalatório', group: 'Medicamentos em uso (cadastro atual)', text: true },
  { key: 'azitromicina', label: 'Azitromicina', group: 'Medicamentos em uso (cadastro atual)', text: true },
  { key: 'creon', label: 'Creon', group: 'Medicamentos em uso (cadastro atual)', text: true },
  { key: 'suplemento', label: 'Suplemento', group: 'Medicamentos em uso (cadastro atual)', text: true },
];

export function annualRow(patient, records, year) {
  const ref = year === new Date().getFullYear() ? todayISO() : `${year}-12-31`;
  const ind = annualIndicators(records, year);
  const inYear = (r) => yearOf(r.date) === year;
  const antro = ofType(records, 'antropometria').find(inYear);
  const antroC = antro ? computeRecord(antro, patient) : null;
  const zv = (k) => (antro ? valueOf(antro, k, patient, antroC).v : null);
  const spiros = ofType(records, 'funcao').filter(inYear);
  let best = null;
  for (const s of spiros) {
    const c = computeRecord(s, patient);
    if (has(c.vef1_ppre) && (!best || c.vef1_ppre > best.vef1)) best = { vef1: c.vef1_ppre, cvf: c.cvf_ppre };
  }
  const mod = MODULADORES.find((m) => m.v === patient.modulador);
  const row = {
    id: patient.id,
    nome: patient.nome,
    prontuario: patient.prontuario || '',
    sexo: patient.sexo === 'M' ? 'M' : patient.sexo === 'F' ? 'F' : '',
    idade: patient.dataNascimento ? Math.max(0, Math.round(ageYears(patient.dataNascimento, ref) * 10) / 10) : null,
    situacao: patient.situacao || '',
    variante1: patient.variante1 || '',
    variante2: patient.variante2 || '',
    modulador: patient.modulador ? (mod?.v || patient.modulador) + (patient.moduladorDose ? ` ${patient.moduladorDose}` : '') : 'Não',
    moduladorInicio: patient.moduladorInicio || '',
    antroData: antro?.date || '',
    peso: antro?.peso ?? null,
    estatura: antro?.estatura ?? null,
    imc: antroC?.imc ?? null,
    zei: zv('zei'),
    zimc: zv('zimc'),
    espiroN: spiros.length,
    vef1Melhor: best?.vef1 ?? null,
    cvfMelhor: best?.cvf ?? null,
    culturas: ind.culturas,
    exacerbacoes: ind.exacerbacoes,
    oralN: ind.oralN, oralDias: ind.oralDias,
    ivN: ind.ivN, ivDias: ind.ivDias,
    erradicacoes: ind.erradicacoes,
    internacoes: ind.internacoes, internacoesDias: ind.internacoesDias,
    internOutrasN: ind.internOutrasN, internOutrasDias: ind.internOutrasDias,
    alfadornase: patient.alfadornase || '',
    salina: patient.salina ? (patient.salina === 'Não' ? 'Não' : `${patient.salina}%`) : '',
    atbInalatorio: patient.atbInalatorio || '',
    azitromicina: patient.azitromicina || '',
    creon: patient.creon || '',
    suplemento: patient.suplemento || '',
  };
  for (const g of GERMES_RELATORIO) row[`g_${g.k}`] = ind.germCount[g.k] || 0;
  return row;
}

export function cellText(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.date) return fmtDate(v);
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: col.dec ?? 2 });
  return String(v);
}
