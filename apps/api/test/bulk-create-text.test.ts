import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBulkCreateText } from '../src/products/bulk-create-text';

describe('parseBulkCreateText', () => {
  it('parsea CSV con encabezado y ;', () => {
    const text = `nombre;precio;stock;costo;codigo_barras;categoria;marca
Coca;1500;24;900;123;Bebidas;Coca-Cola
Alfajor;800;10;;`;
    const result = parseBulkCreateText(text);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].name, 'Coca');
    assert.equal(result.rows[0].price, 1500);
    assert.equal(result.rows[0].stock, 24);
    assert.equal(result.rows[0].cost, 900);
    assert.equal(result.rows[0].barcode, '123');
    assert.equal(result.rows[0].category, 'Bebidas');
    assert.equal(result.rows[0].brand, 'Coca-Cola');
    assert.equal(result.rows[1].name, 'Alfajor');
    assert.equal(result.rows[1].price, 800);
    assert.equal(result.rows[1].stock, 10);
  });

  it('parsea sin encabezado nombre;precio;stock', () => {
    const result = parseBulkCreateText('Gaseosa;1200;5');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, 'Gaseosa');
    assert.equal(result.rows[0].price, 1200);
    assert.equal(result.rows[0].stock, 5);
  });

  it('reporta precio inválido', () => {
    const result = parseBulkCreateText('nombre;precio\nAlgo;abc');
    assert.equal(result.rows.length, 0);
    assert.ok(result.errors.some((e) => /Precio inválido/i.test(e.message)));
  });

  it('acepta precio con coma decimal', () => {
    const result = parseBulkCreateText('nombre;precio\nItem;12,50');
    assert.equal(result.rows[0]?.price, 12.5);
  });
});
