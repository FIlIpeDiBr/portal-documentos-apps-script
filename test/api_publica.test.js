'use strict';
/**
 * No Apps Script, toda função global sem "_" no fim pode ser chamada pelo navegador de
 * quem abre o web app (google.script.run.nome()), inclusive de quem só tem um link de
 * cliente. Estes testes tratam essa lista como a API pública e vigiam o que entra nela.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, criarAmbiente, plano } = require('./harness');

const PUBLICAS = [
  'criarCliente', 'criarModelo', 'diagnostico', 'doGet', 'enviarArquivo',
  'excluirCliente', 'excluirModelo', 'inicializar', 'salvarUrlDoApp',
];
const EXIGEM_TOKEN = ['criarCliente', 'criarModelo', 'excluirCliente', 'excluirModelo', 'salvarUrlDoApp'];

function publicasDe(gs) {
  return Object.keys(gs).filter((n) => typeof gs[n] === 'function' && !n.endsWith('_')).sort();
}

test('a API pública é exatamente a lista esperada', () => {
  const { gs } = criarAmbiente();
  assert.deepEqual(publicasDe(gs), PUBLICAS);
});

test('toda função que a página chama existe no servidor e é pública', () => {
  const html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const chamadas = new Set();
  for (const trecho of html.split('google.script.run').slice(1)) {
    // google.script.run.withXxxHandler(function(){...}).withYyy(...).nomeDaFuncao(
    const nomes = [...trecho.matchAll(/\.\s*([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1]);
    const alvo = nomes.find((n) => PUBLICAS.includes(n));
    assert.ok(alvo, 'chamada a google.script.run sem função conhecida: ' + trecho.slice(0, 80));
    chamadas.add(alvo);
  }
  assert.deepEqual([...chamadas].sort(), ['criarCliente', 'criarModelo', 'enviarArquivo',
    'excluirCliente', 'excluirModelo', 'salvarUrlDoApp']);
});

test('inicializar e diagnostico não devolvem nada a quem chama: o token só vai para o log', () => {
  const amb = criarAmbiente();
  assert.equal(amb.gs.inicializar(), undefined);
  assert.equal(amb.gs.diagnostico(), undefined);
  const token = amb.props.ADMIN_TOKEN;
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.ok(amb.logs.some((l) => l.includes(token)), 'o token deveria estar no log de execução');
});

test('inicializar pode rodar de novo sem trocar o token nem recriar pasta e planilha', () => {
  const amb = criarAmbiente();
  amb.gs.inicializar();
  const antes = { ...amb.props };
  amb.gs.inicializar();
  assert.deepEqual(amb.props, antes);
  assert.equal(Object.keys(amb.planilhas).length, 1);
  assert.equal(Object.keys(amb.drive.pastas).length, 1);
});

test('sem o token certo, nenhuma função da equipe executa nem altera a planilha', () => {
  const amb = criarAmbiente();
  amb.configurar();
  const antes = JSON.stringify([amb.planilhas, amb.props]);
  for (const nome of EXIGEM_TOKEN) {
    for (const token of [undefined, null, '', 'errado', amb.props.ADMIN_TOKEN + 'x', amb.props.ADMIN_TOKEN.slice(1)]) {
      assert.throws(() => amb.gs[nome](token, 'Cliente X', 'onboarding'), /Acesso negado/, `${nome}(${token})`);
    }
  }
  assert.equal(JSON.stringify([amb.planilhas, amb.props]), antes);
});

test('sem token configurado, token vazio não passa', () => {
  const amb = criarAmbiente();
  amb.configurar();
  delete amb.props.ADMIN_TOKEN;
  for (const token of ['', undefined, null]) {
    assert.throws(() => amb.gs.criarCliente(token, 'X', 'rotina'), /Acesso negado/);
  }
  assert.equal(amb.abrir({ admin: '' }).modo, 'restrito');
});

test('o painel da equipe só abre com o token; o do cliente não recebe nada da equipe', () => {
  const amb = criarAmbiente();
  const token = amb.configurar();
  const { clienteId } = plano(amb.gs.criarCliente(token, 'Padaria Aurora', 'rotina'));
  plano(amb.gs.criarCliente(token, 'Oficina Brasa', 'rotina'));

  assert.equal(amb.abrir({}).modo, 'restrito');
  assert.equal(amb.abrir({ admin: 'errado' }).modo, 'restrito');
  assert.equal(amb.abrir({ admin: token }).modo, 'admin');

  const cliente = amb.abrir({ cli: clienteId });
  assert.equal(cliente.modo, 'cliente');
  assert.deepEqual(Object.keys(cliente.dados).sort(), ['cliente', 'estado', 'itens', 'limiteUpload', 'marca']);
  assert.ok(!cliente.bruto.includes(token), 'a página do cliente não pode conter o token');
  assert.ok(!cliente.bruto.includes('Oficina Brasa'), 'nem dados de outro cliente');
  assert.ok(!/pasta\d/.test(cliente.bruto), 'nem o id da pasta no Drive');
});

test('id de cliente inexistente ou fora do formato cai na tela restrita', () => {
  const amb = criarAmbiente();
  const token = amb.configurar();
  amb.gs.criarCliente(token, 'Padaria Aurora', 'rotina');
  for (const cli of ['c' + '0'.repeat(32), 'abc', '../x', 'c123', 'onboarding']) {
    assert.equal(amb.abrir({ cli }).modo, 'restrito', cli);
  }
});
