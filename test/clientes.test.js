'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, plano } = require('./harness');

function preparar() {
  const amb = criarAmbiente();
  const token = amb.configurar();
  return { amb, token, gs: amb.gs };
}

test('criar cliente copia os itens do modelo para a aba Estado, todos pendentes', () => {
  const { amb, token, gs } = preparar();
  const r = plano(gs.criarCliente(token, '  Padaria Aurora  ', 'onboarding'));

  assert.match(r.clienteId, /^c[0-9a-f]{32}$/);
  assert.equal(r.url, 'https://script.google.com/macros/s/TESTE/exec?cli=' + r.clienteId);
  const estado = amb.aba('Estado').linhas.slice(1);
  assert.equal(estado.length, 20);
  assert.ok(estado.every((l) => l[0] === r.clienteId && l[6] === 'Pendente'));
  assert.equal(new Set(estado.map((l) => l[1])).size, 20, 'ids de item únicos');
  assert.deepEqual(plano(amb.aba('Clientes').linhas[1]).slice(0, 4), [r.clienteId, 'Padaria Aurora', 'onboarding', 'Onboarding']);
  // A subpasta fica dentro da pasta-mãe e não carrega o id inteiro (que é a credencial).
  const [subpasta] = amb.drive.pastas[amb.props.DRIVE_PARENT_FOLDER_ID].subpastas;
  assert.match(subpasta.nome, /^Padaria Aurora \[c[0-9a-f]{8}\]$/);
});

test('a lista do cliente não muda quando o modelo é excluído depois', () => {
  const { amb, token, gs } = preparar();
  const modelo = plano(gs.criarModelo(token, 'Abertura de MEI', '# Pessoais\nCPF e RG\nComprovante de endereço\n\n# Empresa\nCCMEI'));
  const { clienteId } = plano(gs.criarCliente(token, 'Ateliê Cora', modelo.id));
  gs.excluirModelo(token, modelo.id);

  const { dados } = amb.abrir({ cli: clienteId });
  assert.deepEqual(dados.itens.map((i) => [i.grupo, i.label]), [
    ['Pessoais', 'CPF e RG'], ['Pessoais', 'Comprovante de endereço'], ['Empresa', 'CCMEI'],
  ]);
  assert.equal(dados.cliente.modeloNome, 'Abertura de MEI');
  assert.throws(() => gs.criarCliente(token, 'Outro', modelo.id), /Modelo não encontrado/);
});

test('modelos embutidos não podem ser excluídos; modelo vazio ou sem nome é recusado', () => {
  const { token, gs } = preparar();
  assert.throws(() => gs.excluirModelo(token, 'onboarding'), /Apenas modelos personalizados/);
  assert.throws(() => gs.excluirModelo(token, 'custom:naoexiste'), /Modelo não encontrado/);
  assert.throws(() => gs.criarModelo(token, '', 'CPF'), /Informe um nome/);
  assert.throws(() => gs.criarModelo(token, 'Só títulos', '# Grupo\n\n# Outro'), /lista está vazia/);
  assert.throws(() => gs.criarCliente(token, '   ', 'rotina'), /Informe o nome/);
});

test('o painel lista os clientes do mais novo para o mais antigo, com o progresso', () => {
  const { amb, token, gs } = preparar();
  gs.criarCliente(token, 'Primeiro', 'rotina');
  gs.criarCliente(token, 'Segundo', 'rotina');
  const terceiro = plano(gs.criarCliente(token, 'Terceiro', 'rotina'));

  assert.deepEqual(terceiro.clientes.map((c) => c.nome), ['Terceiro', 'Segundo', 'Primeiro']);
  assert.deepEqual(terceiro.clientes.map((c) => [c.entregues, c.total]), [[0, 11], [0, 11], [0, 11]]);
  const painel = amb.abrir({ admin: token }).dados;
  assert.deepEqual(painel.modelos.map((m) => [m.id, m.qtd]), [['onboarding', 20], ['rotina', 11]]);
  assert.equal(painel.clientes.length, 3);
});

test('excluir cliente apaga só as linhas dele e manda a pasta para a lixeira', () => {
  const { amb, token, gs } = preparar();
  const a = plano(gs.criarCliente(token, 'Fica', 'rotina'));
  const b = plano(gs.criarCliente(token, 'Sai', 'onboarding'));
  const c = plano(gs.criarCliente(token, 'Fica também', 'rotina'));

  const r = plano(gs.excluirCliente(token, b.clienteId));
  assert.deepEqual(r.clientes.map((x) => x.nome), ['Fica também', 'Fica']);
  const donos = amb.aba('Estado').linhas.slice(1).map((l) => l[0]);
  assert.equal(donos.length, 22);
  assert.ok(donos.every((id) => id === a.clienteId || id === c.clienteId));
  const pastas = amb.drive.pastas[amb.props.DRIVE_PARENT_FOLDER_ID].subpastas;
  assert.deepEqual(pastas.map((p) => [p.nome.split(' [')[0], p.naLixeira]), [['Fica', false], ['Sai', true], ['Fica também', false]]);
  assert.equal(amb.abrir({ cli: b.clienteId }).modo, 'restrito');
  assert.throws(() => gs.excluirCliente(token, b.clienteId), /Cliente não encontrado/);
});

test('toda gravação pega e solta o lock; com o lock ocupado, nada é gravado', () => {
  const { amb, token, gs } = preparar();
  const antes = amb.lock.pegos;
  gs.criarCliente(token, 'Com lock', 'rotina');
  assert.equal(amb.lock.pegos, antes + 1);
  assert.equal(amb.lock.soltos, amb.lock.pegos);

  amb.lock.livre = false;
  const linhas = amb.aba('Clientes').linhas.length;
  assert.throws(() => gs.criarCliente(token, 'Sem lock', 'rotina'), /ocupado/);
  assert.throws(() => gs.criarModelo(token, 'M', 'item'), /ocupado/);
  assert.equal(amb.aba('Clientes').linhas.length, linhas);
  assert.equal(amb.drive.pastas[amb.props.DRIVE_PARENT_FOLDER_ID].subpastas.length, 1, 'sem pasta órfã');
});

test('a URL do app aceita só https sem aspas nem espaços, e some com a query', () => {
  const { amb, token, gs } = preparar();
  assert.equal(plano(gs.salvarUrlDoApp(token, ' https://script.google.com/macros/s/ABC/exec?x=1 ')).appUrl,
    'https://script.google.com/macros/s/ABC/exec');
  assert.equal(amb.props.APP_URL, 'https://script.google.com/macros/s/ABC/exec');
  for (const ruim of ['http://exemplo.com', 'javascript:alert(1)', "https://x/'onmouseover='y", 'https://a b']) {
    assert.throws(() => gs.salvarUrlDoApp(token, ruim), /URL inválida/, ruim);
  }
  const { url } = plano(gs.criarCliente(token, 'Link', 'rotina'));
  assert.ok(url.startsWith('https://script.google.com/macros/s/ABC/exec?cli=c'));
});
