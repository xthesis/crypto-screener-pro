import { NextResponse } from 'next/server';
import { fetchUnifiedCoins, clearCache, ExchangeName } from '@/lib/exchanges/aggregator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bust = url.searchParams.has('bust');
    
    // Get selected exchanges from query params (comma-separated)
    const exchangesParam = url.searchParams.get('exchanges');
    const selectedExchanges: ExchangeName[] = exchangesParam
      ? (exchangesParam.split(',') as ExchangeName[])
      : ['binance', 'bybit']; // Default to Binance + Bybit

    if (bust) {
      clearCache();
    }

    const coins = await fetchUnifiedCoins(selectedExchanges);

    return NextResponse.json(coins, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'X-Cache-Busted': String(bust),
        'X-Server-Time': new Date().toISOString(),
        'X-Exchanges': selectedExchanges.join(','),
        'X-Coin-Count': String(coins.length),
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch coins' }, { status: 500 });
  }
}
