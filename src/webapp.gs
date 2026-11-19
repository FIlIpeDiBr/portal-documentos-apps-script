/**
 * Entrada do web app. A mesma implantação serve três telas, conforme a URL:
 *   ?cli=<id>      painel do cliente
 *   ?admin=<token> painel da equipe
 *   (nada)         aviso de acesso restrito
 */
function doGet(e) {
  const parametros = (e && e.parameter) || {};
  let modo = 'restrito';
  let dados = {};

  if (parametros.cli) {
    const cliente = dadosDoCliente_(parametros.cli);
    if (cliente) {
      modo = 'cliente';
      dados = cliente;
    }
  } else if (parametros.admin && tokenConfere_(parametros.admin)) {
    modo = 'admin';
    dados = dadosDoPainel_();
    dados.admin = String(parametros.admin);
  }
  dados.marca = MARCA;
  dados.limiteUpload = CFG.LIMITE_UPLOAD;

  const pagina = HtmlService.createTemplateFromFile('Index');
  pagina.modo = modo;
  // Entra na página dentro de <script>, sem o escape de HTML do template: ver jsonParaScript_.
  pagina.dadosJson = jsonParaScript_(dados);
  return pagina.evaluate()
    .setTitle('Portal de Documentos | ' + MARCA.nome)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}
