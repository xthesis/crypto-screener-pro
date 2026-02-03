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

  // Fetch candles whenever interval or context changes
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      const allTimes = [...group.entries, ...group.exits].map(t => t.timestamp);
      const start = Math.min(...allTimes);
      const end = Math.max(...allTimes);

      try {
        const res = await fetch(`/api/candles?symbol=${group.symbol}&start=${start}&end=${end}&interval=${interval}&context=${contextMs}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setCandles(data.candles || []);
        setCandleCount(data.count || 0);
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
      series.setMarkers(markers);

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
    setError('');
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
      setHasData(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
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
    setGroups([]); setStats(null); setAnalysis(''); setHasData(false); setError('');
    setFilterSymbol('all'); setFilterResult('all');
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
              <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#f0f2f5', marginBottom: '0.5rem' }}>📋 How to export</div>
              <div style={{ fontSize: '0.7rem', color: '#8b9099', lineHeight: 1.7 }}>
                <p style={{ marginBottom: '0.4rem' }}><b style={{ color: '#f5a623' }}>Hyperliquid:</b> Portfolio → Trade History → Export CSV</p>
                <p style={{ marginBottom: '0.4rem' }}><b style={{ color: '#f5a623' }}>Binance:</b> Orders → Trade History → Export</p>
                <p style={{ marginBottom: '0.4rem' }}><b style={{ color: '#f5a623' }}>Bybit:</b> Orders → Trade History → Export</p>
                <p><b style={{ color: '#f5a623' }}>Custom:</b> Needs columns: <code style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>symbol, side, price</code> (+ optional: size, time, fee, closedPnl)</p>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Round Trips', value: stats.totalTrades, color: '#f0f2f5' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: parseFloat(stats.winRate) >= 50 ? '#00c878' : '#ff4d4d' },
              { label: 'Total P&L', value: `$${stats.totalPnl}`, color: stats.totalPnl >= 0 ? '#00c878' : '#ff4d4d' },
              { label: 'Avg Win', value: `+${stats.avgWin}%`, color: '#00c878' },
              { label: 'Avg Loss', value: `${stats.avgLoss}%`, color: '#ff4d4d' },
              { label: 'R:R Ratio', value: stats.riskReward || 'N/A', color: '#4f8cff' },
              { label: 'Avg Hold', value: stats.avgHoldingTime, color: '#8b9099' },
              { label: 'Total Fees', value: `$${stats.totalFees}`, color: '#f5a623' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="label">{s.label}</div>
                <div className="value" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* AI Analysis */}
        {analysis && (
          <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1rem' }}>🤖</span>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f0f2f5' }}>AI Trading Coach</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#c9cdd3', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{analysis}</div>
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
                    <th style={{ textAlign: 'center' }}>Result</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pnl')}>P&L<SortIcon field="pnl" /></th>
                    <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pnlPercent')}>P&L %<SortIcon field="pnlPercent" /></th>
                    <th style={{ textAlign: 'right' }}>Entry</th>
                    <th style={{ textAlign: 'right' }}>Exit</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('holdingTime')}>Held<SortIcon field="holdingTime" /></th>
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
