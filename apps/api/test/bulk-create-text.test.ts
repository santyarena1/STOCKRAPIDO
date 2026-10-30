import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseBulkCreateText,
  scoreCatalogNameMatch,
} from '../src/products/bulk-create-text';

describe('parseBulkCreateText', () => {
  it('formato principal: producto;cantidad;costo', () => {
    const text = `producto;cantidad;costo
Coca;24;1500
Alfajor;10;800`;
    const result = parseBulkCreateText(text);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].name, 'Coca');
    assert.equal(result.rows[0].stock, 24);
    assert.equal(result.rows[0].cost, 1500);
    assert.equal(result.rows[0].price, 0);
    assert.equal(result.rows[1].name, 'Alfajor');
    assert.equal(result.rows[1].stock, 10);
    assert.equal(result.rows[1].cost, 800);
    assert.equal(result.rows[1].price, 0);
  });

  it('sin encabezado: nombre;cantidad;costo', () => {
    const result = parseBulkCreateText('Gaseosa;5;1200');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, 'Gaseosa');
    assert.equal(result.rows[0].stock, 5);
    assert.equal(result.rows[0].cost, 1200);
    assert.equal(result.rows[0].price, 0);
  });

  it('dos columnas: nombre;costo', () => {
    const result = parseBulkCreateText('Item;12,50');
    assert.equal(result.rows[0]?.cost, 12.5);
    assert.equal(result.rows[0]?.price, 0);
    assert.equal(result.rows[0]?.stock, undefined);
  });

  it('reporta costo inválido', () => {
    const result = parseBulkCreateText('producto;cantidad;costo\nAlgo;2;abc');
    assert.equal(result.rows.length, 0);
    assert.ok(result.errors.some((e) => /Costo unitario inválido/i.test(e.message)));
  });

  it('tolera CSV con comas y ; al final de cada línea (costo)', () => {
    const text = `Bombón Bon o Bon Blanco 40g,4,733;
Bombón Bon o Bon Negro 40g,4,733;
Bizcocho Don Satur Grasa 200g,2,1000;`;
    const result = parseBulkCreateText(text);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0].name, 'Bombón Bon o Bon Blanco 40g');
    assert.equal(result.rows[0].stock, 4);
    assert.equal(result.rows[0].cost, 733);
    assert.equal(result.rows[0].price, 0);
    assert.equal(result.rows[2].cost, 1000);
  });

  it('encabezado "precio" se interpreta como costo', () => {
    const text = `producto;cantidad;precio
Coca;24;1500`;
    const result = parseBulkCreateText(text);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.rows[0].cost, 1500);
    assert.equal(result.rows[0].price, 0);
  });

  it('lista real con repetidos: parsea todas las filas como costo', () => {
    const text = `Bombón Bon o Bon Blanco 40g,4,733;
Alfajor Milka Tri Mousse Blanco 55g,3,1329;
Alfajor Milka Tri Mousse Blanco 55g,3,1329;
Snack Saladix Dúo 33g,6,601;
Snack Saladix Dúo 33g,6,601;
Chocolate Sapito Chocolatosos,24,231;
Caramelos Menthoplus Manzana,12,597;`;
    const result = parseBulkCreateText(text);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.rows.length, 7);
    assert.equal(result.rows[5].name, 'Chocolate Sapito Chocolatosos');
    assert.equal(result.rows[5].stock, 24);
    assert.equal(result.rows[5].cost, 231);
    assert.equal(result.rows[5].price, 0);
  });
});

describe('scoreCatalogNameMatch', () => {
  it('match exacto e insensible a mayúsculas/acentos', () => {
    assert.equal(scoreCatalogNameMatch('Coca Cola', 'coca cola'), 100);
  });

  it('match parcial por tokens', () => {
    const score = scoreCatalogNameMatch('coca 500', 'Coca Cola 500ml');
    assert.ok(score >= 55, `score=${score}`);
  });

  it('no matchea cosas distintas', () => {
    assert.ok(scoreCatalogNameMatch('alfajor', 'Gaseosa Sprite') < 55);
  });
});
