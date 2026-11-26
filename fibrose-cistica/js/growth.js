// Cálculo de escores-Z pelo método LMS da OMS.
// Padrões OMS 2006 (0–5 anos) e Referência OMS 2007 (5–19 anos).
import G from './growth-data.js';

function interp(table, x) {
  if (!table || !table.length) return null;
  if (x < table[0][0] || x > table[table.length - 1][0]) return null;
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid][0] <= x) lo = mid; else hi = mid;
  }
  const a = table[lo], b = table[hi];
  if (b[0] === a[0]) return { L: a[1], M: a[2], S: a[3] };
  const t = (x - a[0]) / (b[0] - a[0]);
  return {
    L: a[1] + (b[1] - a[1]) * t,
    M: a[2] + (b[2] - a[2]) * t,
    S: a[3] + (b[3] - a[3]) * t,
  };
}

const sdAt = ({ L, M, S }, z) => M * Math.pow(1 + L * S * z, 1 / L);

// restrito = aplica a correção da OMS para |z| > 3 (indicadores baseados em peso)
function lmsZ(lms, x, restricted) {
  if (!lms || !(x > 0)) return null;
  const { L, M, S } = lms;
  let z = Math.abs(L) < 1e-7 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  if (restricted) {
    if (z > 3) {
      const sd3 = sdAt(lms, 3), sd23 = sd3 - sdAt(lms, 2);
      z = 3 + (x - sd3) / sd23;
    } else if (z < -3) {
      const sd3 = sdAt(lms, -3), sd23 = sdAt(lms, -2) - sd3;
      z = -3 + (x - sd3) / sd23;
    }
  }
  return Math.round(z * 100) / 100;
}

/**
 * @param {object} p  { sexo:'M'|'F', idadeAnos:number, peso?:kg, estatura?:cm }
 * @returns {{zpi:number|null, zei:number|null, zimc:number|null, zpa:number|null}}
 */
export function zscores({ sexo, idadeAnos, peso, estatura }) {
  const out = { zpi: null, zei: null, zimc: null, zpa: null };
  if (sexo !== 'M' && sexo !== 'F') return out;
  if (!(idadeAnos >= 0) || idadeAnos > 19.0001) return out;
  const a = idadeAnos;
  if (peso > 0 && a <= 10) out.zpi = lmsZ(interp(G.wfa[sexo], a), peso, true);
  if (estatura > 0) out.zei = lmsZ(interp(G.hfa[sexo], a), estatura, false);
  if (peso > 0 && estatura > 0) {
    const imc = peso / Math.pow(estatura / 100, 2);
    out.zimc = lmsZ(interp(G.bfa[sexo], a), imc, true);
    if (a < 5) {
      // peso para comprimento (< 2 anos) ou para estatura (2–5 anos)
      const tab = a < 2 ? G.wfl[sexo] : G.wfh[sexo];
      out.zpa = lmsZ(interp(tab, estatura), peso, true);
    }
  }
  return out;
}

export const growthSource = G.source;
