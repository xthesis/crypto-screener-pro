#!/usr/bin/env node

// scan-patterns.mjs
// Fetches OHLCV data for all coins, runs pattern detection, stores results in Supabase
// Usage: node scan-patterns.mjs

import pkg from 'technicalindicators';
const { RSI, bullishengulfingpattern, bullishhammerstick, bullishharami, bullishinvertedhammerstick, bullishmarubozu, morningstar, morningdojistar, threewhitesoldiers, piercingline, tweezerbottom, hammerpattern, bearishengulfingpattern, bearishhammerstick, bearishharami, bearishinvertedhammerstick, bearishmarubozu, eveningstar, eveningdojistar, threeblackcrows, darkcloudcover, tweezertop, shootingstar, hangingman, doji } = pkg;

const SUPABASE_URL = 'https://mzuocbdocvhpffytsvaw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dW9jYmRvY3ZocGZmeXRzdmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTc0OTYsImV4cCI6MjA4NTYzMzQ5Nn0.boaEi1_VmDW6NWC998NwJpEvAY899pLIlFTbr0dHgIc';

// ═══════════════════════════════════════════════
// PATTERN DEFINITIONS
// ═══════════════════════════════════════════════

const CANDLESTICK_PATTERNS = [
  { fn: bullishengulfingpattern, name: 'Bullish Engulfing', type: 'bullish', weight: 3 },
  { fn: bullishhammerstick, name: 'Bullish Hammer', type: 'bullish', weight: 2 },
  { fn: bullishharami, name: 'Bullish Harami', type: 'bullish', weight: 2 },
  { fn: bullishinvertedhammerstick, name: 'Inverted Hammer', type: 'bullish', weight: 1 },
  { fn: bullishmarubozu, name: 'Bullish Marubozu', type: 'bullish', weight: 2 },
  { fn: morningstar, name: 'Morning Star', type: 'bullish', weight: 3 },
  { fn: morningdojistar, name: 'Morning Doji Star', type: 'bullish', weight: 3 },
  { fn: threewhitesoldiers, name: 'Three White Soldiers', type: 'bullish', weight: 3 },
  { fn: piercingline, name: 'Piercing Line', type: 'bullish', weight: 2 },
  { fn: tweezerbottom, name: 'Tweezer Bottom', type: 'bullish', weight: 2 },
  { fn: hammerpattern, name: 'Hammer', type: 'bullish', weight: 2 },

  { fn: bearishengulfingpattern, name: 'Bearish Engulfing', type: 'bearish', weight: 3 },
  { fn: bearishhammerstick, name: 'Bearish Hammer', type: 'bearish', weight: 2 },
  { fn: bearishharami, name: 'Bearish Harami', type: 'bearish', weight: 2 },
  { fn: bearishinvertedhammerstick, name: 'Bearish Inverted Hammer', type: 'bearish', weight: 1 },
  { fn: bearishmarubozu, name: 'Bearish Marubozu', type: 'bearish', weight: 2 },
  { fn: eveningstar, name: 'Evening Star', type: 'bearish', weight: 3 },
  { fn: eveningdojistar, name: 'Evening Doji Star', type: 'bearish', weight: 3 },
  { fn: threeblackcrows, name: 'Three Black Crows', type: 'bearish', weight: 3 },
  { fn: darkcloudcover, name: 'Dark Cloud Cover', type: 'bearish', weight: 2 },
  { fn: tweezertop, name: 'Tweezer Top', type: 'bearish', weight: 2 },
  { fn: shootingstar, name: 'Shooting Star', type: 'bearish', weight: 2 },
  { fn: hangingman, name: 'Hanging Man', type: 'bearish', weight: 2 },

  { fn: doji, name: 'Doji', type: 'neutral', weight: 1 },
];

// ═══════════════════════════════════════════════
// FETCH OHLCV FROM EXCHANGES
// ═══════════════════════════════════════════════

async function fetchKlinesFromBinance(symbol, limit = 30) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.map(k => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      time: k[0],
    }));
  } catch { return null; }
}

async function fetchKlinesFromBybit(symbol, limit = 30) {
  try {
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=D&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result?.list) return null;
    return data.result.list.reverse().map(k => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      time: parseInt(k[0]),
    }));
  } catch { return null; }
}

