// src/lib/exchanges/client-fetcher.ts
// Client-side fetcher that runs in the browser to avoid server IP blocks

export interface SimpleTicker {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  volume24h: number;
  priceChangePercent24h: number;
  exchange: string;
}

export type ExchangeName = 'binance' | 'bybit' | 'okx' | 'gateio' | 'coinbase' | 'hyperliquid' | 'aster';
export type Timeframe = '15m' | '1h' | '4h' | '1d' | '1w';

// Binance client-side fetch
export async function fetchBinanceTickers(): Promise<SimpleTicker[]> {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    
    const data = await response.json();
    
    return data
      .filter((t: any) => t.symbol.endsWith('USDT'))
      .map((t: any) => ({
        symbol: t.symbol,
        base: t.symbol.replace('USDT', ''),
        quote: 'USDT',
        price: parseFloat(t.lastPrice),
        volume24h: parseFloat(t.volume) * parseFloat(t.lastPrice),
        priceChangePercent24h: parseFloat(t.priceChangePercent),
        exchange: 'binance',
      }));
  } catch (error: any) {
    console.error('[Binance Client] Error:', error.message);
    return [];
  }
}

// Bybit client-side fetch
export async function fetchBybitTickers(): Promise<SimpleTicker[]> {
  try {
    const response = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
    if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!data.result?.list) return [];
    
    return data.result.list
      .filter((t: any) => t.symbol.endsWith('USDT'))
      .map((t: any) => {
        const price = parseFloat(t.lastPrice);
        const priceChange = parseFloat(t.price24hPcnt) * 100;
        
        return {
          symbol: t.symbol,
          base: t.symbol.replace('USDT', ''),
          quote: 'USDT',
          price,
          volume24h: parseFloat(t.turnover24h),
          priceChangePercent24h: priceChange,
          exchange: 'bybit',
        };
      });
  } catch (error: any) {
    console.error('[Bybit Client] Error:', error.message);
    return [];
  }
}

// OKX client-side fetch
export async function fetchOkxTickers(): Promise<SimpleTicker[]> {
  try {
    const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!data.data) return [];
    
    return data.data
      .filter((t: any) => t.instId.endsWith('-USDT'))
      .map((t: any) => {
        const price = parseFloat(t.last);
        const open24h = parseFloat(t.open24h);
        const priceChange = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
        
        return {
          symbol: t.instId.replace('-', ''),
          base: t.instId.split('-')[0],
          quote: 'USDT',
          price,
          volume24h: parseFloat(t.volCcy24h),
          priceChangePercent24h: priceChange,
          exchange: 'okx',
        };
      });
  } catch (error: any) {
    console.error('[OKX Client] Error:', error.message);
    return [];
  }
}

// Gate.io client-side fetch
export async function fetchGateioTickers(): Promise<SimpleTicker[]> {
  try {
    const response = await fetch('https://api.gateio.ws/api/v4/spot/tickers');
    if (!response.ok) throw new Error(`Gate.io HTTP ${response.status}`);
    
    const data = await response.json();
    
    return data
      .filter((t: any) => t.currency_pair.endsWith('_USDT'))
      .map((t: any) => {
        const price = parseFloat(t.last);
        
        return {
          symbol: t.currency_pair.replace('_', ''),
          base: t.currency_pair.split('_')[0],
          quote: 'USDT',
          price,
          volume24h: parseFloat(t.quote_volume),
          priceChangePercent24h: parseFloat(t.change_percentage),
          exchange: 'gateio',
        };
      });
  } catch (error: any) {
    console.error('[Gate.io Client] Error:', error.message);
    return [];
  }
}

