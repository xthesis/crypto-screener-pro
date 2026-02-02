// src/lib/ma-calculator.ts
// Calculates Moving Averages (20, 50, 200) for all coins

import { supabase, CoinRecord } from './supabase';

interface Kline {
  close: number;
}

// Fetch daily candles from Binance
async function fetchBinanceKlines(symbol: string, limit: number = 200): Promise<number[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((k: any) => parseFloat(k[4])); // Close prices
  } catch {
    return [];
  }
}

// Fetch daily candles from Bybit
async function fetchBybitKlines(symbol: string, limit: number = 200): Promise<number[]> {
  try {
    const response = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}USDT&interval=D&limit=${limit}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.result?.list) return [];
    // Bybit returns newest first, reverse it
    return data.result.list.reverse().map((k: any) => parseFloat(k[4])); // Close prices
  } catch {
    return [];
  }
}

// Fetch daily candles from OKX
async function fetchOkxKlines(symbol: string, limit: number = 200): Promise<number[]> {
  try {
    const response = await fetch(
      `https://www.okx.com/api/v5/market/candles?instId=${symbol}-USDT&bar=1D&limit=${limit}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.data) return [];
    // OKX returns newest first, reverse it
    return data.data.reverse().map((k: any) => parseFloat(k[4])); // Close prices
  } catch {
    return [];
  }
}

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const relevantPrices = prices.slice(-period);
  const sum = relevantPrices.reduce((a, b) => a + b, 0);
  return sum / period;
}

// Fetch klines for a symbol (tries multiple exchanges)
async function fetchKlines(symbol: string): Promise<number[]> {
  // Try Binance first (most reliable)
  let prices = await fetchBinanceKlines(symbol);
  if (prices.length >= 200) return prices;

  // Try Bybit
  prices = await fetchBybitKlines(symbol);
  if (prices.length >= 200) return prices;

  // Try OKX
  prices = await fetchOkxKlines(symbol);
  return prices;
}

// Get top coins by volume from current tickers
async function getTopCoins(): Promise<{ symbol: string; base: string; exchange: string; price: number; volume: number; change: number }[]> {
  const coins: { symbol: string; base: string; exchange: string; price: number; volume: number; change: number }[] = [];

  // Fetch from Binance
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const data = await response.json();
    data
      .filter((t: any) => t.symbol.endsWith('USDT'))
      .forEach((t: any) => {
        const volume = parseFloat(t.volume) * parseFloat(t.lastPrice);
        if (volume >= 100000) { // Min $100k volume
          coins.push({
            symbol: t.symbol,
            base: t.symbol.replace('USDT', ''),
            exchange: 'binance',
            price: parseFloat(t.lastPrice),
            volume,
            change: parseFloat(t.priceChangePercent),
          });
        }
      });
  } catch (e) {
    console.error('Binance fetch error:', e);
  }

  // Fetch from Bybit
  try {
    const response = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
    const data = await response.json();
    if (data.result?.list) {
      data.result.list
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .forEach((t: any) => {
          const volume = parseFloat(t.turnover24h);
          if (volume >= 100000 && !coins.find(c => c.base === t.symbol.replace('USDT', ''))) {
            coins.push({
              symbol: t.symbol,
              base: t.symbol.replace('USDT', ''),
              exchange: 'bybit',
              price: parseFloat(t.lastPrice),
              volume,
              change: parseFloat(t.price24hPcnt) * 100,
            });
          }
        });
    }
  } catch (e) {
    console.error('Bybit fetch error:', e);
  }

  // Sort by volume and return top 500
  return coins.sort((a, b) => b.volume - a.volume).slice(0, 500);
}

// Main function to update all MAs
export async function updateAllMAs(): Promise<{ updated: number; errors: number }> {
  console.log('Starting MA update...');
  
  const coins = await getTopCoins();
  console.log(`Found ${coins.length} coins to process`);

  let updated = 0;
  let errors = 0;

  // Process in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < coins.length; i += batchSize) {
    const batch = coins.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (coin) => {
        try {
          const prices = await fetchKlines(coin.base);
          
          const ma20 = calculateSMA(prices, 20);
          const ma50 = calculateSMA(prices, 50);
          const ma200 = calculateSMA(prices, 200);

          const record: Partial<CoinRecord> = {
            id: `${coin.exchange}-${coin.symbol}`,
            symbol: coin.symbol,
            base: coin.base,
            exchange: coin.exchange,
            price: coin.price,
            volume_24h: coin.volume,
            change_24h: coin.change,
            ma_20: ma20,
            ma_50: ma50,
            ma_200: ma200,
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('coins')
            .upsert(record, { onConflict: 'id' });

          if (error) {
            console.error(`Error updating ${coin.base}:`, error.message);
            errors++;
          } else {
            updated++;
          }
        } catch (e) {
          console.error(`Error processing ${coin.base}:`, e);
          errors++;
        }
      })
    );

    // Small delay between batches
    if (i + batchSize < coins.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Processed ${Math.min(i + batchSize, coins.length)}/${coins.length} coins`);
  }

  console.log(`MA update complete. Updated: ${updated}, Errors: ${errors}`);
  return { updated, errors };
}
