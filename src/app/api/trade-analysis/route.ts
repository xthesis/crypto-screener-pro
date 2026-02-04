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

    const trades = parseTrades(rawText);
    if (trades.length === 0) {
      return NextResponse.json({ error: 'No valid trades found. Check file format.' }, { status: 400 });
    }

    const groups = groupIntoRoundTrips(trades);

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

    const symbolSet = new Set(groups.map(g => g.symbol));
    const symbolStats = Array.from(symbolSet).map(sym => {
      const symGroups = groups.filter(g => g.symbol === sym);
      const symPnl = symGroups.reduce((s, g) => s + g.pnl, 0);
      const symWins = symGroups.filter(g => g.pnl > 0).length;
      return { symbol: sym, trades: symGroups.length, pnl: symPnl, winRate: (symWins / symGroups.length * 100).toFixed(0) };
    }).sort((a, b) => b.trades - a.trades);

    // ── DEEP ANALYTICS ──
    const sorted = [...groups].sort((a, b) => (a.entries[0]?.timestamp || 0) - (b.entries[0]?.timestamp || 0));

    // Holding time buckets
    const holdBucket = (arr: TradeGroup[]) => {
      if (arr.length === 0) return { trades: 0, pnl: 0, winRate: '0', avgPnl: 0 };
      const pnl = arr.reduce((s, g) => s + g.pnl, 0);
      const wr = (arr.filter(g => g.pnl > 0).length / arr.length * 100).toFixed(1);
      return { trades: arr.length, pnl: +pnl.toFixed(2), winRate: wr, avgPnl: +(pnl / arr.length).toFixed(2) };
    };
    const holdingTimeBuckets = {
      'Scalps (<10m)': holdBucket(groups.filter(g => g.holdingTime > 0 && g.holdingTime < 600000)),
      'Intraday (10m-4h)': holdBucket(groups.filter(g => g.holdingTime >= 600000 && g.holdingTime < 14400000)),
      'Day (4h-1d)': holdBucket(groups.filter(g => g.holdingTime >= 14400000 && g.holdingTime < 86400000)),
      'Swing (1d-7d)': holdBucket(groups.filter(g => g.holdingTime >= 86400000 && g.holdingTime < 604800000)),
      'Position (>7d)': holdBucket(groups.filter(g => g.holdingTime >= 604800000)),
    };

    // Session performance (UTC hours)
    const sessionBucket = (hours: number[]) => {
      const arr = groups.filter(g => {
        const h = g.entries[0]?.timestamp ? new Date(g.entries[0].timestamp).getUTCHours() : -1;
        return hours.includes(h);
      });
      return holdBucket(arr);
    };
    const sessionPerformance = {
      'Asia (00-08 UTC)': sessionBucket([0,1,2,3,4,5,6,7]),
      'Europe (08-16 UTC)': sessionBucket([8,9,10,11,12,13,14,15]),
      'US (16-24 UTC)': sessionBucket([16,17,18,19,20,21,22,23]),
    };

    // Day of week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayPerformance: Record<string, any> = {};
    dayNames.forEach(d => {
      const arr = groups.filter(g => {
        const day = g.entries[0]?.timestamp ? dayNames[new Date(g.entries[0].timestamp).getUTCDay()] : null;
        return day === d;
      });
      if (arr.length > 0) dayPerformance[d] = holdBucket(arr);
    });

    // Long vs Short
    const longTrades = groups.filter(g => g.direction === 'long');
    const shortTrades = groups.filter(g => g.direction === 'short');
    const directionPerformance = {
      long: holdBucket(longTrades),
      short: holdBucket(shortTrades),
    };

    // Streak analysis + tilt detection
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    // Track: after 3+ loss streak, what happens in next 3 trades?
    let lossStreak = 0;
    const postStreakResults: number[] = []; // pnl of trades right after 3+ loss streak
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].pnl > 0) {
        curWin++; curLoss = 0;
        if (curWin > maxWinStreak) maxWinStreak = curWin;
        if (lossStreak >= 3) {
          // This trade comes right after a 3+ loss streak
          postStreakResults.push(sorted[i].pnl);
        }
        lossStreak = 0;
      } else {
        curLoss++; curWin = 0;
        if (curLoss > maxLossStreak) maxLossStreak = curLoss;
        lossStreak++;
        if (lossStreak > 3) {
          postStreakResults.push(sorted[i].pnl);
        }
      }
    }
    const tiltPnl = postStreakResults.length > 0 ? postStreakResults.reduce((s, v) => s + v, 0) : 0;
    const tiltWinRate = postStreakResults.length > 0
      ? (postStreakResults.filter(v => v > 0).length / postStreakResults.length * 100).toFixed(1)
      : '0';

    // Monthly P&L curve
    const monthlyPnl: Record<string, number> = {};
    sorted.forEach(g => {
      const ts = g.exits[g.exits.length - 1]?.timestamp || g.entries[0]?.timestamp;
      if (ts) {
        const key = new Date(ts).toISOString().substring(0, 7); // YYYY-MM
        monthlyPnl[key] = (monthlyPnl[key] || 0) + g.pnl;
      }
    });
    const monthlyCurve = Object.entries(monthlyPnl).sort(([a], [b]) => a.localeCompare(b)).map(([month, pnl]) => ({ month, pnl: +pnl.toFixed(2) }));

    // Cumulative P&L curve (sampled: max 100 points)
    let cumPnl = 0;
    const cumCurve: { trade: number; pnl: number }[] = [];
    const step = Math.max(1, Math.floor(sorted.length / 100));
    sorted.forEach((g, i) => {
      cumPnl += g.pnl;
      if (i % step === 0 || i === sorted.length - 1) {
        cumCurve.push({ trade: i + 1, pnl: +cumPnl.toFixed(2) });
      }
    });

    const deepAnalytics = {
      holdingTimeBuckets,
      sessionPerformance,
      dayPerformance,
      directionPerformance,
      streaks: { maxWinStreak, maxLossStreak },
      tilt: { tradesAfterLossStreak: postStreakResults.length, pnl: +tiltPnl.toFixed(2), winRate: tiltWinRate },
      monthlyCurve,
      cumCurve,
      avgLossDollar: losers.length > 0 ? +(losers.reduce((s, g) => s + g.pnl, 0) / losers.length).toFixed(2) : 0,
    };

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

    let analysis = '';
    let coachData: any = null;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      const statsText = buildStatsPrompt(stats, groups, deepAnalytics);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1200,
            messages: [{
              role: 'user',
              content: `You are a professional crypto trading coach. Analyze this trader's performance data and return ONLY valid JSON — no markdown, no backticks, no explanation.

${statsText}

Return this exact JSON structure:
{
  "grade": "B+",
  "gradeLabel": "Solid but needs discipline",
  "scores": {
    "discipline": { "value": 45, "label": "Overtrading" },
    "riskManagement": { "value": 72, "label": "Good R:R ratio" },
    "execution": { "value": 58, "label": "Entries OK, exits poor" },
    "consistency": { "value": 35, "label": "Erratic sizing" }
  },
  "strengths": [
    { "icon": "trophy", "title": "Good R:R", "detail": "1.42 avg win/loss ratio" },
    { "icon": "target", "title": "Alt selection", "detail": "KAITO +$1,693 profit" }
  ],
  "mistakes": [
    { "icon": "alert", "title": "Overtrading", "detail": "762 trades, $13,959 in fees (72% of gross)", "severity": "high" },
    { "icon": "clock", "title": "No patience", "detail": "CAKE held 50s, BNB trades <10min", "severity": "medium" }
  ],
  "actions": [
    "Max 20 trades/month — only A+ setups",
    "24h minimum hold rule for all positions",
    "Focus on KAITO, VIRTUAL, PENGU — drop BTC scalps"
  ],
  "pattern": "Skilled at finding alts but addicted to action. Best P&L from longer holds on small caps, worst from scalping majors."
}

Rules:
- grade: A+ to F, be honest
- scores: 0-100 each. Be harsh if warranted.
- label: max 4 words describing the score
- strengths: exactly 2-3 items, icon must be one of: trophy, target, shield, trending, zap
- mistakes: exactly 2-3 items, icon must be one of: alert, clock, skull, flame, ban. severity: high/medium/low
- actions: exactly 3 items, max 10 words each, very specific
- pattern: max 25 words, the single most important behavioral insight
- detail fields: max 10 words, use actual numbers from their data
- All values must reference actual numbers and coins from the data above
- Return ONLY the JSON object, nothing else`
            }],
          }),
        });
        clearTimeout(timeout);
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawText = aiData.content?.[0]?.text || '';
          if (rawText) {
            // Try to parse as JSON, fallback to raw text
            try {
              // Strip markdown fences, leading/trailing text outside braces
              let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
              // Find the first { and last } to extract just the JSON object
              const firstBrace = cleaned.indexOf('{');
              const lastBrace = cleaned.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1);
              }
              coachData = JSON.parse(cleaned);
            } catch (parseErr) {
              console.error('Coach JSON parse failed:', parseErr, 'Raw:', rawText.substring(0, 200));
              analysis = rawText; // fallback to text display
            }
          }
        } else {
          console.error('AI coach API error:', aiRes.status, aiRes.statusText);
        }
      } catch (aiErr) {
        console.error('AI coach fetch error:', aiErr);
      }
    }

    return NextResponse.json({ stats, groups, analysis, coachData, deepAnalytics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════
// EXCHANGE FORMAT DETECTION
// ═══════════════════════════════════════════════

type ExchangeFormat = 'hyperliquid' | 'binance-spot' | 'binance-futures' | 'bybit-spot' | 'bybit-derivs' | 'bybit-closed-pnl' | 'okx' | 'generic';

function detectExchange(headers: string[]): ExchangeFormat {
  const h = headers.join('|');

  // Hyperliquid: old format: time coin direction price size trade volume fee closedpnl
  //              new format: time coin dir px sz ntl fee closedpnl
  if (h.includes('closedpnl') && h.includes('coin')) return 'hyperliquid';
  if (h.includes('trade volume') && h.includes('coin')) return 'hyperliquid';
  if (h.includes('coin') && (h.includes('|dir|') || h.includes('|dir') || h === 'dir' || h.includes('|px|') || h.includes('|ntl|'))) return 'hyperliquid';

  // Binance Spot: Date(UTC),Pair,Side,Price,Executed,Amount,Fee
  if (h.includes('date(utc)') && (h.includes('pair') || h.includes('market'))) return 'binance-spot';

  // Binance Futures: includes "realized profit" or "quote quantity"
  if (h.includes('realized profit') || h.includes('realised profit')) return 'binance-futures';
  if (h.includes('quote quantity') && h.includes('commission')) return 'binance-futures';

  // Bybit Closed P&L (old): Contracts,Closing Direction,Qty,Entry Price,Exit Price,Closed P&L
  if (h.includes('closing direction') && h.includes('entry price') && h.includes('exit price')) return 'bybit-closed-pnl';
  if (h.includes('contracts') && h.includes('closing direction')) return 'bybit-closed-pnl';

  // Bybit Spot: has "fee currency"
  if (h.includes('fee currency') && !h.includes('closing direction')) return 'bybit-spot';
  if (h.includes('avg. filled') || h.includes('avg filled')) return 'bybit-spot';

  // Bybit Derivs: has "exec price" or "exec type"
  if (h.includes('exec price') || h.includes('exec type')) return 'bybit-derivs';

  // OKX: has "instrument" or "instid" or "fillpx"
  if (h.includes('instrument') || h.includes('instid') || h.includes('inst id')) return 'okx';
  if (h.includes('fillpx') || h.includes('filled price') || h.includes('fill price')) return 'okx';

  return 'generic';
}

// ═══════════════════════════════════════════════
// COLUMN MAPPING
// ═══════════════════════════════════════════════

interface ColMap {
  time: number; symbol: number; side: number; price: number; size: number;
  fee: number; pnl: number; vol: number;
  entryPrice: number; exitPrice: number; closingDir: number;
}

function fc(headers: string[], ...patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex(h => h === p);
    if (idx !== -1) return idx;
  }
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.includes(p));
    if (idx !== -1) return idx;
  }
  return -1;
}

