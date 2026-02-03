// src/app/api/trade-analysis/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Trade {
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  timestamp: number;
  fee?: number;
}

interface TradeGroup {
  symbol: string;
  entries: Trade[];
  exits: Trade[];
  pnl: number;
  pnlPercent: number;
  holdingTime: number;
  entryAvg: number;
  exitAvg: number;
}

export async function POST(req: Request) {
  try {
    const { trades } = await req.json() as { trades: Trade[] };
    if (!trades || trades.length === 0) {
      return NextResponse.json({ error: 'No trades provided' }, { status: 400 });
    }

    // Group trades into round-trip positions
    const groups = groupTradesIntoPositions(trades);

    // Calculate stats
    const totalTrades = groups.length;
    const winners = groups.filter(g => g.pnl > 0);
    const losers = groups.filter(g => g.pnl < 0);
    const winRate = totalTrades > 0 ? (winners.length / totalTrades * 100).toFixed(1) : '0';
    const totalPnl = groups.reduce((s, g) => s + g.pnl, 0);
    const avgWin = winners.length > 0 ? winners.reduce((s, g) => s + g.pnlPercent, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, g) => s + g.pnlPercent, 0) / losers.length : 0;
    const avgHoldingTime = groups.length > 0 ? groups.reduce((s, g) => s + g.holdingTime, 0) / groups.length : 0;
    const biggestWin = winners.length > 0 ? winners.sort((a, b) => b.pnlPercent - a.pnlPercent)[0] : null;
    const biggestLoss = losers.length > 0 ? losers.sort((a, b) => a.pnlPercent - b.pnlPercent)[0] : null;

    const statsText = `
TRADING STATS:
- Total round-trip trades: ${totalTrades}
- Win rate: ${winRate}%  (${winners.length}W / ${losers.length}L)
- Total P&L: $${totalPnl.toFixed(2)}
- Average win: +${avgWin.toFixed(2)}%
- Average loss: ${avgLoss.toFixed(2)}%
- Risk/Reward ratio: ${avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : 'N/A'}
- Average holding time: ${formatDuration(avgHoldingTime)}
- Biggest win: ${biggestWin ? `${biggestWin.symbol} +${biggestWin.pnlPercent.toFixed(2)}%` : 'N/A'}
- Biggest loss: ${biggestLoss ? `${biggestLoss.symbol} ${biggestLoss.pnlPercent.toFixed(2)}%` : 'N/A'}

TRADE DETAILS:
${groups.slice(0, 20).map(g => 
  `${g.symbol}: ${g.pnl >= 0 ? '+' : ''}${g.pnlPercent.toFixed(2)}% ($${g.pnl.toFixed(2)}) | Entry: $${g.entryAvg.toFixed(4)} → Exit: $${g.exitAvg.toFixed(4)} | Held: ${formatDuration(g.holdingTime)}`
).join('\n')}
`.trim();

    // Call Claude for analysis
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({
        stats: { totalTrades, winRate, totalPnl, avgWin, avgLoss, avgHoldingTime, winners: winners.length, losers: losers.length },
        groups,
        analysis: 'AI analysis unavailable (no API key)',
      });
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `You are a professional crypto trading coach. Analyze this trader's performance data and give actionable, specific feedback. Be direct and honest - point out mistakes clearly.

${statsText}

Give your analysis in these sections (use these exact headers):
🎯 Overall Assessment (1-2 sentences, grade A-F)
📊 Key Strengths (2-3 bullets)  
⚠️ Critical Mistakes (2-3 specific issues)
📈 Improvement Plan (3 concrete action items)
💡 Pattern Noticed (any recurring behavior, good or bad)

Keep it under 400 words. No disclaimers. Be specific to their actual trades.`
        }],
      }),
    });

    let analysis = '';
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      analysis = aiData.content?.[0]?.text || 'Analysis failed';
    } else {
      analysis = 'AI analysis temporarily unavailable';
    }

    return NextResponse.json({
      stats: { totalTrades, winRate, totalPnl, avgWin, avgLoss, avgHoldingTime: formatDuration(avgHoldingTime), winners: winners.length, losers: losers.length },
      groups,
      analysis,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function groupTradesIntoPositions(trades: Trade[]): TradeGroup[] {
  // Sort by timestamp
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  // Group by symbol
  const bySymbol = new Map<string, Trade[]>();
  for (const t of sorted) {
    const sym = t.symbol.replace(/USDT|USD|BUSD/gi, '').toUpperCase();
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push({ ...t, symbol: sym });
  }

  const groups: TradeGroup[] = [];

  for (const [symbol, symbolTrades] of bySymbol) {
    let position = 0;
    let entries: Trade[] = [];
    let exits: Trade[] = [];

    for (const trade of symbolTrades) {
      const side = trade.side.toLowerCase();
      if (side === 'buy') {
        if (position < 0) {
          // Closing a short
          exits.push(trade);
          position += trade.quantity;
        } else {
          // Opening or adding to long
          entries.push(trade);
          position += trade.quantity;
        }
      } else {
        // sell
        if (position > 0) {
          // Closing a long
          exits.push(trade);
          position -= trade.quantity;
        } else {
          // Opening or adding to short
          entries.push(trade);
          position -= trade.quantity;
        }
      }

      // Position closed - create group
      if (Math.abs(position) < 0.0001 && entries.length > 0 && exits.length > 0) {
        const entryAvg = entries.reduce((s, e) => s + e.price * e.quantity, 0) / entries.reduce((s, e) => s + e.quantity, 0);
        const exitAvg = exits.reduce((s, e) => s + e.price * e.quantity, 0) / exits.reduce((s, e) => s + e.quantity, 0);
        const totalQty = entries.reduce((s, e) => s + e.quantity, 0);
        const isLong = entries[0].side.toLowerCase() === 'buy';
        const pnl = isLong ? (exitAvg - entryAvg) * totalQty : (entryAvg - exitAvg) * totalQty;
        const pnlPercent = isLong ? ((exitAvg - entryAvg) / entryAvg) * 100 : ((entryAvg - exitAvg) / entryAvg) * 100;
        const holdingTime = exits[exits.length - 1].timestamp - entries[0].timestamp;

        groups.push({ symbol, entries: [...entries], exits: [...exits], pnl, pnlPercent, holdingTime, entryAvg, exitAvg });
        entries = [];
        exits = [];
        position = 0;
      }
    }

    // Handle unclosed positions
    if (entries.length > 0 && exits.length > 0) {
      const entryAvg = entries.reduce((s, e) => s + e.price * e.quantity, 0) / entries.reduce((s, e) => s + e.quantity, 0);
      const exitAvg = exits.reduce((s, e) => s + e.price * e.quantity, 0) / exits.reduce((s, e) => s + e.quantity, 0);
      const totalQty = Math.min(entries.reduce((s, e) => s + e.quantity, 0), exits.reduce((s, e) => s + e.quantity, 0));
      const isLong = entries[0].side.toLowerCase() === 'buy';
      const pnl = isLong ? (exitAvg - entryAvg) * totalQty : (entryAvg - exitAvg) * totalQty;
      const pnlPercent = isLong ? ((exitAvg - entryAvg) / entryAvg) * 100 : ((entryAvg - exitAvg) / entryAvg) * 100;
      const holdingTime = exits[exits.length - 1].timestamp - entries[0].timestamp;

      groups.push({ symbol, entries: [...entries], exits: [...exits], pnl, pnlPercent, holdingTime, entryAvg, exitAvg });
    }
  }

  return groups.sort((a, b) => (a.entries[0]?.timestamp || 0) - (b.entries[0]?.timestamp || 0));
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}
