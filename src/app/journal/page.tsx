'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface Trade {
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  timestamp: number;
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
  entryQty: number;
  direction: string;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '< 1m';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

function fmtPrice(v: number): string {
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(6);
}

// ═══════════════════════════════════════════════
// CLIENT-SIDE CANDLE FETCHING
// Fetches directly from exchange APIs in the browser,
// bypassing Railway IP blocks from Binance/Bybit/HL
// ═══════════════════════════════════════════════

const CANDLE_INTERVALS: Record<string, { binance: string; bybit: string; hl: string; ms: number }> = {
  '15m': { binance: '15m', bybit: '15', hl: '15m', ms: 900000 },
  '1h':  { binance: '1h',  bybit: '60', hl: '1h',  ms: 3600000 },
  '4h':  { binance: '4h',  bybit: '240', hl: '4h', ms: 14400000 },
  '1d':  { binance: '1d',  bybit: 'D',  hl: '1d',  ms: 86400000 },
};

function cleanCandleSymbol(raw: string): string {
  let s = raw.toUpperCase().trim();
  s = s.replace(/\/USD[CT]$/i, '');      // VAPOR/USDC -> VAPOR
  s = s.replace(/\s*\(.*\)$/, '');       // COPPER (xyz) -> COPPER
  s = s.replace(/^K(?=[A-Z]{3,})/, '');  // kPEPE -> PEPE
  return s;
}

