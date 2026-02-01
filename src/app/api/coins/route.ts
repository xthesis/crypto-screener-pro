import { NextResponse } from 'next/server';
import { fetchTop300Coins } from '@/lib/coinData';
import { addEstimatedIndicators } from '@/lib/indicators';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const coins = await fetchTop300Coins();
    const coinsWithIndicators = coins.map(coin => addEstimatedIndicators(coin));
    return NextResponse.json(coinsWithIndicators);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch coins' }, { status: 500 });
  }
}
