import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPriceListPdf } from '../src/common/simple-pdf';

describe('buildPriceListPdf', () => {
  it('genera un PDF con cabecera %PDF', () => {
    const buf = buildPriceListPdf({
      title: 'Lista de precios — Teatro',
      subtitle: '3 productos',
      items: [
        { name: 'Alfajor', priceLabel: '$1.500' },
        { name: 'Café', priceLabel: '$8.000' },
        { name: 'Ñoquis', priceLabel: '$2.200' },
      ],
    });
    assert.equal(buf.length > 200, true);
    assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(buf.toString('latin1').includes('%%EOF'), true);
  });

  it('pagina cuando hay muchos ítems', () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      name: `Producto ${String(i + 1).padStart(3, '0')}`,
      priceLabel: `$${((i + 1) * 100).toLocaleString('es-AR')}`,
    }));
    const buf = buildPriceListPdf({ title: 'Lista', items });
    const text = buf.toString('latin1');
    assert.equal(text.includes('contin'), true);
    assert.equal(buf.length > 1000, true);
  });
});
