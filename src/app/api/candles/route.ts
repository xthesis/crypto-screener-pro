// src/app/api/candles/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchBinanceCandles(symbol: string, startTime: number, endTime: number) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1h&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((k: any) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch { return null; }
}

async function fetchBybitCandles(symbol: string, startTime: number, endTime: number) {
  try {
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=60&start=${startTime}&end=${endTime}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result?.list || data.result.list.length === 0) return null;
    return data.result.list.reverse().map((k: any) => ({
      time: Math.floor(parseInt(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch { return null; }
}

async function fetchHyperliquidCandles(symbol: string, startTime: number, endTime: number) {
  try {
    // Hyperliquid uses POST API for candle data
    // Fetch in chunks if range is large (max ~500 candles per request)
    const allCandles: any[] = [];
    let currentStart = startTime;
    const chunkSize = 500 * 3600000; // 500 hours in ms

    while (currentStart < endTime) {
      const chunkEnd = Math.min(currentStart + chunkSize, endTime);
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin: symbol,
            interval: '1h',
            startTime: currentStart,
            endTime: chunkEnd,
          },
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data) || data.length === 0) {
        currentStart = chunkEnd;
        continue;
      }

      allCandles.push(...data);
      currentStart = chunkEnd;
    }

    if (allCandles.length === 0) return null;

    return allCandles.map((k: any) => ({
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
    }));
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() || '';
  const start = parseInt(searchParams.get('start') || '0');
  const end = parseInt(searchParams.get('end') || '0');

  if (!symbol || !start || !end) {
    return NextResponse.json({ error: 'Missing symbol, start, or end' }, { status: 400 });
  }

  // Add padding: 12h before first trade and 12h after last trade
  const paddedStart = start - 43200000;
  const paddedEnd = end + 43200000;

  // Try Binance first, then Bybit, then Hyperliquid
  let candles = await fetchBinanceCandles(symbol, paddedStart, paddedEnd);

  if (!candles || candles.length === 0) {
    candles = await fetchBybitCandles(symbol, paddedStart, paddedEnd);
  }

  if (!candles || candles.length === 0) {
    candles = await fetchHyperliquidCandles(symbol, paddedStart, paddedEnd);
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

  return NextResponse.json({ candles, symbol });
}
