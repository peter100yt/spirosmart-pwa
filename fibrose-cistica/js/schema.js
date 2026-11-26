// Definição de todos os campos do sistema (pacientes e registros).
// Tudo (formulários, tabelas, importação e exportação) é gerado a partir daqui.

export const SIM_NAO = ['Sim', 'Não'];
export const EVOLUCAO = ['Melhorado', 'Inalterado', 'Piorado'];

export const PATOGENOS = [
  { k: 'flora', label: 'Flora normal', abbr: 'Flora normal' },
  { k: 'sa', label: 'S. aureus', abbr: 'SA' },
  { k: 'mrsa', label: 'S. aureus MRSA', abbr: 'MRSA' },
  { k: 'sar', label: 'Staphylococcus resistente', abbr: 'Staph. R' },
  { k: 'pa', label: 'P. aeruginosa', abbr: 'PA' },
  { k: 'pam', label: 'P. aeruginosa mucoide', abbr: 'PAM' },
  { k: 'bcc', label: 'Complexo B. cepacia', abbr: 'Bcc' },
  { k: 'steno', label: 'S. maltophilia', abbr: 'Steno' },
  { k: 'achro', label: 'Achromobacter', abbr: 'Achro' },
  { k: 'hi', label: 'H. influenzae', abbr: 'Hi' },
  { k: 'mnt', label: 'Micobactéria não tuberculosa', abbr: 'MNT' },
  { k: 'fungo', label: 'Aspergillus / fungos', abbr: 'Fungo' },
  { k: 'outro', label: 'Outro', abbr: 'Outro' },
];
export const PATOGENO_BY_KEY = Object.fromEntries(PATOGENOS.map((p) => [p.k, p]));

export const MODULADORES = [
  { v: '', label: 'Sem modulador' },
  { v: 'ETI', label: 'Elexacaftor/tezacaftor/ivacaftor (ETI)' },
  { v: 'IVA', label: 'Ivacaftor (IVA)' },
  { v: 'LUM/IVA', label: 'Lumacaftor/ivacaftor' },
  { v: 'TEZ/IVA', label: 'Tezacaftor/ivacaftor' },
  { v: 'VNZ/TEZ/D-IVA', label: 'Vanzacaftor/tezacaftor/deutivacaftor' },
  { v: 'Outro', label: 'Outro' },
];

export const VARIANTES_CFTR = [
  'F508del', 'G542X', 'N1303K', 'R1162X', 'G85E', 'R334W', 'R553X', 'W1282X', 'S549R',
  'G551D', 'R117H', 'A455E', 'D1152H', 'I618T', 'V232D', 'Y1092X', 'S4X',
  '3120+1G>A', '2184insA', '1717-1G>A', '621+1G>T', '711+1G>T', '1812-1G>A',
  '3849+10kbC>T', '2789+5G>A', 'Não identificada',
];

export const COMORBIDADES_SUGESTOES = [
  'Diabetes relacionado à FC (DRFC)', 'Aspergilose broncopulmonar alérgica (ABPA)', 'Hepatopatia associada à FC',
  'Osteopenia / osteoporose', 'Polipose nasal', 'Sinusopatia crônica', 'Doença do refluxo gastroesofágico',
  'Síndrome de obstrução intestinal distal (SOID)', 'Íleo meconial', 'Hemoptise', 'Pneumotórax', 'Asma',
  'Desnutrição', 'Pancreatite', 'Insuficiência pancreática',
];

export const EXAMES_IMAGEM = [
  'TOMOGRAFIA DE TÓRAX', 'RX DE TÓRAX', 'US DE ABDOME', 'TOMOGRAFIA DE FACE', 'TOMOGRAFIA DE ABDOME',
  'NASOFIBROSCOPIA', 'ECOCARDIOGRAMA', 'TESTE DE CAMINHADA', 'DENSITOMETRIA ÓSSEA', 'ELASTOGRAFIA HEPÁTICA',
  'AVALIAÇÃO OFTALMOLÓGICA', 'POLISSONOGRAFIA',
];

export const VISITAS = ['VE', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'Extra'];

const CREON = ['Não', '<5.000', '5-10.000', '>10.000'];
const SUPLEMENTO = ['Não', 'Oral', 'Gastro', 'Sonda'];

