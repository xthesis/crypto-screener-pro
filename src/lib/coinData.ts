// src/lib/coinData.ts
import axios from 'axios';
import { Coin, OHLCV } from '@/types';

// Cache for coin data (15 minutes TTL)
const coinCache = new Map<string, { data: Coin[]; timestamp: number }>();
const ohlcvCache = new Map<string, { data: OHLCV[]; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

// ============================================
// FETCH TOP 300 COINS FROM COINGECKO
// ============================================
export async function fetchTop300Coins(bustCache = false): Promise<Coin[]> {
  const cacheKey = 'top300';
  const cached = coinCache.get(cacheKey);
  
  if (!bustCache && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets',
      {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 300,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h,7d,30d,1y'
        },
        timeout: 15000,
      }
    );

    const coins: Coin[] = response.data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price || 0,
      market_cap: coin.market_cap || 0,
      market_cap_rank: coin.market_cap_rank || 999,
      total_volume: coin.total_volume || 0,
      high_24h: coin.high_24h || coin.current_price,
      low_24h: coin.low_24h || coin.current_price,
      price_change_24h: coin.price_change_24h || 0,
      price_change_percentage_24h: coin.price_change_percentage_24h || 0,
      price_change_percentage_7d: coin.price_change_percentage_7d_in_currency || 0,
      price_change_percentage_30d: coin.price_change_percentage_30d_in_currency || 0,
      price_change_percentage_1y: coin.price_change_percentage_1y_in_currency || 0,
      circulating_supply: coin.circulating_supply || 0,
      total_supply: coin.total_supply || 0,
      max_supply: coin.max_supply || 0,
      ath: coin.ath || coin.current_price,
      ath_change_percentage: coin.ath_change_percentage || 0,
      ath_date: coin.ath_date || new Date().toISOString(),
      atl: coin.atl || coin.current_price,
      atl_change_percentage: coin.atl_change_percentage || 0,
      atl_date: coin.atl_date || new Date().toISOString(),
      last_updated: coin.last_updated || new Date().toISOString(),
      image: coin.image || '',
    }));

    coinCache.set(cacheKey, { data: coins, timestamp: Date.now() });
    return coins;
  } catch (error: any) {
    console.error('Error fetching top 300 coins:', error.message);
    throw new Error('Failed to fetch coin data. Please try again.');
  }
}

// ============================================
// FETCH OHLCV DATA FROM BINANCE
// ============================================
export async function fetchCoinOHLCV(
  symbol: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1d',
  limit: number = 365
): Promise<OHLCV[]> {
  const cacheKey = `${symbol}-${interval}-${limit}`;
  const cached = ohlcvCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Try Binance first
    const response = await axios.get(
      'https://api.binance.com/api/v3/klines',
      {
        params: {
          symbol: `${symbol}USDT`,
          interval,
          limit
        },
        timeout: 10000,
      }
    );

    const ohlcv: OHLCV[] = response.data.map((kline: any) => ({
      time: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));

    ohlcvCache.set(cacheKey, { data: ohlcv, timestamp: Date.now() });
    return ohlcv;
  } catch (error: any) {
    console.error(`Error fetching OHLCV for ${symbol}:`, error.message);
    
    // Fallback: return empty array or generate synthetic data
    return [];
  }
}

// ============================================
// CALCULATE VOLUME RATIO
// ============================================
export function calculateVolumeRatio(coin: Coin, avgPeriod: number = 30): number {
  // Simplified: current volume vs market cap
  // In production, you'd fetch historical volume data
  const estimatedAvgVolume = coin.market_cap * 0.1; // 10% turnover estimate
  return coin.total_volume / estimatedAvgVolume;
}

// ============================================
// SEARCH COINS
// ============================================
export async function searchCoins(query: string, limit: number = 50): Promise<Coin[]> {
  try {
    const allCoins = await fetchTop300Coins();
    const lowercaseQuery = query.toLowerCase();
    
    return allCoins
      .filter(coin => 
        coin.symbol.toLowerCase().includes(lowercaseQuery) ||
        coin.name.toLowerCase().includes(lowercaseQuery)
      )
      .slice(0, limit);
  } catch (error) {
    console.error('Error searching coins:', error);
    return [];
  }
}

// ============================================
// GET SINGLE COIN DETAILS
// ============================================
export async function getCoinDetails(coinId: string): Promise<Coin | null> {
  try {
    const allCoins = await fetchTop300Coins();
    return allCoins.find(coin => coin.id === coinId || coin.symbol === coinId.toUpperCase()) || null;
  } catch (error) {
    console.error('Error getting coin details:', error);
    return null;
  }
}

// ============================================
// BATCH FETCH WITH INDICATORS
// ============================================
export async function fetchCoinsWithIndicators(): Promise<Coin[]> {
  const coins = await fetchTop300Coins();
  
  // Add volume ratio
  return coins.map(coin => ({
    ...coin,
    volume_ratio: calculateVolumeRatio(coin),
  }));
}

// ============================================
// HELPER: Format large numbers
// ============================================
export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatVolume(value: number): string {
  return formatMarketCap(value);
}

export function formatPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}
