'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// TYPES
// ============================================================

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  entryTime: string;
  exitTime: string;
  pnl: number;
  pnlPercent: number;
  fees?: number;
}

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BehaviorAnalysis {
  // Timing
  avgHoldingWinners: number;
  avgHoldingLosers: number;
  bestHoldingRange: string;
  worstHoldingRange: string;
  bestEntryHour: string;
  worstEntryHour: string;
  holdingBuckets: { range: string; winRate: number; count: number; avgPnl: number }[];

  // Entry Quality
  entryOnUptrend: { winRate: number; count: number; avgPnl: number };
  entryOnDowntrend: { winRate: number; count: number; avgPnl: number };
  entryNearSupport: { winRate: number; count: number; avgPnl: number };
  avgEntryMomentum: number;
  momentumBuckets: { range: string; winRate: number; count: number; avgPnl: number }[];

  // Exit Behavior
  avgWinnerGiveBack: number;
  avgLoserDrawdown: number;
  earlyExitCount: number;
  lateExitCount: number;
  exitEfficiency: number;

  // Direction Bias
  longStats: { winRate: number; count: number; avgPnl: number; avgRR: number };
  shortStats: { winRate: number; count: number; avgPnl: number; avgRR: number };
  directionEdge: string;

  // Asset Selection
  topAssets: { symbol: string; winRate: number; count: number; totalPnl: number }[];
  worstAssets: { symbol: string; winRate: number; count: number; totalPnl: number }[];
  diversificationScore: number;

  // Risk Management
  avgRiskPerTrade: number;
  largestWin: number;
  largestLoss: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  profitFactor: number;
  expectancy: number;
  kellyPct: number;
}

interface AIInsight {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  actionItems: string[];
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function parseTrades(csvText: string): Trade[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));

  // Auto-detect column mapping
  const findCol = (keywords: string[]) => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  const symbolCol = findCol(['symbol', 'pair', 'market', 'coin', 'asset', 'instrument']);
  const sideCol = findCol(['side', 'direction', 'type', 'position', 'order_side']);
  const entryPriceCol = findCol(['entry_price', 'entryprice', 'open_price', 'openprice', 'avg_entry', 'entry']);
  const exitPriceCol = findCol(['exit_price', 'exitprice', 'close_price', 'closeprice', 'avg_exit', 'exit']);
  const qtyCol = findCol(['quantity', 'qty', 'size', 'amount', 'volume', 'contracts']);
  const entryTimeCol = findCol(['entry_time', 'entrytime', 'open_time', 'opentime', 'entry_date', 'open_date']);
  const exitTimeCol = findCol(['exit_time', 'exittime', 'close_time', 'closetime', 'exit_date', 'close_date']);
  const pnlCol = findCol(['pnl', 'profit', 'realized_pnl', 'net_pnl', 'pl', 'p&l', 'realised']);
  const feeCol = findCol(['fee', 'fees', 'commission', 'trading_fee']);

  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 3) continue;

    try {
      const symbol = symbolCol >= 0 ? cols[symbolCol] : '';
      const sideRaw = sideCol >= 0 ? cols[sideCol].toUpperCase() : 'LONG';
      const side = (sideRaw.includes('LONG') || sideRaw.includes('BUY')) ? 'LONG' : 'SHORT';
      const entryPrice = entryPriceCol >= 0 ? parseFloat(cols[entryPriceCol]) : 0;
      const exitPrice = exitPriceCol >= 0 ? parseFloat(cols[exitPriceCol]) : 0;
      const quantity = qtyCol >= 0 ? parseFloat(cols[qtyCol]) : 1;
      const entryTime = entryTimeCol >= 0 ? cols[entryTimeCol] : '';
      const exitTime = exitTimeCol >= 0 ? cols[exitTimeCol] : '';
      const fees = feeCol >= 0 ? Math.abs(parseFloat(cols[feeCol]) || 0) : 0;

      let pnl: number;
      if (pnlCol >= 0 && cols[pnlCol]) {
        pnl = parseFloat(cols[pnlCol]);
      } else {
        pnl = side === 'LONG'
          ? (exitPrice - entryPrice) * quantity
          : (entryPrice - exitPrice) * quantity;
      }
      pnl -= fees;

      const pnlPercent = entryPrice > 0
        ? ((side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice) / entryPrice) * 100
        : 0;

      if (symbol && entryPrice > 0 && exitPrice > 0) {
        trades.push({
          id: `trade-${i}`,
          symbol: symbol.replace(/USDT|USD|PERP/gi, '').toUpperCase(),
          side: side as 'LONG' | 'SHORT',
          entryPrice,
          exitPrice,
          quantity,
          entryTime,
          exitTime,
          pnl,
          pnlPercent,
          fees,
        });
      }
    } catch (e) {
      continue;
    }
  }

  return trades;
}

function getHoldingHours(trade: Trade): number {
  try {
    const entry = new Date(trade.entryTime).getTime();
    const exit = new Date(trade.exitTime).getTime();
    if (isNaN(entry) || isNaN(exit)) return 0;
    return Math.max(0, (exit - entry) / (1000 * 60 * 60));
  } catch {
    return 0;
  }
}

function getEntryHour(trade: Trade): number {
  try {
    return new Date(trade.entryTime).getUTCHours();
  } catch {
    return -1;
  }
}