// ---------------------------------------------------------------------------
// Paciente
// ---------------------------------------------------------------------------
export const PATIENT_GROUPS = [
  {
    title: 'Identificação',
    fields: [
      { key: 'nome', label: 'Nome completo', type: 'text', required: true, wide: true },
      { key: 'prontuario', label: 'Prontuário / registro', type: 'text' },
      { key: 'sexo', label: 'Sexo', type: 'seg', options: [{ v: 'M', label: 'Masculino' }, { v: 'F', label: 'Feminino' }] },
      { key: 'dataNascimento', label: 'Data de nascimento', type: 'date', required: true },
      { key: 'naturalidade', label: 'Naturalidade', type: 'text' },
      { key: 'centro', label: 'Centro de seguimento', type: 'combo', suggestions: ['SRFC HEOM'] },
      { key: 'situacao', label: 'Situação', type: 'select', options: ['Em acompanhamento', 'Transferido', 'Perda de seguimento', 'Transplantado', 'Óbito'] },
    ],
  },
  {
    title: 'Diagnóstico',
    fields: [
      { key: 'diagForma', label: 'Forma de diagnóstico', type: 'seg', options: ['Triagem neonatal', 'Diagnóstico tardio'] },
      { key: 'diagData', label: 'Data do diagnóstico', type: 'date' },
      { key: 'suorData', label: 'Teste do suor — data', type: 'date' },
      { key: 'suorValor', label: 'Teste do suor — cloreto', unit: 'mmol/L', type: 'num' },
      { key: 'irt1', label: '1ª IRT', unit: 'ng/mL', type: 'num' },
      { key: 'irt1Data', label: '1ª IRT — data', type: 'date' },
      { key: 'irt2', label: '2ª IRT', unit: 'ng/mL', type: 'num' },
      { key: 'irt2Data', label: '2ª IRT — data', type: 'date' },
      { key: 'variante1', label: 'Variante CFTR 1', type: 'combo', suggestions: VARIANTES_CFTR },
      { key: 'variante2', label: 'Variante CFTR 2', type: 'combo', suggestions: VARIANTES_CFTR },
    ],
  },
  {
    title: 'Modulador de CFTR',
    fields: [
      { key: 'modulador', label: 'Modulador', type: 'select', options: MODULADORES.map((m) => ({ v: m.v, label: m.label })), wide: true },
      { key: 'moduladorDose', label: 'Dose', type: 'combo', suggestions: ['50mg', '100mg'] },
      { key: 'moduladorInicio', label: 'Data de início', type: 'date' },
    ],
  },
  {
    title: 'Medicamentos em uso',
    fields: [
      { key: 'creon', label: 'Creon (UI/kg/dia)', type: 'select', options: CREON },
      { key: 'atbInalatorio', label: 'Antibioticoterapia inalatória', type: 'select', options: ['Não', 'Tobramicina intervalada', 'Colimicina intervalada', 'Tobramicina contínua', 'Colimicina contínua', 'Combinada contínua', 'Combinada intervalada'] },
      { key: 'alfadornase', label: 'Alfadornase', type: 'seg', options: SIM_NAO },
      { key: 'salina', label: 'Salina hipertônica (%)', type: 'select', options: ['Não', '3', '5', '7'] },
      { key: 'broncodilatador', label: 'Broncodilatador', type: 'select', options: ['Não', 'Beta-2 agonista curta', 'Beta-2 agonista longa', 'Anticolinérgico'] },
      { key: 'corticoideInal', label: 'Corticoesteroide inalatório', type: 'seg', options: SIM_NAO },
      { key: 'ibp', label: 'IBP', type: 'seg', options: SIM_NAO },
      { key: 'azitromicina', label: 'Azitromicina', type: 'seg', options: SIM_NAO },
      { key: 'vitaminas', label: 'Vitaminas', type: 'text' },
      { key: 'suplemento', label: 'Suporte nutricional (suplemento)', type: 'select', options: SUPLEMENTO },
    ],
  },
  {
    title: 'Observações',
    fields: [{ key: 'observacoes', label: 'Observações gerais', type: 'textarea', wide: true }],
  },
];
export const PATIENT_FIELDS = PATIENT_GROUPS.flatMap((g) => g.fields);
export const PATIENT_FIELD_BY_KEY = Object.fromEntries(PATIENT_FIELDS.map((f) => [f.key, f]));

