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

export type ExchangeName = 'binance' | 'bybit' | 'okx' | 'gateio' | 'hyperliquid' | 'aster';
export type Timeframe = '15m' | '1h' | '4h' | '1d' | '1w';

// Minimum 24h volume in USD to filter out illiquid/dead tokens
const MIN_VOLUME_USD = 20000;

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
      }))
      .filter((t: SimpleTicker) => t.volume24h >= MIN_VOLUME_USD);
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
      .map((t: any) => ({
        symbol: t.symbol,
        base: t.symbol.replace('USDT', ''),
        quote: 'USDT',
        price: parseFloat(t.lastPrice),
        volume24h: parseFloat(t.turnover24h),
        priceChangePercent24h: parseFloat(t.price24hPcnt) * 100,
        exchange: 'bybit',
      }))
      .filter((t: SimpleTicker) => t.volume24h >= MIN_VOLUME_USD);
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
        return {
          symbol: t.instId.replace('-', ''),
          base: t.instId.split('-')[0],
          quote: 'USDT',
          price,
          volume24h: parseFloat(t.volCcy24h),
          priceChangePercent24h: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
          exchange: 'okx',
        };
      })
      .filter((t: SimpleTicker) => t.volume24h >= MIN_VOLUME_USD);
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
      .map((t: any) => ({
        symbol: t.currency_pair.replace('_', ''),
        base: t.currency_pair.split('_')[0],
        quote: 'USDT',
        price: parseFloat(t.last),
        volume24h: parseFloat(t.quote_volume),
        priceChangePercent24h: parseFloat(t.change_percentage),
        exchange: 'gateio',
      }))
      .filter((t: SimpleTicker) => t.volume24h >= MIN_VOLUME_USD);
  } catch (error: any) {
    console.error('[Gate.io Client] Error:', error.message);
    return [];
  }
}

// Hyperliquid client-side fetch (ALL perps + canonical spot)
// Perps include: crypto, tradfi, HIP-3, pre-launch - all returned by the API
// Spot: only isCanonical=true pairs (filters out fake HIP-1 index tokens like VORTX, USOL, BZEC)
export async function fetchHyperliquidTickers(): Promise<SimpleTicker[]> {
  const tickers: SimpleTicker[] = [];
  
  // 1. Fetch ALL perps (crypto, tradfi, HIP-3, pre-launch, hyperps - everything)
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (response.ok) {
      const data = await response.json();
      const meta = data[0];
      const assetCtxs = data[1];
      
      if (meta?.universe && assetCtxs) {
        meta.universe.forEach((coin: any, index: number) => {
          if (coin.isDelisted) return;
          const ctx = assetCtxs[index];
          if (!ctx) return;
          
          const price = parseFloat(ctx.markPx || '0');
          if (price <= 0) return;
          
          const prevDayPx = parseFloat(ctx.prevDayPx || '0');
          const priceChange = prevDayPx > 0 ? ((price - prevDayPx) / prevDayPx) * 100 : 0;
          const volume = parseFloat(ctx.dayNtlVlm || '0');
          
          if (volume < MIN_VOLUME_USD) return;
          
          tickers.push({
            symbol: coin.name + 'USDT',
            base: coin.name,
            quote: 'USDT',
            price,
            volume24h: volume,
            priceChangePercent24h: priceChange,
            exchange: 'hyperliquid',
          });
        });
      }
    }
  } catch (error: any) {
    console.error('[Hyperliquid Perps] Error:', error.message);
  }
  
  // 2. Fetch canonical spot pairs only (real listings, not HIP-1 index tokens)
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'spotMetaAndAssetCtxs' }),
    });
    if (response.ok) {
      const data = await response.json();
      const spotMeta = data[0];
      const spotCtxs = data[1];
      
      if (spotMeta?.tokens && spotMeta?.universe && spotCtxs) {
        const tokenMap: Record<number, any> = {};
        spotMeta.tokens.forEach((token: any) => { tokenMap[token.index] = token; });
        
        spotMeta.universe.forEach((pair: any, index: number) => {
          // Only include canonical pairs (filters out fake index tokens)
          if (!pair.isCanonical) return;
          
          const ctx = spotCtxs[index];
          if (!ctx) return;
          
          const price = parseFloat(ctx.markPx || '0');
          if (price <= 0) return;
          
          const prevDayPx = parseFloat(ctx.prevDayPx || '0');
          const volume = parseFloat(ctx.dayNtlVlm || '0');
          if (volume < MIN_VOLUME_USD) return;
          
          const priceChange = prevDayPx > 0 ? ((price - prevDayPx) / prevDayPx) * 100 : 0;
          
          const baseToken = tokenMap[pair.tokens[0]];
          const quoteToken = tokenMap[pair.tokens[1]];
          const baseName = baseToken?.name || '?';
          const quoteName = quoteToken?.name || 'USDC';
          
          if (baseName === '?' || baseName === quoteName) return;
          
          // Avoid duplicating if already in perps
          const alreadyExists = tickers.some(t => t.base === baseName);
          if (alreadyExists) return;
          
          tickers.push({
            symbol: baseName + quoteName,
            base: baseName,
            quote: quoteName,
            price,
            volume24h: volume,
            priceChangePercent24h: priceChange,
            exchange: 'hyperliquid',
          });
        });
      }
    }
  } catch (error: any) {
    console.error('[Hyperliquid Spot] Error:', error.message);
  }
  
  return tickers;
}