function analyzeBehavior(trades: Trade[]): BehaviorAnalysis {
  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl <= 0);
  const longs = trades.filter(t => t.side === 'LONG');
  const shorts = trades.filter(t => t.side === 'SHORT');

  // --- TIMING ANALYSIS ---
  const holdingBucketDefs = [
    { range: '< 1h', min: 0, max: 1 },
    { range: '1-4h', min: 1, max: 4 },
    { range: '4-12h', min: 4, max: 12 },
    { range: '12-24h', min: 12, max: 24 },
    { range: '1-3d', min: 24, max: 72 },
    { range: '3-7d', min: 72, max: 168 },
    { range: '7d+', min: 168, max: Infinity },
  ];

  const holdingBuckets = holdingBucketDefs.map(b => {
    const inBucket = trades.filter(t => {
      const h = getHoldingHours(t);
      return h >= b.min && h < b.max;
    });
    const bucketWinners = inBucket.filter(t => t.pnl > 0);
    return {
      range: b.range,
      winRate: inBucket.length > 0 ? (bucketWinners.length / inBucket.length) * 100 : 0,
      count: inBucket.length,
      avgPnl: inBucket.length > 0 ? inBucket.reduce((s, t) => s + t.pnl, 0) / inBucket.length : 0,
    };
  }).filter(b => b.count > 0);

  const bestHolding = [...holdingBuckets].sort((a, b) => b.avgPnl - a.avgPnl)[0];
  const worstHolding = [...holdingBuckets].sort((a, b) => a.avgPnl - b.avgPnl)[0];

  const avgHoldWin = winners.length > 0 ? winners.reduce((s, t) => s + getHoldingHours(t), 0) / winners.length : 0;
  const avgHoldLoss = losers.length > 0 ? losers.reduce((s, t) => s + getHoldingHours(t), 0) / losers.length : 0;

  // Entry hour analysis
  const hourBuckets: Record<number, { wins: number; total: number }> = {};
  trades.forEach(t => {
    const h = getEntryHour(t);
    if (h < 0) return;
    if (!hourBuckets[h]) hourBuckets[h] = { wins: 0, total: 0 };
    hourBuckets[h].total++;
    if (t.pnl > 0) hourBuckets[h].wins++;
  });

  const hourEntries = Object.entries(hourBuckets)
    .filter(([_, v]) => v.total >= 2)
    .map(([h, v]) => ({ hour: parseInt(h), winRate: (v.wins / v.total) * 100, count: v.total }));

  const bestHour = hourEntries.sort((a, b) => b.winRate - a.winRate)[0];
  const worstHour = [...hourEntries].sort((a, b) => a.winRate - b.winRate)[0];

  // --- ENTRY QUALITY (momentum-based) ---
  const momentumBucketDefs = [
    { range: 'Down >5%', min: -Infinity, max: -5 },
    { range: 'Down 2-5%', min: -5, max: -2 },
    { range: 'Down 0-2%', min: -2, max: 0 },
    { range: 'Up 0-2%', min: 0, max: 2 },
    { range: 'Up 2-5%', min: 2, max: 5 },
    { range: 'Up 5-10%', min: 5, max: 10 },
    { range: 'Up >10%', min: 10, max: Infinity },
  ];

  // Use pnlPercent as proxy for asset momentum context
  const avgMomentum = trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length : 0;

  const momentumBuckets = momentumBucketDefs.map(b => {
    const inBucket = trades.filter(t => t.pnlPercent >= b.min && t.pnlPercent < b.max);
    const bucketWinners = inBucket.filter(t => t.pnl > 0);
    return {
      range: b.range,
      winRate: inBucket.length > 0 ? (bucketWinners.length / inBucket.length) * 100 : 0,
      count: inBucket.length,
      avgPnl: inBucket.length > 0 ? inBucket.reduce((s, t) => s + t.pnl, 0) / inBucket.length : 0,
    };
  }).filter(b => b.count > 0);

  const uptrendTrades = trades.filter(t => t.pnlPercent > 2);
  const downtrendTrades = trades.filter(t => t.pnlPercent < -2);

  const entryOnUptrend = {
    winRate: uptrendTrades.length > 0 ? (uptrendTrades.filter(t => t.pnl > 0).length / uptrendTrades.length) * 100 : 0,
    count: uptrendTrades.length,
    avgPnl: uptrendTrades.length > 0 ? uptrendTrades.reduce((s, t) => s + t.pnl, 0) / uptrendTrades.length : 0,
  };

  const entryOnDowntrend = {
    winRate: downtrendTrades.length > 0 ? (downtrendTrades.filter(t => t.pnl > 0).length / downtrendTrades.length) * 100 : 0,
    count: downtrendTrades.length,
    avgPnl: downtrendTrades.length > 0 ? downtrendTrades.reduce((s, t) => s + t.pnl, 0) / downtrendTrades.length : 0,
  };

  // --- EXIT BEHAVIOR ---
  const winnerMaxMoves = winners.map(t => {
    const maxPossible = Math.abs(t.pnlPercent) * 1.5; // estimate
    return { giveBack: maxPossible - Math.abs(t.pnlPercent), trade: t };
  });
  const avgGiveBack = winnerMaxMoves.length > 0 ? winnerMaxMoves.reduce((s, w) => s + w.giveBack, 0) / winnerMaxMoves.length : 0;

  const loserDrawdowns = losers.map(t => Math.abs(t.pnlPercent));
  const avgDrawdown = loserDrawdowns.length > 0 ? loserDrawdowns.reduce((s, d) => s + d, 0) / loserDrawdowns.length : 0;

  const avgWinPct = winners.length > 0 ? winners.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / winners.length : 0;
  const avgLossPct = losers.length > 0 ? losers.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / losers.length : 0;
  const exitEfficiency = avgWinPct + avgLossPct > 0 ? (avgWinPct / (avgWinPct + avgLossPct)) * 100 : 50;

  // --- DIRECTION BIAS ---
  const longWins = longs.filter(t => t.pnl > 0);
  const shortWins = shorts.filter(t => t.pnl > 0);

  const longStats = {
    winRate: longs.length > 0 ? (longWins.length / longs.length) * 100 : 0,
    count: longs.length,
    avgPnl: longs.length > 0 ? longs.reduce((s, t) => s + t.pnl, 0) / longs.length : 0,
    avgRR: avgLossPct > 0 && longWins.length > 0
      ? (longWins.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / longWins.length) / avgLossPct
      : 0,
  };

  const shortStats = {
    winRate: shorts.length > 0 ? (shortWins.length / shorts.length) * 100 : 0,
    count: shorts.length,
    avgPnl: shorts.length > 0 ? shorts.reduce((s, t) => s + t.pnl, 0) / shorts.length : 0,
    avgRR: avgLossPct > 0 && shortWins.length > 0
      ? (shortWins.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / shortWins.length) / avgLossPct
      : 0,
  };

  let directionEdge = 'Neutral';
  if (longStats.avgPnl > shortStats.avgPnl * 1.3) directionEdge = 'Strong Long Edge';
  else if (longStats.avgPnl > shortStats.avgPnl) directionEdge = 'Slight Long Edge';
  else if (shortStats.avgPnl > longStats.avgPnl * 1.3) directionEdge = 'Strong Short Edge';
  else if (shortStats.avgPnl > longStats.avgPnl) directionEdge = 'Slight Short Edge';

  // --- ASSET SELECTION ---
  const assetMap: Record<string, { wins: number; total: number; totalPnl: number }> = {};
  trades.forEach(t => {
    if (!assetMap[t.symbol]) assetMap[t.symbol] = { wins: 0, total: 0, totalPnl: 0 };
    assetMap[t.symbol].total++;
    assetMap[t.symbol].totalPnl += t.pnl;
    if (t.pnl > 0) assetMap[t.symbol].wins++;
  });

  const assetList = Object.entries(assetMap)
    .map(([symbol, data]) => ({
      symbol,
      winRate: (data.wins / data.total) * 100,
      count: data.total,
      totalPnl: data.totalPnl,
    }))
    .filter(a => a.count >= 2);

  const topAssets = [...assetList].sort((a, b) => b.totalPnl - a.totalPnl).slice(0, 5);
  const worstAssets = [...assetList].sort((a, b) => a.totalPnl - b.totalPnl).slice(0, 5);

  const uniqueAssets = Object.keys(assetMap).length;
  const diversificationScore = Math.min(100, (uniqueAssets / Math.max(1, trades.length)) * 100 * 3);

  // --- RISK MANAGEMENT ---
  const pnls = trades.map(t => t.pnl);
  const largestWin = Math.max(...pnls, 0);
  const largestLoss = Math.min(...pnls, 0);

  let maxConsecLoss = 0, maxConsecWin = 0, curLoss = 0, curWin = 0;
  trades.forEach(t => {
    if (t.pnl <= 0) { curLoss++; curWin = 0; maxConsecLoss = Math.max(maxConsecLoss, curLoss); }
    else { curWin++; curLoss = 0; maxConsecWin = Math.max(maxConsecWin, curWin); }
  });

  const totalGrossWin = winners.reduce((s, t) => s + t.pnl, 0);
  const totalGrossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = totalGrossLoss > 0 ? totalGrossWin / totalGrossLoss : totalGrossWin > 0 ? Infinity : 0;

  const winRate = trades.length > 0 ? winners.length / trades.length : 0;
  const avgWin = winners.length > 0 ? totalGrossWin / winners.length : 0;
  const avgLoss = losers.length > 0 ? totalGrossLoss / losers.length : 0;
  const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

  const kellyPct = avgLoss > 0
    ? Math.max(0, (winRate - ((1 - winRate) / (avgWin / avgLoss))) * 100)
    : 0;

  const avgRisk = trades.length > 0
    ? trades.reduce((s, t) => s + Math.abs(t.entryPrice * t.quantity), 0) / trades.length
    : 0;

  return {
    avgHoldingWinners: avgHoldWin,
    avgHoldingLosers: avgHoldLoss,
    bestHoldingRange: bestHolding?.range || 'N/A',
    worstHoldingRange: worstHolding?.range || 'N/A',
    bestEntryHour: bestHour ? `${bestHour.hour}:00 UTC (${bestHour.winRate.toFixed(0)}% WR, ${bestHour.count} trades)` : 'N/A',
    worstEntryHour: worstHour ? `${worstHour.hour}:00 UTC (${worstHour.winRate.toFixed(0)}% WR, ${worstHour.count} trades)` : 'N/A',
    holdingBuckets,
    entryOnUptrend,
    entryOnDowntrend,
    entryNearSupport: { winRate: 0, count: 0, avgPnl: 0 },
    avgEntryMomentum: avgMomentum,
    momentumBuckets,
    avgWinnerGiveBack: avgGiveBack,
    avgLoserDrawdown: avgDrawdown,
    earlyExitCount: winners.filter(t => Math.abs(t.pnlPercent) < 1).length,
    lateExitCount: losers.filter(t => Math.abs(t.pnlPercent) > avgLossPct * 1.5).length,
    exitEfficiency,
    longStats,
    shortStats,
    directionEdge,
    topAssets,
    worstAssets,
    diversificationScore,
    avgRiskPerTrade: avgRisk,
    largestWin,
    largestLoss,
    maxConsecutiveLosses: maxConsecLoss,
    maxConsecutiveWins: maxConsecWin,
    profitFactor,
    expectancy,
    kellyPct,
  };
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatUSD(n: number): string {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

// ============================================================
// COMPONENTS
// ============================================================

function StatCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean | null }) {
  return (
    <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function BehaviorTable({ title, headers, rows }: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2d3e]">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12141f]">
              {headers.map((h, i) => (
                <th key={i} className={`px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-[#1e2133] hover:bg-[#1e2133]/50 transition-colors">
                {row.map((cell, ci) => {
                  const val = typeof cell === 'number' ? cell : parseFloat(cell as string);
                  const isNum = !isNaN(val) && ci > 0;
                  const isPositive = isNum && val > 0;
                  const isNegative = isNum && val < 0;
                  return (
                    <td
                      key={ci}
                      className={`px-4 py-2.5 font-mono ${ci === 0 ? 'text-left text-gray-300' : 'text-right'} ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : ci === 0 ? '' : 'text-gray-400'}`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, colorFn }: {
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
  colorFn?: (val: number) => string;
}) {
  const maxVal = Math.max(...data.map(d => Math.abs(d[valueKey])), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const val = d[valueKey];
        const width = Math.min(100, (Math.abs(val) / maxVal) * 100);
        const color = colorFn ? colorFn(val) : (val >= 50 ? '#34d399' : val >= 40 ? '#fbbf24' : '#f87171');
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-16 text-xs text-gray-400 text-right font-mono flex-shrink-0">{d[labelKey]}</div>
            <div className="flex-1 bg-[#12141f] rounded-full h-5 overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${width}%`, backgroundColor: color }}
              />
              <span className="absolute right-2 top-0 h-full flex items-center text-xs font-mono text-gray-300">
                {typeof val === 'number' ? val.toFixed(1) : val}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// AI ANALYSIS FUNCTION
// ============================================================

async function getAIBehaviorInsight(trades: Trade[], behavior: BehaviorAnalysis): Promise<AIInsight> {
  const basicStats = {
    totalTrades: trades.length,
    winners: trades.filter(t => t.pnl > 0).length,
    losers: trades.filter(t => t.pnl <= 0).length,
    totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
    winRate: trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length * 100) : 0,
  };

  const prompt = `You are a professional trading coach analyzing a crypto trader's behavior patterns. Be direct, specific, and actionable. No fluff.

TRADE STATISTICS:
- Total trades: ${basicStats.totalTrades} | Win rate: ${basicStats.winRate.toFixed(1)}% | Total PnL: $${basicStats.totalPnl.toFixed(2)}
- Profit factor: ${behavior.profitFactor === Infinity ? '∞' : behavior.profitFactor.toFixed(2)} | Expectancy: $${behavior.expectancy.toFixed(2)}
- Kelly %: ${behavior.kellyPct.toFixed(1)}%

TIMING:
- Avg holding (winners): ${formatHours(behavior.avgHoldingWinners)} | Avg holding (losers): ${formatHours(behavior.avgHoldingLosers)}
- Best holding period: ${behavior.bestHoldingRange} | Worst: ${behavior.worstHoldingRange}
- Best entry hour: ${behavior.bestEntryHour} | Worst: ${behavior.worstEntryHour}

DIRECTION:
- Longs: ${behavior.longStats.count} trades, ${behavior.longStats.winRate.toFixed(1)}% WR, avg PnL $${behavior.longStats.avgPnl.toFixed(2)}
- Shorts: ${behavior.shortStats.count} trades, ${behavior.shortStats.winRate.toFixed(1)}% WR, avg PnL $${behavior.shortStats.avgPnl.toFixed(2)}
- Edge: ${behavior.directionEdge}

EXIT BEHAVIOR:
- Exit efficiency: ${behavior.exitEfficiency.toFixed(1)}% | Avg loser drawdown: ${behavior.avgLoserDrawdown.toFixed(2)}%
- Early exits (winners <1%): ${behavior.earlyExitCount} | Late exits (losers beyond avg): ${behavior.lateExitCount}

RISK:
- Largest win: $${behavior.largestWin.toFixed(2)} | Largest loss: $${Math.abs(behavior.largestLoss).toFixed(2)}
- Max consecutive losses: ${behavior.maxConsecutiveLosses} | Max consecutive wins: ${behavior.maxConsecutiveWins}

TOP ASSETS: ${behavior.topAssets.map(a => `${a.symbol}(${a.count} trades, $${a.totalPnl.toFixed(0)})`).join(', ')}
WORST ASSETS: ${behavior.worstAssets.map(a => `${a.symbol}(${a.count} trades, $${a.totalPnl.toFixed(0)})`).join(', ')}

Respond ONLY in this exact JSON format, no markdown, no backticks:
{"summary":"2-3 sentence overall assessment of this trader's behavior patterns","strengths":["strength1","strength2","strength3"],"weaknesses":["weakness1","weakness2","weakness3"],"actionItems":["specific actionable item 1","specific actionable item 2","specific actionable item 3"]}`;

  try {
    const res = await fetch('/api/ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, maxTokens: 600 }),
    });

    if (!res.ok) throw new Error('AI API failed');
    const data = await res.json();
    const text = data.content || data.text || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return {
      summary: 'Unable to generate AI insight. Review the behavioral data tables below for patterns.',
      strengths: [],
      weaknesses: [],
      actionItems: [],
    };
  }
}

// ============================================================
// CHART COMPONENT (lightweight-charts)
// ============================================================

function TradeChart({ trade, candles }: { trade: Trade; candles: OHLCV[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    let chart: any;

    const loadChart = async () => {
      try {
        const lc = await import('lightweight-charts');
        if (!chartRef.current) return;

        chart = lc.createChart(chartRef.current, {
          width: chartRef.current.clientWidth,
          height: 300,
          layout: { background: { type: lc.ColorType.Solid, color: '#12141f' }, textColor: '#9ca3af' },
          grid: { vertLines: { color: '#1e2133' }, horzLines: { color: '#1e2133' } },
          crosshair: { mode: lc.CrosshairMode.Normal },
          timeScale: { timeVisible: true, secondsVisible: false },
        });

        const candleSeries = chart.addCandlestickSeries({
          upColor: '#34d399',
          downColor: '#f87171',
          borderUpColor: '#34d399',
          borderDownColor: '#f87171',
          wickUpColor: '#34d399',
          wickDownColor: '#f87171',
        });

        candleSeries.setData(candles.map(c => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));

        // Entry marker
        candleSeries.setMarkers([
          {
            time: (new Date(trade.entryTime).getTime() / 1000) as any,
            position: 'belowBar',
            color: '#34d399',
            shape: 'arrowUp',
            text: `Entry $${trade.entryPrice.toFixed(2)}`,
          },
          {
            time: (new Date(trade.exitTime).getTime() / 1000) as any,
            position: 'aboveBar',
            color: trade.pnl >= 0 ? '#34d399' : '#f87171',
            shape: 'arrowDown',
            text: `Exit $${trade.exitPrice.toFixed(2)}`,
          },
        ]);

        chart.timeScale().fitContent();
        chartInstance.current = chart;
      } catch (e) {
        console.error('Chart load error:', e);
      }
    };

    loadChart();
    return () => { if (chart) chart.remove(); };
  }, [trade, candles]);

  return <div ref={chartRef} className="w-full rounded-lg overflow-hidden" />;
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [behavior, setBehavior] = useState<BehaviorAnalysis | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [candles, setCandles] = useState<OHLCV[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'timing' | 'entries' | 'exits' | 'direction' | 'assets' | 'risk'>('overview');
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseTrades(text);
    if (parsed.length === 0) {
      alert('No valid trades found. Check your CSV format - need columns like: symbol, side, entry_price, exit_price, quantity, entry_time, exit_time');
      return;
    }
    setTrades(parsed);
    setCsvUploaded(true);

    const ba = analyzeBehavior(parsed);
    setBehavior(ba);

    // Trigger AI analysis
    setAiLoading(true);
    const insight = await getAIBehaviorInsight(parsed, ba);
    setAiInsight(insight);
    setAiLoading(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFile(file);
    }
  }, [handleFile]);

  const fetchCandles = async (trade: Trade) => {
    try {
      const symbol = trade.symbol.toUpperCase() + 'USDT';
      const entryMs = new Date(trade.entryTime).getTime();
      const exitMs = new Date(trade.exitTime).getTime();
      const holdMs = exitMs - entryMs;
      const padding = Math.max(holdMs * 2, 86400000);

      let interval = '1h';
      if (holdMs < 3600000) interval = '5m';
      else if (holdMs < 86400000) interval = '15m';
      else if (holdMs > 604800000) interval = '4h';

      const startTime = entryMs - padding;
      const endTime = exitMs + padding;

      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=500`
      );
      if (!res.ok) throw new Error('Binance API error');
      const data = await res.json();

      const ohlcv: OHLCV[] = data.map((k: any) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      setCandles(ohlcv);
    } catch (e) {
      console.error('Candle fetch error:', e);
      setCandles([]);
    }
  };

  const selectTrade = (trade: Trade) => {
    setSelectedTrade(trade);
    fetchCandles(trade);
  };

  // Basic stats
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 : 0;
  const totalFees = trades.reduce((s, t) => s + (t.fees || 0), 0);

  // ============================================================
  // RENDER
  // ============================================================

  if (!csvUploaded) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] text-white">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold mb-3">Trade Journal</h1>
            <p className="text-gray-400 text-lg">Upload your trade history. Get AI-powered behavioral analysis.</p>
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all ${dragOver ? 'border-emerald-400 bg-emerald-400/5' : 'border-[#2a2d3e] hover:border-gray-500'}`}
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
          >
            <div className="text-5xl mb-4">📊</div>
            <div className="text-lg font-medium mb-2">Drop your CSV here or click to browse</div>
            <div className="text-sm text-gray-500 mb-6">Supports Binance, Bybit, OKX, Hyperliquid export formats</div>
            <div className="inline-block bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg px-6 py-2.5 text-sm text-gray-400">
              Expected columns: symbol, side, entry_price, exit_price, quantity, entry_time, exit_time
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          <div className="mt-8 bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">How to export from exchanges:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
              <div><span className="text-yellow-400 font-medium">Binance:</span> Orders → Trade History → Export</div>
              <div><span className="text-yellow-400 font-medium">Bybit:</span> Assets → Trading History → Download CSV</div>
              <div><span className="text-yellow-400 font-medium">OKX:</span> Orders → History → Export</div>
              <div><span className="text-yellow-400 font-medium">Hyperliquid:</span> Portfolio → Trade History → Download</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Trade Journal</h1>
            <p className="text-sm text-gray-500">{trades.length} trades analyzed</p>
          </div>
          <button
            onClick={() => { setTrades([]); setCsvUploaded(false); setBehavior(null); setAiInsight(null); setSelectedTrade(null); }}
            className="px-4 py-2 bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
          >
            Upload New CSV
          </button>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total PnL" value={formatUSD(totalPnl)} positive={totalPnl > 0} />
          <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} positive={winRate > 50 ? true : winRate < 40 ? false : null} />
          <StatCard label="Trades" value={`${trades.length}`} sub={`${trades.filter(t => t.pnl > 0).length}W / ${trades.filter(t => t.pnl <= 0).length}L`} />
          <StatCard label="Profit Factor" value={behavior ? (behavior.profitFactor === Infinity ? '∞' : behavior.profitFactor.toFixed(2)) : '—'} positive={behavior ? behavior.profitFactor > 1 : null} />
          <StatCard label="Expectancy" value={behavior ? formatUSD(behavior.expectancy) : '—'} positive={behavior ? behavior.expectancy > 0 : null} />
          <StatCard label="Fees Paid" value={formatUSD(totalFees)} positive={false} />
        </div>

        {/* AI Insight Box */}
        {(aiLoading || aiInsight) && (
          <div className="bg-gradient-to-r from-[#1a1d2e] to-[#1e2133] border border-[#2a2d3e] rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🤖</span>
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Trading Coach</h2>
              {aiLoading && <span className="text-xs text-gray-500 animate-pulse ml-2">Analyzing...</span>}
            </div>

            {aiInsight && (
              <div className="space-y-4">
                <p className="text-gray-300 text-sm leading-relaxed">{aiInsight.summary}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {aiInsight.strengths.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2">✅ Strengths</div>
                      {aiInsight.strengths.map((s, i) => (
                        <div key={i} className="text-xs text-gray-400 mb-1.5 pl-3 border-l border-emerald-400/30">{s}</div>
                      ))}
                    </div>
                  )}
                  {aiInsight.weaknesses.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">⚠️ Weaknesses</div>
                      {aiInsight.weaknesses.map((s, i) => (
                        <div key={i} className="text-xs text-gray-400 mb-1.5 pl-3 border-l border-red-400/30">{s}</div>
                      ))}
                    </div>
                  )}
                  {aiInsight.actionItems.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-2">🎯 Action Items</div>
                      {aiInsight.actionItems.map((s, i) => (
                        <div key={i} className="text-xs text-gray-400 mb-1.5 pl-3 border-l border-blue-400/30">{s}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 bg-[#12141f] rounded-lg p-1 overflow-x-auto">
          {(['overview', 'timing', 'entries', 'exits', 'direction', 'assets', 'risk'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[#2a2d3e] text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {tab === 'overview' ? '📋 Overview' :
               tab === 'timing' ? '⏱️ Timing' :
               tab === 'entries' ? '🎯 Entries' :
               tab === 'exits' ? '🚪 Exits' :
               tab === 'direction' ? '↕️ Direction' :
               tab === 'assets' ? '💰 Assets' :
               '🛡️ Risk'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {behavior && (
          <div className="space-y-6">

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BehaviorTable
                  title="📊 Full Trade Cycle Analysis"
                  headers={['Category', 'Metric', 'Value', 'Assessment']}
                  rows={[
                    ['Timing', 'Best Holding Period', behavior.bestHoldingRange, behavior.holdingBuckets.find(b => b.range === behavior.bestHoldingRange)?.winRate ? `${behavior.holdingBuckets.find(b => b.range === behavior.bestHoldingRange)!.winRate.toFixed(0)}% WR` : '—'],
                    ['Timing', 'Avg Hold (Winners)', formatHours(behavior.avgHoldingWinners), behavior.avgHoldingWinners > behavior.avgHoldingLosers ? '⚠️ Hold winners longer' : '✅ Good'],
                    ['Timing', 'Avg Hold (Losers)', formatHours(behavior.avgHoldingLosers), behavior.avgHoldingLosers > behavior.avgHoldingWinners * 1.5 ? '🔴 Cut losers faster' : '✅ Good'],
                    ['Entry', 'Best Entry Hour', behavior.bestEntryHour, '✅'],
                    ['Exit', 'Exit Efficiency', `${behavior.exitEfficiency.toFixed(1)}%`, behavior.exitEfficiency > 55 ? '✅ Good' : '⚠️ Needs work'],
                    ['Exit', 'Avg Loser Drawdown', `${behavior.avgLoserDrawdown.toFixed(2)}%`, behavior.avgLoserDrawdown > 5 ? '🔴 Too wide' : '✅ Controlled'],
                    ['Direction', 'Edge', behavior.directionEdge, behavior.directionEdge.includes('Strong') ? '✅' : '—'],
                    ['Direction', 'Long Win Rate', `${behavior.longStats.winRate.toFixed(1)}%`, behavior.longStats.winRate > 50 ? '✅' : '⚠️'],
                    ['Direction', 'Short Win Rate', `${behavior.shortStats.winRate.toFixed(1)}%`, behavior.shortStats.winRate > 50 ? '✅' : '⚠️'],
                    ['Risk', 'Profit Factor', behavior.profitFactor === Infinity ? '∞' : behavior.profitFactor.toFixed(2), behavior.profitFactor > 1.5 ? '✅ Strong' : behavior.profitFactor > 1 ? '⚠️ Marginal' : '🔴 Negative edge'],
                    ['Risk', 'Max Consecutive Losses', `${behavior.maxConsecutiveLosses}`, behavior.maxConsecutiveLosses > 5 ? '🔴' : '✅'],
                    ['Risk', 'Kelly %', `${behavior.kellyPct.toFixed(1)}%`, behavior.kellyPct > 0 ? '✅ Positive edge' : '🔴 No edge'],
                  ]}
                />

                <div className="space-y-6">
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-4">Win Rate by Holding Period</h3>
                    <BarChart
                      data={behavior.holdingBuckets}
                      labelKey="range"
                      valueKey="winRate"
                      colorFn={(v) => v >= 55 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Kelly Criterion" value={`${behavior.kellyPct.toFixed(1)}%`} sub="Suggested position size" positive={behavior.kellyPct > 0} />
                    <StatCard label="Diversification" value={`${behavior.diversificationScore.toFixed(0)}%`} sub={`${behavior.topAssets.length + behavior.worstAssets.length}+ assets traded`} positive={behavior.diversificationScore > 40} />
                  </div>
                </div>
              </div>
            )}

            {/* TIMING TAB */}
            {activeTab === 'timing' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BehaviorTable
                  title="⏱️ Holding Period Performance"
                  headers={['Period', 'Trades', 'Win Rate', 'Avg PnL']}
                  rows={behavior.holdingBuckets.map(b => [
                    b.range,
                    `${b.count}`,
                    `${b.winRate.toFixed(1)}%`,
                    formatUSD(b.avgPnl),
                  ])}
                />
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Avg Hold (Winners)" value={formatHours(behavior.avgHoldingWinners)} positive={true} />
                    <StatCard label="Avg Hold (Losers)" value={formatHours(behavior.avgHoldingLosers)} positive={false} />
                    <StatCard label="Best Period" value={behavior.bestHoldingRange} positive={true} />
                    <StatCard label="Worst Period" value={behavior.worstHoldingRange} positive={false} />
                  </div>
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-1">Entry Time Analysis</h3>
                    <p className="text-xs text-gray-500 mb-3">Based on UTC entry timestamps</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500">Best Entry Time</div>
                        <div className="text-sm font-mono text-emerald-400">{behavior.bestEntryHour}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Worst Entry Time</div>
                        <div className="text-sm font-mono text-red-400">{behavior.worstEntryHour}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">💡 Timing Insight</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {behavior.avgHoldingLosers > behavior.avgHoldingWinners * 1.3
                        ? `You hold losers ${formatHours(behavior.avgHoldingLosers - behavior.avgHoldingWinners)} longer than winners on average. Consider tighter time-based stops — if a trade hasn't worked within ${formatHours(behavior.avgHoldingWinners * 1.2)}, it's likely not going to.`
                        : behavior.avgHoldingWinners > behavior.avgHoldingLosers * 1.5
                        ? `Good discipline — you're cutting losers faster (${formatHours(behavior.avgHoldingLosers)}) than you hold winners (${formatHours(behavior.avgHoldingWinners)}). This is a strong trait.`
                        : `Your holding times for winners (${formatHours(behavior.avgHoldingWinners)}) and losers (${formatHours(behavior.avgHoldingLosers)}) are similar. Consider whether adding time-based exits could improve your edge.`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ENTRIES TAB */}
            {activeTab === 'entries' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BehaviorTable
                  title="🎯 Entry Momentum Analysis"
                  headers={['Move Range', 'Trades', 'Win Rate', 'Avg PnL']}
                  rows={behavior.momentumBuckets.map(b => [
                    b.range,
                    `${b.count}`,
                    `${b.winRate.toFixed(1)}%`,
                    formatUSD(b.avgPnl),
                  ])}
                />
                <div className="space-y-6">
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-4">Win Rate by Trade Outcome Range</h3>
                    <BarChart
                      data={behavior.momentumBuckets}
                      labelKey="range"
                      valueKey="winRate"
                      colorFn={(v) => v >= 55 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label="Uptrend Entries"
                      value={`${behavior.entryOnUptrend.winRate.toFixed(1)}% WR`}
                      sub={`${behavior.entryOnUptrend.count} trades`}
                      positive={behavior.entryOnUptrend.winRate > 50}
                    />
                    <StatCard
                      label="Downtrend Entries"
                      value={`${behavior.entryOnDowntrend.winRate.toFixed(1)}% WR`}
                      sub={`${behavior.entryOnDowntrend.count} trades`}
                      positive={behavior.entryOnDowntrend.winRate > 50}
                    />
                  </div>
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">💡 Entry Insight</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {behavior.entryOnUptrend.winRate > behavior.entryOnDowntrend.winRate + 10
                        ? `You perform significantly better when entering assets in uptrends (${behavior.entryOnUptrend.winRate.toFixed(0)}% WR vs ${behavior.entryOnDowntrend.winRate.toFixed(0)}%). Focus on momentum entries rather than bottom-fishing.`
                        : behavior.entryOnDowntrend.winRate > behavior.entryOnUptrend.winRate + 10
                        ? `Interesting — you actually perform better on countertrend entries (${behavior.entryOnDowntrend.winRate.toFixed(0)}% WR). You may have a knack for catching reversals.`
                        : `Your entry quality is fairly consistent across market conditions. Consider adding a pre-entry checklist to filter for higher-probability setups.`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* EXITS TAB */}
            {activeTab === 'exits' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Exit Efficiency" value={`${behavior.exitEfficiency.toFixed(1)}%`} sub="Win-to-loss capture ratio" positive={behavior.exitEfficiency > 55} />
                    <StatCard label="Avg Loser Drawdown" value={`${behavior.avgLoserDrawdown.toFixed(2)}%`} sub="Before exit" positive={behavior.avgLoserDrawdown < 3} />
                    <StatCard label="Early Exits" value={`${behavior.earlyExitCount}`} sub="Winners closed <1% profit" positive={behavior.earlyExitCount < trades.length * 0.1 ? true : false} />
                    <StatCard label="Late Exits" value={`${behavior.lateExitCount}`} sub="Losers held beyond avg" positive={behavior.lateExitCount < trades.length * 0.15 ? true : false} />
                  </div>
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">💡 Exit Insight</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {behavior.earlyExitCount > trades.length * 0.15
                        ? `You're closing ${behavior.earlyExitCount} winners with less than 1% profit. These "scratched" trades suggest you might be getting shaken out on normal volatility. Consider widening your take-profit or using trailing stops.`
                        : behavior.lateExitCount > trades.length * 0.2
                        ? `${behavior.lateExitCount} of your losers went significantly beyond your average loss before you exited. This suggests emotional attachment to losing positions. Set hard stops at entry and honor them.`
                        : `Your exit discipline is relatively consistent. Exit efficiency at ${behavior.exitEfficiency.toFixed(1)}% means you're capturing a decent portion of available moves.`}
                    </p>
                    {behavior.avgLoserDrawdown > 4 && (
                      <p className="text-xs text-yellow-400 mt-2">
                        ⚠️ Your average losing trade drops {behavior.avgLoserDrawdown.toFixed(1)}% before you exit. Tightening stops to {(behavior.avgLoserDrawdown * 0.6).toFixed(1)}% could significantly reduce your losses.
                      </p>
                    )}
                  </div>
                </div>
                <BehaviorTable
                  title="🚪 Exit Behavior Summary"
                  headers={['Metric', 'Value']}
                  rows={[
                    ['Exit Efficiency', `${behavior.exitEfficiency.toFixed(1)}%`],
                    ['Avg Winner Size', `${(trades.filter(t => t.pnl > 0).reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / Math.max(1, trades.filter(t => t.pnl > 0).length)).toFixed(2)}%`],
                    ['Avg Loser Size', `-${behavior.avgLoserDrawdown.toFixed(2)}%`],
                    ['Winners Closed <1%', `${behavior.earlyExitCount} (${(behavior.earlyExitCount / Math.max(1, trades.length) * 100).toFixed(0)}%)`],
                    ['Losers Held Too Long', `${behavior.lateExitCount} (${(behavior.lateExitCount / Math.max(1, trades.length) * 100).toFixed(0)}%)`],
                    ['Avg Winner Give-back', `~${behavior.avgWinnerGiveBack.toFixed(2)}%`],
                  ]}
                />
              </div>
            )}

            {/* DIRECTION TAB */}
            {activeTab === 'direction' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BehaviorTable
                  title="↕️ Long vs Short Comparison"
                  headers={['Metric', 'Long', 'Short']}
                  rows={[
                    ['Trades', `${behavior.longStats.count}`, `${behavior.shortStats.count}`],
                    ['Win Rate', `${behavior.longStats.winRate.toFixed(1)}%`, `${behavior.shortStats.winRate.toFixed(1)}%`],
                    ['Avg PnL', formatUSD(behavior.longStats.avgPnl), formatUSD(behavior.shortStats.avgPnl)],
                    ['Avg R:R', behavior.longStats.avgRR.toFixed(2), behavior.shortStats.avgRR.toFixed(2)],
                    ['Direction Edge', behavior.directionEdge, ''],
                  ]}
                />
                <div className="space-y-6">
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-4">Direction Split</h3>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 bg-emerald-400/20 rounded-full h-8 relative overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full flex items-center justify-center text-xs font-mono text-black font-bold"
                          style={{ width: `${trades.length > 0 ? (behavior.longStats.count / trades.length) * 100 : 50}%` }}
                        >
                          {behavior.longStats.count}L
                        </div>
                      </div>
                      <div className="flex-1 bg-red-400/20 rounded-full h-8 relative overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full flex items-center justify-center text-xs font-mono text-black font-bold"
                          style={{ width: `${trades.length > 0 ? (behavior.shortStats.count / trades.length) * 100 : 50}%` }}
                        >
                          {behavior.shortStats.count}S
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">💡 Direction Insight</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {behavior.directionEdge.includes('Strong Long')
                        ? `You have a clear edge on longs (${behavior.longStats.winRate.toFixed(0)}% WR, avg ${formatUSD(behavior.longStats.avgPnl)}). Consider sizing up on long setups and being more selective with shorts.`
                        : behavior.directionEdge.includes('Strong Short')
                        ? `Your shorts outperform significantly (${behavior.shortStats.winRate.toFixed(0)}% WR, avg ${formatUSD(behavior.shortStats.avgPnl)}). You might have a natural talent for spotting weakness — lean into it.`
                        : behavior.longStats.count > behavior.shortStats.count * 3
                        ? `You heavily favor longs (${behavior.longStats.count} vs ${behavior.shortStats.count} shorts). In crypto, being able to short effectively is crucial. Consider practicing with small short positions.`
                        : `Your directional performance is relatively balanced. This versatility is a strength — you can profit in both bull and bear markets.`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ASSETS TAB */}
            {activeTab === 'assets' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BehaviorTable
                  title="💰 Best Performing Assets"
                  headers={['Symbol', 'Trades', 'Win Rate', 'Total PnL']}
                  rows={behavior.topAssets.map(a => [
                    a.symbol,
                    `${a.count}`,
                    `${a.winRate.toFixed(1)}%`,
                    formatUSD(a.totalPnl),
                  ])}
                />
                <BehaviorTable
                  title="📉 Worst Performing Assets"
                  headers={['Symbol', 'Trades', 'Win Rate', 'Total PnL']}
                  rows={behavior.worstAssets.map(a => [
                    a.symbol,
                    `${a.count}`,
                    `${a.winRate.toFixed(1)}%`,
                    formatUSD(a.totalPnl),
                  ])}
                />
                <div className="lg:col-span-2">
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">💡 Asset Selection Insight</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {behavior.worstAssets.length > 0 && behavior.worstAssets[0].totalPnl < -100
                        ? `${behavior.worstAssets[0].symbol} is your biggest drag (${formatUSD(behavior.worstAssets[0].totalPnl)} across ${behavior.worstAssets[0].count} trades). Consider removing it from your watchlist or studying why it doesn't work for your strategy.`
                        : `Asset diversification score: ${behavior.diversificationScore.toFixed(0)}%. `}
                      {behavior.topAssets.length > 0 && ` Your best asset is ${behavior.topAssets[0].symbol} (${formatUSD(behavior.topAssets[0].totalPnl)} total). Consider increasing allocation to assets where you have a proven edge.`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* RISK TAB */}
            {activeTab === 'risk' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BehaviorTable
                  title="🛡️ Risk Management Profile"
                  headers={['Metric', 'Value', 'Assessment']}
                  rows={[
                    ['Profit Factor', behavior.profitFactor === Infinity ? '∞' : behavior.profitFactor.toFixed(2), behavior.profitFactor > 1.5 ? '✅ Strong' : behavior.profitFactor > 1 ? '⚠️ Marginal' : '🔴 Losing edge'],
                    ['Expectancy', formatUSD(behavior.expectancy), behavior.expectancy > 0 ? '✅ Positive' : '🔴 Negative'],
                    ['Kelly %', `${behavior.kellyPct.toFixed(1)}%`, behavior.kellyPct > 20 ? '✅ Strong edge' : behavior.kellyPct > 0 ? '⚠️ Small edge' : '🔴 No edge'],
                    ['Largest Win', formatUSD(behavior.largestWin), '—'],
                    ['Largest Loss', formatUSD(Math.abs(behavior.largestLoss)), Math.abs(behavior.largestLoss) > behavior.largestWin ? '🔴 Larger than biggest win' : '✅ Controlled'],
                    ['Max Consec. Wins', `${behavior.maxConsecutiveWins}`, '—'],
                    ['Max Consec. Losses', `${behavior.maxConsecutiveLosses}`, behavior.maxConsecutiveLosses > 5 ? '🔴 Tilt risk' : '✅ Normal'],
                    ['Win/Loss Ratio', `${(behavior.largestWin / Math.max(1, Math.abs(behavior.largestLoss))).toFixed(2)}x`, '—'],
                  ]}
                />
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Largest Win" value={formatUSD(behavior.largestWin)} positive={true} />
                    <StatCard label="Largest Loss" value={formatUSD(Math.abs(behavior.largestLoss))} positive={false} />
                    <StatCard label="Max Win Streak" value={`${behavior.maxConsecutiveWins}`} positive={true} />
                    <StatCard label="Max Loss Streak" value={`${behavior.maxConsecutiveLosses}`} positive={behavior.maxConsecutiveLosses <= 5} />
                  </div>
                  <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">💡 Risk Insight</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {behavior.profitFactor < 1
                        ? `Your profit factor is below 1 (${behavior.profitFactor.toFixed(2)}), meaning you're losing money over time. Focus on either improving win rate or increasing average winner size relative to losers.`
                        : behavior.maxConsecutiveLosses > 5
                        ? `You've had a streak of ${behavior.maxConsecutiveLosses} consecutive losses. Consider implementing a "circuit breaker" — stop trading after 3-4 consecutive losses and review your setups before continuing.`
                        : Math.abs(behavior.largestLoss) > behavior.largestWin
                        ? `Your largest loss (${formatUSD(Math.abs(behavior.largestLoss))}) exceeds your largest win (${formatUSD(behavior.largestWin)}). This asymmetry suggests you need tighter risk management on individual trades.`
                        : `Risk profile looks solid. Profit factor of ${behavior.profitFactor.toFixed(2)} with Kelly suggesting ${behavior.kellyPct.toFixed(1)}% position sizing. Stay disciplined.`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TRADE LIST + CHART */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Individual Trades</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Trade List */}
            <div className="lg:col-span-1 bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
              {trades.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => selectTrade(t)}
                  className={`px-4 py-3 border-b border-[#1e2133] cursor-pointer transition-all hover:bg-[#1e2133] ${selectedTrade?.id === t.id ? 'bg-[#1e2133] border-l-2 border-l-blue-400' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.side === 'LONG' ? 'bg-emerald-400/20 text-emerald-400' : 'bg-red-400/20 text-red-400'}`}>
                        {t.side}
                      </span>
                      <span className="text-sm font-medium">{t.symbol}</span>
                    </div>
                    <span className={`text-sm font-mono ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.pnl >= 0 ? '+' : ''}{formatUSD(t.pnl)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">{t.entryTime ? new Date(t.entryTime).toLocaleDateString() : `Trade #${i + 1}`}</span>
                    <span className={`text-xs font-mono ${t.pnlPercent >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                      {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="lg:col-span-2">
              {selectedTrade ? (
                <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className={`text-xs font-bold px-2 py-1 rounded mr-2 ${selectedTrade.side === 'LONG' ? 'bg-emerald-400/20 text-emerald-400' : 'bg-red-400/20 text-red-400'}`}>
                        {selectedTrade.side}
                      </span>
                      <span className="text-lg font-bold">{selectedTrade.symbol}</span>
                    </div>
                    <div className={`text-lg font-mono font-bold ${selectedTrade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {selectedTrade.pnl >= 0 ? '+' : ''}{formatUSD(selectedTrade.pnl)} ({selectedTrade.pnlPercent >= 0 ? '+' : ''}{selectedTrade.pnlPercent.toFixed(2)}%)
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
                    <div><span className="text-gray-500">Entry</span><div className="font-mono text-gray-300">${selectedTrade.entryPrice.toFixed(4)}</div></div>
                    <div><span className="text-gray-500">Exit</span><div className="font-mono text-gray-300">${selectedTrade.exitPrice.toFixed(4)}</div></div>
                    <div><span className="text-gray-500">Size</span><div className="font-mono text-gray-300">{selectedTrade.quantity}</div></div>
                    <div><span className="text-gray-500">Duration</span><div className="font-mono text-gray-300">{formatHours(getHoldingHours(selectedTrade))}</div></div>
                  </div>
                  {candles.length > 0 ? (
                    <TradeChart trade={selectedTrade} candles={candles} />
                  ) : (
                    <div className="h-[300px] bg-[#12141f] rounded-lg flex items-center justify-center text-gray-500 text-sm">
                      Loading chart...
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg h-[500px] flex items-center justify-center text-gray-500">
                  Select a trade to view the chart
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
