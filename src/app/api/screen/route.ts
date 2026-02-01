import { NextResponse } from 'next/server';
import { fetchTop300Coins } from '@/lib/coinData';
import { addEstimatedIndicators } from '@/lib/indicators';
import { screenCoins } from '@/lib/formulaEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { conditions } = await req.json();

    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
      return NextResponse.json({ error: 'Conditions array is required' }, { status: 400 });
    }

    const coins = await fetchTop300Coins();
    const coinsWithIndicators = coins.map(coin => addEstimatedIndicators(coin));
    const results = screenCoins(coinsWithIndicators, conditions);

    return NextResponse.json({ results, total: results.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Screening failed' }, { status: 500 });
  }
}