function mapColumns(fmt: ExchangeFormat, hdr: string[]): ColMap {
  const m: ColMap = { time: -1, symbol: -1, side: -1, price: -1, size: -1, fee: -1, pnl: -1, vol: -1, entryPrice: -1, exitPrice: -1, closingDir: -1 };

  switch (fmt) {
    case 'hyperliquid':
      m.time = fc(hdr, 'time', 'date');
      m.symbol = fc(hdr, 'coin', 'symbol');
      m.side = fc(hdr, 'direction', 'dir', 'side');
      m.price = fc(hdr, 'price', 'px');
      m.size = fc(hdr, 'size', 'sz', 'quantity', 'qty');
      m.fee = fc(hdr, 'fee');
      m.pnl = fc(hdr, 'closedpnl', 'closed pnl');
      m.vol = fc(hdr, 'trade volume', 'ntl', 'volume');
      break;
    case 'binance-spot':
      m.time = fc(hdr, 'date(utc)', 'date', 'time');
      m.symbol = fc(hdr, 'pair', 'market', 'symbol');
      m.side = fc(hdr, 'side', 'type');
      m.price = fc(hdr, 'price');
      m.size = fc(hdr, 'executed', 'amount', 'quantity', 'qty');
      m.fee = fc(hdr, 'fee', 'commission');
      m.vol = fc(hdr, 'total', 'amount');
      break;
    case 'binance-futures':
      m.time = fc(hdr, 'date(utc)', 'date', 'time');
      m.symbol = fc(hdr, 'symbol', 'pair');
      m.side = fc(hdr, 'side', 'type');
      m.price = fc(hdr, 'price');
      m.size = fc(hdr, 'quantity', 'qty', 'filled qty');
      m.fee = fc(hdr, 'commission', 'fee');
      m.pnl = fc(hdr, 'realized profit', 'realised profit', 'pnl');
      m.vol = fc(hdr, 'quote quantity', 'total');
      break;
    case 'bybit-spot':
      m.time = fc(hdr, 'time(utc)', 'time', 'date', 'created time');
      m.symbol = fc(hdr, 'symbol', 'trading pair');
      m.side = fc(hdr, 'side', 'direction');
      m.price = fc(hdr, 'avg. filled price', 'avg filled price', 'price', 'exec price');
      m.size = fc(hdr, 'filled qty', 'qty', 'quantity', 'size');
      m.fee = fc(hdr, 'fee', 'commission');
      m.pnl = fc(hdr, 'closed p&l', 'closed pnl', 'pnl');
      m.vol = fc(hdr, 'total', 'volume');
      break;
    case 'bybit-closed-pnl':
      m.time = fc(hdr, 'trade time', 'time', 'date');
      m.symbol = fc(hdr, 'contracts', 'symbol');
      m.closingDir = fc(hdr, 'closing direction');
      m.side = fc(hdr, 'closing direction', 'side');
      m.size = fc(hdr, 'qty', 'quantity', 'size');
      m.entryPrice = fc(hdr, 'entry price');
      m.exitPrice = fc(hdr, 'exit price');
      m.price = fc(hdr, 'entry price', 'price');
      m.pnl = fc(hdr, 'closed p&l', 'closed pnl', 'pnl');
      m.fee = fc(hdr, 'fee');
      break;
    case 'bybit-derivs':
      m.time = fc(hdr, 'time', 'date', 'created time', 'trade time');
      m.symbol = fc(hdr, 'symbol', 'contracts');
      m.side = fc(hdr, 'side', 'direction');
      m.price = fc(hdr, 'exec price', 'price', 'avg. filled price');
      m.size = fc(hdr, 'qty', 'quantity', 'size', 'filled qty');
      m.fee = fc(hdr, 'fee', 'commission');
      m.pnl = fc(hdr, 'closed p&l', 'closed pnl', 'pnl');
      m.vol = fc(hdr, 'exec value', 'volume', 'total');
      break;
    case 'okx':
      m.time = fc(hdr, 'order time', 'time', 'date', 'created time', 'timestamp');
      m.symbol = fc(hdr, 'instrument id', 'instrument', 'instid', 'inst id', 'underlying', 'symbol');
      m.side = fc(hdr, 'side', 'direction');
      m.price = fc(hdr, 'filled price', 'fill price', 'fillpx', 'price', 'avg price');
      m.size = fc(hdr, 'filled qty', 'fillsz', 'qty', 'quantity', 'size', 'amount');
      m.fee = fc(hdr, 'fee', 'commission');
      m.pnl = fc(hdr, 'pnl', 'realized pnl', 'profit');
      m.vol = fc(hdr, 'volume', 'total');
      break;
    default: // generic
      m.time = fc(hdr, 'time', 'date', 'timestamp', 'created', 'datetime', 'order time', 'trade time', 'execution time');
      m.symbol = fc(hdr, 'coin', 'symbol', 'pair', 'market', 'asset', 'instrument', 'instid', 'contracts', 'trading pair', 'instrument id', 'ticker');
      m.side = fc(hdr, 'direction', 'dir', 'side', 'type', 'order type', 'closing direction', 'action');
      m.price = fc(hdr, 'price', 'px', 'avg filled price', 'avg. filled price', 'exec price', 'filled price', 'fill price', 'fillpx', 'deal price', 'execution price', 'trade price');
      m.size = fc(hdr, 'size', 'sz', 'quantity', 'qty', 'amount', 'filled', 'executed', 'filled qty', 'fillsz', 'contracts');
      m.fee = fc(hdr, 'fee', 'commission', 'trading fee');
      m.pnl = fc(hdr, 'closedpnl', 'closed pnl', 'closed p&l', 'realized profit', 'realised pnl', 'realised profit', 'realized pnl', 'pnl', 'profit');
      m.vol = fc(hdr, 'trade volume', 'ntl', 'volume', 'total', 'filled value', 'quote quantity', 'exec value', 'notional');
      m.entryPrice = fc(hdr, 'entry price');
      m.exitPrice = fc(hdr, 'exit price');
      m.closingDir = fc(hdr, 'closing direction');
  }
  return m;
}

