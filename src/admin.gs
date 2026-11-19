/**
 * Painel da equipe. Toda função pública daqui exige o token de admin como primeiro
 * argumento: no Apps Script, função global sem "_" no fim pode ser chamada pelo navegador
 * de qualquer visitante, inclusive de quem só tem um link de cliente.
 */

function tokenConfere_(token) {
  return iguaisEmTempoConstante_(token, propriedade_(CFG.PROP_TOKEN_ADMIN));
}

function exigirAdmin_(token) {
  if (!tokenConfere_(token)) throw new Error('Acesso negado.');
}

/** Dados iniciais do painel da equipe (chamado pelo doGet depois de conferir o token). */
function dadosDoPainel_() {
  let urlDoServico = '';
  try { urlDoServico = ScriptApp.getService().getUrl() || ''; } catch (e) { urlDoServico = ''; }
  return {
    clientes: listarClientes_(),
    modelos: listarModelos_(),
    baseUrl: urlDoApp_(),
    getUrl: urlDoServico,
    appUrlSalvo: propriedade_(CFG.PROP_URL_APP) || '',
    parentUrl: linkDaPasta_(propriedade_(CFG.PROP_PASTA_MAE)),
  };
}

/** Clientes com o progresso (entregues/total), do mais novo para o mais antigo. */
function listarClientes_() {
  const progresso = contarEstado_();
  const lista = [];
  linhasDaAba_(CFG.ABA_CLIENTES).forEach(function (linha, indice) {
    const id = linha[COL.CLIENTE.ID];
    if (!id) return;
    const p = progresso[id] || { total: 0, entregues: 0 };
    lista.push({
      id: id,
      nome: linha[COL.CLIENTE.NOME],
      modeloNome: linha[COL.CLIENTE.MODELO_NOME],
      criadoEm: linha[COL.CLIENTE.CRIADO_EM],
      total: p.total,
      entregues: p.entregues,
      url: linkDoCliente_(id),
      pastaUrl: linkDaPasta_(linha[COL.CLIENTE.PASTA_ID]),
      ordem: indice,
    });
  });
  // A planilha só recebe linhas no fim: a ordem de inserção é a ordem de criação.
  lista.sort(function (a, b) { return b.ordem - a.ordem; });
  lista.forEach(function (c) { delete c.ordem; });
  return lista;
}

/** Total e entregues por cliente, em uma leitura só da aba Estado. */
function contarEstado_() {
  const contagem = {};
  linhasDaAba_(CFG.ABA_ESTADO).forEach(function (linha) {
    const id = linha[COL.ESTADO.CLIENTE_ID];
    if (!id) return;
    if (!contagem[id]) contagem[id] = { total: 0, entregues: 0 };
    contagem[id].total++;
    if (linha[COL.ESTADO.STATUS] === STATUS_ENTREGUE) contagem[id].entregues++;
  });
  return contagem;
}

/** Cria um modelo personalizado a partir de um texto (um documento por linha). */
function criarModelo(token, nome, texto) {
  exigirAdmin_(token);
  nome = String(nome || '').trim().slice(0, 120);
  if (!nome) throw new Error('Informe um nome para o modelo.');
  const itens = interpretarTextoModelo_(texto);
  if (!itens.length) throw new Error('A lista está vazia: adicione ao menos um documento.');
  if (itens.length > 300) throw new Error('A lista passa de 300 itens.');

  const id = novoId_('m');
  comLock_(function () {
    aba_(CFG.ABA_MODELOS).appendRow([id, nome, JSON.stringify(itens), agora_()]);
  });
  return { ok: true, id: PREFIXO_PERSONALIZADO + id, modelos: listarModelos_() };
}

/** Exclui um modelo personalizado. Clientes já criados não mudam: a lista deles é uma cópia. */
function excluirModelo(token, modeloId) {
  exigirAdmin_(token);
  if (!ehPersonalizado_(modeloId)) throw new Error('Apenas modelos personalizados podem ser excluídos.');
  const id = String(modeloId).substring(PREFIXO_PERSONALIZADO.length);
  comLock_(function () {
    const linhas = linhasDaAba_(CFG.ABA_MODELOS);
    for (let r = 0; r < linhas.length; r++) {
      if (linhas[r][COL.MODELO.ID] === id) {
        aba_(CFG.ABA_MODELOS).deleteRow(r + 2);
        return;
      }
    }
    throw new Error('Modelo não encontrado.');
  });
  return { ok: true, modelos: listarModelos_() };
}