// ---------------------------------------------------------------------------
// Registros (cada aba da planilha original)
// ---------------------------------------------------------------------------
const D = { key: 'date', label: 'Data', type: 'date', required: true };

export const SPIRO_PARAMS = [
  { k: 'cvf', label: 'CVF', unit: 'L' },
  { k: 'vef1', label: 'VEF1', unit: 'L' },
  { k: 'vef1cvf', label: 'VEF1/CVF', unit: '%' },
  { k: 'fef', label: 'FEF25-75%', unit: 'L/s' },
  { k: 'pfe', label: 'PFE', unit: 'L/s' },
];
export const SPIRO_COLS = [
  { k: 'lin', label: 'LIN' },
  { k: 'prev', label: 'Previsto' },
  { k: 'pre', label: 'Pré-BD' },
  { k: 'pos', label: 'Pós-BD' },
];
const spiroFields = SPIRO_PARAMS.flatMap((p) =>
  SPIRO_COLS.map((c) => ({ key: `${p.k}_${c.k}`, label: `${p.label} ${c.label}`, unit: p.unit, type: 'num', grid: { row: p.k, col: c.k } })),
);

const LAB_GROUPS = [
  ['Hemograma', [['leuco', 'Leucócitos', '/mm³'], ['eos', 'Eosinófilos', '%'], ['linf', 'Linfócitos', '%'], ['neut', 'Neutrófilos', '%'], ['plaq', 'Plaquetas', 'mil/mm³'], ['hb', 'Hemoglobina', 'g/dL'], ['ht', 'Hematócrito', '%'], ['hm', 'Hemácias', 'milhões/mm³']]],
  ['Eletrólitos', [['na', 'Sódio', 'mEq/L'], ['k', 'Potássio', 'mEq/L'], ['cl', 'Cloro', 'mEq/L'], ['ca', 'Cálcio'], ['fosforo', 'Fósforo'], ['mg', 'Magnésio']]],
  ['Coagulação e músculo', [['tp', 'TP', '%'], ['ttpa', 'TTPA (relação)'], ['rni', 'RNI'], ['cpk', 'CPK']]],
  ['Função hepática', [['pt', 'Proteínas totais'], ['albumina', 'Albumina'], ['globulina', 'Globulina'], ['bt', 'Bilirrubina total'], ['bd', 'Bilirrubina direta'], ['bi', 'Bilirrubina indireta'], ['fa', 'Fosfatase alcalina'], ['ggt', 'GGT'], ['tgo', 'TGO'], ['tgp', 'TGP']]],
  ['Ferro', [['ferro', 'Ferro'], ['ferritina', 'Ferritina'], ['retic', 'Reticulócitos'], ['transferrina', 'Transferrina']]],
  ['Renal e tireoide', [['ureia', 'Ureia'], ['creatinina', 'Creatinina'], ['tsh', 'TSH'], ['t4l', 'T4 livre']]],
  ['Pâncreas e suor', [['elastase', 'Elastase fecal', 'µg/g'], ['amilase', 'Amilase'], ['lipase', 'Lipase'], ['suor', 'Teste do suor', 'mmol/L']]],
  ['Glicemia', [['glicemia', 'Glicemia de jejum'], ['hba1c', 'HbA1c', '%'], ['totg', 'TOTG 2h']]],
  ['Vitaminas e imunologia', [['vita', 'Vitamina A'], ['vitd', 'Vitamina D', 'ng/mL'], ['vite', 'Vitamina E'], ['ige', 'IgE total', 'UI/mL']]],
  ['Lipídios', [['ct', 'Colesterol total'], ['hdl', 'HDL'], ['ldl', 'LDL'], ['trig', 'Triglicerídeos']]],
];
const labFields = LAB_GROUPS.flatMap(([group, items]) =>
  items.map(([key, label, unit]) => ({ key, label, unit, type: 'val', group })),
);