async function fetchKlines(symbol, limit = 30) {
  let candles = await fetchKlinesFromBinance(symbol, limit);
  if (candles && candles.length >= 10) return candles;
  candles = await fetchKlinesFromBybit(symbol, limit);
  if (candles && candles.length >= 10) return candles;
  return null;
}

// ═══════════════════════════════════════════════
// DETECT PATTERNS
// ═══════════════════════════════════════════════

function detectCandlestickPatterns(candles) {
  if (!candles || candles.length < 5) return [];
  const last5 = candles.slice(-5);
  const ohlc = {
    open: last5.map(c => c.open),
    high: last5.map(c => c.high),
    low: last5.map(c => c.low),
    close: last5.map(c => c.close),
  };
  const detected = [];
  for (const pattern of CANDLESTICK_PATTERNS) {
    try {
      if (pattern.fn(ohlc)) {
        detected.push({ pattern: pattern.name, type: pattern.type, weight: pattern.weight });
      }
    } catch {}
  }
  return detected;
}

function detectMAPatterns(candles, ma20, ma50, ma200) {
  if (!candles || candles.length < 2) return [];
  const detected = [];
  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles[candles.length - 2].close;

  if (ma20 && ma50 && ma200) {
    if (currentPrice > ma20 && ma20 > ma50 && ma50 > ma200)
      detected.push({ pattern: 'Golden Cross', type: 'bullish', weight: 3 });
    if (currentPrice < ma20 && ma20 < ma50 && ma50 < ma200)
      detected.push({ pattern: 'Death Cross', type: 'bearish', weight: 3 });
  }
  if (ma20 && prevPrice < ma20 && currentPrice > ma20)
    detected.push({ pattern: 'Price Crossed Above 20MA', type: 'bullish', weight: 2 });
  if (ma50 && prevPrice < ma50 && currentPrice > ma50)
    detected.push({ pattern: 'Price Crossed Above 50MA', type: 'bullish', weight: 2 });
  if (ma200 && prevPrice < ma200 && currentPrice > ma200)
    detected.push({ pattern: 'Price Crossed Above 200MA', type: 'bullish', weight: 3 });
  if (ma20 && prevPrice > ma20 && currentPrice < ma20)
    detected.push({ pattern: 'Price Crossed Below 20MA', type: 'bearish', weight: 2 });
  if (ma50 && prevPrice > ma50 && currentPrice < ma50)
    detected.push({ pattern: 'Price Crossed Below 50MA', type: 'bearish', weight: 2 });
  if (ma200 && prevPrice > ma200 && currentPrice < ma200)
    detected.push({ pattern: 'Price Crossed Below 200MA', type: 'bearish', weight: 3 });
  return detected;
}

function detectVolumePatterns(candles) {
  if (!candles || candles.length < 11) return [];
  const detected = [];
  const avgVol = candles.slice(-11, -1).reduce((s, c) => s + c.volume, 0) / 10;
  const lastVol = candles[candles.length - 1].volume;
  const lastChange = candles[candles.length - 1].close - candles[candles.length - 1].open;

  if (lastVol > avgVol * 2) {
    detected.push({ pattern: lastChange > 0 ? 'Volume Spike (Bullish)' : 'Volume Spike (Bearish)', type: lastChange > 0 ? 'bullish' : 'bearish', weight: 2 });
  }
  if (lastVol > avgVol * 3) {
    detected.push({ pattern: 'Extreme Volume Surge', type: 'neutral', weight: 3 });
  }
  return detected;
}

