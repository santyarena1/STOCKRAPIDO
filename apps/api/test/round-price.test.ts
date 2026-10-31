import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roundPriceUpToStep } from '../src/products/round-price';

describe('roundPriceUpToStep', () => {
  it('redondea hacia arriba a múltiplos de 500', () => {
    assert.equal(roundPriceUpToStep(1100), 1500);
    assert.equal(roundPriceUpToStep(900), 1000);
    assert.equal(roundPriceUpToStep(1), 500);
    assert.equal(roundPriceUpToStep(501), 1000);
    assert.equal(roundPriceUpToStep(1499), 1500);
  });

  it('deja igual los que ya son múltiplo', () => {
    assert.equal(roundPriceUpToStep(1000), 1000);
    assert.equal(roundPriceUpToStep(1500), 1500);
    assert.equal(roundPriceUpToStep(500), 500);
  });

  it('trata 0 y no finitos como 0', () => {
    assert.equal(roundPriceUpToStep(0), 0);
    assert.equal(roundPriceUpToStep(-10), 0);
    assert.equal(roundPriceUpToStep(Number.NaN), 0);
  });
});
