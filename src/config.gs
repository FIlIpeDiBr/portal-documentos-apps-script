/**
 * Portal de Documentos — configuração.
 *
 * Web app com duas telas na mesma implantação:
 *   - painel do cliente:  URL?cli=<id do cliente>   (link individual, sem login)
 *   - painel da equipe:   URL?admin=<token>         (token guardado nas propriedades do script)
 *
 * Tudo o que identifica o escritório fica em MARCA; nada disso está espalhado pelo código.
 */

const MARCA = {
  nome: 'Escritório Exemplo',
  descricao: 'Contabilidade e assessoria',
  contato: 'contato@exemplo.com.br',
};

const CFG = {
  MODELO_IA_PADRAO: 'gemini-2.5-flash',
  CONFIANCA_MINIMA: 0.6,
  // Acima disto o arquivo é guardado, mas a IA classifica só pelo nome.
  LIMITE_CONTEUDO_IA: 15 * 1024 * 1024,
  // Acima disto o upload é recusado.
  LIMITE_UPLOAD: 25 * 1024 * 1024,
  TAMANHO_MAXIMO_NOME: 180,
  ESPERA_LOCK_MS: 20000,

  PROP_API_KEY: 'GEMINI_API_KEY',
  PROP_MODELO_IA: 'GEMINI_MODELO',
  PROP_PASTA_MAE: 'DRIVE_PARENT_FOLDER_ID',
  PROP_PLANILHA: 'CONTROLE_SHEET_ID',
  PROP_TOKEN_ADMIN: 'ADMIN_TOKEN',
  PROP_URL_APP: 'APP_URL',

  ABA_CLIENTES: 'Clientes',
  ABA_MODELOS: 'Modelos',
  ABA_ESTADO: 'Estado',
};

/** Colunas (base 0) de cada aba, para o código não depender de números soltos. */
const COL = {
  CLIENTE: { ID: 0, NOME: 1, MODELO_ID: 2, MODELO_NOME: 3, PASTA_ID: 4, CRIADO_EM: 5 },
  MODELO: { ID: 0, NOME: 1, ITENS_JSON: 2, CRIADO_EM: 3 },
  ESTADO: {
    CLIENTE_ID: 0, ITEM_ID: 1, GRUPO: 2, SUB: 3, ITEM: 4, OBS: 5,
    STATUS: 6, ARQUIVOS: 7, LINKS: 8, ATUALIZADO: 9,
  },
};

const STATUS_PENDENTE = 'Pendente';
const STATUS_ENTREGUE = 'Entregue';

function propriedade_(chave) {
  return PropertiesService.getScriptProperties().getProperty(chave);
}
