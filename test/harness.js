'use strict';
/**
 * Carrega os arquivos .gs de src/ em um contexto isolado do Node, do mesmo jeito que o
 * Apps Script faz: todos os arquivos compartilham o escopo global. Os serviços do Google
 * (planilha, Drive, propriedades, lock, HTTP) são dublês em memória.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SRC = path.join(__dirname, '..', 'src');

/** Avalia uma expressão no escopo global do projeto (para ler constantes `const`). */
function avaliar(contexto, expressao) {
  return vm.runInContext(expressao, contexto);
}

/** Objetos criados dentro do contexto têm outro Object.prototype; isto os traz para o do teste. */
function plano(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

class Aba {
  constructor(nome) { this.nome = nome; this.linhas = []; }
  setName(nome) { this.nome = nome; return this; }
  getDataRange() { return { getValues: () => this.linhas.map((l) => l.slice()) }; }
  appendRow(linha) { this.linhas.push(linha.slice()); }
  deleteRow(n) { this.linhas.splice(n - 1, 1); }
  getLastRow() { return this.linhas.length; }
  setFrozenRows() {}
  getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
    const aba = this;
    const intervalo = {
      setValues(valores) {
        for (let i = 0; i < nLinhas; i++) {
          while (aba.linhas.length < linha + i) aba.linhas.push([]);
          for (let j = 0; j < nColunas; j++) aba.linhas[linha - 1 + i][coluna - 1 + j] = valores[i][j];
        }
        return intervalo;
      },
      setFontWeight() { return intervalo; },
    };
    return intervalo;
  }
}

class Planilha {
  constructor(id, nome) { this.id = id; this.nome = nome; this.abas = [new Aba('Página1')]; }
  getId() { return this.id; }
  getActiveSheet() { return this.abas[0]; }
  insertSheet(nome) { const aba = new Aba(nome); this.abas.push(aba); return aba; }
  getSheetByName(nome) { return this.abas.find((a) => a.nome === nome) || null; }
}

class Pasta {
  constructor(drive, nome) {
    this.drive = drive; this.id = 'pasta' + (++drive.sequencia); this.nome = nome;
    this.arquivos = []; this.subpastas = []; this.naLixeira = false;
    drive.pastas[this.id] = this;
  }
  getId() { return this.id; }
  getName() { return this.nome; }
  getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
  createFolder(nome) { const p = new Pasta(this.drive, nome); this.subpastas.push(p); return p; }
  createFile(blob) {
    const arquivo = { ...blob, id: 'arq' + (++this.drive.sequencia) };
    this.arquivos.push(arquivo);
    return { getUrl: () => 'https://drive.google.com/file/d/' + arquivo.id + '/view' };
  }
  setTrashed(valor) { this.naLixeira = valor; }
  getFolders() {
    let i = 0;
    return { hasNext: () => i < this.subpastas.length, next: () => this.subpastas[i++] };
  }
}

/**
 * Monta o projeto com todos os dublês e devolve as peças para o teste inspecionar.
 * `respostasDaIa` é a fila de respostas do UrlFetchApp ({ code, body }).
 */
