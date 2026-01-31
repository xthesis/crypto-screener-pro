// src/lib/indicators.ts
import { RSI, MACD, BollingerBands, EMA, SMA } from 'technicalindicators';
import { Coin, OHLCV, MACDValue, BollingerBands as BBType } from '@/types';

// ============================================
// RSI (Relative Strength Index)
// ============================================
export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period) {
    return Array(prices.length).fill(50); // Default neutral RSI
  }

  try {
    const rsiValues = RSI.calculate({
      values: prices,
      period
    });
    
    // Pad with nulls for the initial period
    const paddedRSI = Array(period - 1).fill(50).concat(rsiValues);
    return paddedRSI;
  } catch (error) {
    console.error('RSI calculation error:', error);
    return Array(prices.length).fill(50);
  }
}

// ============================================
// MACD (Moving Average Convergence Divergence)
// ============================================
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDValue[] {
  if (prices.length < slowPeriod + signalPeriod) {
    return Array(prices.length).fill({ MACD: 0, signal: 0, histogram: 0 });
  }

  try {
    const macdValues = MACD.calculate({
      values: prices,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    // Pad with zeros
    const padding = prices.length - macdValues.length;
    const paddedMACD = Array(padding).fill({ MACD: 0, signal: 0, histogram: 0 }).concat(macdValues);
    return paddedMACD;
  } catch (error) {
    console.error('MACD calculation error:', error);
    return Array(prices.length).fill({ MACD: 0, signal: 0, histogram: 0 });
  }
}

// ============================================
// BOLLINGER BANDS
// ============================================
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): BBType[] {
  if (prices.length < period) {
    const defaultBB = { upper: 0, middle: 0, lower: 0 };
    return Array(prices.length).fill(defaultBB);
  }

  try {
    const bbValues = BollingerBands.calculate({
      period,
      values: prices,
      stdDev
    });

    const padding = prices.length - bbValues.length;
    const paddedBB = Array(padding).fill({ upper: 0, middle: 0, lower: 0 }).concat(bbValues);
    return paddedBB;
  } catch (error) {
    console.error('Bollinger Bands calculation error:', error);
    return Array(prices.length).fill({ upper: 0, middle: 0, lower: 0 });
  }
}

// ============================================
// EMA (Exponential Moving Average)
// ============================================
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return prices; // Return original if not enough data
  }

  try {
    const emaValues = EMA.calculate({
      period,
      values: prices
    });

    const padding = prices.length - emaValues.length;
    const paddedEMA = Array(padding).fill(prices[0]).concat(emaValues);
    return paddedEMA;
  } catch (error) {
    console.error('EMA calculation error:', error);
    return prices;
  }
}

// ============================================
// SMA (Simple Moving Average)
// ============================================
export function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return prices;
  }

  try {
    const smaValues = SMA.calculate({
      period,
      values: prices
    });

    const padding = prices.length - smaValues.length;
    const paddedSMA = Array(padding).fill(prices[0]).concat(smaValues);
    return paddedSMA;
  } catch (error) {
    console.error('SMA calculation error:', error);
    return prices;
  }
}

// ============================================
// ADD INDICATORS TO COIN DATA
// ============================================
export async function addIndicatorsToCoin(coin: Coin, ohlcv: OHLCV[]): Promise<Coin> {
  if (ohlcv.length === 0) {
    return coin;
  }

  const closePrices = ohlcv.map(candle => candle.close);
  
  // Calculate all indicators
  const rsiValues = calculateRSI(closePrices, 14);
  const macdValues = calculateMACD(closePrices);
  const bbValues = calculateBollingerBands(closePrices, 20, 2);
  const ema20Values = calculateEMA(closePrices, 20);
  const ema50Values = calculateEMA(closePrices, 50);
  const sma200Values = calculateSMA(closePrices, 200);

  // Get latest values
  const latestIndex = closePrices.length - 1;

  return {
    ...coin,
    rsi_14: rsiValues[latestIndex],
    macd: macdValues[latestIndex],
    bb: bbValues[latestIndex],
    ema_20: ema20Values[latestIndex],
    ema_50: ema50Values[latestIndex],
    sma_200: sma200Values[latestIndex],
  };
}

// ============================================
// BATCH ADD INDICATORS TO MULTIPLE COINS
// ============================================
export async function addIndicatorsToCoins(coins: Coin[], ohlcvData: Map<string, OHLCV[]>): Promise<Coin[]> {
  const coinsWithIndicators = await Promise.all(
    coins.map(async (coin) => {
      const ohlcv = ohlcvData.get(coin.symbol) || [];
      return addIndicatorsToCoin(coin, ohlcv);
    })
  );

  return coinsWithIndicators;
}

// ============================================
// SIMPLE RSI FOR SCREENING (without fetching OHLCV)
// ============================================
export function estimateRSI(priceChange24h: number, priceChange7d: number): number {
  // Simple estimation based on price changes
  // Real RSI requires full price history
  const avgChange = (priceChange24h + priceChange7d) / 2;
  
  if (avgChange > 10) return 70 + Math.min(avgChange - 10, 20);
  if (avgChange > 5) return 60 + (avgChange - 5) * 2;
  if (avgChange > 0) return 50 + avgChange;
  if (avgChange > -5) return 50 + avgChange;
  if (avgChange > -10) return 40 + (avgChange + 5) * 2;
  return Math.max(10, 30 + avgChange);
}

// ============================================
// ADD ESTIMATED INDICATORS (Fast screening)
// ============================================
export function addEstimatedIndicators(coin: Coin): Coin {
  const estimatedRSI = estimateRSI(
    coin.price_change_percentage_24h,
    coin.price_change_percentage_7d
  );

  return {
    ...coin,
    rsi_14: estimatedRSI,
    // Estimated volume ratio
    volume_ratio: coin.total_volume / (coin.market_cap * 0.1),
  };
}
