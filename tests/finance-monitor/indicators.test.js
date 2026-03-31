/**
 * Tests for finance-monitor/lib/indicators.js
 *
 * Pure math functions — no HTTP, no side effects.
 * Plugin lives at ~/.hanako-dev/plugins/finance-monitor/ (outside repo);
 * imported via absolute path, same convention as data-source.test.js.
 */

import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';

const hanaHome = process.env.HANA_HOME ?? path.join(os.homedir(), '.hanako-dev');
const indicatorsPath = path.join(
  hanaHome,
  'plugins',
  'finance-monitor',
  'lib',
  'indicators.js'
);

const { sma, ema, macd, rsi, boll, atr, vwma, computeIndicators } =
  await import(indicatorsPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a linear price series: start, start+step, start+2*step, ... */
function linear(start, step, count) {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/** Non-null values from an array */
function nonNull(arr) {
  return arr.filter(v => v !== null);
}

// ---------------------------------------------------------------------------
// SMA
// ---------------------------------------------------------------------------

describe('sma', () => {
  it('returns correct values for a simple series', () => {
    const data = [1, 2, 3, 4, 5];
    const result = sma(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 10); // (1+2+3)/3
    expect(result[3]).toBeCloseTo(3, 10); // (2+3+4)/3
    expect(result[4]).toBeCloseTo(4, 10); // (3+4+5)/3
  });

  it('returns array of same length as input', () => {
    const data = [10, 20, 30, 40, 50];
    expect(sma(data, 3).length).toBe(data.length);
  });

  it('first (period-1) positions are null', () => {
    const data = linear(100, 1, 10);
    const result = sma(data, 5);
    for (let i = 0; i < 4; i++) expect(result[i]).toBeNull();
    expect(result[4]).not.toBeNull();
  });

  it('period-1 SMA is the entire array mean', () => {
    const data = [2, 4, 6, 8, 10];
    const result = sma(data, 5);
    expect(result[4]).toBeCloseTo(6, 10);
  });

  it('handles empty array', () => {
    expect(sma([], 5)).toEqual([]);
  });

  it('returns all nulls when period > data length', () => {
    const result = sma([1, 2, 3], 10);
    expect(result.every(v => v === null)).toBe(true);
  });

  it('handles single element with period 1', () => {
    expect(sma([42], 1)[0]).toBeCloseTo(42, 10);
  });
});

// ---------------------------------------------------------------------------
// EMA
// ---------------------------------------------------------------------------

describe('ema', () => {
  it('seeds at SMA and converges', () => {
    // With period=3 the seed EMA is avg(1,2,3)=2, k=2/4=0.5
    const data = [1, 2, 3, 4, 5];
    const result = ema(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 10);           // SMA seed
    expect(result[3]).toBeCloseTo(3, 10);           // 4*0.5 + 2*0.5 = 3
    expect(result[4]).toBeCloseTo(4, 10);           // 5*0.5 + 3*0.5 = 4
  });

  it('returns array of same length as input', () => {
    expect(ema([1, 2, 3, 4, 5], 3).length).toBe(5);
  });

  it('first (period-1) positions are null', () => {
    const result = ema(linear(100, 1, 10), 5);
    for (let i = 0; i < 4; i++) expect(result[i]).toBeNull();
    expect(result[4]).not.toBeNull();
  });

  it('handles empty array', () => {
    expect(ema([], 5)).toEqual([]);
  });

  it('returns all nulls when period > data length', () => {
    expect(ema([1, 2], 5).every(v => v === null)).toBe(true);
  });

  it('on a constant series EMA equals the constant', () => {
    const data = new Array(20).fill(100);
    const result = ema(data, 5);
    nonNull(result).forEach(v => expect(v).toBeCloseTo(100, 8));
  });

  it('EMA responds faster than SMA to a sudden price spike', () => {
    // Flat at 10 for 10 bars, then spike to 100.
    // EMA weights the spike more; SMA dilutes it equally across the window.
    const flat = new Array(10).fill(10);
    const spike = new Array(10).fill(100);
    const data = [...flat, ...spike];
    const emaVals = ema(data, 5);
    const smaVals = sma(data, 5);
    // At the bar right after the spike starts (index 10), EMA should exceed SMA.
    expect(emaVals[10]).toBeGreaterThan(smaVals[10]);
  });
});

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

describe('macd', () => {
  const data = linear(10, 0.5, 60); // 60 points, gently rising

  it('returns object with dif, dea, histogram arrays', () => {
    const result = macd(data);
    expect(result).toHaveProperty('dif');
    expect(result).toHaveProperty('dea');
    expect(result).toHaveProperty('histogram');
  });

  it('all three arrays have the same length as input', () => {
    const result = macd(data);
    expect(result.dif.length).toBe(data.length);
    expect(result.dea.length).toBe(data.length);
    expect(result.histogram.length).toBe(data.length);
  });

  it('first (slow-1) DIF positions are null', () => {
    const result = macd(data, 12, 26, 9);
    for (let i = 0; i < 25; i++) expect(result.dif[i]).toBeNull();
    expect(result.dif[25]).not.toBeNull();
  });

  it('histogram = (DIF - DEA) * 2 wherever both are defined', () => {
    const result = macd(data, 12, 26, 9);
    for (let i = 0; i < data.length; i++) {
      if (result.dif[i] !== null && result.dea[i] !== null) {
        expect(result.histogram[i]).toBeCloseTo(
          (result.dif[i] - result.dea[i]) * 2,
          8
        );
      }
    }
  });

  it('handles empty array', () => {
    const result = macd([]);
    expect(result.dif).toEqual([]);
    expect(result.dea).toEqual([]);
    expect(result.histogram).toEqual([]);
  });

  it('returns all nulls when data shorter than slow period', () => {
    const result = macd([1, 2, 3], 12, 26, 9);
    expect(result.dif.every(v => v === null)).toBe(true);
  });

  it('accepts custom periods', () => {
    const result = macd(data, 5, 10, 3);
    const nonNullDif = nonNull(result.dif);
    expect(nonNullDif.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RSI
// ---------------------------------------------------------------------------

describe('rsi', () => {
  it('produces values strictly between 0 and 100 for normal data', () => {
    const data = [
      44, 45, 43, 46, 48, 47, 49, 50, 48, 51,
      53, 52, 54, 55, 53, 56, 57, 55, 58, 60,
    ];
    const result = rsi(data, 14);
    nonNull(result).forEach(v => {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    });
  });

  it('returns array of same length as input', () => {
    const data = linear(10, 1, 30);
    expect(rsi(data, 14).length).toBe(data.length);
  });

  it('first period positions are null', () => {
    const data = linear(10, 1, 30);
    const result = rsi(data, 14);
    for (let i = 0; i < 14; i++) expect(result[i]).toBeNull();
    expect(result[14]).not.toBeNull();
  });

  it('RSI = 100 for a perfectly rising series (no losses)', () => {
    // Every candle goes up — avgLoss = 0, RSI should be 100
    const data = linear(1, 1, 30);
    const result = rsi(data, 14);
    nonNull(result).forEach(v => expect(v).toBeCloseTo(100, 5));
  });

  it('RSI = 0 for a perfectly falling series (no gains)', () => {
    const data = linear(100, -1, 30);
    const result = rsi(data, 14);
    nonNull(result).forEach(v => expect(v).toBeCloseTo(0, 5));
  });

  it('handles empty array', () => {
    expect(rsi([])).toEqual([]);
  });

  it('returns all nulls when period >= data length', () => {
    expect(rsi([1, 2, 3], 14).every(v => v === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BOLL
// ---------------------------------------------------------------------------

describe('boll', () => {
  const data = [
    20, 21, 22, 20, 19, 21, 23, 22, 24, 25,
    23, 22, 21, 23, 24, 25, 26, 24, 23, 22,
    25, 27, 26, 28, 29,
  ];

  it('returns object with upper, middle, lower arrays', () => {
    const result = boll(data, 20, 2);
    expect(result).toHaveProperty('upper');
    expect(result).toHaveProperty('middle');
    expect(result).toHaveProperty('lower');
  });

  it('all three arrays have the same length as input', () => {
    const result = boll(data, 20, 2);
    expect(result.upper.length).toBe(data.length);
    expect(result.middle.length).toBe(data.length);
    expect(result.lower.length).toBe(data.length);
  });

  it('upper > middle > lower wherever defined (non-flat series)', () => {
    const result = boll(data, 20, 2);
    for (let i = 0; i < data.length; i++) {
      if (result.upper[i] !== null) {
        expect(result.upper[i]).toBeGreaterThan(result.middle[i]);
        expect(result.middle[i]).toBeGreaterThan(result.lower[i]);
      }
    }
  });

  it('middle equals SMA', () => {
    const result = boll(data, 5, 2);
    const smaResult = sma(data, 5);
    for (let i = 0; i < data.length; i++) {
      if (smaResult[i] !== null) {
        expect(result.middle[i]).toBeCloseTo(smaResult[i], 8);
      }
    }
  });

  it('first (period-1) positions are null', () => {
    const result = boll(data, 5, 2);
    for (let i = 0; i < 4; i++) {
      expect(result.upper[i]).toBeNull();
      expect(result.middle[i]).toBeNull();
      expect(result.lower[i]).toBeNull();
    }
  });

  it('handles empty array', () => {
    const result = boll([], 20, 2);
    expect(result.upper).toEqual([]);
    expect(result.middle).toEqual([]);
    expect(result.lower).toEqual([]);
  });

  it('upper === lower === middle on a flat series (stdDev=0)', () => {
    const flatData = new Array(25).fill(50);
    const result = boll(flatData, 20, 2);
    nonNull(result.upper).forEach(v => expect(v).toBeCloseTo(50, 8));
    nonNull(result.lower).forEach(v => expect(v).toBeCloseTo(50, 8));
  });
});

// ---------------------------------------------------------------------------
// ATR
// ---------------------------------------------------------------------------

describe('atr', () => {
  // Simple synthetic OHLCV where high=close+1, low=close-1
  const closes = linear(100, 1, 20);
  const highs = closes.map(c => c + 1);
  const lows = closes.map(c => c - 1);

  it('returns array of same length as input', () => {
    expect(atr(highs, lows, closes, 5).length).toBe(closes.length);
  });

  it('all non-null ATR values are positive', () => {
    const result = atr(highs, lows, closes, 5);
    nonNull(result).forEach(v => expect(v).toBeGreaterThan(0));
  });

  it('first (period-1) positions are null', () => {
    const result = atr(highs, lows, closes, 5);
    for (let i = 0; i < 4; i++) expect(result[i]).toBeNull();
    expect(result[4]).not.toBeNull();
  });

  it('ATR on a flat series with constant high-low range equals that range', () => {
    const n = 20;
    const c = new Array(n).fill(100);
    const h = new Array(n).fill(102);
    const l = new Array(n).fill(98);
    const result = atr(h, l, c, 5);
    // Range = 4; on a flat close series TR = max(4, |102-100|, |98-100|) = 4
    nonNull(result).forEach(v => expect(v).toBeCloseTo(4, 8));
  });

  it('handles empty arrays', () => {
    expect(atr([], [], [], 14)).toEqual([]);
  });

  it('returns all nulls when period > data length', () => {
    expect(atr([105], [95], [100], 14).every(v => v === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VWMA
// ---------------------------------------------------------------------------

describe('vwma', () => {
  it('returns correct values for known input', () => {
    const closes = [10, 20, 30];
    const volumes = [1, 2, 3];
    // VWMA(3) at index 2: (10*1 + 20*2 + 30*3) / (1+2+3) = 140/6 ≈ 23.33
    const result = vwma(closes, volumes, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(140 / 6, 8);
  });

  it('returns array of same length as input', () => {
    const c = linear(10, 1, 10);
    const v = new Array(10).fill(1000);
    expect(vwma(c, v, 5).length).toBe(10);
  });

  it('equals SMA when all volumes are equal', () => {
    const c = linear(10, 1, 20);
    const v = new Array(20).fill(1000);
    const vwmaResult = vwma(c, v, 5);
    const smaResult = sma(c, 5);
    for (let i = 0; i < c.length; i++) {
      if (smaResult[i] !== null) {
        expect(vwmaResult[i]).toBeCloseTo(smaResult[i], 8);
      }
    }
  });

  it('weights recent high-volume bars more heavily', () => {
    // Prices: all 10 except last = 100; volumes: all 1 except last = 10
    // VWMA(3) at last index: (10*1 + 10*1 + 100*10) / (1+1+10) = 1020/12 = 85
    const closes = [10, 10, 100];
    const volumes = [1, 1, 10];
    const result = vwma(closes, volumes, 3);
    expect(result[2]).toBeCloseTo(1020 / 12, 8);
  });

  it('handles empty array', () => {
    expect(vwma([], [], 5)).toEqual([]);
  });

  it('returns all nulls when period > data length', () => {
    expect(vwma([10, 20], [1, 1], 5).every(v => v === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeIndicators
// ---------------------------------------------------------------------------

describe('computeIndicators', () => {
  // Build 50 OHLCV bars
  const n = 50;
  const ohlcv = Array.from({ length: n }, (_, i) => ({
    open: 100 + i * 0.3,
    high: 100 + i * 0.3 + 1,
    low: 100 + i * 0.3 - 1,
    close: 100 + i * 0.5,
    volume: 10000 + i * 100,
  }));

  it('computes MA5 and MA20', () => {
    const result = computeIndicators(ohlcv, ['MA5', 'MA20']);
    expect(result).toHaveProperty('MA5');
    expect(result).toHaveProperty('MA20');
    expect(result.MA5.length).toBe(n);
    expect(result.MA20.length).toBe(n);
    // MA5 first 4 null, MA20 first 19 null
    for (let i = 0; i < 4; i++) expect(result.MA5[i]).toBeNull();
    expect(result.MA5[4]).not.toBeNull();
    for (let i = 0; i < 19; i++) expect(result.MA20[i]).toBeNull();
    expect(result.MA20[19]).not.toBeNull();
  });

  it('computes EMA20', () => {
    const result = computeIndicators(ohlcv, ['EMA20']);
    expect(result).toHaveProperty('EMA20');
    expect(result.EMA20.length).toBe(n);
  });

  it('computes MACD with correct structure', () => {
    const result = computeIndicators(ohlcv, ['MACD']);
    expect(result).toHaveProperty('MACD');
    expect(result.MACD).toHaveProperty('dif');
    expect(result.MACD).toHaveProperty('dea');
    expect(result.MACD).toHaveProperty('histogram');
  });

  it('computes RSI within 0-100', () => {
    const result = computeIndicators(ohlcv, ['RSI']);
    expect(result).toHaveProperty('RSI');
    nonNull(result.RSI).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('computes BOLL with correct structure', () => {
    const result = computeIndicators(ohlcv, ['BOLL']);
    expect(result).toHaveProperty('BOLL');
    expect(result.BOLL).toHaveProperty('upper');
    expect(result.BOLL).toHaveProperty('middle');
    expect(result.BOLL).toHaveProperty('lower');
  });

  it('computes ATR with positive non-null values', () => {
    const result = computeIndicators(ohlcv, ['ATR']);
    expect(result).toHaveProperty('ATR');
    nonNull(result.ATR).forEach(v => expect(v).toBeGreaterThan(0));
  });

  it('computes VWMA', () => {
    const result = computeIndicators(ohlcv, ['VWMA']);
    expect(result).toHaveProperty('VWMA');
    expect(result.VWMA.length).toBe(n);
  });

  it('handles all indicators in a single call', () => {
    const result = computeIndicators(ohlcv, ['MA5', 'MA20', 'EMA20', 'MACD', 'RSI', 'BOLL', 'ATR', 'VWMA']);
    expect(Object.keys(result)).toHaveLength(8);
  });

  it('ignores unknown indicator names gracefully', () => {
    const result = computeIndicators(ohlcv, ['UNKNOWN_IND']);
    // Unknown keys simply aren't added
    expect(result).not.toHaveProperty('UNKNOWN_IND');
  });

  it('handles empty OHLCV array', () => {
    const result = computeIndicators([], ['MA5', 'MACD', 'RSI', 'BOLL']);
    expect(result.MA5).toEqual([]);
    expect(result.MACD.dif).toEqual([]);
    expect(result.RSI).toEqual([]);
    expect(result.BOLL.upper).toEqual([]);
  });

  it('handles single OHLCV bar', () => {
    const single = [{ open: 100, high: 101, low: 99, close: 100, volume: 1000 }];
    const result = computeIndicators(single, ['MA5', 'RSI', 'BOLL']);
    expect(result.MA5).toEqual([null]);
    expect(result.RSI).toEqual([null]);
    expect(result.BOLL.upper).toEqual([null]);
  });
});
