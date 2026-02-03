// src/app/api/ai-summary/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SUPABASE_URL = 'https://mzuocbdocvhpffytsvaw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dW9jYmRvY3ZocGZmeXRzdmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTc0OTYsImV4cCI6MjA4NTYzMzQ5Nn0.boaEi1_VmDW6NWC998NwJpEvAY899pLIlFTbr0dHgIc';

interface CoinData {
  base: string;
  exchange: string;
  price: number;
  volume_24h: number;
  change_24h: number;
  ma_20: number | null;
  ma_50: number | null;
  ma_200: number | null;
}

export async function GET() {
  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // 1. Fetch all coin data from Supabase
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/coins?select=base,exchange,price,volume_24h,change_24h,ma_20,ma_50,ma_200&order=volume_24h.desc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error('Failed to fetch from Supabase');
    const allCoins: CoinData[] = await res.json();

    // 2. Compute market statistics
    const withChange = allCoins.filter(c => c.change_24h !== null && c.change_24h !== undefined);
    const withMA = allCoins.filter(c => c.ma_20 !== null && c.ma_50 !== null && c.ma_200 !== null);

    const totalCoins = allCoins.length;
    const gainers = withChange.filter(c => c.change_24h > 0).length;
    const losers = withChange.filter(c => c.change_24h < 0).length;
    const bigGainers = withChange.filter(c => c.change_24h > 10).length;
    const bigLosers = withChange.filter(c => c.change_24h < -10).length;

    const aboveMA20 = withMA.filter(c => c.price > c.ma_20!).length;
    const aboveMA50 = withMA.filter(c => c.price > c.ma_50!).length;
    const aboveMA200 = withMA.filter(c => c.price > c.ma_200!).length;

    const goldenCross = withMA.filter(c => c.price > c.ma_20! && c.ma_20! > c.ma_50! && c.ma_50! > c.ma_200!).length;
    const deathCross = withMA.filter(c => c.price < c.ma_20! && c.ma_20! < c.ma_50! && c.ma_50! < c.ma_200!).length;

    // Top movers
    const topGainers = [...withChange].sort((a, b) => b.change_24h - a.change_24h).slice(0, 10);
    const topLosers = [...withChange].sort((a, b) => a.change_24h - b.change_24h).slice(0, 10);
    const topVolume = [...allCoins].sort((a, b) => b.volume_24h - a.volume_24h).slice(0, 10);

    // BTC & ETH data
    const btc = allCoins.find(c => c.base === 'BTC');
    const eth = allCoins.find(c => c.base === 'ETH');
    const sol = allCoins.find(c => c.base === 'SOL');

    const avgChange = withChange.length > 0
      ? withChange.reduce((s, c) => s + c.change_24h, 0) / withChange.length
      : 0;

    // 3. Build data prompt for Claude
    const dataPrompt = `
You are a crypto market analyst AI. Based on the following LIVE market data, write a concise, insightful market summary.

MARKET OVERVIEW:
- Total coins tracked: ${totalCoins}
- Gainers: ${gainers} (${((gainers / withChange.length) * 100).toFixed(1)}%) | Losers: ${losers} (${((losers / withChange.length) * 100).toFixed(1)}%)
- Big gainers (>10%): ${bigGainers} | Big losers (<-10%): ${bigLosers}
- Average 24h change: ${avgChange.toFixed(2)}%

MOVING AVERAGE ANALYSIS (${withMA.length} coins with MA data):
- Above 20 MA: ${aboveMA20} (${((aboveMA20 / withMA.length) * 100).toFixed(1)}%)
- Above 50 MA: ${aboveMA50} (${((aboveMA50 / withMA.length) * 100).toFixed(1)}%)
- Above 200 MA: ${aboveMA200} (${((aboveMA200 / withMA.length) * 100).toFixed(1)}%)
- Golden Cross (Price > 20MA > 50MA > 200MA): ${goldenCross} coins
- Death Cross (Price < 20MA < 50MA < 200MA): ${deathCross} coins

KEY ASSETS:
${btc ? `- BTC: $${btc.price.toLocaleString()} (${btc.change_24h >= 0 ? '+' : ''}${btc.change_24h.toFixed(2)}%) | 20MA: $${btc.ma_20?.toLocaleString() || 'N/A'} | 50MA: $${btc.ma_50?.toLocaleString() || 'N/A'} | 200MA: $${btc.ma_200?.toLocaleString() || 'N/A'}` : '- BTC: N/A'}
${eth ? `- ETH: $${eth.price.toLocaleString()} (${eth.change_24h >= 0 ? '+' : ''}${eth.change_24h.toFixed(2)}%) | 20MA: $${eth.ma_20?.toLocaleString() || 'N/A'} | 50MA: $${eth.ma_50?.toLocaleString() || 'N/A'} | 200MA: $${eth.ma_200?.toLocaleString() || 'N/A'}` : '- ETH: N/A'}
${sol ? `- SOL: $${sol.price.toLocaleString()} (${sol.change_24h >= 0 ? '+' : ''}${sol.change_24h.toFixed(2)}%) | 20MA: $${sol.ma_20?.toLocaleString() || 'N/A'} | 50MA: $${sol.ma_50?.toLocaleString() || 'N/A'} | 200MA: $${sol.ma_200?.toLocaleString() || 'N/A'}` : '- SOL: N/A'}

TOP 10 GAINERS (24h):
${topGainers.map(c => `- ${c.base}: +${c.change_24h.toFixed(2)}% ($${c.price})`).join('\n')}

TOP 10 LOSERS (24h):
${topLosers.map(c => `- ${c.base}: ${c.change_24h.toFixed(2)}% ($${c.price})`).join('\n')}

TOP 10 BY VOLUME:
${topVolume.map(c => `- ${c.base}: $${(c.volume_24h / 1e6).toFixed(0)}M vol (${c.change_24h >= 0 ? '+' : ''}${c.change_24h?.toFixed(2) || '?'}%)`).join('\n')}

INSTRUCTIONS:
Write a market summary with these sections. Use the exact headers shown below. Be data-driven, specific, and concise. No fluff.

1. **MARKET PULSE** - One-line overall sentiment (bullish/bearish/neutral) with key reasoning
2. **KEY MOVES** - 2-3 sentences about the most notable price actions today
3. **MA STRUCTURE** - 2-3 sentences analyzing the moving average data: what % of market is bullish vs bearish from MA perspective, golden crosses vs death crosses
4. **NOTABLE SIGNALS** - 2-3 specific coins worth watching and why (based on unusual moves, MA crossovers, volume)
5. **RISK LEVEL** - One-line risk assessment (Low/Medium/High) based on the data

Keep the total response under 250 words. Be direct and analytical, no disclaimers or "not financial advice" text.
`;

    // 4. Call Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [
          { role: 'user', content: dataPrompt },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('Claude API error:', err);
      throw new Error('AI analysis failed');
    }

    const claudeData = await claudeRes.json();
    const summary = claudeData.content
      .map((block: any) => block.text || '')
      .join('\n')
      .trim();

    // 5. Return summary with stats
    return NextResponse.json({
      summary,
      stats: {
        totalCoins,
        gainers,
        losers,
        bigGainers,
        bigLosers,
        avgChange: avgChange.toFixed(2),
        aboveMA20,
        aboveMA50,
        aboveMA200,
        goldenCross,
        deathCross,
        maCoinsCount: withMA.length,
        btcPrice: btc?.price || 0,
        btcChange: btc?.change_24h || 0,
        ethPrice: eth?.price || 0,
        ethChange: eth?.change_24h || 0,
        solPrice: sol?.price || 0,
        solChange: sol?.change_24h || 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('AI Summary error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate summary' }, { status: 500 });
  }
}