const VISIT_LINKS = [
  // valores trazidos automaticamente do registro mais próximo da data da visita
  { key: 'peso', from: 'antropometria', label: 'Peso', unit: 'kg' },
  { key: 'estatura', from: 'antropometria', label: 'Estatura', unit: 'cm' },
  { key: 'zei', from: 'antropometria', label: 'Z E/I' },
  { key: 'zimc', from: 'antropometria', label: 'Z IMC' },
  { key: 'vef1_ppre', from: 'funcao', label: 'VEF1 (% prev.)' },
  { key: 'cvf_ppre', from: 'funcao', label: 'CVF (% prev.)' },
  { key: 'germes', from: 'cultura', label: 'Cultura' },
  { key: 'suor', from: 'laboratorio', label: 'Suor', unit: 'mmol/L' },
  { key: 'leuco', from: 'laboratorio', label: 'Leucócitos' },
  { key: 'plaq', from: 'laboratorio', label: 'Plaquetas' },
  { key: 'hb', from: 'laboratorio', label: 'Hb' },
  { key: 'ht', from: 'laboratorio', label: 'Ht' },
  { key: 'tp', from: 'laboratorio', label: 'TP' },
  { key: 'ttpa', from: 'laboratorio', label: 'TTPA' },
  { key: 'rni', from: 'laboratorio', label: 'RNI' },
  { key: 'cpk', from: 'laboratorio', label: 'CPK' },
  { key: 'tgo', from: 'laboratorio', label: 'TGO' },
  { key: 'tgp', from: 'laboratorio', label: 'TGP' },
  { key: 'fa', from: 'laboratorio', label: 'FA' },
  { key: 'ggt', from: 'laboratorio', label: 'GGT' },
  { key: 'bt', from: 'laboratorio', label: 'BT' },
  { key: 'bd', from: 'laboratorio', label: 'BD' },
  { key: 'bi', from: 'laboratorio', label: 'BI' },
];

