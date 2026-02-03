// src/app/api/candles/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchBinanceCandles(symbol: string, startTime: number, endTime: number) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1h&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
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
    const start = startTime;
    const end = endTime;
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=60&start=${start}&end=${end}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result?.list) return null;
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() || '';
  const start = parseInt(searchParams.get('start') || '0');
  const end = parseInt(searchParams.get('end') || '0');

  if (!symbol || !start || !end) {
    return NextResponse.json({ error: 'Missing symbol, start, or end' }, { status: 400 });
  }

  // Add padding: 24h before first trade and 24h after last trade
  const paddedStart = start - 86400000;
  const paddedEnd = end + 86400000;

  let candles = await fetchBinanceCandles(symbol, paddedStart, paddedEnd);
  if (!candles || candles.length === 0) {
    candles = await fetchBybitCandles(symbol, paddedStart, paddedEnd);
  }

  if (!candles || candles.length === 0) {
    return NextResponse.json({ error: `No candle data found for ${symbol}` }, { status: 404 });
  }

  return NextResponse.json({ candles, symbol });
}
