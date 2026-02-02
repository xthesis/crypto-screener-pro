// src/lib/exchanges/aggregator.ts
import { binanceAPI } from './binance';
import { bybitAPI } from './bybit';
import { ExchangeAPI, Ticker, OHLCV, Timeframe } from './types';

export const AVAILABLE_EXCHANGES = {
  binance: binanceAPI,
  bybit: bybitAPI,
  // okx: okxAPI,        // Add later
  // gateio: gateioAPI,  // Add later
  // coinbase: coinbaseAPI, // Add later
  // hyperliquid: hyperliquidAPI, // Add later
  // aster: asterAPI,    // Add later
} as const;

export type ExchangeName = keyof typeof AVAILABLE_EXCHANGES;

interface UnifiedCoin {
  id: string;  // BTC/USDT
  base: string;
  quote: string;
  exchanges: {
    [key in ExchangeName]?: {
      symbol: string;
      price: number;
      volume24h: number;
      priceChange24h: number;
      priceChangePercent24h: number;
      high24h: number;
      low24h: number;
      lastUpdated: number;
    };
  };
  aggregated: {
    avgPrice: number;
    totalVolume: number;
    avgPriceChange24h: number;
    bestBid: { exchange: ExchangeName; price: number } | null;
    bestAsk: { exchange: ExchangeName; price: number } | null;
  };
}

// In-memory cache for quick access
let coinsCache: Map<string, UnifiedCoin> = new Map();
let lastUpdate = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Fetch and merge ticker data from selected exchanges
 */
export async function fetchUnifiedCoins(
  exchanges: ExchangeName[] = ['binance', 'bybit']
): Promise<UnifiedCoin[]> {
  // Return cache if fresh
  if (Date.now() - lastUpdate < CACHE_TTL && coinsCache.size > 0) {
    return Array.from(coinsCache.values()).filter(coin =>
      exchanges.some(ex => coin.exchanges[ex])
    );
  }

  const coinMap = new Map<string, UnifiedCoin>();

  // Fetch from all selected exchanges in parallel
  const results = await Promise.allSettled(
    exchanges.map(async (exchangeName) => {
      const exchange = AVAILABLE_EXCHANGES[exchangeName];
      console.log(`[Aggregator] Fetching tickers from ${exchangeName}...`);
      const tickers = await exchange.fetchAllTickers();
      return { exchangeName, tickers };
    })
  );

  // Merge results
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[Aggregator] Exchange fetch failed:', result.reason);
      continue;
    }

    const { exchangeName, tickers } = result.value;

    for (const ticker of tickers) {
      const normalized = AVAILABLE_EXCHANGES[exchangeName].normalizeSymbol(ticker.symbol);
      const coinId = normalized.id;

      if (!coinMap.has(coinId)) {
        coinMap.set(coinId, {
          id: coinId,
          base: normalized.base,
          quote: normalized.quote,
          exchanges: {},
          aggregated: {
            avgPrice: 0,
            totalVolume: 0,
            avgPriceChange24h: 0,
            bestBid: null,
            bestAsk: null,
          },
        });
      }

      const coin = coinMap.get(coinId)!;
      coin.exchanges[exchangeName] = {
        symbol: ticker.symbol,
        price: ticker.price,
        volume24h: ticker.volume24h,
        priceChange24h: ticker.priceChange24h,
        priceChangePercent24h: ticker.priceChangePercent24h,
        high24h: ticker.high24h,
        low24h: ticker.low24h,
        lastUpdated: ticker.lastUpdated,
      };
    }
  }

  // Calculate aggregated data
  for (const coin of coinMap.values()) {
    const exchangeData = Object.entries(coin.exchanges);
    
    if (exchangeData.length === 0) continue;

    const prices = exchangeData.map(([_, data]) => data.price);
    const volumes = exchangeData.map(([_, data]) => data.volume24h);
    const priceChanges = exchangeData.map(([_, data]) => data.priceChange24h);

    coin.aggregated.avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    coin.aggregated.totalVolume = volumes.reduce((a, b) => a + b, 0);
    coin.aggregated.avgPriceChange24h = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;

    // Best bid (highest price to sell at)
    const maxPriceExchange = exchangeData.reduce((prev, curr) => 
      curr[1].price > prev[1].price ? curr : prev
    );
    coin.aggregated.bestBid = {
      exchange: maxPriceExchange[0] as ExchangeName,
      price: maxPriceExchange[1].price,
    };

    // Best ask (lowest price to buy at)
    const minPriceExchange = exchangeData.reduce((prev, curr) => 
      curr[1].price < prev[1].price ? curr : prev
    );
    coin.aggregated.bestAsk = {
      exchange: minPriceExchange[0] as ExchangeName,
      price: minPriceExchange[1].price,
    };
  }

  // Update cache
  coinsCache = coinMap;
  lastUpdate = Date.now();

  console.log(`[Aggregator] Cached ${coinMap.size} unified coins`);
  return Array.from(coinMap.values());
}

/**
 * Fetch OHLCV data for a specific symbol from a specific exchange
 */
export async function fetchOHLCV(
  exchange: ExchangeName,
  symbol: string,
  timeframe: Timeframe,
  limit = 100
): Promise<OHLCV[]> {
  const api = AVAILABLE_EXCHANGES[exchange];
  return api.fetchOHLCV(symbol, timeframe, limit);
}

/**
 * Get list of all available symbols across selected exchanges
 */
export async function fetchAllSymbols(
  exchanges: ExchangeName[] = ['binance', 'bybit']
): Promise<Map<ExchangeName, string[]>> {
  const symbolMap = new Map<ExchangeName, string[]>();

  const results = await Promise.allSettled(
    exchanges.map(async (exchangeName) => {
      const exchange = AVAILABLE_EXCHANGES[exchangeName];
      const symbols = await exchange.fetchAllSymbols();
      return { exchangeName, symbols };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      symbolMap.set(result.value.exchangeName, result.value.symbols);
      console.log(`[Aggregator] ${result.value.exchangeName}: ${result.value.symbols.length} symbols`);
    }
  }

  return symbolMap;
}

/**
 * Clear cache (useful for forcing refresh)
 */
export function clearCache() {
  coinsCache.clear();
  lastUpdate = 0;
}