// ═══════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════

function parseTrades(text: string): RawTrade[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const isTab = firstLine.split('\t').length > firstLine.split(',').length;
  const delimiter = isTab ? '\t' : ',';

  const rawHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/['"]/g, ''));
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/\s+/g, ' '));

  const fmt = detectExchange(headers);
  const cm = mapColumns(fmt, headers);

  if (cm.symbol === -1 || (cm.price === -1 && cm.entryPrice === -1)) {
    throw new Error(
      `Cannot detect required columns.\n\nHeaders found: ${rawHeaders.join(', ')}\n\n` +
      `Supported formats:\n` +
      `• Hyperliquid: Export from Portfolio → Trade History → Export CSV\n` +
      `• Binance: Orders → Spot Order → Trade History → Export\n` +
      `• Bybit: Orders → Spot/Derivatives → Trade History → Export\n` +
      `• OKX: Assets → Order History → Trade History → Export\n` +
      `• Custom: Any CSV with columns: symbol, side, price (+ optional: qty, time, fee, pnl)`
    );
  }

  // Bybit Closed P&L is special: each row = complete round trip
  if (fmt === 'bybit-closed-pnl' && cm.entryPrice !== -1 && cm.exitPrice !== -1) {
    return parseBybitClosedPnl(lines, delimiter, cm);
  }

  const trades: RawTrade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitLine(line, delimiter);

    const price = parseNum(cols[cm.price]);
    if (!price || price <= 0) continue;

    const symbol = cleanSymbol(cols[cm.symbol] || '', fmt);
    if (!symbol) continue;

    const side = cm.side !== -1 ? parseSide(cols[cm.side] || '') : '';
    if (!side) continue;

    const quantity = cm.size !== -1 ? Math.abs(parseNum(cols[cm.size])) || 1 : 1;
    const timestamp = cm.time !== -1 ? parseTimestamp(cols[cm.time]) : Date.now();
    const fee = cm.fee !== -1 ? Math.abs(parseNum(cols[cm.fee])) || 0 : 0;
    const closedPnl = cm.pnl !== -1 ? parseNum(cols[cm.pnl]) || 0 : 0;
    const volume = cm.vol !== -1 ? parseNum(cols[cm.vol]) || 0 : price * quantity;

    trades.push({ symbol, side, price, quantity, timestamp, fee, closedPnl, volume });
  }

  return trades.sort((a, b) => a.timestamp - b.timestamp);
}