function detectRSIPatterns(candles) {
  if (!candles || candles.length < 20) return [];
  const detected = [];
  const closes = candles.map(c => c.close);
  const rsiValues = RSI.calculate({ values: closes, period: 14 });

  if (rsiValues.length >= 2) {
    const currentRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    if (currentRSI < 30) detected.push({ pattern: `RSI Oversold (${currentRSI.toFixed(0)})`, type: 'bullish', weight: 2 });
    if (currentRSI > 70) detected.push({ pattern: `RSI Overbought (${currentRSI.toFixed(0)})`, type: 'bearish', weight: 2 });
    if (prevRSI < 30 && currentRSI > 30) detected.push({ pattern: 'RSI Bouncing From Oversold', type: 'bullish', weight: 3 });
    if (prevRSI > 70 && currentRSI < 70) detected.push({ pattern: 'RSI Dropping From Overbought', type: 'bearish', weight: 3 });
  }
  return detected;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🔍 Pattern Scanner Starting...\n');

  const coinsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/coins?select=base,exchange,price,volume_24h,change_24h,ma_20,ma_50,ma_200&order=volume_24h.desc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const allCoins = await coinsRes.json();

  const coinMap = new Map();
  for (const coin of allCoins) {
    if (!coinMap.has(coin.base) || coin.volume_24h > coinMap.get(coin.base).volume_24h)
      coinMap.set(coin.base, coin);
  }
  const coins = Array.from(coinMap.values());
  console.log(`📊 ${coins.length} unique coins to scan\n`);

  const allSignals = [];
  let processed = 0, withPatterns = 0;

  for (const coin of coins) {
    processed++;
    if (processed % 50 === 0)
      console.log(`  [${processed}/${coins.length}] Scanning... (${withPatterns} patterns found so far)`);

    const candles = await fetchKlines(coin.base, 30);
    await sleep(100);
    if (!candles) continue;

    const patterns = [
      ...detectCandlestickPatterns(candles),
      ...detectMAPatterns(candles, coin.ma_20, coin.ma_50, coin.ma_200),
      ...detectVolumePatterns(candles),
      ...detectRSIPatterns(candles),
    ];

    if (patterns.length > 0) {
      withPatterns++;
      const bullishWeight = patterns.filter(p => p.type === 'bullish').reduce((s, p) => s + p.weight, 0);
      const bearishWeight = patterns.filter(p => p.type === 'bearish').reduce((s, p) => s + p.weight, 0);
      const totalWeight = bullishWeight + bearishWeight;
      const signal = bullishWeight > bearishWeight ? 'bullish' : bearishWeight > bullishWeight ? 'bearish' : 'neutral';
      const strength = totalWeight >= 6 ? 'strong' : totalWeight >= 3 ? 'moderate' : 'weak';

      allSignals.push({
        base: coin.base, exchange: coin.exchange, price: coin.price,
        volume_24h: coin.volume_24h, change_24h: coin.change_24h,
        signal, strength, bullish_score: bullishWeight, bearish_score: bearishWeight,
        patterns: patterns.map(p => p.pattern).join(', '),
        pattern_count: patterns.length,
        pattern_details: JSON.stringify(patterns),
        scanned_at: new Date().toISOString(),
      });
    }
  }

  console.log(`\n✅ Scan complete: ${processed} coins scanned, ${allSignals.length} with patterns`);

  // Clear old signals
  await fetch(`${SUPABASE_URL}/rest/v1/pattern_signals?scanned_at=not.is.null`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });

  // Insert in batches
  for (let i = 0; i < allSignals.length; i += 50) {
    const batch = allSignals.slice(i, i + 50);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pattern_signals`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) console.error(`❌ Insert batch failed:`, await res.text());
  }

  const bullish = allSignals.filter(s => s.signal === 'bullish');
  const bearish = allSignals.filter(s => s.signal === 'bearish');

  console.log(`\n📈 Summary:`);
  console.log(`  Bullish signals: ${bullish.length}`);
  console.log(`  Bearish signals: ${bearish.length}`);
  console.log(`  Strong signals: ${allSignals.filter(s => s.strength === 'strong').length}`);

  console.log(`\n🔥 Top Bullish (Strong):`);
  bullish.filter(s => s.strength === 'strong').sort((a, b) => b.bullish_score - a.bullish_score).slice(0, 10)
    .forEach(s => console.log(`  ${s.base}: score=${s.bullish_score} | ${s.patterns}`));

  console.log(`\n💀 Top Bearish (Strong):`);
  bearish.filter(s => s.strength === 'strong').sort((a, b) => b.bearish_score - a.bearish_score).slice(0, 10)
    .forEach(s => console.log(`  ${s.base}: score=${s.bearish_score} | ${s.patterns}`));

  console.log(`\n✅ ${allSignals.length} signals saved to Supabase`);
}

main().catch(console.error);