// Coinbase client-side fetch
export async function fetchCoinbaseTickers(): Promise<SimpleTicker[]> {
  try {
    // Coinbase uses a different API structure - fetch products first, then stats
    const productsResponse = await fetch('https://api.exchange.coinbase.com/products');
    if (!productsResponse.ok) throw new Error(`Coinbase HTTP ${productsResponse.status}`);
    
    const products = await productsResponse.json();
    const usdPairs = products.filter((p: any) => p.quote_currency === 'USD' && !p.trading_disabled);
    
    // Fetch 24hr stats for each pair (limited to top pairs to avoid rate limits)
    const tickers: SimpleTicker[] = [];
    const topPairs = usdPairs.slice(0, 50); // Limit to avoid rate limiting
    
    await Promise.all(
      topPairs.map(async (product: any) => {
        try {
          const statsResponse = await fetch(`https://api.exchange.coinbase.com/products/${product.id}/stats`);
          if (!statsResponse.ok) return;
          
          const stats = await statsResponse.json();
          const price = parseFloat(stats.last);
          const open = parseFloat(stats.open);
          const priceChange = open > 0 ? ((price - open) / open) * 100 : 0;
          
          tickers.push({
            symbol: product.id.replace('-', ''),
            base: product.base_currency,
            quote: 'USD',
            price,
            volume24h: parseFloat(stats.volume) * price,
            priceChangePercent24h: priceChange,
            exchange: 'coinbase',
          });
        } catch {
          // Skip failed individual requests
        }
      })
    );
    
    return tickers;
  } catch (error: any) {
    console.error('[Coinbase Client] Error:', error.message);
    return [];
  }
}

// Hyperliquid client-side fetch
export async function fetchHyperliquidTickers(): Promise<SimpleTicker[]> {
  try {
    // Get meta and asset contexts in one call - this has proper names and price data
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!response.ok) throw new Error(`Hyperliquid HTTP ${response.status}`);
    
    const data = await response.json();
    const meta = data[0]; // Contains universe with coin names
    const assetCtxs = data[1]; // Contains price and volume data
    
    if (!meta?.universe || !assetCtxs) return [];
    
    const tickers: SimpleTicker[] = [];
    
    meta.universe.forEach((coin: any, index: number) => {
      // Skip delisted coins
      if (coin.isDelisted) return;
      
      const ctx = assetCtxs[index];
      if (!ctx) return;
      
      const price = parseFloat(ctx.markPx || '0');
      if (price <= 0) return;
      
      // Calculate 24h price change from prevDayPx
      const prevDayPx = parseFloat(ctx.prevDayPx || '0');
      const priceChange = prevDayPx > 0 ? ((price - prevDayPx) / prevDayPx) * 100 : 0;
      
      // Volume is in notional (USD)
      const volume = parseFloat(ctx.dayNtlVlm || '0');
      
      const symbol = coin.name;
      
      tickers.push({
        symbol: symbol + 'USDT',
        base: symbol,
        quote: 'USDT',
        price,
        volume24h: volume,
        priceChangePercent24h: priceChange,
        exchange: 'hyperliquid',
      });
    });
    
    return tickers;
  } catch (error: any) {
    console.error('[Hyperliquid Client] Error:', error.message);
    return [];
  }
}