async function fetchBinanceDirect(sym: string, startMs: number, endMs: number, ivl: string): Promise<Candle[] | null> {
  try {
    const binanceIvl = CANDLE_INTERVALS[ivl]?.binance || '1h';
    const all: Candle[] = [];
    let cursor = startMs;
    let attempts = 0;
    while (cursor < endMs && attempts < 10) {
      attempts++;
      const url = `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${binanceIvl}&startTime=${cursor}&endTime=${endMs}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      for (const k of data) {
        all.push({ time: Math.floor(k[0] / 1000), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) });
      }
      const lastTs = data[data.length - 1][0];
      if (lastTs <= cursor) break;
      cursor = lastTs + 1;
      if (data.length < 1000) break;
    }
    return all.length > 0 ? all : null;
  } catch { return null; }
}

async function fetchBybitDirect(sym: string, startMs: number, endMs: number, ivl: string, category: string): Promise<Candle[] | null> {
  try {
    const bybitIvl = CANDLE_INTERVALS[ivl]?.bybit || '60';
    const all: Candle[] = [];
    let curEnd = endMs;
    let attempts = 0;
    while (curEnd > startMs && attempts < 10) {
      attempts++;
      const url = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${sym}USDT&interval=${bybitIvl}&start=${startMs}&end=${curEnd}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const list = data?.result?.list;
      if (!list || list.length === 0) break;
      const oldestTs = parseInt(list[list.length - 1][0]);
      for (let i = list.length - 1; i >= 0; i--) {
        const k = list[i];
        all.push({ time: Math.floor(parseInt(k[0]) / 1000), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) });
      }
      if (oldestTs >= curEnd) break;
      curEnd = oldestTs - 1;
      if (list.length < 1000) break;
    }
    return all.length > 0 ? all : null;
  } catch { return null; }
}

async function fetchHyperliquidDirect(sym: string, startMs: number, endMs: number, ivl: string): Promise<Candle[] | null> {
  try {
    const hlIvl = CANDLE_INTERVALS[ivl]?.hl || '1h';
    const ivlMs = CANDLE_INTERVALS[ivl]?.ms || 3600000;
    const all: Candle[] = [];
    let cursor = startMs;
    const chunkSize = 500 * ivlMs;
    let attempts = 0;
    while (cursor < endMs && attempts < 10) {
      attempts++;
      const chunkEnd = Math.min(cursor + chunkSize, endMs);
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'candleSnapshot', req: { coin: sym, interval: hlIvl, startTime: cursor, endTime: chunkEnd } }),
      });
      if (!res.ok) break;
      const data = await res.json();
      if (!data || !Array.isArray(data) || data.length === 0) { cursor = chunkEnd; continue; }
      for (const k of data) {
        all.push({ time: Math.floor(k.t / 1000), open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v) });
      }
      cursor = chunkEnd;
    }
    return all.length > 0 ? all : null;
  } catch { return null; }
}

async function fetchCandlesClientSide(rawSymbol: string, start: number, end: number, ivl: string, ctxMs: number): Promise<{ candles: Candle[]; source: string }> {
  const sym = cleanCandleSymbol(rawSymbol);
  const ivlMs = CANDLE_INTERVALS[ivl]?.ms || 3600000;
  const beforePad = ctxMs > 0 ? ctxMs : ivlMs * 200;
  const afterPad = ivlMs * 30;
  const paddedStart = start - beforePad;
  const paddedEnd = end + afterPad;

  let data: Candle[] | null = null;
  let source = '';

  // 1. Binance
  data = await fetchBinanceDirect(sym, paddedStart, paddedEnd, ivl);
  if (data) source = 'Binance';

  // 2. Bybit spot
  if (!data) { data = await fetchBybitDirect(sym, paddedStart, paddedEnd, ivl, 'spot'); if (data) source = 'Bybit'; }

  // 3. Bybit perps
  if (!data) { data = await fetchBybitDirect(sym, paddedStart, paddedEnd, ivl, 'linear'); if (data) source = 'Bybit'; }

  // 4. Hyperliquid perps
  if (!data) { data = await fetchHyperliquidDirect(sym, paddedStart, paddedEnd, ivl); if (data) source = 'Hyperliquid'; }

  // 5. Hyperliquid spot (@N suffixes)
  if (!data && rawSymbol.includes('/')) {
    for (const suffix of ['@1', '@2', '@3']) {
      data = await fetchHyperliquidDirect(sym + suffix, paddedStart, paddedEnd, ivl);
      if (data) { source = `HL spot (${sym}${suffix})`; break; }
    }
  }

  if (!data || data.length === 0) {
    throw new Error(`No candle data for ${sym}. Tried Binance, Bybit, Hyperliquid.`);
  }

  // Deduplicate and sort
  const seen = new Set<number>();
  const unique = data.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; }).sort((a, b) => a.time - b.time);
  return { candles: unique, source };
}

// ═══════════════════════════════════════════════
// CHART MODAL
// ═══════════════════════════════════════════════

const TIMEFRAMES = [
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

const CONTEXT_OPTIONS = [
  { label: '1D', ms: 86400000 },
  { label: '3D', ms: 259200000 },
  { label: '1W', ms: 604800000 },
  { label: '1M', ms: 2592000000 },
  { label: '3M', ms: 7776000000 },
  { label: 'MAX', ms: 31536000000 },
];

function TradeChart({ group, onClose }: { group: TradeGroup; onClose: () => void }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [interval, setInterval] = useState('1h');
  const [contextMs, setContextMs] = useState(2592000000); // default 1 month
  const [candleCount, setCandleCount] = useState(0);

  // Fetch candles client-side (directly from exchanges)
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      const allTimes = [...group.entries, ...group.exits].map(t => t.timestamp);
      const start = Math.min(...allTimes);
      const end = Math.max(...allTimes);

      try {
        const result = await fetchCandlesClientSide(group.symbol, start, end, interval, contextMs);
        if (cancelled) return;
        setCandles(result.candles);
        setCandleCount(result.candles.length);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [group, interval, contextMs]);

  // Render chart
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    let chart: any;

    const init = async () => {
      const lc = await import('lightweight-charts');
      chartRef.current!.innerHTML = '';

      chart = lc.createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth,
        height: 480,
        layout: { background: { type: lc.ColorType.Solid, color: '#0d1117' }, textColor: '#8b9099' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: { mode: lc.CrosshairMode.Normal },
        timeScale: { timeVisible: interval !== '1d', secondsVisible: false, borderColor: 'rgba(255,255,255,0.06)' },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
      });

      const series = chart.addCandlestickSeries({
        upColor: '#00c878', downColor: '#ff4d4d',
        borderUpColor: '#00c878', borderDownColor: '#ff4d4d',
        wickUpColor: '#00c878', wickDownColor: '#ff4d4d',
      });
      series.setData(candles);

      // Volume series
      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeries.setData(candles.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0,200,120,0.15)' : 'rgba(255,77,77,0.15)',
      })));

      // Find nearest candle time for markers
      const findNearestTime = (ts: number) => {
        const targetSec = Math.floor(ts / 1000);
        let best = candles[0].time;
        let bestDiff = Math.abs(targetSec - best);
        for (const c of candles) {
          const diff = Math.abs(targetSec - c.time);
          if (diff < bestDiff) { best = c.time; bestDiff = diff; }
        }
        return best;
      };

      const markers: any[] = [];
      for (const t of group.entries) {
        markers.push({
          time: findNearestTime(t.timestamp),
          position: 'belowBar', color: '#00c878', shape: 'arrowUp',
          text: `BUY ${fmtPrice(t.price)}`,
        });
      }
      for (const t of group.exits) {
        markers.push({
          time: findNearestTime(t.timestamp),
          position: 'aboveBar', color: '#ff4d4d', shape: 'arrowDown',
          text: `SELL ${fmtPrice(t.price)}`,
        });
      }
      markers.sort((a, b) => a.time - b.time);
      if (markers.length > 0) series.setMarkers(markers);

      // Price lines for avg entry/exit
      series.createPriceLine({
        price: group.entryAvg, color: 'rgba(0,200,120,0.5)', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: `Entry ${fmtPrice(group.entryAvg)}`,
      });
      series.createPriceLine({
        price: group.exitAvg, color: 'rgba(255,77,77,0.5)', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: `Exit ${fmtPrice(group.exitAvg)}`,
      });

      chart.timeScale().fitContent();

      // Handle resize
      const handleResize = () => {
        if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    };

    init();
    return () => { if (chart) chart.remove(); };
  }, [candles, group, interval]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const btnStyle = (active: boolean) => ({
    padding: '0.25rem 0.55rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700 as const,
    cursor: 'pointer' as const, border: 'none',
    background: active ? 'rgba(79,140,255,0.2)' : 'rgba(255,255,255,0.04)',
    color: active ? '#4f8cff' : '#8b9099',
    transition: 'all 0.15s',
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, width: '100%', maxWidth: 1100, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1.1rem', color: '#f0f2f5' }}>{group.symbol}</span>
            <span style={{ fontSize: '0.65rem', color: '#8b9099', textTransform: 'uppercase' }}>{group.direction}</span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 4,
              background: group.pnl >= 0 ? 'rgba(0,200,120,0.12)' : 'rgba(255,77,77,0.12)',
              color: group.pnl >= 0 ? '#00c878' : '#ff4d4d',
            }}>
              {group.pnl >= 0 ? '+' : ''}{group.pnlPercent.toFixed(2)}% (${group.pnl >= 0 ? '+' : ''}${group.pnl.toFixed(2)})
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b9099', cursor: 'pointer', fontSize: '1.2rem', padding: '0.25rem' }}>✕</button>
        </div>

        {/* Toolbar: Timeframe + Context */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.6rem', color: '#545b66', fontWeight: 600, marginRight: '0.25rem' }}>INTERVAL</span>
            {TIMEFRAMES.map(tf => (
              <button key={tf.value} onClick={() => setInterval(tf.value)} style={btnStyle(interval === tf.value)}>
                {tf.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.6rem', color: '#545b66', fontWeight: 600, marginRight: '0.25rem' }}>CONTEXT</span>
            {CONTEXT_OPTIONS.map(ctx => (
              <button key={ctx.label} onClick={() => setContextMs(ctx.ms)} style={btnStyle(contextMs === ctx.ms)}>
                {ctx.label}
              </button>
            ))}
          </div>
          {!loading && <span style={{ fontSize: '0.6rem', color: '#545b66' }}>{candleCount} candles</span>}
        </div>

        {/* Chart */}
        <div style={{ padding: '0.5rem', position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,17,23,0.8)', zIndex: 2 }}>
              <span style={{ color: '#545b66', fontSize: '0.8rem' }}>Loading {interval} chart...</span>
            </div>
          )}
          {error && !loading && <div style={{ height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4d', fontSize: '0.8rem' }}>⚠️ {error}</div>}
          <div ref={chartRef} style={{ minHeight: 480 }} />
        </div>

        {/* Trade details */}
        <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '1.5rem', fontSize: '0.68rem', color: '#8b9099', flexWrap: 'wrap' }}>
          <span>Entry: <b style={{ color: '#00c878' }}>{fmtPrice(group.entryAvg)}</b></span>
          <span>Exit: <b style={{ color: '#ff4d4d' }}>{fmtPrice(group.exitAvg)}</b></span>
          <span>Size: <b style={{ color: '#f0f2f5' }}>{group.entryQty?.toFixed(2)}</b></span>
          <span>Held: <b style={{ color: '#f0f2f5' }}>{formatDuration(group.holdingTime)}</b></span>
          <span>Entries: {group.entries.length} · Exits: {group.exits.length}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════

export default function TradeJournal() {
  const [groups, setGroups] = useState<TradeGroup[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [analysis, setAnalysis] = useState('');
  const [coachData, setCoachData] = useState<any>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [deepAnalytics, setDeepAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<TradeGroup | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [sortField, setSortField] = useState('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterSymbol, setFilterSymbol] = useState('all');
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss'>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (text: string) => {
    setLoading(true);
    setCoachLoading(true);
    setError('');
    setCoachData(null);
    setAnalysis('');
    try {
      const res = await fetch('/api/trade-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGroups(data.groups || []);
      setStats(data.stats || null);
      setAnalysis(data.analysis || '');
      setCoachData(data.coachData || null);
      setDeepAnalytics(data.deepAnalytics || null);
      setHasData(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setCoachLoading(false);
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => processFile(e.target?.result as string);
    reader.readAsText(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSample = () => {
    const sampleCSV = `time\tcoin\tDirection\tPrice\tSize\tTrade Volume\tFee\tclosedPnl
11/30/2024 - 11:02:49\tHYPE/USDC\tBuy\t6.7272\t70.08\t471.44\t0.024\t-0.165
11/30/2024 - 12:47:22\tHYPE/USDC\tSell\t6.415\t70.05\t449.38\t0.157\t-22.177
11/30/2024 - 12:52:36\tHYPE/USDC\tBuy\t6.599\t68.1\t449.45\t0.023\t-0.157
11/30/2024 - 12:56:17\tHYPE/USDC\tBuy\t6.708\t14.31\t95.99\t0.005\t-0.033
11/30/2024 - 16:31:39\tHYPE/USDC\tSell\t7.332\t82.38\t604.02\t0.211\t58.378
11/30/2024 - 16:34:12\tHYPE/USDC\tBuy\t7.315\t82.54\t603.80\t0.028\t-0.211
11/30/2024 - 17:59:18\tHYPE/USDC\tSell\t7.271\t82.51\t599.96\t0.209\t-4.043
11/30/2024 - 18:01:17\tHYPE/USDC\tBuy\t7.404\t81\t599.72\t0.028\t-0.209
11/30/2024 - 21:47:37\tHYPE/USDC\tSell\t8.886\t60.73\t539.64\t0.188\t89.656
11/30/2024 - 22:08:20\tHYPE/USDC\tSell\t8.693\t10.12\t87.97\t0.030\t12.993
12/1/2024 - 12:19:57\tJEFF/USDC\tBuy\t28.429\t24\t682.29\t0.008\t-0.238
12/1/2024 - 12:39:56\tJEFF/USDC\tSell\t30.194\t23\t694.46\t0.243\t40.123
12/1/2024 - 15:24:53\tJEFF/USDC\tBuy\t35.795\t10\t357.95\t0.003\t-0.124
12/1/2024 - 15:25:01\tJEFF/USDC\tBuy\t35.75\t15\t536.25\t0.005\t-0.187
12/1/2024 - 15:31:18\tJEFF/USDC\tSell\t33.312\t25\t832.80\t0.291\t-54.999
12/1/2024 - 15:40:50\tPOINTS/USDC\tBuy\t0.040059\t1000\t40.05\t0.349\t-0.014
12/1/2024 - 15:52:34\tPOINTS/USDC\tSell\t0.035769\t999\t35.73\t0.012\t-4.312`;
    processFile(sampleCSV);
  };

  // Filter & sort
  const symbols = [...new Set(groups.map(g => g.symbol))];
  let filtered = groups;
  if (filterSymbol !== 'all') filtered = filtered.filter(g => g.symbol === filterSymbol);
  if (filterResult === 'win') filtered = filtered.filter(g => g.pnl > 0);
  if (filterResult === 'loss') filtered = filtered.filter(g => g.pnl <= 0);

  filtered = [...filtered].sort((a, b) => {
    let vA: number, vB: number;
    switch (sortField) {
      case 'pnl': vA = a.pnl; vB = b.pnl; break;
      case 'pnlPercent': vA = a.pnlPercent; vB = b.pnlPercent; break;
      case 'holdingTime': vA = a.holdingTime; vB = b.holdingTime; break;
      case 'entryTime': vA = a.entries[0]?.timestamp || 0; vB = b.entries[0]?.timestamp || 0; break;
      case 'exitTime': vA = a.exits[a.exits.length - 1]?.timestamp || 0; vB = b.exits[b.exits.length - 1]?.timestamp || 0; break;
      default: vA = a.entries[0]?.timestamp || 0; vB = b.entries[0]?.timestamp || 0;
    }
    return sortDir === 'asc' ? vA - vB : vB - vA;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: string }) => (
    <span style={{ opacity: sortField === field ? 1 : 0.25, color: sortField === field ? '#4f8cff' : 'inherit', marginLeft: 4, fontSize: '0.6rem' }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const reset = () => {
    setGroups([]); setStats(null); setAnalysis(''); setCoachData(null); setCoachLoading(false); setDeepAnalytics(null); setHasData(false); setError('');
    setFilterSymbol('all'); setFilterResult('all');
  };

  // Coach visual helpers
  const gradeColor = (g: string) => {
    if (!g) return '#8b9099';
    const letter = g.charAt(0).toUpperCase();
    if (letter === 'A') return '#00c878';
    if (letter === 'B') return '#4f8cff';
    if (letter === 'C') return '#f5a623';
    if (letter === 'D') return '#ff8c42';
    return '#ff4d4d';
  };

  const gradePercent = (g: string) => {
    if (!g) return 0;
    const map: Record<string, number> = { 'A+': 98, 'A': 93, 'A-': 90, 'B+': 87, 'B': 83, 'B-': 80, 'C+': 77, 'C': 73, 'C-': 70, 'D+': 67, 'D': 63, 'D-': 60, 'F': 30 };
    return map[g.toUpperCase()] || 50;
  };

  const scoreColor = (v: number) => {
    if (v >= 75) return '#00c878';
    if (v >= 50) return '#f5a623';
    if (v >= 30) return '#ff8c42';
    return '#ff4d4d';
  };

  const coachIcon = (icon: string) => {
    const icons: Record<string, string> = {
      trophy: '🏆', target: '🎯', shield: '🛡️', trending: '📈', zap: '⚡',
      alert: '🚨', clock: '⏱️', skull: '💀', flame: '🔥', ban: '🚫',
    };
    return icons[icon] || '•';
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/patterns">Pattern Scanner</Link>
            <Link href="/formula/new">Formula Builder</Link>
            <Link href="/journal" className="active">Trade Journal</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell" style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>📒 Trade Journal</h1>
            <span style={{ fontSize: '0.55rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>BETA</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#545b66' }}>
            {hasData ? `${groups.length} round-trip trades from ${stats?.totalRawTrades || 0} executions · ${stats?.uniqueSymbols || 0} symbols` : 'Upload your trade history CSV · View entries & exits on charts · AI analyzes your performance'}
          </p>
        </div>

        {/* Upload Area */}
        {!hasData && !loading && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#4f8cff' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 12, padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'rgba(79,140,255,0.05)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s', marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📁</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f2f5', marginBottom: '0.35rem' }}>Drop your trade history CSV here</div>
              <div style={{ fontSize: '0.7rem', color: '#545b66', marginBottom: '1rem' }}>Supports Hyperliquid, Binance, Bybit, OKX, or any CSV with symbol + side + price</div>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                {['Hyperliquid', 'Binance', 'Bybit', 'OKX', 'Custom CSV'].map(ex => (
                  <span key={ex} style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b9099' }}>{ex}</span>
                ))}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <button onClick={handleSample} style={{
                background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)',
                color: '#4f8cff', padding: '0.4rem 1rem', borderRadius: 6, fontSize: '0.72rem',
                cursor: 'pointer', fontWeight: 600,
              }}>Try with sample Hyperliquid trades →</button>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#f0f2f5', marginBottom: '0.75rem' }}>📋 How to export your trade history</div>
              <div style={{ fontSize: '0.7rem', color: '#8b9099', lineHeight: 1.8 }}>
                <div style={{ marginBottom: '0.6rem', padding: '0.5rem 0.6rem', borderRadius: 6, background: 'rgba(79,140,255,0.04)', border: '1px solid rgba(79,140,255,0.08)' }}>
                  <b style={{ color: '#4f8cff', fontSize: '0.68rem' }}>⚡ Auto-detected</b>
                  <span style={{ color: '#8b9099', fontSize: '0.65rem', marginLeft: '0.4rem' }}>— Just upload the CSV as-is. No renaming columns or converting to xlsx needed.</span>
                </div>
                <p style={{ marginBottom: '0.5rem' }}>
                  <b style={{ color: '#f5a623' }}>Hyperliquid:</b> Portfolio → Trade History → Export CSV
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>Exports as TSV with columns: time, coin, Direction, Price, Size, Trade Volume, Fee, closedPnl</span>
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <b style={{ color: '#f5a623' }}>Binance (Spot):</b> Orders → Spot Order → Trade History → Export
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>CSV with columns: Date(UTC), Pair, Side, Price, Executed, Amount, Fee. Max 3 months per export.</span>
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <b style={{ color: '#f5a623' }}>Binance (Futures):</b> Orders → Futures Order → Trade History → Export
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>CSV with: Date(UTC), Symbol, Side, Price, Quantity, Commission, Realized Profit</span>
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <b style={{ color: '#f5a623' }}>Bybit (Spot):</b> Orders → Spot Order → Trade History → Export
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>CSV with: Symbol, Side, Price, Qty, Fee, Fee Currency, Time(UTC)</span>
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <b style={{ color: '#f5a623' }}>Bybit (Derivatives):</b> Orders → Derivatives Order → Trade History → Export
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>Both TradeHistory and Closed P&L formats supported. Export &quot;Trade History&quot; not &quot;Order History&quot;.</span>
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <b style={{ color: '#f5a623' }}>OKX:</b> Assets → Order History → Trade History → Export
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>CSV with: Instrument ID, Order time, Side, Filled Price, Filled Qty, Fee. Max 3 months per export.</span>
                </p>
                <p>
                  <b style={{ color: '#f5a623' }}>Custom CSV:</b> Any CSV/TSV with at least: <code style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>symbol</code> + <code style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>side</code> + <code style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>price</code>
                  <br /><span style={{ color: '#545b66', fontSize: '0.63rem' }}>Optional: quantity/size, time/date, fee, closedPnl/realized profit. Column names are flexible.</span>
                </p>
              </div>
            </div>
          </>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#545b66' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
            <div style={{ fontSize: '0.82rem' }}>Analyzing your trades...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#ff4d4d' }}>⚠️ {error}</span>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Round Trips', value: stats.totalTrades, color: '#f0f2f5' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: parseFloat(stats.winRate) >= 50 ? '#00c878' : '#ff4d4d' },
              { label: 'Total P&L', value: `$${Number(stats.totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: stats.totalPnl >= 0 ? '#00c878' : '#ff4d4d' },
              { label: 'Avg Win', value: `+${stats.avgWin}%`, color: '#00c878' },
              { label: 'Avg Loss', value: `${stats.avgLoss}%`, color: '#ff4d4d' },
              { label: 'R:R Ratio', value: stats.riskReward || 'N/A', color: '#4f8cff' },
              { label: 'Avg Hold', value: stats.avgHoldingTime, color: '#8b9099' },
              { label: 'Total Fees', value: `$${Number(stats.totalFees).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#f5a623' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, padding: '0.6rem 0.5rem', textAlign: 'center', overflow: 'hidden',
              }}>
                <div style={{ fontSize: '0.55rem', color: '#8b9099', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>{s.label}</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* AI Coach Visual Dashboard */}
        {(coachData || analysis || coachLoading) && (
          <div style={{ marginBottom: '1.25rem' }}>
            {coachLoading && !coachData && !analysis ? (
              <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>🤖</div>
                <div style={{ fontSize: '0.72rem', color: '#8b9099' }}>AI Coach analyzing your trades...</div>
              </div>
            ) : coachData ? (
              <>
                {/* Grade + Scores Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {/* Grade Circle */}
                  <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 120 }}>
                    <div style={{ fontSize: '0.58rem', color: '#8b9099', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>AI Coach Grade</div>
                    <div style={{
                      width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `conic-gradient(${gradeColor(coachData.grade)} ${gradePercent(coachData.grade)}%, rgba(255,255,255,0.06) 0%)`,
                      position: 'relative',
                    }}>
                      <div style={{
                        width: 58, height: 58, borderRadius: '50%', background: '#1a1d23', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column',
                      }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: gradeColor(coachData.grade), lineHeight: 1 }}>{coachData.grade}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#c9cdd3', marginTop: '0.4rem', textAlign: 'center', maxWidth: 110 }}>{coachData.gradeLabel}</div>
                  </div>

                  {/* Score Bars */}
                  <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.55rem' }}>
                    {coachData.scores && Object.entries(coachData.scores).map(([key, score]: [string, any]) => (
                      <div key={key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.2rem' }}>
                          <span style={{ fontSize: '0.65rem', color: '#c9cdd3', fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.58rem', color: '#8b9099' }}>{score.label}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: scoreColor(score.value), fontFamily: 'JetBrains Mono, monospace' }}>{score.value}</span>
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3, width: `${score.value}%`,
                            background: `linear-gradient(90deg, ${scoreColor(score.value)}88, ${scoreColor(score.value)})`,
                            transition: 'width 0.8s ease',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths + Mistakes Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {/* Strengths */}
                  <div className="card" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.62rem', color: '#00c878', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>✦ Strengths</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {coachData.strengths?.map((s: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.35rem 0.5rem', borderRadius: 6, background: 'rgba(0,200,120,0.04)', border: '1px solid rgba(0,200,120,0.08)' }}>
                          <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{coachIcon(s.icon)}</span>
                          <div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f0f2f5' }}>{s.title}</div>
                            <div style={{ fontSize: '0.6rem', color: '#8b9099' }}>{s.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mistakes */}
                  <div className="card" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.62rem', color: '#ff4d4d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>⚑ Mistakes</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {coachData.mistakes?.map((m: any, i: number) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.35rem 0.5rem', borderRadius: 6,
                          background: m.severity === 'high' ? 'rgba(255,77,77,0.06)' : 'rgba(255,165,0,0.04)',
                          border: `1px solid ${m.severity === 'high' ? 'rgba(255,77,77,0.12)' : 'rgba(255,165,0,0.08)'}`,
                        }}>
                          <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{coachIcon(m.icon)}</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f0f2f5' }}>{m.title}</span>
                              {m.severity === 'high' && <span style={{ fontSize: '0.5rem', padding: '0.08rem 0.3rem', borderRadius: 3, background: 'rgba(255,77,77,0.15)', color: '#ff4d4d', fontWeight: 700 }}>HIGH</span>}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: '#8b9099' }}>{m.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Plan + Pattern */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {/* Action Plan */}
                  <div className="card" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.62rem', color: '#4f8cff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>◆ Action Plan</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {coachData.actions?.map((a: string, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: '50%', background: 'rgba(79,140,255,0.12)', flexShrink: 0,
                            fontSize: '0.55rem', fontWeight: 800, color: '#4f8cff',
                          }}>{i + 1}</span>
                          <span style={{ fontSize: '0.66rem', color: '#c9cdd3', lineHeight: 1.4 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pattern */}
                  <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '0.62rem', color: '#f5a623', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>◉ Key Pattern</div>
                    <div style={{ fontSize: '0.72rem', color: '#e8eaed', lineHeight: 1.55, flex: 1, display: 'flex', alignItems: 'center' }}>
                      {coachData.pattern}
                    </div>
                  </div>
                </div>
              </>
            ) : analysis ? (
              /* Fallback: raw text display */
              <div className="card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1rem' }}>🤖</span>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f0f2f5' }}>AI Trading Coach</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#c9cdd3', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{analysis}</div>
              </div>
            ) : null}
          </div>
        )}

        {/* Deep Analytics */}
        {deepAnalytics && hasData && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>

            {/* Holding Time Buckets */}
            <div className="card" style={{ padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#4f8cff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>⏱ Hold Time vs Performance</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {Object.entries(deepAnalytics.holdingTimeBuckets).map(([label, d]: [string, any]) => d.trades > 0 && (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', marginBottom: '0.15rem' }}>
                      <span style={{ color: '#c9cdd3', fontWeight: 600 }}>{label}</span>
                      <span style={{ color: '#8b9099' }}>{d.trades} trades · <span style={{ color: d.pnl >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 600 }}>${d.pnl.toLocaleString()}</span> · {d.winRate}% WR</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(parseFloat(d.winRate), 100)}%`, background: parseFloat(d.winRate) >= 50 ? '#00c878' : '#ff4d4d' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Session Performance */}
            <div className="card" style={{ padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#f5a623', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>🌍 Session Performance</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {Object.entries(deepAnalytics.sessionPerformance).map(([label, d]: [string, any]) => d.trades > 0 && (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', marginBottom: '0.15rem' }}>
                      <span style={{ color: '#c9cdd3', fontWeight: 600 }}>{label}</span>
                      <span style={{ color: '#8b9099' }}>{d.trades} trades · <span style={{ color: d.pnl >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 600 }}>${d.pnl.toLocaleString()}</span> · {d.winRate}% WR</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(parseFloat(d.winRate), 100)}%`, background: parseFloat(d.winRate) >= 50 ? '#00c878' : '#ff4d4d' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Day of Week */}
            <div className="card" style={{ padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#00c878', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>📅 Day of Week</div>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'flex-end', height: 70 }}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                  const d = deepAnalytics.dayPerformance[day];
                  if (!d) return <div key={day} style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.52rem', color: '#545b66' }}>{day}</div></div>;
                  const maxTrades = Math.max(...Object.values(deepAnalytics.dayPerformance).map((v: any) => v?.trades || 0));
                  const h = maxTrades > 0 ? (d.trades / maxTrades) * 50 : 0;
                  return (
                    <div key={day} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: '0.52rem', color: d.pnl >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 700, marginBottom: 2 }}>${Math.abs(d.pnl) >= 1000 ? (d.pnl/1000).toFixed(1)+'k' : d.pnl}</div>
                      <div style={{ width: '80%', height: h, borderRadius: 2, background: d.pnl >= 0 ? 'rgba(0,200,120,0.4)' : 'rgba(255,77,77,0.4)', marginBottom: 2 }} />
                      <div style={{ fontSize: '0.52rem', color: '#8b9099' }}>{day}</div>
                      <div style={{ fontSize: '0.48rem', color: '#545b66' }}>{d.trades}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Long vs Short + Streaks + Tilt */}
            <div className="card" style={{ padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#ff4d4d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>📊 Direction & Streaks</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {/* Long vs Short */}
                {deepAnalytics.directionPerformance && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['long', 'short'].map(dir => {
                      const d = deepAnalytics.directionPerformance[dir];
                      if (!d || d.trades === 0) return null;
                      return (
                        <div key={dir} style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: dir === 'long' ? '#00c878' : '#ff4d4d', textTransform: 'uppercase', marginBottom: 2 }}>{dir === 'long' ? '↑ Long' : '↓ Short'}</div>
                          <div style={{ fontSize: '0.58rem', color: '#8b9099' }}>{d.trades} trades · {d.winRate}% WR · <span style={{ color: d.pnl >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 600 }}>${d.pnl.toLocaleString()}</span></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Streaks */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: 6, background: 'rgba(0,200,120,0.04)', border: '1px solid rgba(0,200,120,0.08)' }}>
                    <div style={{ fontSize: '0.55rem', color: '#8b9099' }}>Best streak</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#00c878' }}>{deepAnalytics.streaks.maxWinStreak}W</div>
                  </div>
                  <div style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: 6, background: 'rgba(255,77,77,0.04)', border: '1px solid rgba(255,77,77,0.08)' }}>
                    <div style={{ fontSize: '0.55rem', color: '#8b9099' }}>Worst streak</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ff4d4d' }}>{deepAnalytics.streaks.maxLossStreak}L</div>
                  </div>
                  <div style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: 6, background: deepAnalytics.tilt.pnl >= 0 ? 'rgba(0,200,120,0.04)' : 'rgba(255,77,77,0.04)', border: `1px solid ${deepAnalytics.tilt.pnl >= 0 ? 'rgba(0,200,120,0.08)' : 'rgba(255,77,77,0.08)'}` }}>
                    <div style={{ fontSize: '0.55rem', color: '#8b9099' }}>Tilt trades</div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: deepAnalytics.tilt.pnl >= 0 ? '#00c878' : '#ff4d4d' }}>{deepAnalytics.tilt.tradesAfterLossStreak} trades</div>
                    <div style={{ fontSize: '0.52rem', color: '#8b9099' }}>${deepAnalytics.tilt.pnl} · {deepAnalytics.tilt.winRate}% WR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly P&L */}
            {deepAnalytics.monthlyCurve && deepAnalytics.monthlyCurve.length > 1 && (
              <div className="card" style={{ padding: '0.75rem 1rem', gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.62rem', color: '#4f8cff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>📈 Monthly P&L</div>
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'flex-end', height: 80 }}>
                  {deepAnalytics.monthlyCurve.map((m: any) => {
                    const maxAbs = Math.max(...deepAnalytics.monthlyCurve.map((v: any) => Math.abs(v.pnl)));
                    const h = maxAbs > 0 ? (Math.abs(m.pnl) / maxAbs) * 60 : 0;
                    return (
                      <div key={m.month} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: '0.5rem', color: m.pnl >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 700, marginBottom: 2 }}>${Math.abs(m.pnl) >= 1000 ? (m.pnl/1000).toFixed(1)+'k' : m.pnl}</div>
                        <div style={{ width: '70%', height: Math.max(h, 3), borderRadius: 2, background: m.pnl >= 0 ? 'rgba(0,200,120,0.5)' : 'rgba(255,77,77,0.5)', marginBottom: 2 }} />
                        <div style={{ fontSize: '0.48rem', color: '#8b9099' }}>{m.month.substring(2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        {hasData && groups.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#545b66', fontWeight: 600, textTransform: 'uppercase' }}>Symbol:</span>
            <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)}
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f2f5', cursor: 'pointer' }}>
              <option value="all">All ({groups.length})</option>
              {symbols.map(s => <option key={s} value={s}>{s} ({groups.filter(g => g.symbol === s).length})</option>)}
            </select>

            <span style={{ fontSize: '0.65rem', color: '#545b66', fontWeight: 600, textTransform: 'uppercase', marginLeft: '0.5rem' }}>Result:</span>
            {(['all', 'win', 'loss'] as const).map(f => (
              <button key={f} onClick={() => setFilterResult(f)}
                style={{
                  padding: '0.3rem 0.65rem', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                  background: filterResult === f ? (f === 'win' ? 'rgba(0,200,120,0.15)' : f === 'loss' ? 'rgba(255,77,77,0.15)' : 'rgba(79,140,255,0.15)') : 'rgba(255,255,255,0.04)',
                  color: filterResult === f ? (f === 'win' ? '#00c878' : f === 'loss' ? '#ff4d4d' : '#4f8cff') : '#8b9099',
                  border: `1px solid ${filterResult === f ? 'rgba(79,140,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer', textTransform: 'capitalize',
                }}
              >{f}</button>
            ))}

            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#545b66' }}>
              {filtered.length} trades
            </span>

            <button onClick={reset} style={{ fontSize: '0.65rem', padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8b9099', cursor: 'pointer' }}>
              ↑ Upload New
            </button>
          </div>
        )}

        {/* Trade Table */}
        {filtered.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Symbol</th>
                    <th style={{ textAlign: 'center' }}>Dir</th>
                    <th style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('entryTime')}>Entry Date<SortIcon field="entryTime" /></th>
                    <th style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('exitTime')}>Exit Date<SortIcon field="exitTime" /></th>
                    <th style={{ textAlign: 'center' }}>Result</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pnl')}>P&L<SortIcon field="pnl" /></th>
                    <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pnlPercent')}>P&L %<SortIcon field="pnlPercent" /></th>
                    <th style={{ textAlign: 'right' }}>Entry</th>
                    <th style={{ textAlign: 'right' }}>Exit</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('holdingTime')}>Held<SortIcon field="holdingTime" /></th>
                    <th style={{ textAlign: 'right' }}>R:R</th>
                    <th style={{ textAlign: 'center' }}>Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g, i) => (
                    <tr key={i} onClick={() => setSelectedGroup(g)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.82rem', color: '#f0f2f5' }}>{g.symbol}</span>
                        <div style={{ fontSize: '0.58rem', color: '#545b66' }}>{g.entries.length} in · {g.exits.length} out</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: g.direction === 'long' ? '#00c878' : '#ff4d4d', textTransform: 'uppercase' }}>
                          {g.direction === 'long' ? '↑ Long' : '↓ Short'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', color: '#c9cdd3', whiteSpace: 'nowrap' }}>
                        {g.entries[0] ? new Date(g.entries[0].timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        <div style={{ fontSize: '0.58rem', color: '#545b66' }}>
                          {g.entries[0] ? new Date(g.entries[0].timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', color: '#c9cdd3', whiteSpace: 'nowrap' }}>
                        {g.exits[0] ? new Date(g.exits[g.exits.length - 1].timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        <div style={{ fontSize: '0.58rem', color: '#545b66' }}>
                          {g.exits[0] ? new Date(g.exits[g.exits.length - 1].timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '0.18rem 0.5rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
                          background: g.pnl > 0 ? 'rgba(0,200,120,0.12)' : 'rgba(255,77,77,0.12)',
                          color: g.pnl > 0 ? '#00c878' : '#ff4d4d',
                        }}>
                          {g.pnl > 0 ? '✅ WIN' : '❌ LOSS'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', fontWeight: 600, color: g.pnl >= 0 ? '#00c878' : '#ff4d4d' }}>
                        {g.pnl >= 0 ? '+' : ''}${g.pnl.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 600,
                          padding: '0.15rem 0.4rem', borderRadius: 4,
                          background: g.pnlPercent >= 0 ? 'rgba(0,200,120,0.1)' : 'rgba(255,77,77,0.1)',
                          color: g.pnlPercent >= 0 ? '#00c878' : '#ff4d4d',
                        }}>
                          {g.pnlPercent >= 0 ? '+' : ''}{g.pnlPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#c9cdd3' }}>
                        {fmtPrice(g.entryAvg)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#c9cdd3' }}>
                        {fmtPrice(g.exitAvg)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.72rem', color: '#8b9099' }}>
                        {formatDuration(g.holdingTime)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {(() => {
                          const avgL = Math.abs(stats?.avgLoss || 1);
                          const rr = avgL > 0 ? g.pnlPercent / avgL : 0;
                          const color = rr >= 2 ? '#00c878' : rr >= 1 ? '#4f8cff' : rr >= 0 ? '#8b9099' : '#ff4d4d';
                          return <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', fontWeight: 600, color }}>{rr >= 0 ? '+' : ''}{rr.toFixed(1)}R</span>;
                        })()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: '#4f8cff' }}>📊</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-symbol breakdown */}
        {stats?.symbolStats && stats.symbolStats.length > 1 && (
          <div className="card" style={{ marginTop: '1rem', padding: '0.75rem 1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#f0f2f5', marginBottom: '0.5rem' }}>📊 By Symbol</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {stats.symbolStats.map((s: any) => (
                <div key={s.symbol} style={{
                  padding: '0.4rem 0.65rem', borderRadius: 6, fontSize: '0.68rem',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', gap: '0.5rem', alignItems: 'center',
                }}>
                  <b style={{ color: '#f0f2f5' }}>{s.symbol}</b>
                  <span style={{ color: '#8b9099' }}>{s.trades} trades</span>
                  <span style={{ color: s.pnl >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 600 }}>${s.pnl.toFixed(2)}</span>
                  <span style={{ color: '#8b9099' }}>{s.winRate}% WR</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chart Modal */}
      {selectedGroup && <TradeChart group={selectedGroup} onClose={() => setSelectedGroup(null)} />}
    </div>
  );
}
