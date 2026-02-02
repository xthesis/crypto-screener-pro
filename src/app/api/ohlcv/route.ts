import { NextResponse } from 'next/server';
import { fetchOHLCV, ExchangeName } from '@/lib/exchanges/aggregator';
import { Timeframe } from '@/lib/exchanges/types';
import { calculateRSI, calculateMACD, calculateBollingerBands } from '@/lib/indicators';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    
    const exchange = url.searchParams.get('exchange') as ExchangeName;
    const symbol = url.searchParams.get('symbol');
    const timeframe = url.searchParams.get('timeframe') as Timeframe;
    const limit = parseInt(url.searchParams.get('limit') || '100');

    if (!exchange || !symbol || !timeframe) {
      return NextResponse.json(
        { error: 'Missing required params: exchange, symbol, timeframe' },
        { status: 400 }
      );
    }

    const ohlcv = await fetchOHLCV(exchange, symbol, timeframe, limit);

    if (ohlcv.length === 0) {
      return NextResponse.json(
        { error: 'No OHLCV data available' },
        { status: 404 }
      );
    }

    // Calculate indicators from OHLCV
    const closePrices = ohlcv.map(candle => candle.close);
    const rsi = calculateRSI(closePrices, 14);
    const macd = calculateMACD(closePrices);
    const bb = calculateBollingerBands(closePrices, 20, 2);

    const latestIndex = closePrices.length - 1;

    return NextResponse.json({
      ohlcv,
      indicators: {
        rsi_14: rsi[latestIndex],
        macd: macd[latestIndex],
        bb: bb[latestIndex],
      },
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60', // Cache OHLCV for 1 minute
        'X-Exchange': exchange,
        'X-Symbol': symbol,
        'X-Timeframe': timeframe,
        'X-Candles': String(ohlcv.length),
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch OHLCV' },
      { status: 500 }
    );
  }
}
