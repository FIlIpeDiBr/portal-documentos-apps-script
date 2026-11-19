/**
 * Auxiliares: planilha de controle, pastas, links, identificadores e exclusão mútua.
 */

function agora_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

/** Identificador imprevisível: 122 bits do UUID v4, em hexadecimal. */
function novoId_(prefixo) {
  return prefixo + Utilities.getUuid().replace(/-/g, '');
}

/** Comparação em tempo constante, para não vazar o token pelo tempo de resposta. */
function iguaisEmTempoConstante_(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  }
  return diferenca === 0 && a.length > 0;
}

/**
 * Executa `fn` com o lock do script. Duas gravações simultâneas na planilha (dois uploads,
 * ou um upload durante uma exclusão) leriam o mesmo estado e uma apagaria a outra.
 */
function comLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CFG.ESPERA_LOCK_MS)) {
    throw new Error('O sistema está ocupado. Tente de novo em instantes.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function planilhaDeControle_() {
  const id = propriedade_(CFG.PROP_PLANILHA);
  if (!id) throw new Error('Planilha de controle não configurada (rode inicializar).');
  return SpreadsheetApp.openById(id);
}

function aba_(nome) {
  return planilhaDeControle_().getSheetByName(nome);
}

/** Linhas de dados da aba (sem o cabeçalho). */
function linhasDaAba_(nome) {
  return aba_(nome).getDataRange().getValues().slice(1);
}

function pastaMae_() {
  const id = propriedade_(CFG.PROP_PASTA_MAE);
  if (!id) throw new Error('Pasta-mãe não configurada (rode inicializar).');
  return DriveApp.getFolderById(id);
}

/** URL de publicação: a salva pela equipe (/exec) ou, na falta dela, a do próprio serviço. */
function urlDoApp_() {
  const salva = propriedade_(CFG.PROP_URL_APP);
  if (salva) return salva;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function linkDoCliente_(clienteId) {
  const base = urlDoApp_();
  return base ? base + '?cli=' + clienteId : '';
}

function linkDaPasta_(pastaId) {
  return pastaId ? 'https://drive.google.com/drive/folders/' + pastaId : '';
}

/** Nome de arquivo vindo do navegador: sem caminho, sem caracteres de controle, com teto. */
function limparNomeDeArquivo_(nome) {
  const limpo = String(nome || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, CFG.TAMANHO_MAXIMO_NOME);
  return limpo || 'arquivo';
}

/**
 * JSON para ser impresso dentro de <script>. JSON.stringify não escapa "</script>" nem os
 * separadores de linha U+2028/U+2029, e um nome de arquivo com isso encerraria o script.
 */
function jsonParaScript_(valor) {
  return JSON.stringify(valor)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
