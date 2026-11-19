'use strict';
/**
 * A página de verdade, renderizada com o que o servidor manda em cada modo.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, plano, renderizar, compilarScripts } = require('./harness');

function paginaDe(amb, parametros) {
  amb.gs.doGet({ parameter: parametros });
  const pagina = amb.paginas[amb.paginas.length - 1];
  return renderizar('Index.html', { modo: pagina.modo, dadosJson: pagina.dadosJson });
}

test('os três modos renderizam e o script da página compila em todos', () => {
  const amb = criarAmbiente();
  const token = amb.configurar();
  const { clienteId } = plano(amb.gs.criarCliente(token, 'Padaria Aurora', 'onboarding'));
  for (const parametros of [{}, { cli: clienteId }, { admin: token }]) {
    const html = paginaDe(amb, parametros);
    assert.equal(compilarScripts(html), 1);
    assert.ok(!html.includes('<?'), 'sobrou scriptlet sem renderizar');
  }
});

test('nome de cliente com "</script>" não fecha o script da página', () => {
  const amb = criarAmbiente();
  const token = amb.configurar();
  const nome = 'Bar </script><script>alert(1)</script>';
  const { clienteId } = plano(amb.gs.criarCliente(token, nome, 'rotina'));
  for (const parametros of [{ cli: clienteId }, { admin: token }]) {
    const html = paginaDe(amb, parametros);
    assert.equal(compilarScripts(html), 1, 'um script só: o nome não abriu outro');
    assert.ok(!html.includes('alert(1)</script>'));
  }
});

test('a página não carrega marca fixa: o nome do escritório vem da configuração', () => {
  const amb = criarAmbiente();
  const token = amb.configurar();
  const html = paginaDe(amb, { admin: token });
  assert.ok(html.includes('"nome":"Escritório Exemplo"'));
  assert.ok(html.includes('MARCA.nome'));
});
