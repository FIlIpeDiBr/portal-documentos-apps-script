/**
 * Modelos de lista: quais documentos se espera de um cliente.
 *
 * Há dois modelos embutidos (abaixo) e modelos personalizados, criados pela equipe e
 * guardados na aba Modelos. Todo modelo se resolve na mesma forma plana:
 *   [{ grupo, sub, label, obs }]
 */

const MODELO_ONBOARDING = [
  { titulo: '1. DOCUMENTOS DA EMPRESA', itens: [
    { label: 'Contrato social e última alteração consolidada' },
    { label: 'Cartão CNPJ' },
    { label: 'Inscrição estadual e municipal', obs: 'se houver' },
    { label: 'Alvará de funcionamento' },
    { label: 'Certificado digital da empresa (e-CNPJ)', obs: 'A1 ou A3' },
  ]},
  { titulo: '2. SÓCIOS E ADMINISTRADORES', itens: [
    { label: 'Documento de identidade e CPF dos sócios' },
    { label: 'Comprovante de endereço dos sócios' },
    { label: 'Última declaração de IRPF dos sócios', obs: 'com recibo de entrega' },
  ]},
  { titulo: '3. FISCAL E CONTÁBIL', sub: [
    { subheader: 'Exercício anterior:', itens: [
      { label: 'Balanço patrimonial e DRE do último exercício' },
      { label: 'Balancete do último mês fechado' },
    ]},
    { subheader: 'Obrigações entregues:', itens: [
      { label: 'Recibos das últimas declarações acessórias', obs: 'ECD, ECF, DEFIS ou equivalentes' },
      { label: 'Extrato de parcelamentos em aberto', obs: 'se houver' },
    ]},
  ]},
  { titulo: '4. FINANCEIRO', itens: [
    { label: 'Extratos bancários dos últimos 3 meses', obs: 'todas as contas, em PDF e OFX' },
    { label: 'Contratos de empréstimo e financiamento vigentes' },
    { label: 'Relação de contas a pagar e a receber' },
  ]},
  { titulo: '5. PESSOAL', itens: [
    { label: 'Relação de funcionários com cargo, salário e data de admissão' },
    { label: 'Últimas 3 folhas de pagamento' },
    { label: 'Guias de FGTS e INSS dos últimos 3 meses' },
  ]},
  { titulo: '6. ACESSOS', itens: [
    { label: 'Procuração eletrônica no e-CAC' },
    { label: 'Acesso ao sistema emissor de notas fiscais', obs: 'usuário de consulta ou convite' },
  ]},
];

const MODELO_ROTINA = [
  'Extratos de todas as contas bancárias (PDF e OFX)',
  'Extratos das aplicações financeiras',
  'Faturas dos cartões de crédito da empresa',
  'Contas de consumo (água, energia, telefone, internet)',
  'Movimento do caixa em espécie',
  'Posição de estoque no fim do mês (se houver)',
  'Relatório de contas pagas e a pagar (PDF ou XLS)',
  'Relatório de valores recebidos e a receber (PDF ou XLS)',
  'Relatório de recebimentos por máquina de cartão (se houver)',
  'Contratos novos de aluguel, veículos, máquinas e equipamentos',
  'Demais contratos assinados no mês',
];

const PREFIXO_PERSONALIZADO = 'custom:';

function itensOnboarding_() {
  const itens = [];
  MODELO_ONBOARDING.forEach(function (bloco) {
    (bloco.itens || []).forEach(function (it) {
      itens.push({ grupo: bloco.titulo, sub: '', label: it.label, obs: it.obs || '' });
    });
    (bloco.sub || []).forEach(function (secao) {
      secao.itens.forEach(function (it) {
        itens.push({ grupo: bloco.titulo, sub: secao.subheader, label: it.label, obs: it.obs || '' });
      });
    });
  });
  return itens;
}

function itensRotina_() {
  return MODELO_ROTINA.map(function (label) {
    return { grupo: 'DOCUMENTOS DE ROTINA (MENSAL)', sub: '', label: label, obs: '' };
  });
}

/** Texto de um modelo personalizado → itens. Um documento por linha; "# Título" abre um grupo. */
function interpretarTextoModelo_(texto) {
  const itens = [];
  let grupo = 'DOCUMENTOS ESPERADOS';
  String(texto || '').split(/\r?\n/).forEach(function (linha) {
    const l = linha.trim();
    if (!l) return;
    if (l.charAt(0) === '#') {
      grupo = l.replace(/^#+\s*/, '').trim() || grupo;
      return;
    }
    itens.push({ grupo: grupo, sub: '', label: l.slice(0, 300), obs: '' });
  });
  return itens;
}

function ehPersonalizado_(modeloId) {
  return String(modeloId || '').indexOf(PREFIXO_PERSONALIZADO) === 0;
}

/** modeloId ('onboarding' | 'rotina' | 'custom:<id>') → { nome, itens }. Lança se não existir. */
function resolverModelo_(modeloId) {
  if (modeloId === 'onboarding') return { nome: 'Onboarding', itens: itensOnboarding_() };
  if (modeloId === 'rotina') return { nome: 'Rotina (mensal)', itens: itensRotina_() };
  if (ehPersonalizado_(modeloId)) {
    const id = modeloId.substring(PREFIXO_PERSONALIZADO.length);
    const linhas = linhasDaAba_(CFG.ABA_MODELOS);
    for (let r = 0; r < linhas.length; r++) {
      if (linhas[r][COL.MODELO.ID] === id) {
        return {
          nome: linhas[r][COL.MODELO.NOME],
          itens: JSON.parse(linhas[r][COL.MODELO.ITENS_JSON] || '[]'),
        };
      }
    }
  }
  throw new Error('Modelo não encontrado.');
}

/** Embutidos + personalizados, para o seletor do painel da equipe. */
function listarModelos_() {
  const modelos = [
    { id: 'onboarding', nome: 'Onboarding', tipo: 'Embutido', qtd: itensOnboarding_().length },
    { id: 'rotina', nome: 'Rotina (mensal)', tipo: 'Embutido', qtd: MODELO_ROTINA.length },
  ];
  linhasDaAba_(CFG.ABA_MODELOS).forEach(function (linha) {
    if (!linha[COL.MODELO.ID]) return;
    let qtd = 0;
    try { qtd = JSON.parse(linha[COL.MODELO.ITENS_JSON] || '[]').length; } catch (e) { qtd = 0; }
    modelos.push({
      id: PREFIXO_PERSONALIZADO + linha[COL.MODELO.ID],
      nome: linha[COL.MODELO.NOME], tipo: 'Personalizado', qtd: qtd,
    });
  });
  return modelos;
}
