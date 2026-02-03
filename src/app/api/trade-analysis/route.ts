// src/app/api/trade-analysis/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface RawTrade {
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  timestamp: number;
  fee: number;
  closedPnl: number;
  volume: number;
}

interface TradeGroup {
  symbol: string;
  entries: RawTrade[];
  exits: RawTrade[];
  pnl: number;
  pnlPercent: number;
  holdingTime: number;
  entryAvg: number;
  exitAvg: number;
  entryQty: number;
  direction: string;
}

export async function POST(req: Request) {
  try {
    const { rawText } = await req.json();
    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    // Parse trades from raw CSV/TSV text
    const trades = parseTrades(rawText);
    if (trades.length === 0) {
      return NextResponse.json({ error: 'No valid trades found. Check file format.' }, { status: 400 });
    }

    // Group trades into round-trip positions
    const groups = groupIntoRoundTrips(trades);

    // Calculate stats
    const totalTrades = groups.length;
    const winners = groups.filter(g => g.pnl > 0);
    const losers = groups.filter(g => g.pnl <= 0);
    const winRate = totalTrades > 0 ? (winners.length / totalTrades * 100).toFixed(1) : '0';
    const totalPnl = groups.reduce((s, g) => s + g.pnl, 0);
    const totalFees = trades.reduce((s, t) => s + t.fee, 0);
    const avgWin = winners.length > 0 ? winners.reduce((s, g) => s + g.pnlPercent, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, g) => s + g.pnlPercent, 0) / losers.length : 0;
    const avgHoldingMs = groups.filter(g => g.holdingTime > 0).length > 0
      ? groups.filter(g => g.holdingTime > 0).reduce((s, g) => s + g.holdingTime, 0) / groups.filter(g => g.holdingTime > 0).length
      : 0;
    const biggestWin = winners.length > 0 ? winners.sort((a, b) => b.pnl - a.pnl)[0] : null;
    const biggestLoss = losers.length > 0 ? losers.sort((a, b) => a.pnl - b.pnl)[0] : null;

    // Symbols traded
    const symbolSet = new Set(groups.map(g => g.symbol));
    const symbolStats = Array.from(symbolSet).map(sym => {
      const symGroups = groups.filter(g => g.symbol === sym);
      const symPnl = symGroups.reduce((s, g) => s + g.pnl, 0);
      const symWins = symGroups.filter(g => g.pnl > 0).length;
      return { symbol: sym, trades: symGroups.length, pnl: symPnl, winRate: (symWins / symGroups.length * 100).toFixed(0) };
    }).sort((a, b) => b.trades - a.trades);

    const stats = {
      totalTrades,
      totalRawTrades: trades.length,
      winRate,
      totalPnl: +totalPnl.toFixed(2),
      totalFees: +totalFees.toFixed(2),
      avgWin: +avgWin.toFixed(2),
      avgLoss: +avgLoss.toFixed(2),
      avgHoldingTime: formatDuration(avgHoldingMs),
      winners: winners.length,
      losers: losers.length,
      riskReward: avgLoss !== 0 ? +Math.abs(avgWin / avgLoss).toFixed(2) : 0,
      biggestWin: biggestWin ? { symbol: biggestWin.symbol, pnl: +biggestWin.pnl.toFixed(2), pct: +biggestWin.pnlPercent.toFixed(2) } : null,
      biggestLoss: biggestLoss ? { symbol: biggestLoss.symbol, pnl: +biggestLoss.pnl.toFixed(2), pct: +biggestLoss.pnlPercent.toFixed(2) } : null,
      symbolStats,
      uniqueSymbols: symbolSet.size,
    };

    // AI Analysis
    let analysis = '';
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      const statsText = buildStatsPrompt(stats, groups);
      try {
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
              content: `You are a professional crypto trading coach. Analyze this trader's performance and give specific, actionable feedback. Be direct and honest.

${statsText}

Give your analysis in these sections (use these exact headers):
🎯 Overall Assessment (1-2 sentences, grade A-F)
📊 Key Strengths (2-3 bullets)
⚠️ Critical Mistakes (2-3 specific issues with concrete examples from their trades)
📈 Improvement Plan (3 concrete action items)
💡 Pattern Noticed (any recurring behavior, good or bad)

Keep it under 400 words. No disclaimers. Reference their actual trades and numbers.`
            }],
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          analysis = aiData.content?.[0]?.text || '';
        }
      } catch {}
    }

    return NextResponse.json({ stats, groups, analysis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════
// PARSING
// ═══════════════════════════════════════════════

function parseTrades(text: string): RawTrade[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter: tab or comma
  const firstLine = lines[0];
  const isTab = firstLine.split('\t').length > firstLine.split(',').length;
  const delimiter = isTab ? '\t' : ',';

  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' '));

  // Find columns flexibly
  const findCol = (...names: string[]) => {
    return headers.findIndex(h => names.some(n => h === n || h.includes(n)));
  };

  const timeCol = findCol('time', 'date', 'timestamp', 'created');
  const symbolCol = findCol('coin', 'symbol', 'pair', 'market', 'asset');
  const sideCol = findCol('direction', 'side', 'type', 'order type');
  const priceCol = findCol('price', 'avg filled price', 'exec price', 'deal price');
  const sizeCol = findCol('size', 'quantity', 'qty', 'amount', 'filled', 'executed');
  const feeCol = findCol('fee', 'commission');
  const pnlCol = findCol('closedpnl', 'closed pnl', 'realized profit', 'realised pnl', 'pnl');
  const volCol = findCol('trade volume', 'volume', 'total', 'filled value');

  if (symbolCol === -1 || sideCol === -1 || priceCol === -1) {
    throw new Error(`Cannot detect columns. Headers found: ${headers.join(', ')}`);
  }

  const trades: RawTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitLine(line, delimiter);

    const price = parseNum(cols[priceCol]);
    if (!price || price <= 0) continue;

    const symbol = cleanSymbol(cols[symbolCol] || '');
    if (!symbol) continue;

    const side = parseSide(cols[sideCol] || '');
    if (!side) continue;

    const quantity = sizeCol !== -1 ? Math.abs(parseNum(cols[sizeCol])) || 1 : 1;
    const timestamp = timeCol !== -1 ? parseTimestamp(cols[timeCol]) : Date.now();
    const fee = feeCol !== -1 ? Math.abs(parseNum(cols[feeCol])) || 0 : 0;
    const closedPnl = pnlCol !== -1 ? parseNum(cols[pnlCol]) || 0 : 0;
    const volume = volCol !== -1 ? parseNum(cols[volCol]) || 0 : price * quantity;

    trades.push({ symbol, side, price, quantity, timestamp, fee, closedPnl, volume });
  }

  return trades.sort((a, b) => a.timestamp - b.timestamp);
}

