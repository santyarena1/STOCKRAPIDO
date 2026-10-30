import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseBulkCreateText,
  scoreCatalogNameMatch,
} from '../src/products/bulk-create-text';

describe('parseBulkCreateText', () => {
  it('formato principal: producto;cantidad;precio', () => {
    const text = `producto;cantidad;precio
Coca;24;1500
Alfajor;10;800`;
    const result = parseBulkCreateText(text);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].name, 'Coca');
    assert.equal(result.rows[0].stock, 24);
    assert.equal(result.rows[0].price, 1500);
    assert.equal(result.rows[1].name, 'Alfajor');
    assert.equal(result.rows[1].stock, 10);
    assert.equal(result.rows[1].price, 800);
  });

  it('sin encabezado: nombre;cantidad;precio', () => {
    const result = parseBulkCreateText('Gaseosa;5;1200');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, 'Gaseosa');
    assert.equal(result.rows[0].stock, 5);
    assert.equal(result.rows[0].price, 1200);
  });

  it('dos columnas: nombre;precio', () => {
    const result = parseBulkCreateText('Item;12,50');
    assert.equal(result.rows[0]?.price, 12.5);
    assert.equal(result.rows[0]?.stock, undefined);
  });

  it('reporta precio inválido', () => {
    const result = parseBulkCreateText('producto;cantidad;precio\nAlgo;2;abc');
    assert.equal(result.rows.length, 0);
    assert.ok(result.errors.some((e) => /Precio unitario inválido/i.test(e.message)));
  });

  it('tolera CSV con comas y ; al final de cada línea', () => {
    const text = `Bombón Bon o Bon Blanco 40g,4,733;
Bombón Bon o Bon Negro 40g,4,733;
Bizcocho Don Satur Grasa 200g,2,1000;`;
    const result = parseBulkCreateText(text);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0].name, 'Bombón Bon o Bon Blanco 40g');
    assert.equal(result.rows[0].stock, 4);
    assert.equal(result.rows[0].price, 733);
    assert.equal(result.rows[2].price, 1000);
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
