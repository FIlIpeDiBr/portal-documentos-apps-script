/**
 * Painel do cliente: leitura do checklist e recebimento de arquivos.
 *
 * O id do cliente é a credencial: quem tem o link enxerga e envia para aquele checklist,
 * e só para ele. Por isso o id tem 122 bits aleatórios e nada aqui lista outros clientes.
 */

const FORMATO_ID_CLIENTE = /^c[0-9a-f]{32}$/;
const FORMATO_MIME = /^[\w.+-]+\/[\w.+-]+$/;

/** Tudo sobre um cliente em duas leituras de planilha. Devolve null se o id não existir. */
function carregarCliente_(clienteId) {
  clienteId = String(clienteId || '');
  if (!FORMATO_ID_CLIENTE.test(clienteId)) return null;

  let cliente = null;
  let pastaId = '';
  const clientes = linhasDaAba_(CFG.ABA_CLIENTES);
  for (let r = 0; r < clientes.length; r++) {
    if (clientes[r][COL.CLIENTE.ID] === clienteId) {
      cliente = {
        id: clienteId,
        nome: clientes[r][COL.CLIENTE.NOME],
        modeloNome: clientes[r][COL.CLIENTE.MODELO_NOME],
        criadoEm: clientes[r][COL.CLIENTE.CRIADO_EM],
      };
      pastaId = clientes[r][COL.CLIENTE.PASTA_ID];
      break;
    }
  }
  if (!cliente) return null;

  const visao = lerEstado_(clienteId, linhasDaAba_(CFG.ABA_ESTADO));
  return { cliente: cliente, pastaId: pastaId, itens: visao.itens, estado: visao.estado };
}

/** Itens e situação de um cliente a partir das linhas da aba Estado. */
function lerEstado_(clienteId, linhas) {
  const itens = [];
  const estado = {};
  linhas.forEach(function (linha) {
    if (linha[COL.ESTADO.CLIENTE_ID] !== clienteId) return;
    const itemId = linha[COL.ESTADO.ITEM_ID];
    itens.push({
      id: itemId,
      grupo: linha[COL.ESTADO.GRUPO],
      sub: linha[COL.ESTADO.SUB],
      label: linha[COL.ESTADO.ITEM],
      obs: linha[COL.ESTADO.OBS],
    });
    estado[itemId] = {
      status: linha[COL.ESTADO.STATUS] || STATUS_PENDENTE,
      arquivos: linha[COL.ESTADO.ARQUIVOS] || '',
      links: linha[COL.ESTADO.LINKS] || '',
      atualizado: linha[COL.ESTADO.ATUALIZADO] || '',
    };
  });
  return { itens: itens, estado: estado };
}

/** O que a página do cliente recebe: sem o id da pasta no Drive. */
function dadosDoCliente_(clienteId) {
  const dados = carregarCliente_(clienteId);
  return dados ? { cliente: dados.cliente, itens: dados.itens, estado: dados.estado } : null;
}

/**
 * Recebe um arquivo do cliente, guarda na pasta dele, pede a classificação à IA e marca
 * como entregues os itens identificados com confiança suficiente.
 *
 * O arquivo é guardado antes da classificação: se a IA falhar, nada se perde e a equipe
 * confere à mão.
 *
 * @param {string} clienteId
 * @param {{nome: string, mime: string, dados: string}} payload `dados` em base64
 */
function enviarArquivo(clienteId, payload) {
  try {
    const dados = carregarCliente_(clienteId);
    if (!dados) throw new Error('Link inválido.');
    if (!payload || typeof payload.dados !== 'string' || !payload.dados) throw new Error('Arquivo vazio.');
    if (payload.dados.length * 0.75 > CFG.LIMITE_UPLOAD) {
      throw new Error('Arquivo acima de ' + Math.round(CFG.LIMITE_UPLOAD / 1048576) + ' MB.');
    }

    const nome = limparNomeDeArquivo_(payload.nome);
    const mime = FORMATO_MIME.test(String(payload.mime || '')) ? String(payload.mime) : 'application/octet-stream';
    const bytes = Utilities.base64Decode(payload.dados);
    const url = DriveApp.getFolderById(dados.pastaId).createFile(Utilities.newBlob(bytes, mime, nome)).getUrl();

    let sugestoes = [];
    let iaIndisponivel = false;
    try {
      sugestoes = classificarDocumento_(dados.itens, nome, mime, bytes.length, payload.dados);
    } catch (e) {
      // O detalhe (status HTTP, corpo do erro) fica no log; o cliente só precisa saber que
      // a conferência será manual.
      iaIndisponivel = true;
      Logger.log('Classificação falhou para ' + nome + ': ' + (e && e.message ? e.message : e));
    }

    const confiantes = sugestoes.filter(function (s) { return s.confianca >= CFG.CONFIANCA_MINIMA; });
    let estado = dados.estado;
    if (confiantes.length) {
      const ids = confiantes.map(function (s) { return s.id; });
      estado = comLock_(function () { return marcarEntregues_(dados.cliente.id, ids, nome, url); });
    }

    const rotulos = {};
    dados.itens.forEach(function (it) { rotulos[it.id] = it.label; });
    const identificados = confiantes.map(function (s) {
      return { id: s.id, label: rotulos[s.id], confianca: s.confianca };
    });
    return {
      ok: true,
      nome: nome,
      identificados: identificados,
      naoIdentificado: identificados.length === 0,
      iaIndisponivel: iaIndisponivel,
      estado: estado,
    };
  } catch (e) {
    return { ok: false, erro: String(e && e.message ? e.message : e) };
  }
}

/**
 * Marca itens como entregues e anexa o arquivo a cada um. Lê a aba uma vez, grava só as
 * linhas alteradas e devolve o estado atualizado do cliente. Chamar dentro de comLock_.
 */
function marcarEntregues_(clienteId, itemIds, nomeArquivo, url) {
  const aba = aba_(CFG.ABA_ESTADO);
  const linhas = linhasDaAba_(CFG.ABA_ESTADO);
  const alvo = {};
  itemIds.forEach(function (id) { alvo[id] = true; });
  const quando = agora_();

  linhas.forEach(function (linha, r) {
    if (linha[COL.ESTADO.CLIENTE_ID] !== clienteId || !alvo[linha[COL.ESTADO.ITEM_ID]]) return;
    const arquivos = linha[COL.ESTADO.ARQUIVOS] ? String(linha[COL.ESTADO.ARQUIVOS]).split('\n') : [];
    const links = linha[COL.ESTADO.LINKS] ? String(linha[COL.ESTADO.LINKS]).split('\n') : [];
    if (links.indexOf(url) === -1) {
      arquivos.push(nomeArquivo);
      links.push(url);
    }
    linha[COL.ESTADO.STATUS] = STATUS_ENTREGUE;
    linha[COL.ESTADO.ARQUIVOS] = arquivos.join('\n');
    linha[COL.ESTADO.LINKS] = links.join('\n');
    linha[COL.ESTADO.ATUALIZADO] = quando;
    aba.getRange(r + 2, COL.ESTADO.STATUS + 1, 1, 4).setValues([[
      STATUS_ENTREGUE, linha[COL.ESTADO.ARQUIVOS], linha[COL.ESTADO.LINKS], quando,
    ]]);
  });
  return lerEstado_(clienteId, linhas).estado;
}
