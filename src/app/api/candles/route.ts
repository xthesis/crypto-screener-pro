// src/app/api/candles/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Map interval string to Binance, Bybit, and Hyperliquid formats
const INTERVAL_MAP: Record<string, { binance: string; bybit: string; hl: string; ms: number }> = {
  '15m': { binance: '15m', bybit: '15', hl: '15m', ms: 900000 },
  '1h':  { binance: '1h',  bybit: '60', hl: '1h',  ms: 3600000 },
  '4h':  { binance: '4h',  bybit: '240', hl: '4h', ms: 14400000 },
  '1d':  { binance: '1d',  bybit: 'D',  hl: '1d',  ms: 86400000 },
};

async function fetchBinanceCandles(symbol: string, startTime: number, endTime: number, interval: string) {
  try {
    const ivl = INTERVAL_MAP[interval]?.binance || '1h';
    // Binance limit is 1000 candles per request
    const allCandles: any[] = [];
    let currentStart = startTime;

    while (currentStart < endTime) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${ivl}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) return allCandles.length > 0 ? allCandles : null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      const mapped = data.map((k: any) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      allCandles.push(...mapped);

      // Move start past last candle
      const lastTs = data[data.length - 1][0];
      if (lastTs <= currentStart) break;
      currentStart = lastTs + 1;
      if (data.length < 1000) break;
    }

    return allCandles.length > 0 ? allCandles : null;
  } catch { return null; }
}

async function fetchBybitCandles(symbol: string, startTime: number, endTime: number, interval: string) {
  try {
    const ivl = INTERVAL_MAP[interval]?.bybit || '60';
    const allCandles: any[] = [];
    let currentEnd = endTime;

    while (currentEnd > startTime) {
      const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=${ivl}&start=${startTime}&end=${currentEnd}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) return allCandles.length > 0 ? allCandles : null;
      const data = await res.json();
      if (!data.result?.list || data.result.list.length === 0) break;

      const mapped = data.result.list.reverse().map((k: any) => ({
        time: Math.floor(parseInt(k[0]) / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      allCandles.push(...mapped);

      const firstTs = parseInt(data.result.list[data.result.list.length - 1][0]);
      if (firstTs >= currentEnd) break;
      currentEnd = firstTs - 1;
      if (data.result.list.length < 1000) break;
    }

    return allCandles.length > 0 ? allCandles : null;
  } catch { return null; }
}

async function fetchHyperliquidCandles(symbol: string, startTime: number, endTime: number, interval: string) {
  try {
    const ivl = INTERVAL_MAP[interval]?.hl || '1h';
    const ivlMs = INTERVAL_MAP[interval]?.ms || 3600000;
    const allCandles: any[] = [];
    let currentStart = startTime;
    const chunkSize = 500 * ivlMs;

    while (currentStart < endTime) {
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

      const mapped = data.map((k: any) => ({
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
      }));
      allCandles.push(...mapped);
      currentStart = chunkEnd;
    }

    return allCandles.length > 0 ? allCandles : null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() || '';
  const start = parseInt(searchParams.get('start') || '0');
  const end = parseInt(searchParams.get('end') || '0');
  const interval = searchParams.get('interval') || '1h';
  // Context: how much extra history to show before the trade (in ms)
  const context = parseInt(searchParams.get('context') || '0');

  if (!symbol || !start || !end) {
    return NextResponse.json({ error: 'Missing symbol, start, or end' }, { status: 400 });
  }

  if (!INTERVAL_MAP[interval]) {
    return NextResponse.json({ error: `Invalid interval: ${interval}. Use 15m, 1h, 4h, or 1d` }, { status: 400 });
  }

  // Apply context padding before trade, small padding after
  const ivlMs = INTERVAL_MAP[interval].ms;
  const defaultContext = ivlMs * 100; // 100 candles before by default
  const beforePad = context > 0 ? context : defaultContext;
  const afterPad = ivlMs * 20; // 20 candles after last exit

  const paddedStart = start - beforePad;
  const paddedEnd = end + afterPad;

  // Try Binance → Bybit → Hyperliquid
  let candles = await fetchBinanceCandles(symbol, paddedStart, paddedEnd, interval);

  if (!candles || candles.length === 0) {
    candles = await fetchBybitCandles(symbol, paddedStart, paddedEnd, interval);
  }

  if (!candles || candles.length === 0) {
    candles = await fetchHyperliquidCandles(symbol, paddedStart, paddedEnd, interval);
  }

  if (!candles || candles.length === 0) {
    return NextResponse.json(
      { error: `No candle data found for ${symbol}. This token may not have historical data available.` },
      { status: 404 }
    );
  }

  // Deduplicate by time and sort
  const seen = new Set<number>();
  candles = candles.filter(c => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  }).sort((a, b) => a.time - b.time);

  return NextResponse.json({ candles, symbol, interval, count: candles.length });
}
