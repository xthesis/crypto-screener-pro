// src/lib/exchanges/binance.ts
import axios from 'axios';
import { ExchangeAPI, Ticker, OHLCV, NormalizedSymbol, Timeframe } from './types';

const BASE_URL = 'https://api.binance.com';

class BinanceAPI implements ExchangeAPI {
  name = 'binance';

  private timeframeMap: Record<Timeframe, string> = {
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
    '1w': '1w',
  };

  async fetchAllSymbols(): Promise<string[]> {
    try {
      const response = await axios.get(`${BASE_URL}/api/v3/exchangeInfo`, {
        headers: { 'User-Agent': 'crypto-screener-pro/1.0' }
      });
      return response.data.symbols
        .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
        .map((s: any) => s.symbol);
    } catch (error: any) {
      console.error('[Binance] Error fetching symbols:', error.message);
      throw new Error('Failed to fetch Binance symbols');
    }
  }

  async fetchAllTickers(): Promise<Ticker[]> {
    try {
      const response = await axios.get(`${BASE_URL}/api/v3/ticker/24hr`, {
        headers: { 'User-Agent': 'crypto-screener-pro/1.0' }
      });
      
      return response.data
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .map((t: any) => {
          const baseAsset = t.symbol.replace('USDT', '');
          return {
            symbol: t.symbol,
            baseAsset,
            quoteAsset: 'USDT',
            price: parseFloat(t.lastPrice),
            volume24h: parseFloat(t.volume) * parseFloat(t.lastPrice),
            priceChange24h: parseFloat(t.priceChange),
            priceChangePercent24h: parseFloat(t.priceChangePercent),
            high24h: parseFloat(t.highPrice),
            low24h: parseFloat(t.lowPrice),
            lastUpdated: Date.now(),
          } as Ticker;
        });
    } catch (error: any) {
      console.error('[Binance] Error fetching tickers:', error.message);
      throw new Error('Failed to fetch Binance tickers');
    }
  }

  async fetchOHLCV(symbol: string, timeframe: Timeframe, limit = 100): Promise<OHLCV[]> {
    try {
      const interval = this.timeframeMap[timeframe];
      const response = await axios.get(`${BASE_URL}/api/v3/klines`, {
        params: {
          symbol: symbol.replace('/', ''), // BTC/USDT -> BTCUSDT
          interval,
          limit,
        },
      });

      return response.data.map((k: any) => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch (error: any) {
      console.error(`[Binance] Error fetching OHLCV for ${symbol}:`, error.message);
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

export const binanceAPI = new BinanceAPI();
