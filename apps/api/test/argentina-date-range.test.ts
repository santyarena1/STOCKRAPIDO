import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  argentinaDayOfMonth,
  argentinaDayStart,
  argentinaMonthBounds,
  argentinaTodayYmd,
  parseArgentinaDayEnd,
  parseArgentinaDayStart,
  saleDateRangeFromQuery,
} from '../src/common/argentina-date-range';

describe('argentina-date-range', () => {
  it('después de las 21 hs ART sigue siendo el mismo día de calendario', () => {
    // 22:30 ART del 31/10 = 01:30 UTC del 01/11
    const late = new Date('2026-11-01T01:30:00.000Z');
    assert.equal(argentinaTodayYmd(late), '2026-10-31');
    assert.equal(argentinaDayStart(late).toISOString(), '2026-10-31T03:00:00.000Z');
  });

  it('bucket de día usa calendario AR, no getUTCDate del server', () => {
    assert.equal(argentinaDayOfMonth(new Date('2026-11-01T01:15:00.000Z')), 31);
    assert.equal(argentinaDayOfMonth(new Date('2026-11-01T03:15:00.000Z')), 1);
  });

  it('parsea YYYY-MM-DD como día completo ART', () => {
    assert.equal(parseArgentinaDayStart('2026-10-31')!.toISOString(), '2026-10-31T03:00:00.000Z');
    assert.equal(parseArgentinaDayEnd('2026-10-31')!.toISOString(), '2026-11-01T02:59:59.999Z');
    const range = saleDateRangeFromQuery('2026-10-31', '2026-10-31');
    assert.equal(range.from!.toISOString(), '2026-10-31T03:00:00.000Z');
    assert.equal(range.to!.toISOString(), '2026-11-01T02:59:59.999Z');
  });

  it('bounds de octubre en ART', () => {
    const late = new Date('2026-11-01T01:30:00.000Z');
    const bounds = argentinaMonthBounds(2026, 9, late);
    assert.equal(bounds.daysInMonth, 31);
    assert.equal(bounds.from.toISOString(), '2026-10-01T03:00:00.000Z');
    assert.equal(bounds.to.toISOString(), '2026-11-01T02:59:59.999Z');
  });
});