/**
 * Cria um cliente e copia os itens do modelo para a aba Estado. A cópia é o que torna a
 * lista do cliente imutável: editar ou excluir o modelo depois não a altera.
 */
function criarCliente(token, nome, modeloId) {
  exigirAdmin_(token);
  nome = String(nome || '').trim().slice(0, 200);
  if (!nome) throw new Error('Informe o nome do cliente.');
  const modelo = resolverModelo_(modeloId);

  const clienteId = novoId_('c');
  const linhasDeEstado = modelo.itens.map(function (it, i) {
    return [clienteId, clienteId + '-i' + i, it.grupo, it.sub || '', it.label, it.obs || '',
            STATUS_PENDENTE, '', '', ''];
  });

  // A pasta nasce dentro do lock: se ele não for obtido, não sobra pasta órfã no Drive.
  const pastaId = comLock_(function () {
    const pasta = pastaMae_().createFolder(limparNomeDeArquivo_(nome) + ' [' + clienteId.slice(0, 9) + ']');
    aba_(CFG.ABA_CLIENTES).appendRow([clienteId, nome, modeloId, modelo.nome, pasta.getId(), agora_()]);
    if (linhasDeEstado.length) {
      const estado = aba_(CFG.ABA_ESTADO);
      estado.getRange(estado.getLastRow() + 1, 1, linhasDeEstado.length, linhasDeEstado[0].length)
        .setValues(linhasDeEstado);
    }
    return pasta.getId();
  });

  return {
    ok: true,
    clienteId: clienteId,
    url: linkDoCliente_(clienteId),
    pastaUrl: linkDaPasta_(pastaId),
    clientes: listarClientes_(),
  };
}

/**
 * Exclui um cliente: apaga as linhas dele em Clientes e Estado e manda a pasta do Drive
 * para a lixeira (recuperável por cerca de 30 dias; não é exclusão permanente).
 */
function excluirCliente(token, clienteId) {
  exigirAdmin_(token);
  let pastaId = '';

  comLock_(function () {
    const clientes = linhasDaAba_(CFG.ABA_CLIENTES);
    let linhaDoCliente = -1;
    for (let r = 0; r < clientes.length; r++) {
      if (clientes[r][COL.CLIENTE.ID] === clienteId) {
        linhaDoCliente = r + 2;
        pastaId = clientes[r][COL.CLIENTE.PASTA_ID];
        break;
      }
    }
    if (linhaDoCliente === -1) throw new Error('Cliente não encontrado.');

    // De baixo para cima, para a exclusão de uma linha não deslocar as seguintes.
    const estado = aba_(CFG.ABA_ESTADO);
    const linhas = linhasDaAba_(CFG.ABA_ESTADO);
    for (let r = linhas.length - 1; r >= 0; r--) {
      if (linhas[r][COL.ESTADO.CLIENTE_ID] === clienteId) estado.deleteRow(r + 2);
    }
    aba_(CFG.ABA_CLIENTES).deleteRow(linhaDoCliente);
  });

  let aviso = '';
  try {
    if (pastaId) DriveApp.getFolderById(pastaId).setTrashed(true);
  } catch (e) {
    aviso = 'Registros removidos, mas a pasta não pôde ser enviada para a lixeira.';
  }
  return { ok: true, aviso: aviso, clientes: listarClientes_() };
}

/** Define a URL de publicação (/exec) usada para montar os links dos clientes. */
function salvarUrlDoApp(token, url) {
  exigirAdmin_(token);
  url = String(url || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (url && !/^https:\/\/[\w.~:\/-]+$/.test(url)) throw new Error('URL inválida: use o endereço https do app.');
  PropertiesService.getScriptProperties().setProperty(CFG.PROP_URL_APP, url);
  return { ok: true, appUrl: url };
}
