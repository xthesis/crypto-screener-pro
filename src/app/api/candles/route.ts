// src/app/api/candles/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INTERVAL_MAP: Record<string, { binance: string; bybit: string; hl: string; ms: number }> = {
  '15m': { binance: '15m', bybit: '15', hl: '15m', ms: 900000 },
  '1h':  { binance: '1h',  bybit: '60', hl: '1h',  ms: 3600000 },
  '4h':  { binance: '4h',  bybit: '240', hl: '4h', ms: 14400000 },
  '1d':  { binance: '1d',  bybit: 'D',  hl: '1d',  ms: 86400000 },
};

// ═══════════════════════════════════════════════
// BINANCE
// ═══════════════════════════════════════════════
async function fetchBinanceCandles(symbol: string, startTime: number, endTime: number, interval: string): Promise<any[] | null> {
  try {
    const ivl = INTERVAL_MAP[interval]?.binance || '1h';
    const allCandles: any[] = [];
    let currentStart = startTime;
    let attempts = 0;

    while (currentStart < endTime && attempts < 10) {
      attempts++;
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${ivl}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const k of data) {
        allCandles.push({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        });
      }

      const lastTs = data[data.length - 1][0];
      if (lastTs <= currentStart) break;
      currentStart = lastTs + 1;
      if (data.length < 1000) break;
    }
    return allCandles.length > 0 ? allCandles : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════
// BYBIT (works for both spot and linear/perps)
// ═══════════════════════════════════════════════
async function fetchBybitCandles(symbol: string, startTime: number, endTime: number, interval: string, category: string = 'spot'): Promise<any[] | null> {
  try {
    const ivl = INTERVAL_MAP[interval]?.bybit || '60';
    const allCandles: any[] = [];
    let currentEnd = endTime;
    let attempts = 0;

    while (currentEnd > startTime && attempts < 10) {
      attempts++;
      const url = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}USDT&interval=${ivl}&start=${startTime}&end=${currentEnd}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const list = data?.result?.list;
      if (!list || list.length === 0) break;

      // Bybit returns newest first. Grab oldest timestamp BEFORE reversing.
      const oldestTs = parseInt(list[list.length - 1][0]);

      // Now process into candles (reverse to get chronological order)
      for (let i = list.length - 1; i >= 0; i--) {
        const k = list[i];
        allCandles.push({
          time: Math.floor(parseInt(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        });
      }

      // Move end cursor to before the oldest candle we received
      if (oldestTs >= currentEnd) break;
      currentEnd = oldestTs - 1;
      if (list.length < 1000) break;
    }
    return allCandles.length > 0 ? allCandles : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════
// HYPERLIQUID
// ═══════════════════════════════════════════════
async function fetchHyperliquidCandles(symbol: string, startTime: number, endTime: number, interval: string): Promise<any[] | null> {
  try {
    const ivl = INTERVAL_MAP[interval]?.hl || '1h';
    const ivlMs = INTERVAL_MAP[interval]?.ms || 3600000;
    const allCandles: any[] = [];
    let currentStart = startTime;
    const chunkSize = 500 * ivlMs;
    let attempts = 0;

    while (currentStart < endTime && attempts < 10) {
      attempts++;
      const chunkEnd = Math.min(currentStart + chunkSize, endTime);
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: { coin: symbol, interval: ivl, startTime: currentStart, endTime: chunkEnd },
        }),
      });
      if (!res.ok) break;
      const data = await res.json();
      if (!data || !Array.isArray(data) || data.length === 0) {
        currentStart = chunkEnd;
        continue;
      }

      for (const k of data) {
        allCandles.push({
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        });
      }
      currentStart = chunkEnd;
    }
    return allCandles.length > 0 ? allCandles : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════
// ROUTE
// ═══════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() || '';
  const start = parseInt(searchParams.get('start') || '0');
  const end = parseInt(searchParams.get('end') || '0');
  const interval = searchParams.get('interval') || '1h';
  const context = parseInt(searchParams.get('context') || '0');

  if (!symbol || !start || !end) {
    return NextResponse.json({ error: 'Missing symbol, start, or end' }, { status: 400 });
  }
  if (!INTERVAL_MAP[interval]) {
    return NextResponse.json({ error: `Invalid interval: ${interval}` }, { status: 400 });
  }

  const ivlMs = INTERVAL_MAP[interval].ms;
  const defaultContext = ivlMs * 200; // 200 candles of context before trade
  const beforePad = context > 0 ? context : defaultContext;
  const afterPad = ivlMs * 30;

  const paddedStart = start - beforePad;
  const paddedEnd = end + afterPad;

  let candles: any[] | null = null;
  let source = '';
  const tried: string[] = [];

  // 1. Binance
  candles = await fetchBinanceCandles(symbol, paddedStart, paddedEnd, interval);
  if (candles && candles.length > 0) { source = 'binance'; }
  else { tried.push('binance'); }

  // 2. Bybit spot
  if (!source) {
    candles = await fetchBybitCandles(symbol, paddedStart, paddedEnd, interval, 'spot');
    if (candles && candles.length > 0) { source = 'bybit-spot'; }
    else { tried.push('bybit-spot'); }
  }

  // 3. Bybit perps
  if (!source) {
    candles = await fetchBybitCandles(symbol, paddedStart, paddedEnd, interval, 'linear');
    if (candles && candles.length > 0) { source = 'bybit-perp'; }
    else { tried.push('bybit-perp'); }
  }

  // 4. Hyperliquid
  if (!source) {
    candles = await fetchHyperliquidCandles(symbol, paddedStart, paddedEnd, interval);
    if (candles && candles.length > 0) { source = 'hyperliquid'; }
    else { tried.push('hyperliquid'); }
  }

  if (!candles || candles.length === 0) {
    return NextResponse.json({
      error: `No candle data for ${symbol}. Tried: ${tried.join(', ')}`,
      tried,
      range: { paddedStart, paddedEnd },
    }, { status: 404 });
  }

  // Deduplicate and sort
  const seen = new Set<number>();
  candles = candles.filter((c: any) => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  }).sort((a: any, b: any) => a.time - b.time);

  return NextResponse.json({ candles, symbol, interval, source, count: candles.length });
}
