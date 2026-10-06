import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  arsCentsToPurchasedPoints,
  assertClaimable,
  assertPendingReview,
  assertRedemptionDeliverable,
  assertSameTenant,
  calculateCashbackPoints,
  collectedForChannel,
  invertDeltas,
  planSaleLoyalty,
  pointsToCents,
  resolveFiscalMode,
} from '../../../shared/loyalty-money';
import { pickConsignmentParty, quickProductFlags } from '../src/consignment/pick-party';

describe('conversión de puntos', () => {
  it('10 puntos equivalen a $1', () => {
    assert.equal(pointsToCents(100000, 10), 1_000_000);
    assert.equal(arsCentsToPurchasedPoints(1_000_000, 10), 100000);
    assert.equal(pointsToCents(10, 10), 100);
  });

  it('una carga de $10.000 acredita 100.000 puntos comprados', () => {
    assert.equal(arsCentsToPurchasedPoints(1_000_000, 10), 100000);
  });

  it('el cashback de $10.000 al 5% son 5.000 puntos', () => {
    assert.equal(calculateCashbackPoints(1_000_000, 5, 10), 5000);
  });

  it('redondea hacia abajo', () => {
    assert.equal(calculateCashbackPoints(150, 5, 10), 0);
  });
});

describe('cashback según procedencia', () => {
  it('una compra pagada solo con puntos regalados no genera cashback', () => {
    const plan = planSaleLoyalty({
      totalCents: 1_000_000,
      pointsRequested: 100000,
      buckets: { purchased: 0, free: 100000 },
      pointsPerArs: 10,
      cashbackPercent: 5,
      paymentMethod: 'efectivo',
    });
    assert.equal(plan.freeUsed, 100000);
    assert.equal(plan.paymentMethod, 'puntos');
    assert.equal(plan.eligibleCents, 0);
    assert.equal(plan.earnedPoints, 0);
  });

  it('los puntos comprados generan cashback como dinero prepago', () => {
    const plan = planSaleLoyalty({
      totalCents: 1_000_000,
      pointsRequested: 100000,
      buckets: { purchased: 100000, free: 0 },
      pointsPerArs: 10,
      cashbackPercent: 5,
      paymentMethod: 'efectivo',
    });
    assert.equal(plan.purchasedUsed, 100000);
    assert.equal(plan.earnedPoints, 5000);
    assert.equal(plan.paymentMethod, 'puntos');
  });

  it('mezcla purchased, earned y efectivo', () => {
    const plan = planSaleLoyalty({
      totalCents: 1_000_000,
      pointsRequested: 70000,
      buckets: { purchased: 50000, free: 20000 },
      pointsPerArs: 10,
      cashbackPercent: 5,
      paymentMethod: 'efectivo',
    });
    assert.equal(plan.purchasedUsed, 50000);
    assert.equal(plan.freeUsed, 20000);
    assert.equal(plan.residualCents, 300_000);
    assert.equal(plan.eligibleCents, 800_000);
    assert.equal(plan.earnedPoints, 4000);
    assert.equal(plan.paymentMethod, 'efectivo');
  });

  it('una compra en cuenta corriente no genera cashback', () => {
    const plan = planSaleLoyalty({
      totalCents: 1_000_000,
      pointsRequested: 0,
      buckets: { purchased: 0, free: 0 },
      pointsPerArs: 10,
      cashbackPercent: 5,
      paymentMethod: 'fiado',
    });
    assert.equal(plan.earnedPoints, 0);
    assert.equal(plan.eligibleCents, 0);
  });

  it('no deja gastar más saldo del disponible', () => {
    assert.throws(
      () =>
        planSaleLoyalty({
          totalCents: 1_000_000,
          pointsRequested: 10,
          buckets: { purchased: 0, free: 0 },
          pointsPerArs: 10,
          cashbackPercent: 5,
          paymentMethod: 'efectivo',
        }),
      /suficientes/,
    );
  });
});