function splitLine(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === delimiter && !inQuotes) { cols.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

function cleanSymbol(s: string): string {
  return s.replace(/[-_\/]/g, '').replace(/USDT|USDC|USD|BUSD|PERP/gi, '').toUpperCase().trim();
}

function parseSide(val: string): string {
  const v = val.toLowerCase().trim();
  if (v === 'buy' || v === 'long' || v.includes('buy')) return 'buy';
  if (v === 'sell' || v === 'short' || v.includes('sell')) return 'sell';
  return '';
}

function parseNum(val: string): number {
  if (!val) return 0;
  // Remove currency symbols, spaces, commas
  const cleaned = val.replace(/[$€£,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseTimestamp(val: string): number {
  if (!val) return 0;
  val = val.trim();

  // Handle "MM/DD/YYYY - HH:MM:SS" (Hyperliquid format)
  const hlMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hlMatch) {
    const [, month, day, year, hour, min, sec] = hlMatch;
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min}:${sec}Z`).getTime();
  }

  // Handle "YYYY-MM-DD HH:MM:SS"
  const isoMatch = val.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const d = new Date(val.replace(' ', 'T') + (val.includes('Z') ? '' : 'Z'));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Unix timestamp
  const num = Number(val);
  if (!isNaN(num)) {
    if (num > 1e15) return num / 1000; // microseconds
    if (num > 1e12) return num; // milliseconds
    if (num > 1e9) return num * 1000; // seconds
  }

  // Fallback: try Date constructor
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();

  return 0;
}

// ═══════════════════════════════════════════════
// TRADE GROUPING - Round Trip Detection
// ═══════════════════════════════════════════════

function groupIntoRoundTrips(trades: RawTrade[]): TradeGroup[] {
  // Group by symbol
  const bySymbol = new Map<string, RawTrade[]>();
  for (const t of trades) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  }

  const allGroups: TradeGroup[] = [];

  for (const [symbol, symbolTrades] of bySymbol) {
    // Track position size
    let position = 0;
    let currentEntries: RawTrade[] = [];
    let currentExits: RawTrade[] = [];
    let direction = ''; // 'long' or 'short'

    for (const trade of symbolTrades) {
      const isBuy = trade.side === 'buy';

      if (position === 0 || Math.abs(position) < 0.001) {
        // Starting new position
        if (currentEntries.length > 0 && currentExits.length > 0) {
          // Save previous round trip
          const group = buildGroup(symbol, currentEntries, currentExits, direction);
          if (group) allGroups.push(group);
        }
        currentEntries = [trade];
        currentExits = [];
        direction = isBuy ? 'long' : 'short';
        position = isBuy ? trade.quantity : -trade.quantity;
      } else if ((direction === 'long' && isBuy) || (direction === 'short' && !isBuy)) {
        // Adding to position
        currentEntries.push(trade);
        position += isBuy ? trade.quantity : -trade.quantity;
      } else {
        // Closing position (partially or fully)
        currentExits.push(trade);
        position += isBuy ? trade.quantity : -trade.quantity;

        // Check if position is closed (near zero)
        if (Math.abs(position) < 0.001) {
          const group = buildGroup(symbol, currentEntries, currentExits, direction);
          if (group) allGroups.push(group);
          currentEntries = [];
          currentExits = [];
          position = 0;
          direction = '';
        }
      }
    }

    // Handle any remaining open position with partial closes
    if (currentEntries.length > 0 && currentExits.length > 0) {
      const group = buildGroup(symbol, currentEntries, currentExits, direction);
      if (group) allGroups.push(group);
    }
  }

  return allGroups.sort((a, b) => {
    const aTime = a.entries[0]?.timestamp || 0;
    const bTime = b.entries[0]?.timestamp || 0;
    return aTime - bTime;
  });
}

function buildGroup(symbol: string, entries: RawTrade[], exits: RawTrade[], direction: string): TradeGroup | null {
  if (entries.length === 0 || exits.length === 0) return null;

  const entryQty = entries.reduce((s, e) => s + e.quantity, 0);
  const exitQty = exits.reduce((s, e) => s + e.quantity, 0);
  const entryAvg = entries.reduce((s, e) => s + e.price * e.quantity, 0) / entryQty;
  const exitAvg = exits.reduce((s, e) => s + e.price * e.quantity, 0) / exitQty;

  const usedQty = Math.min(entryQty, exitQty);

  let pnl: number;
  // If we have closedPnl from exchange, use it (more accurate)
  const exitPnlSum = exits.reduce((s, e) => s + e.closedPnl, 0);
  if (Math.abs(exitPnlSum) > 0.01) {
    pnl = exitPnlSum;
  } else {
    // Calculate from prices
    if (direction === 'long') {
      pnl = (exitAvg - entryAvg) * usedQty;
    } else {
      pnl = (entryAvg - exitAvg) * usedQty;
    }
  }

  const pnlPercent = direction === 'long'
    ? ((exitAvg - entryAvg) / entryAvg) * 100
    : ((entryAvg - exitAvg) / entryAvg) * 100;

  const holdingTime = exits[exits.length - 1].timestamp - entries[0].timestamp;

  return {
    symbol,
    entries: [...entries],
    exits: [...exits],
    pnl,
    pnlPercent,
    holdingTime,
    entryAvg,
    exitAvg,
    entryQty: usedQty,
    direction,
  };
}

function buildStatsPrompt(stats: any, groups: TradeGroup[]): string {
  const lines = [
    `TRADING PERFORMANCE SUMMARY:`,
    `Total round-trip trades: ${stats.totalTrades} (from ${stats.totalRawTrades} raw executions)`,
    `Win rate: ${stats.winRate}% (${stats.winners}W / ${stats.losers}L)`,
    `Total P&L: $${stats.totalPnl} (Fees: $${stats.totalFees})`,
    `Average win: +${stats.avgWin}% | Average loss: ${stats.avgLoss}%`,
    `Risk/Reward: ${stats.riskReward}`,
    `Average holding time: ${stats.avgHoldingTime}`,
    `Symbols traded: ${stats.uniqueSymbols}`,
    ``,
    `BY SYMBOL:`,
    ...stats.symbolStats.slice(0, 10).map((s: any) => `  ${s.symbol}: ${s.trades} trades, $${s.pnl.toFixed(2)} P&L, ${s.winRate}% win rate`),
    ``,
    `RECENT TRADES (last 20):`,
    ...groups.slice(-20).map((g: TradeGroup) =>
      `  ${g.symbol} ${g.direction.toUpperCase()}: ${g.pnl >= 0 ? '+' : ''}${g.pnlPercent.toFixed(2)}% ($${g.pnl.toFixed(2)}) | Entry $${g.entryAvg.toFixed(4)} → Exit $${g.exitAvg.toFixed(4)} | Held ${formatDuration(g.holdingTime)}`
    ),
  ];
  if (stats.biggestWin) lines.push(`\nBiggest win: ${stats.biggestWin.symbol} +${stats.biggestWin.pct}% ($${stats.biggestWin.pnl})`);
  if (stats.biggestLoss) lines.push(`Biggest loss: ${stats.biggestLoss.symbol} ${stats.biggestLoss.pct}% ($${stats.biggestLoss.pnl})`);
  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '< 1m';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}
