# Registro FC — acompanhamento de pacientes com fibrose cística

Sistema web (PWA, funciona offline) que substitui a planilha individual por paciente
(abas DADOS, Antropometria, Internamentos, Exacerbação/Erradicação, Laboratório, Culturas,
Imagem, Modulador, Função Pulmonar e Peak Flow) por um cadastro único com **vários pacientes**.

Endereço após a publicação: `<seu-site>/fibrose-cistica/`

## Primeiros passos

1. **Importar as planilhas atuais** — em *Pacientes › Importar planilhas* (ou *Dados e backup*),
   selecione um ou vários arquivos `.xlsx` de uma vez. O sistema mostra uma prévia por arquivo
   (nº de registros de cada aba e avisos) antes de gravar. Se o paciente já existir
   (mesmo nome + data de nascimento), a importação atualiza o cadastro em vez de duplicar.
2. Abra cada paciente importado e, em **Cadastro**, confira o **sexo** (a planilha não tem esse
   campo e ele é necessário para os escores-Z automáticos).
3. Nas consultas seguintes, use **Registrar consulta**: uma única tela com a data e as seções
   que serão lançadas (antropometria, espirometria, cultura, laboratório, visita do modulador…).
   Seções deixadas em branco são ignoradas.

Atalhos: `/` busca paciente · `Enter` avança para o próximo campo (como na planilha) ·
`Ctrl+Enter` salva · `Esc` fecha.

## Painel (tela inicial)

Resume o serviço: pacientes em acompanhamento e em modulador, exacerbações e internações do ano,
VEF1 e Z IMC médios, **pontos de atenção por paciente**, VEF1 médio por ano, variação após o início do
modulador, germes da última cultura, faixa etária e genótipo, além da dica do dia e de um guia rápido.

Os pontos de atenção usam rotinas de referência (cultura e espirometria a cada 3 meses, antropometria a
cada 3 meses, laboratório anual, TGO/TGP em modulador a cada 3 meses nos primeiros 18 meses e anualmente
depois, avaliação oftalmológica anual em menores de 18 anos em modulador, Z IMC/E/I ≤ −1 ou ≤ −2 e queda de
10 pontos no VEF1). Os limites ficam em `LIMITES`, no início de `js/dashboard.js`, e devem ser ajustados ao
protocolo do serviço.

## O que é calculado automaticamente

| Item | Como |
|---|---|
| Idade em cada registro | data de nascimento × data do registro |
| IMC | peso / estatura² |
| Escores-Z (E/I, IMC/I, P/I até 10 anos, P/A até 5 anos) | método LMS da OMS — Padrões 2006 (0–5 anos) e Referência 2007 (5–19 anos). Se o valor for digitado, o digitado prevalece; os calculados aparecem em itálico |
| % do previsto e resposta ao broncodilatador | pré-BD/previsto, pós-BD/previsto e (pós − pré)/pré |
| Dias de internação | alta − admissão + 1 (ou até hoje, se sem alta) |
| Peak flow | % do previsto, com faixas 80% / 50% |
| Teste de caminhada | distância predita = 622,461 − 1,846 × idade + 61,503 × sexo (masc. = 1), a mesma equação da planilha, quando não informada |
| Visitas do modulador | peso, Z, VEF1/CVF % prev., cultura, suor e exames são trazidos do registro **mais próximo** da data da visita (até 6 meses) |
| Seguimento no ano | erradicações, exacerbações, tratamento oral/IV (episódios e dias), internações (por exacerbação e por outras causas), germes isolados |
| Controle de exames | data e tempo desde a última cultura, espirometria, laboratório, imagem, TC de tórax, elastase, teste do suor e avaliação oftalmológica |

Os registros são sempre ordenados por data automaticamente.

## Relatório anual e pesquisa

* **Relatório anual** — uma linha por paciente com os indicadores do ano (antropometria,
  melhor VEF1, microbiologia, exacerbações, internações, medicamentos), exportável para Excel,
  com opção de exportar sem nome/prontuário. Serve de base para o envio ao GBEFC.
* **Exportar base para pesquisa** (*Dados e backup*) — Excel com uma aba por tipo de registro
  (formato longo), código do paciente, idade em anos decimais, meses desde o início do modulador,
  colunas 0/1 por germe e dicionário de variáveis. Opção de **pseudonimizar** (remove nome,
  prontuário, naturalidade, data de nascimento e observações gerais).
* **Excel do paciente** — botão *Excel* na página do paciente (resumo + todas as abas).

## Onde ficam os dados — leia

* Os dados ficam **somente no navegador do computador/celular em uso** (IndexedDB). Nada é
  enviado para servidores. Outro computador ou outro navegador **não** vê os mesmos dados.
* Limpar os dados de navegação do site apaga os registros. Por isso:
  **faça backups regularmente** em *Dados e backup › Baixar backup* (a barra superior avisa
  “Backup pendente”). O backup pode ser **protegido por senha** (criptografia AES-256).
* Para levar os dados para outro computador: baixe o backup em um e use *Restaurar backup* no outro.
* São dados sensíveis de saúde (LGPD): use em equipamento com senha de acesso e guarde os
  arquivos de backup/exportação em local seguro.

## Publicação / atualização

Arquivos estáticos — não há etapa de build. Basta publicar a pasta junto com o restante do site
(GitHub Pages, Netlify, Vercel…).
**Ao publicar uma nova versão, altere `VERSION` em `sw.js`** para que os aparelhos que já usam
o sistema recebam a atualização (aparece o aviso “Nova versão disponível — Atualizar”).

## Estrutura

```
index.html, sw.js, manifest.webmanifest, css/app.css, icons/
js/schema.js        campos de todas as seções (formulários, tabelas, exportação saem daqui)
js/calc.js          idade, IMC, % previsto, indicadores anuais, “registro mais próximo”
js/growth.js        escores-Z OMS  (tabelas em js/growth-data.js, geradas por tools/build-growth-data.py)
js/db.js            armazenamento local (IndexedDB)
js/xlsx-import.js   leitura das planilhas no modelo atual
js/xlsx-export.js   exportações Excel;  js/backup.js  backup JSON (com senha opcional)
js/dashboard.js     painel (regras de atenção e indicadores)
js/app.js, pages.js, patient.js, forms.js, charts.js, ui.js, router.js   interface
vendor/             Preact + htm, Chart.js, ExcelJS (licenças MIT/Apache na mesma pasta)
```

Tabelas de crescimento: Organização Mundial da Saúde — WHO Child Growth Standards (2006) e
WHO Growth Reference 5–19 anos (2007), obtidas via pacote `@pedi-growth/core` (MIT), uso não
comercial com atribuição à OMS.