function criarAmbiente({ propriedades = {}, respostasDaIa = [], lockLivre = true } = {}) {
  const props = { ...propriedades };
  const planilhas = {};
  const drive = { pastas: {}, sequencia: 0 };
  const logs = [];
  const requisicoes = [];
  const paginas = [];
  const fila = respostasDaIa.slice();
  const lock = { livre: lockLivre, pegos: 0, soltos: 0 };
  let relogio = 0;

  const servicos = {
    console,
    Logger: { log: (m) => logs.push(String(m)) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
      }),
    },
    SpreadsheetApp: {
      create(nome) {
        const ss = new Planilha('planilha' + (Object.keys(planilhas).length + 1), nome);
        planilhas[ss.id] = ss;
        return ss;
      },
      openById(id) {
        if (!planilhas[id]) throw new Error('planilha inexistente: ' + id);
        return planilhas[id];
      },
    },
    DriveApp: {
      createFolder: (nome) => new Pasta(drive, nome),
      getFolderById(id) {
        if (!drive.pastas[id]) throw new Error('pasta inexistente: ' + id);
        return drive.pastas[id];
      },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (lock.livre) lock.pegos++; return lock.livre; },
        releaseLock: () => { lock.soltos++; },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: (texto) => Array.from(Buffer.from(texto, 'base64')),
      newBlob: (bytes, mime, nome) => ({ bytes, mime, nome }),
      // Um minuto a mais a cada chamada, para os carimbos serem distinguíveis.
      formatDate: () => '01/03/2026 10:' + String(relogio++ % 60).padStart(2, '0'),
    },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TESTE/exec' }) },
    HtmlService: {
      createTemplateFromFile(arquivo) {
        const pagina = { arquivo };
        pagina.evaluate = () => {
          const saida = { setTitle: (t) => { pagina.titulo = t; return saida; }, addMetaTag: () => saida };
          paginas.push(pagina);
          return saida;
        };
        return pagina;
      },
    },
    UrlFetchApp: {
      fetch(url, opcoes) {
        requisicoes.push({ url, ...opcoes });
        const r = fila.shift();
        if (!r) throw new Error('teste: nenhuma resposta da IA na fila');
        return {
          getResponseCode: () => r.code || 200,
          getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
        };
      },
    },
  };

  const gs = vm.createContext(servicos);
  for (const arquivo of fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(SRC, arquivo), 'utf8'), gs, { filename: arquivo });
  }

  const ambiente = {
    gs, props, planilhas, drive, logs, requisicoes, paginas, lock,
    aba: (nome) => Object.values(planilhas)[0].getSheetByName(nome),
    /** Roda a configuração inicial e devolve o token de admin gerado. */
    configurar() {
      gs.inicializar();
      props.GEMINI_API_KEY = 'chave-de-teste';
      return props.ADMIN_TOKEN;
    },
    /** Abre uma URL do web app e devolve { modo, dados } como a página os receberia. */
    abrir(parametros) {
      gs.doGet({ parameter: parametros });
      const pagina = paginas[paginas.length - 1];
      return { modo: pagina.modo, dados: JSON.parse(pagina.dadosJson), bruto: pagina.dadosJson };
    },
  };
  return ambiente;
}

/** Resposta no formato do generateContent do Gemini com as sugestões dadas. */
function respostaDaIa(itens) {
  return { body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ itens }) }] } }] } };
}

function arquivoBase64(texto) {
  return Buffer.from(texto).toString('base64');
}

/**
 * Renderiza um template .html do projeto como o HtmlService faria: `<? código ?>` executa,
 * `<?= x ?>` imprime com escape de HTML e `<?!= x ?>` imprime como está. Serve para os
 * testes pegarem variável inexistente, laço mal fechado e erro de sintaxe na página.
 */
function renderizar(arquivo, variaveis) {
  const fonte = fs.readFileSync(path.join(SRC, arquivo), 'utf8');
  const escapar = (v) => String(v == null ? '' : v).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let js = 'const __saida = [];\n';
  let pos = 0;
  for (const m of fonte.matchAll(/<[?](!=|=)?([^]*?)[?]>/g)) {
    js += '__saida.push(' + JSON.stringify(fonte.slice(pos, m.index)) + ');\n';
    if (m[1] === '=') js += '__saida.push(__escapar(' + m[2] + '));\n';
    else if (m[1] === '!=') js += '__saida.push(String(' + m[2] + '));\n';
    else js += m[2] + '\n';
    pos = m.index + m[0].length;
  }
  js += '__saida.push(' + JSON.stringify(fonte.slice(pos)) + ');\nreturn __saida.join("");';
  return new Function('__escapar', ...Object.keys(variaveis), js)(escapar, ...Object.values(variaveis));
}

/** Compila os <script> da página já renderizada; lança SyntaxError se algum estiver quebrado. */
function compilarScripts(html) {
  const blocos = [...html.matchAll(/<script>([^]*?)<[/]script>/g)].map((m) => m[1]);
  blocos.forEach((codigo) => new vm.Script(codigo));
  return blocos.length;
}

module.exports = {
  SRC, avaliar, plano, criarAmbiente, respostaDaIa, arquivoBase64, renderizar, compilarScripts,
};
