/**
 * Configuração inicial e diagnóstico, para rodar no editor do Apps Script.
 *
 * Estas duas funções não têm "_" no fim para aparecerem no menu Executar. O efeito
 * colateral é que qualquer visitante do web app também consegue chamá-las pelo navegador
 * (google.script.run). Por isso elas NÃO devolvem nada: o token de admin e os links das
 * pastas vão só para o log de execução, que só quem tem acesso ao projeto enxerga.
 */

function inicializar() {
  Logger.log(comLock_(configurar_));
}

function diagnostico() {
  Logger.log(montarDiagnostico_());
}

/** Cria o que estiver faltando (pasta-mãe, planilha de controle, token). Pode rodar de novo. */
function configurar_() {
  const props = PropertiesService.getScriptProperties();

  let pastaId = props.getProperty(CFG.PROP_PASTA_MAE);
  if (!pastaId) {
    pastaId = DriveApp.createFolder('Portal de Documentos').getId();
    props.setProperty(CFG.PROP_PASTA_MAE, pastaId);
  }

  let planilhaId = props.getProperty(CFG.PROP_PLANILHA);
  if (!planilhaId) {
    planilhaId = criarPlanilhaDeControle_().getId();
    props.setProperty(CFG.PROP_PLANILHA, planilhaId);
  }

  let token = props.getProperty(CFG.PROP_TOKEN_ADMIN);
  if (!token) {
    token = novoId_('');
    props.setProperty(CFG.PROP_TOKEN_ADMIN, token);
  }

  const base = urlDoApp_();
  const temChave = !!props.getProperty(CFG.PROP_API_KEY);
  return [
    'Configuração concluída.',
    'Pasta-mãe: ' + linkDaPasta_(pastaId),
    'Planilha de controle: https://docs.google.com/spreadsheets/d/' + planilhaId,
    'Token de admin: ' + token,
    base ? 'Painel da equipe: ' + base + '?admin=' + token
         : 'Publique como app da Web; o painel da equipe é URL?admin=' + token,
    temChave ? 'Chave da IA: configurada.'
             : 'Falta a chave da IA: crie a propriedade ' + CFG.PROP_API_KEY + ' nas configurações do projeto.',
  ].join('\n');
}

function criarPlanilhaDeControle_() {
  const ss = SpreadsheetApp.create('Controle - Portal de Documentos');
  const cabecalhos = {};
  cabecalhos[CFG.ABA_CLIENTES] = ['ID', 'Nome', 'ModeloID', 'ModeloNome', 'PastaID', 'CriadoEm'];
  cabecalhos[CFG.ABA_MODELOS] = ['ID', 'Nome', 'ItensJSON', 'CriadoEm'];
  cabecalhos[CFG.ABA_ESTADO] = [
    'ClienteID', 'ItemID', 'Grupo', 'Sub', 'Item', 'Obs', 'Status', 'Arquivos', 'Links', 'Atualizado',
  ];
  Object.keys(cabecalhos).forEach(function (nome, i) {
    const aba = i === 0 ? ss.getActiveSheet().setName(nome) : ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalhos[nome].length).setValues([cabecalhos[nome]]).setFontWeight('bold');
    aba.setFrozenRows(1);
  });
  return ss;
}

function montarDiagnostico_() {
  const linhas = ['URL do app: ' + (urlDoApp_() || '(não definida)')];
  const pastaId = propriedade_(CFG.PROP_PASTA_MAE);
  linhas.push('Pasta-mãe: ' + (linkDaPasta_(pastaId) || '(não configurada)'));
  try {
    const subpastas = DriveApp.getFolderById(pastaId).getFolders();
    let n = 0;
    while (subpastas.hasNext()) {
      const pasta = subpastas.next();
      n++;
      linhas.push('  - ' + pasta.getName() + ' → ' + pasta.getUrl());
    }
    linhas.push('Subpastas: ' + n);
  } catch (e) {
    linhas.push('Erro ao ler a pasta-mãe: ' + e.message);
  }
  return linhas.join('\n');
}