export const SECTIONS = [
  {
    type: 'antropometria',
    label: 'Antropometria',
    singular: 'medida antropométrica',
    fields: [
      D,
      { key: 'peso', label: 'Peso', unit: 'kg', type: 'num' },
      { key: 'estatura', label: 'Estatura', unit: 'cm', type: 'num' },
      { key: 'pc', label: 'Perímetro cefálico', unit: 'cm', type: 'num' },
      { key: 'zpi', label: 'Z P/I', type: 'num', auto: 'zpi', hint: 'Peso/idade (até 10 anos)' },
      { key: 'zei', label: 'Z E/I', type: 'num', auto: 'zei', hint: 'Estatura/idade' },
      { key: 'zimc', label: 'Z IMC', type: 'num', auto: 'zimc', hint: 'IMC/idade' },
      { key: 'zpa', label: 'Z P/A', type: 'num', auto: 'zpa', hint: 'Peso/altura (até 5 anos)' },
    ],
    columns: ['date', 'idade', 'peso', 'estatura', 'pc', 'imc', 'zpi', 'zei', 'zimc', 'zpa'],
  },
  {
    type: 'funcao',
    label: 'Função pulmonar',
    singular: 'espirometria',
    layout: 'spiro',
    fields: [
      D,
      { key: 'peso', label: 'Peso', unit: 'kg', type: 'num' },
      { key: 'estatura', label: 'Estatura', unit: 'cm', type: 'num' },
      ...spiroFields,
      { key: 'obs', label: 'Observações / interpretação', type: 'textarea', wide: true },
    ],
    columns: ['date', 'idade', 'cvf_pre', 'cvf_ppre', 'vef1_pre', 'vef1_ppre', 'vef1cvf_pre', 'fef_pre', 'fef_ppre', 'vef1_bd', 'cvf_bd'],
  },
  {
    type: 'cultura',
    label: 'Culturas',
    singular: 'cultura',
    fields: [
      D,
      { key: 'material', label: 'Material', type: 'select', options: ['Escarro', 'Swab de orofaringe', 'Escarro induzido', 'Lavado broncoalveolar', 'Outro'] },
      { key: 'germes', label: 'Resultado', type: 'chips', options: PATOGENOS.map((p) => ({ v: p.k, label: p.label })), wide: true },
      { key: 'outroGerme', label: 'Outro germe (especificar)', type: 'text', wide: true, showIf: (r) => (r.germes || []).includes('outro') },
      { key: 'sensibilidade', label: 'Sensibilidade', type: 'textarea' },
      { key: 'resistencia', label: 'Resistência', type: 'textarea' },
      { key: 'conduta', label: 'Conduta', type: 'textarea', wide: true },
    ],
    columns: ['date', 'germes', 'material', 'sensibilidade', 'resistencia', 'conduta'],
  },
  {
    type: 'laboratorio',
    label: 'Laboratório',
    singular: 'exame laboratorial',
    layout: 'groups',
    fields: [D, ...labFields, { key: 'obs', label: 'Observações', type: 'textarea', wide: true, group: 'Observações' }],
    columns: ['date', 'idade', 'hb', 'leuco', 'eos', 'plaq', 'tgo', 'tgp', 'ggt', 'vitd', 'ige', 'elastase', 'suor', 'obs'],
  },
  {
    type: 'modulador',
    label: 'Modulador',
    singular: 'visita do modulador',
    layout: 'visits',
    links: VISIT_LINKS,
    fields: [
      D,
      { key: 'visita', label: 'Visita', type: 'select', options: VISITAS },
      { key: 'dose', label: 'Dose do modulador', type: 'combo', suggestions: ['50mg', '100mg', 'Suspenso'] },
      { key: 'creon', label: 'Insuf. pancreática (Creon)', type: 'select', options: CREON },
      { key: 'suplemento', label: 'Suplemento', type: 'select', options: SUPLEMENTO },
      { key: 'salina', label: 'Salina hipertônica', type: 'select', options: ['Não', '3', '5', '7', 'Suspendeu'] },
      { key: 'alfadornase', label: 'Alfadornase', type: 'seg', options: SIM_NAO },
      { key: 'ci', label: 'Corticoide inalatório', type: 'seg', options: SIM_NAO },
      { key: 'laba', label: 'LABA', type: 'seg', options: SIM_NAO },
      { key: 'tob', label: 'Tobramicina', type: 'seg', options: SIM_NAO },
      { key: 'coli', label: 'Colimicina', type: 'seg', options: SIM_NAO },
      { key: 'ibp', label: 'IBP', type: 'seg', options: SIM_NAO },
      { key: 'tosse', label: 'Tosse', type: 'seg', options: EVOLUCAO },
      { key: 'expectoracao', label: 'Expectoração', type: 'seg', options: EVOLUCAO },
      { key: 'dispneia', label: 'Dispneia', type: 'seg', options: EVOLUCAO },
      { key: 'oftalmo', label: 'Avaliação oftalmológica?', type: 'seg', options: SIM_NAO },
      { key: 'exacerbacao', label: 'Exacerbação?', type: 'seg', options: SIM_NAO },
      { key: 'erradicacao', label: 'Erradicação?', type: 'seg', options: SIM_NAO },
      { key: 'efeitos', label: 'Efeitos adversos', type: 'textarea', wide: true },
      { key: 'intercorrencias', label: 'Intercorrências', type: 'textarea', wide: true },
      { key: 'obs', label: 'Observações', type: 'textarea', wide: true },
    ],
    columns: ['date', 'visita', 'dose'],
  },
  {
    type: 'exacerbacao',
    label: 'Exacerbações',
    singular: 'exacerbação pulmonar',
    fields: [
      D,
      { key: 'tratamento', label: 'Tratamento', type: 'seg', options: ['Oral', 'Intravenoso', 'Inalatório'] },
      { key: 'antibiotico', label: 'Antibiótico(s)', type: 'text', wide: true },
      { key: 'dias', label: 'Dias de tratamento', type: 'num' },
      { key: 'obs', label: 'Observações', type: 'textarea', wide: true },
    ],
    columns: ['date', 'tratamento', 'antibiotico', 'dias', 'obs'],
  },
  {
    type: 'erradicacao',
    label: 'Erradicação',
    singular: 'erradicação de patógeno',
    fields: [
      D,
      { key: 'germes', label: 'Patógeno(s)', type: 'chips', options: PATOGENOS.filter((p) => p.k !== 'flora').map((p) => ({ v: p.k, label: p.label })), wide: true },
      { key: 'antibiotico', label: 'Antibiótico(s)', type: 'text', wide: true },
      { key: 'duracao', label: 'Duração do tratamento', type: 'text' },
      { key: 'obs', label: 'Observações', type: 'textarea', wide: true },
    ],
    columns: ['date', 'germes', 'antibiotico', 'duracao', 'obs'],
  },
  {
    type: 'internamento',
    label: 'Internamentos',
    singular: 'internamento',
    fields: [
      { ...D, label: 'Data de admissão' },
      { key: 'alta', label: 'Data da alta', type: 'date' },
      { key: 'local', label: 'Local', type: 'combo', suggestions: ['HEC'] },
      { key: 'motivo', label: 'Motivo', type: 'seg', options: ['Exacerbação pulmonar', 'Outras causas'] },
      { key: 'descricao', label: 'Diagnóstico / medicamentos utilizados', type: 'textarea', wide: true },
    ],
    columns: ['date', 'alta', 'diasInternacao', 'local', 'motivo', 'descricao'],
  },
  {
    type: 'imagem',
    label: 'Imagem/exames',
    singular: 'exame de imagem / complementar',
    fields: [
      D,
      { key: 'exame', label: 'Exame', type: 'combo', suggestions: EXAMES_IMAGEM, wide: true },
      { key: 'laudo', label: 'Laudo', type: 'textarea', wide: true },
      { key: 'obs', label: 'Observações', type: 'textarea', wide: true },
    ],
    columns: ['date', 'idade', 'exame', 'laudo', 'obs'],
  },
  {
    type: 'peakflow',
    label: 'Peak flow',
    singular: 'peak flow',
    fields: [
      D,
      { key: 'altura', label: 'Altura', unit: 'cm', type: 'num' },
      { key: 'pfe', label: 'PFE medido', unit: 'L/min', type: 'num' },
      { key: 'pfePrev', label: 'PFE previsto', unit: 'L/min', type: 'num' },
      { key: 'obs', label: 'Observações', type: 'text', wide: true },
    ],
    columns: ['date', 'altura', 'pfe', 'pfePrev', 'pfePct', 'obs'],
  },
  {
    type: 'caminhada',
    label: 'Caminhada (TC6)',
    singular: 'teste de caminhada (TC6M)',
    fields: [
      D,
      { key: 'distancia', label: 'Distância percorrida', unit: 'm', type: 'num' },
      { key: 'distPrev', label: 'Distância predita', unit: 'm', type: 'num', hint: 'Em branco = calcula pela equação 622,461 − 1,846×idade + 61,503×sexo (masc.=1)' },
      { key: 'spo2Ini', label: 'SpO₂ inicial', unit: '%', type: 'num' },
      { key: 'spo2Min', label: 'SpO₂ mínima', unit: '%', type: 'num' },
      { key: 'obs', label: 'Observações', type: 'text', wide: true },
    ],
    columns: ['date', 'idade', 'distancia', 'distPredita', 'distPct', 'spo2Ini', 'spo2Min', 'obs'],
  },
];

