"""Gera js/growth-data.js (tabelas LMS da OMS) — uso:

    npm pack @pedi-growth/core   # pacote MIT com as tabelas oficiais da OMS
    tar xzf pedi-growth-core-*.tgz
    python3 build-growth-data.py package/dist/data ../js/growth-data.js

Fonte dos dados: OMS — WHO Child Growth Standards 2006 (0–5 anos, pacote WHO Anthro) e
WHO Growth Reference 2007 (5–19 anos, pacote WHO AnthroPlus), redistribuídos por
@pedi-growth/core (MIT). Uso não comercial com atribuição à OMS (CC BY-NC-SA 3.0 IGO).
"""
import json, os, sys

src, out = sys.argv[1:3]

def load(name):
    return json.load(open(os.path.join(src, name)))

def r(x, n):
    return float(round(x, n))

def by_age(young, old=None, step=7):
    """young: idade em dias (0–5 anos, amostra semanal); old: idade em meses (5–19 anos)"""
    # inclui os dias 730/731: troca de comprimento (deitado) para estatura (em pé) aos 24 meses
    pts = [[r(p['age'] / 365.25, 5), p['L'], p['M'], p['S']] for i, p in enumerate(young) if i % step == 0 or i in (730, 731) or i == len(young) - 1]
    if old:
        pts += [[r(p['age'] / 12, 4), p['L'], p['M'], p['S']] for p in old]
    return pts

def by_size(rows):
    """peso para comprimento/estatura: passos de 0,5 cm"""
    return [[p['age'], p['L'], p['M'], p['S']] for p in rows if abs(p['age'] * 2 - round(p['age'] * 2)) < 1e-6]

data = {
    'source': 'OMS — WHO Child Growth Standards 2006 (0–5 anos) e WHO Growth Reference 2007 (5–19 anos)',
    'wfa': {'M': by_age(load('wfa-boys-0-5.json'), load('wfa-boys-5-10.json')), 'F': by_age(load('wfa-girls-0-5.json'), load('wfa-girls-5-10.json'))},
    'hfa': {'M': by_age(load('lhfa-boys-0-5.json'), load('hfa-boys-5-19.json')), 'F': by_age(load('lhfa-girls-0-5.json'), load('hfa-girls-5-19.json'))},
    'bfa': {'M': by_age(load('bfa-boys-0-5.json'), load('bfa-boys-5-19.json')), 'F': by_age(load('bfa-girls-0-5.json'), load('bfa-girls-5-19.json'))},
    'wfl': {'M': by_size(load('wfl-boys.json')), 'F': by_size(load('wfl-girls.json'))},
    'wfh': {'M': by_size(load('wfh-boys.json')), 'F': by_size(load('wfh-girls.json'))},
}
with open(out, 'w') as f:
    f.write('// Gerado por tools/build-growth-data.py — não editar manualmente.\n')
    f.write('// Tabelas LMS da OMS (Child Growth Standards 2006; Growth Reference 2007). Atribuição: Organização Mundial da Saúde.\n')
    f.write('// Cada ponto: [idade em anos (ou comprimento/estatura em cm), L, M, S]\n')
    f.write('export default ' + json.dumps(data, separators=(',', ':')) + ';\n')
print('ok', {k: len(v['M']) for k, v in data.items() if isinstance(v, dict)})
