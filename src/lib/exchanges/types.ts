// src/lib/exchanges/types.ts

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;           // Exchange-specific format (BTCUSDT, BTC-USDT, etc)
  baseAsset: string;        // BTC
  quoteAsset: string;       // USDT
  price: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  lastUpdated: number;
}

export interface NormalizedSymbol {
  id: string;               // BTC/USDT (our internal format)
  base: string;             // BTC
  quote: string;            // USDT
  exchange: string;         // binance, bybit, etc
  exchangeSymbol: string;   // BTCUSDT (exchange-specific)
}

export type Timeframe = '15m' | '1h' | '4h' | '1d' | '1w';

export interface ExchangeAPI {
  name: string;
  
  // Fetch all available trading pairs
  fetchAllSymbols(): Promise<string[]>;
  
  // Fetch 24h ticker data for all symbols
  fetchAllTickers(): Promise<Ticker[]>;
  
  // Fetch OHLCV data for a specific symbol and timeframe
  fetchOHLCV(symbol: string, timeframe: Timeframe, limit?: number): Promise<OHLCV[]>;
  
  // Normalize exchange-specific symbol to our standard format
  normalizeSymbol(exchangeSymbol: string): NormalizedSymbol;
  
  // Convert our standard format back to exchange-specific
  denormalizeSymbol(normalizedId: string): string;
}