export const SECTION_BY_TYPE = Object.fromEntries(SECTIONS.map((s) => [s.type, s]));
for (const s of SECTIONS) {
  s.fields = s.fields.map((f) => ({ ...f })); // cópia: campos compartilhados (ex.: data) não podem ser alterados em conjunto
  s.fieldByKey = Object.fromEntries(s.fields.map((f) => [f.key, f]));
}

// Rótulos dos campos calculados (usados em tabelas e exportações)
export const COMPUTED_LABELS = {
  idade: { label: 'Idade' },
  imc: { label: 'IMC', unit: 'kg/m²' },
  diasInternacao: { label: 'Dias' },
  pfePct: { label: '% previsto' },
  distPredita: { label: 'Distância predita', unit: 'm' },
  distPct: { label: '% predito' },
  ...Object.fromEntries(
    SPIRO_PARAMS.flatMap((p) => [
      [`${p.k}_ppre`, { label: `${p.label} % prev. pré` }],
      [`${p.k}_ppos`, { label: `${p.label} % prev. pós` }],
      [`${p.k}_bd`, { label: `${p.label} BD %` }],
    ]),
  ),
};

export function fieldMeta(section, key) {
  return section.fieldByKey[key] || COMPUTED_LABELS[key] || { label: key };
}

// agrupamento dos campos da visita do modulador no formulário
const MOD_GROUPS = {
  Visita: ['date', 'visita', 'dose'],
  'Medicações em uso': ['creon', 'suplemento', 'salina', 'alfadornase', 'ci', 'laba', 'tob', 'coli', 'ibp'],
  'Sintomas (em relação à visita anterior)': ['tosse', 'expectoracao', 'dispneia'],
  Eventos: ['oftalmo', 'exacerbacao', 'erradicacao'],
  Anotações: ['efeitos', 'intercorrencias', 'obs'],
};
for (const [g, keys] of Object.entries(MOD_GROUPS)) for (const k of keys) SECTION_BY_TYPE.modulador.fieldByKey[k].group = g;
SECTION_BY_TYPE.laboratorio.fieldByKey.date.group = 'Data';