// Bybit Closed P&L: each row has entry+exit in one line
function parseBybitClosedPnl(lines: string[], delimiter: string, cm: ColMap): RawTrade[] {
  const trades: RawTrade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitLine(line, delimiter);

    const entryPrice = parseNum(cols[cm.entryPrice]);
    const exitPrice = parseNum(cols[cm.exitPrice]);
    if (!entryPrice || !exitPrice) continue;

    const symbol = cleanSymbol(cols[cm.symbol] || '', 'bybit-closed-pnl');
    if (!symbol) continue;

    const qty = cm.size !== -1 ? Math.abs(parseNum(cols[cm.size])) || 1 : 1;
    const timestamp = cm.time !== -1 ? parseTimestamp(cols[cm.time]) : Date.now();
    const closedPnl = cm.pnl !== -1 ? parseNum(cols[cm.pnl]) || 0 : 0;
    const fee = cm.fee !== -1 ? Math.abs(parseNum(cols[cm.fee])) || 0 : 0;

    // "Closing Direction" = how position was closed
    // Sell to close = was Long | Buy to close = was Short
    const closingDir = cm.closingDir !== -1 ? parseSide(cols[cm.closingDir] || '') : '';

    if (closingDir === 'sell') {
      trades.push({ symbol, side: 'buy', price: entryPrice, quantity: qty, timestamp: timestamp - 1000, fee: fee / 2, closedPnl: 0, volume: entryPrice * qty });
      trades.push({ symbol, side: 'sell', price: exitPrice, quantity: qty, timestamp, fee: fee / 2, closedPnl, volume: exitPrice * qty });
    } else if (closingDir === 'buy') {
      trades.push({ symbol, side: 'sell', price: entryPrice, quantity: qty, timestamp: timestamp - 1000, fee: fee / 2, closedPnl: 0, volume: entryPrice * qty });
      trades.push({ symbol, side: 'buy', price: exitPrice, quantity: qty, timestamp, fee: fee / 2, closedPnl, volume: exitPrice * qty });
    }
  }
  return trades.sort((a, b) => a.timestamp - b.timestamp);
}

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════

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