// Aster (DEX aggregator) - using their public API
export async function fetchAsterTickers(): Promise<SimpleTicker[]> {
  try {
    // Aster is a newer DEX - adjust endpoint as needed
    // This is a placeholder structure - adjust URL when their API is confirmed
    const response = await fetch('https://api.aster.finance/v1/markets');
    if (!response.ok) throw new Error(`Aster HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];
    
    return data
      .filter((t: any) => t.quoteSymbol === 'USDT' || t.quoteSymbol === 'USDC')
      .map((t: any) => ({
        symbol: t.baseSymbol + t.quoteSymbol,
        base: t.baseSymbol,
        quote: t.quoteSymbol,
        price: parseFloat(t.price || t.lastPrice || 0),
        volume24h: parseFloat(t.volume24h || t.quoteVolume || 0),
        priceChangePercent24h: parseFloat(t.priceChange24h || 0),
        exchange: 'aster',
      }));
  } catch (error: any) {
    console.error('[Aster Client] Error:', error.message);
    // Return empty array - Aster may not be available yet
    return [];
  }
}

// Exchange fetcher registry
const exchangeFetchers: Record<ExchangeName, () => Promise<SimpleTicker[]>> = {
  binance: fetchBinanceTickers,
  bybit: fetchBybitTickers,
  okx: fetchOkxTickers,
  gateio: fetchGateioTickers,
  coinbase: fetchCoinbaseTickers,
  hyperliquid: fetchHyperliquidTickers,
  aster: fetchAsterTickers,
};

// Fetch from multiple exchanges in parallel
export async function fetchAllExchanges(
  exchanges: ExchangeName[] = ['binance', 'bybit']
): Promise<SimpleTicker[]> {
  const promises = exchanges.map(exchange => {
    const fetcher = exchangeFetchers[exchange];
    return fetcher ? fetcher() : Promise.resolve([]);
  });
  
  const results = await Promise.all(promises);
  return results.flat();
}

// Kline/candlestick data for timeframes
export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// Timeframe mappings for different exchanges
const TIMEFRAME_MAP: Record<ExchangeName, Record<Timeframe, string>> = {
  binance: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
  bybit: { '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' },
  okx: { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W' },
  gateio: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
  coinbase: { '15m': '900', '1h': '3600', '4h': '14400', '1d': '86400', '1w': '604800' },
  hyperliquid: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
  aster: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
};

// Fetch klines for a specific symbol and timeframe
export async function fetchKlines(
  exchange: ExchangeName,
  symbol: string,
  timeframe: Timeframe,
  limit: number = 100
): Promise<Kline[]> {
  try {
    switch (exchange) {
      case 'binance': {
        const interval = TIMEFRAME_MAP.binance[timeframe];
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) throw new Error(`Binance klines HTTP ${response.status}`);
        const data = await response.json();
        return data.map((k: any[]) => ({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          closeTime: k[6],
        }));
      }
      
      case 'bybit': {
        const interval = TIMEFRAME_MAP.bybit[timeframe];
        const response = await fetch(
          `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) throw new Error(`Bybit klines HTTP ${response.status}`);
        const data = await response.json();
        if (!data.result?.list) return [];
        return data.result.list.reverse().map((k: any[]) => ({
          openTime: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          closeTime: parseInt(k[0]) + getTimeframeMs(timeframe),
        }));
      }
      
      case 'okx': {
        const bar = TIMEFRAME_MAP.okx[timeframe];
        const instId = symbol.replace('USDT', '-USDT');
        const response = await fetch(
          `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`
        );
        if (!response.ok) throw new Error(`OKX klines HTTP ${response.status}`);
        const data = await response.json();
        if (!data.data) return [];
        return data.data.reverse().map((k: any[]) => ({
          openTime: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          closeTime: parseInt(k[0]) + getTimeframeMs(timeframe),
        }));
      }
      
      case 'gateio': {
        const interval = TIMEFRAME_MAP.gateio[timeframe];
        const pair = symbol.replace('USDT', '_USDT');
        const response = await fetch(
          `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) throw new Error(`Gate.io klines HTTP ${response.status}`);
        const data = await response.json();
        return data.map((k: any[]) => ({
          openTime: parseInt(k[0]) * 1000,
          open: parseFloat(k[5]),
          high: parseFloat(k[3]),
          low: parseFloat(k[4]),
          close: parseFloat(k[2]),
          volume: parseFloat(k[1]),
          closeTime: (parseInt(k[0]) + getTimeframeSec(timeframe)) * 1000,
        }));
      }
      
      default:
        return [];
    }
  } catch (error: any) {
    console.error(`[${exchange} Klines] Error:`, error.message);
    return [];
  }
}

// Helper: Get timeframe duration in milliseconds
function getTimeframeMs(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
  };
  return map[tf];
}

// Helper: Get timeframe duration in seconds
function getTimeframeSec(tf: Timeframe): number {
  return getTimeframeMs(tf) / 1000;
}
