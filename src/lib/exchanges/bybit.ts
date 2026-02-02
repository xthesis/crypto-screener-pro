// src/lib/exchanges/bybit.ts
import axios from 'axios';
import { ExchangeAPI, Ticker, OHLCV, NormalizedSymbol, Timeframe } from './types';

const BASE_URL = 'https://api.bybit.com';

class BybitAPI implements ExchangeAPI {
  name = 'bybit';

  private timeframeMap: Record<Timeframe, string> = {
    '15m': '15',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
    '1w': 'W',
  };

  async fetchAllSymbols(): Promise<string[]> {
    try {
      const response = await axios.get(`${BASE_URL}/v5/market/instruments-info`, {
        params: {
          category: 'linear', // USDT perpetuals
        },
      });
      
      return response.data.result.list
        .filter((s: any) => s.quoteCoin === 'USDT' && s.status === 'Trading')
        .map((s: any) => s.symbol);
    } catch (error: any) {
      console.error('[Bybit] Error fetching symbols:', error.message);
      throw new Error('Failed to fetch Bybit symbols');
    }
  }

  async fetchAllTickers(): Promise<Ticker[]> {
    try {
      const response = await axios.get(`${BASE_URL}/v5/market/tickers`, {
        params: {
          category: 'linear',
        },
      });

      return response.data.result.list
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .map((t: any) => {
          const baseAsset = t.symbol.replace('USDT', '');
          const price = parseFloat(t.lastPrice);
          const priceChange = parseFloat(t.price24hPcnt) * 100; // Bybit returns decimal

          return {
            symbol: t.symbol,
            baseAsset,
            quoteAsset: 'USDT',
            price,
            volume24h: parseFloat(t.turnover24h), // Already in USDT
            priceChange24h: (priceChange / 100) * price,
            priceChangePercent24h: priceChange,
            high24h: parseFloat(t.highPrice24h),
            low24h: parseFloat(t.lowPrice24h),
            lastUpdated: Date.now(),
          } as Ticker;
        });
    } catch (error: any) {
      console.error('[Bybit] Error fetching tickers:', error.message);
      throw new Error('Failed to fetch Bybit tickers');
    }
  }

  async fetchOHLCV(symbol: string, timeframe: Timeframe, limit = 100): Promise<OHLCV[]> {
    try {
      const interval = this.timeframeMap[timeframe];
      const response = await axios.get(`${BASE_URL}/v5/market/kline`, {
        params: {
          category: 'linear',
          symbol: symbol.replace('/', ''), // BTC/USDT -> BTCUSDT
          interval,
          limit,
        },
      });

      return response.data.result.list.map((k: any) => ({
        timestamp: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      })).reverse(); // Bybit returns newest first, we want oldest first
    } catch (error: any) {
      console.error(`[Bybit] Error fetching OHLCV for ${symbol}:`, error.message);
      return [];
    }
  }

  normalizeSymbol(exchangeSymbol: string): NormalizedSymbol {
    // BTCUSDT -> BTC/USDT
    const base = exchangeSymbol.replace('USDT', '');
    const quote = 'USDT';
    
    return {
      id: `${base}/${quote}`,
      base,
      quote,
      exchange: this.name,
      exchangeSymbol,
    };
  }

  denormalizeSymbol(normalizedId: string): string {
    // BTC/USDT -> BTCUSDT
    return normalizedId.replace('/', '');
  }
}

export const bybitAPI = new BybitAPI();