function cleanSymbol(s: string, fmt: ExchangeFormat): string {
  if (!s) return '';
  s = s.trim().replace(/['"]/g, '');

  // Hyperliquid: keep as-is (HYPE/USDC, BTC, COPPER (xyz), kPEPE)
  if (fmt === 'hyperliquid') return s.toUpperCase().trim();

  // Binance: BTCUSDT → BTC
  if (fmt === 'binance-spot' || fmt === 'binance-futures') {
    s = s.toUpperCase();
    for (const q of ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD', 'AUD', 'EUR', 'GBP', 'BRL', 'TRY', 'JPY', 'BTC', 'ETH', 'BNB']) {
      if (s.endsWith(q) && s.length > q.length) { s = s.slice(0, -q.length); break; }
    }
    return s;
  }

  // Bybit: BTCUSDT → BTC
  if (fmt === 'bybit-spot' || fmt === 'bybit-derivs' || fmt === 'bybit-closed-pnl') {
    s = s.toUpperCase();
    for (const q of ['USDT', 'USDC', 'PERP', 'USD']) {
      if (s.endsWith(q) && s.length > q.length) { s = s.slice(0, -q.length); break; }
    }
    return s;
  }

  // OKX: BTC-USDT or BTC-USDT-SWAP → BTC
  if (fmt === 'okx') {
    s = s.toUpperCase();
    const parts = s.split('-');
    return parts[0] || s;
  }

  // Generic
  s = s.toUpperCase();
  s = s.replace(/[-_\/]/g, '');
  s = s.replace(/USDT|USDC|USD|BUSD|PERP/gi, '');
  return s.trim();
}

function parseSide(val: string): string {
  const v = val.toLowerCase().trim();
  if (v === 'buy' || v === 'long' || v === 'bid') return 'buy';
  if (v === 'sell' || v === 'short' || v === 'ask') return 'sell';
  if (v.includes('buy') || v === 'open long' || v === 'close short') return 'buy';
  if (v.includes('sell') || v === 'open short' || v === 'close long') return 'sell';
  return '';
}

function parseNum(val: string): number {
  if (!val) return 0;
  let cleaned = val.replace(/[$€£,\s]/g, '').trim();
  cleaned = cleaned.replace(/[A-Za-z]+$/, ''); // strip trailing units like "ETH"
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseTimestamp(val: string): number {
  if (!val) return 0;
  val = val.trim().replace(/['"]/g, '');

  // "MM/DD/YYYY - HH:MM:SS" (Hyperliquid)
  const hlMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hlMatch) {
    const [, month, day, year, hour, min, sec] = hlMatch;
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min}:${sec}Z`).getTime();
  }

  // "DD/MM/YYYY HH:MM:SS" or "MM/DD/YYYY HH:MM:SS"
  const slashDate = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[\s,]*(\d{1,2}:\d{2}:\d{2})?$/);
  if (slashDate) {
    const [, p1, p2, year, time] = slashDate;
    const d1 = parseInt(p1), d2 = parseInt(p2);
    let month: string, day: string;
    if (d1 > 12) { day = p1; month = p2; }
    else if (d2 > 12) { month = p1; day = p2; }
    else { month = p1; day = p2; }
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time || '00:00:00'}Z`).getTime();
  }

  // "YYYY-MM-DD HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val.replace(' ', 'T') + (val.includes('Z') || val.includes('+') ? '' : 'Z'));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // "YYYY/MM/DD HH:MM:SS"
  const slashIso = val.match(/^(\d{4})\/(\d{2})\/(\d{2})\s*(.*)?$/);
  if (slashIso) {
    const [, y, m, d, time] = slashIso;
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}Z`).getTime();
  }

  // Unix timestamp
  const num = Number(val);
  if (!isNaN(num) && num > 0) {
    if (num > 1e15) return Math.floor(num / 1000);
    if (num > 1e12) return num;
    if (num > 1e9) return num * 1000;
  }

  // Fallback
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();

  return 0;
}

// ═══════════════════════════════════════════════
// TRADE GROUPING
// ═══════════════════════════════════════════════

function groupIntoRoundTrips(trades: RawTrade[]): TradeGroup[] {
  const bySymbol = new Map<string, RawTrade[]>();
  for (const t of trades) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  }

  const allGroups: TradeGroup[] = [];

  for (const [symbol, symbolTrades] of bySymbol) {
    let position = 0;
    let currentEntries: RawTrade[] = [];
    let currentExits: RawTrade[] = [];
    let direction = '';

    for (const trade of symbolTrades) {
      const isBuy = trade.side === 'buy';

      if (position === 0 || Math.abs(position) < 0.001) {
        if (currentEntries.length > 0 && currentExits.length > 0) {
          const group = buildGroup(symbol, currentEntries, currentExits, direction);
          if (group) allGroups.push(group);
        }
        currentEntries = [trade];
        currentExits = [];
        direction = isBuy ? 'long' : 'short';
        position = isBuy ? trade.quantity : -trade.quantity;
      } else if ((direction === 'long' && isBuy) || (direction === 'short' && !isBuy)) {
        currentEntries.push(trade);
        position += isBuy ? trade.quantity : -trade.quantity;
      } else {
        currentExits.push(trade);
        position += isBuy ? trade.quantity : -trade.quantity;
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

    if (currentEntries.length > 0 && currentExits.length > 0) {
      const group = buildGroup(symbol, currentEntries, currentExits, direction);
      if (group) allGroups.push(group);
    }
  }

  return allGroups.sort((a, b) => (a.entries[0]?.timestamp || 0) - (b.entries[0]?.timestamp || 0));
}

function buildGroup(symbol: string, entries: RawTrade[], exits: RawTrade[], direction: string): TradeGroup | null {
  if (entries.length === 0 || exits.length === 0) return null;

  const entryQty = entries.reduce((s, e) => s + e.quantity, 0);
  const exitQty = exits.reduce((s, e) => s + e.quantity, 0);
  const entryAvg = entries.reduce((s, e) => s + e.price * e.quantity, 0) / entryQty;
  const exitAvg = exits.reduce((s, e) => s + e.price * e.quantity, 0) / exitQty;
  const usedQty = Math.min(entryQty, exitQty);

  let pnl: number;
  const exitPnlSum = exits.reduce((s, e) => s + e.closedPnl, 0);
  if (Math.abs(exitPnlSum) > 0.01) {
    pnl = exitPnlSum;
  } else {
    pnl = direction === 'long' ? (exitAvg - entryAvg) * usedQty : (entryAvg - exitAvg) * usedQty;
  }

  const pnlPercent = direction === 'long'
    ? ((exitAvg - entryAvg) / entryAvg) * 100
    : ((entryAvg - exitAvg) / entryAvg) * 100;

  return {
    symbol, entries: [...entries], exits: [...exits],
    pnl, pnlPercent,
    holdingTime: exits[exits.length - 1].timestamp - entries[0].timestamp,
    entryAvg, exitAvg, entryQty: usedQty, direction,
  };
}

function buildStatsPrompt(stats: any, groups: TradeGroup[], deep?: any): string {
  const lines = [
    `TRADING PERFORMANCE SUMMARY:`,
    `Total round-trip trades: ${stats.totalTrades} (from ${stats.totalRawTrades} raw executions)`,
    `Win rate: ${stats.winRate}% (${stats.winners}W / ${stats.losers}L)`,
    `Total P&L: $${stats.totalPnl} (Fees: $${stats.totalFees})`,
    `Average win: +${stats.avgWin}% | Average loss: ${stats.avgLoss}%`,
    `Risk/Reward: ${stats.riskReward}`,
    `Average holding time: ${stats.avgHoldingTime}`,
    `Symbols traded: ${stats.uniqueSymbols}`,
    ``, `TOP SYMBOLS:`,
    ...stats.symbolStats.slice(0, 12).map((s: any) => `  ${s.symbol}: ${s.trades} trades, $${s.pnl.toFixed(2)} P&L, ${s.winRate}% WR`),
  ];
  if (stats.biggestWin) lines.push(`\nBiggest win: ${stats.biggestWin.symbol} +${stats.biggestWin.pct}% ($${stats.biggestWin.pnl})`);
  if (stats.biggestLoss) lines.push(`Biggest loss: ${stats.biggestLoss.symbol} ${stats.biggestLoss.pct}% ($${stats.biggestLoss.pnl})`);

  if (deep) {
    lines.push('', 'HOLDING TIME ANALYSIS:');
    Object.entries(deep.holdingTimeBuckets).forEach(([k, v]: [string, any]) => {
      if (v.trades > 0) lines.push(`  ${k}: ${v.trades} trades, $${v.pnl} P&L, ${v.winRate}% WR`);
    });
    lines.push('', 'SESSION PERFORMANCE:');
    Object.entries(deep.sessionPerformance).forEach(([k, v]: [string, any]) => {
      if (v.trades > 0) lines.push(`  ${k}: ${v.trades} trades, $${v.pnl} P&L, ${v.winRate}% WR`);
    });
    lines.push('', 'LONG vs SHORT:');
    lines.push(`  Long: ${deep.directionPerformance.long.trades} trades, $${deep.directionPerformance.long.pnl} P&L, ${deep.directionPerformance.long.winRate}% WR`);
    lines.push(`  Short: ${deep.directionPerformance.short.trades} trades, $${deep.directionPerformance.short.pnl} P&L, ${deep.directionPerformance.short.winRate}% WR`);
    lines.push('', 'STREAKS & TILT:');
    lines.push(`  Max win streak: ${deep.streaks.maxWinStreak} | Max loss streak: ${deep.streaks.maxLossStreak}`);
    lines.push(`  After 3+ loss streak: ${deep.tilt.tradesAfterLossStreak} trades, $${deep.tilt.pnl} P&L, ${deep.tilt.winRate}% WR`);
  }

  lines.push('', 'RECENT TRADES (last 15):');
  groups.slice(-15).forEach((g: TradeGroup) => {
    lines.push(`  ${g.symbol} ${g.direction.toUpperCase()}: ${g.pnl >= 0 ? '+' : ''}${g.pnlPercent.toFixed(2)}% ($${g.pnl.toFixed(2)}) | Held ${formatDuration(g.holdingTime)}`);
  });

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '< 1m';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}