describe('caja y fiscal automático', () => {
  it('los puntos no entran como efectivo', () => {
    const split = collectedForChannel(1_000_000, 300_000, 'efectivo');
    assert.equal(split.efectivo, 700_000);
    assert.equal(split.puntos, 300_000);
    assert.equal(split.banco, 0);
  });

  it('resuelve el comprobante según el medio cuando el modo es Mercado Pago', () => {
    for (const method of ['efectivo', 'fiado', 'cuenta_corriente', 'puntos']) {
      assert.equal(resolveFiscalMode('auto_mp', method), 'internal');
    }
    for (const method of ['transferencia', 'mercadopago', 'tarjeta_debito', 'tarjeta_credito']) {
      assert.equal(resolveFiscalMode('auto_mp', method), 'factura_c');
    }
    assert.equal(resolveFiscalMode('internal', 'transferencia'), 'internal');
    assert.equal(resolveFiscalMode('factura_c', 'efectivo'), 'factura_c');
  });
});

describe('idempotencia y tenancy', () => {
  it('una venta solo se reclama una vez', () => {
    assert.doesNotThrow(() => assertClaimable({ saleStatus: 'completed', linkStatus: 'open' }));
    assert.throws(
      () => assertClaimable({ saleStatus: 'completed', linkStatus: 'linked', linkedAccountId: 'a' }),
      /ya fue acreditada/,
    );
    assert.throws(() => assertClaimable({ saleStatus: 'voided' }), /anulada/);
  });

  it('una carga no se aprueba dos veces', () => {
    assert.doesNotThrow(() => assertPendingReview('PENDING'));
    assert.throws(() => assertPendingReview('APPROVED'), /ya fue revisada/);
  });

  it('un canje no se entrega dos veces', () => {
    assert.doesNotThrow(() => assertRedemptionDeliverable('PENDING'));
    assert.throws(() => assertRedemptionDeliverable('REDEEMED'), /ya fue utilizado/);
  });

  it('una anulación invierte los movimientos', () => {
    const original = { purchasedDelta: -50000, freeDelta: -20000, pointsDelta: -70000 };
    const reversal = invertDeltas(original);
    assert.deepEqual(reversal, { purchasedDelta: 50000, freeDelta: 20000, pointsDelta: 70000 });
    const earn = invertDeltas({ purchasedDelta: 0, freeDelta: 5000, pointsDelta: 5000 });
    assert.equal(earn.freeDelta, -5000);
  });

  it('no cruza negocios', () => {
    assert.throws(() => assertSameTenant('business-a', 'business-b'), /No encontrado/);
    assert.doesNotThrow(() => assertSameTenant('business-a', 'business-a'));
  });

  it('dos gastos concurrentes no pueden usar el mismo saldo', async () => {
    const state = { purchased: 50000, free: 0, locked: Promise.resolve() };
    const spend = (points: number) => {
      const run = state.locked.then(async () => {
        const plan = planSaleLoyalty({
          totalCents: pointsToCents(points, 10),
          pointsRequested: points,
          buckets: { purchased: state.purchased, free: state.free },
          pointsPerArs: 10,
          cashbackPercent: 0,
          paymentMethod: 'efectivo',
        });
        state.purchased -= plan.purchasedUsed;
        state.free = state.free - plan.freeUsed + plan.earnedPoints;
      });
      state.locked = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
    const results = await Promise.allSettled([spend(40000), spend(40000)]);
    const ok = results.filter((result) => result.status === 'fulfilled');
    assert.equal(ok.length, 1);
    assert.equal(state.purchased, 10000);
  });
});

describe('producto rápido', () => {
  it('marca silencioso sin cambiar el alta incompleta', () => {
    assert.deepEqual(quickProductFlags({ silent: true }), {
      stockControl: false,
      incomplete: true,
      silent: true,
    });
  });

  it('exige entidad cuando hay más de una', () => {
    const missing = pickConsignmentParty([], null);
    assert.equal(missing.ok, false);
    const many = pickConsignmentParty([{ id: 'a' }, { id: 'b' }], null);
    assert.equal(many.ok, false);
    const only = pickConsignmentParty([{ id: 'a' }], null);
    assert.deepEqual(only, { ok: true, partyId: 'a' });
    const chosen = pickConsignmentParty([{ id: 'a' }, { id: 'b' }], 'b');
    assert.deepEqual(chosen, { ok: true, partyId: 'b' });
    const invalid = pickConsignmentParty([{ id: 'a' }], 'zzz');
    assert.equal(invalid.ok, false);
  });
});