// Aster - API not publicly available yet
export async function fetchAsterTickers(): Promise<SimpleTicker[]> {
  return [];
}

// Exchange fetcher registry
const exchangeFetchers: Record<ExchangeName, () => Promise<SimpleTicker[]>> = {
  binance: fetchBinanceTickers,
  bybit: fetchBybitTickers,
  okx: fetchOkxTickers,
  gateio: fetchGateioTickers,
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

// Kline/candlestick data
export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

const TIMEFRAME_MAP: Record<ExchangeName, Record<Timeframe, string>> = {
  binance: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
  bybit: { '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' },
  okx: { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W' },
  gateio: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
  hyperliquid: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
  aster: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },
};

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
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        if (!response.ok) throw new Error(`Binance klines HTTP ${response.status}`);
        const data = await response.json();
        return data.map((k: any[]) => ({
          openTime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]), closeTime: k[6],
        }));
      }
      case 'bybit': {
        const interval = TIMEFRAME_MAP.bybit[timeframe];
        const response = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`);
        if (!response.ok) throw new Error(`Bybit klines HTTP ${response.status}`);
        const data = await response.json();
        if (!data.result?.list) return [];
        return data.result.list.reverse().map((k: any[]) => ({
          openTime: parseInt(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          closeTime: parseInt(k[0]) + getTimeframeMs(timeframe),
        }));
      }
      case 'okx': {
        const bar = TIMEFRAME_MAP.okx[timeframe];
        const instId = symbol.replace('USDT', '-USDT');
        const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`);
        if (!response.ok) throw new Error(`OKX klines HTTP ${response.status}`);
        const data = await response.json();
        if (!data.data) return [];
        return data.data.reverse().map((k: any[]) => ({
          openTime: parseInt(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          closeTime: parseInt(k[0]) + getTimeframeMs(timeframe),
        }));
      }
      case 'gateio': {
        const interval = TIMEFRAME_MAP.gateio[timeframe];
        const pair = symbol.replace('USDT', '_USDT');
        const response = await fetch(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=${interval}&limit=${limit}`);
        if (!response.ok) throw new Error(`Gate.io klines HTTP ${response.status}`);
        const data = await response.json();
        return data.map((k: any[]) => ({
          openTime: parseInt(k[0]) * 1000, open: parseFloat(k[5]), high: parseFloat(k[3]),
          low: parseFloat(k[4]), close: parseFloat(k[2]), volume: parseFloat(k[1]),
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

function getTimeframeMs(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000, '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000, '1w': 7 * 24 * 60 * 60 * 1000,
  };
  return map[tf];
}

function getTimeframeSec(tf: Timeframe): number {
  return getTimeframeMs(tf) / 1000;
}
