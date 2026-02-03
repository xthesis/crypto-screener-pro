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

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ═══════════════════════════════════════════════
// CSV PARSERS
// ═══════════════════════════════════════════════

function cleanSymbol(s: string): string {
  return s.replace(/[-_\/]/g, '').replace(/USDT|USD|BUSD|PERP/gi, '').toUpperCase();
}

function parseTimestamp(val: string): number {
  if (!val) return 0;
  // Try parsing as number first (unix ms or s)
  const num = Number(val);
  if (!isNaN(num) && num > 1e12) return num; // ms
  if (!isNaN(num) && num > 1e9) return num * 1000; // s
  // Try as date string
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();
  return 0;
}

function parseSide(val: string): string {
  const v = val.toLowerCase().trim();
  if (v.includes('buy') || v === 'long') return 'buy';
  if (v.includes('sell') || v === 'short') return 'sell';
  return v;
}

function autoDetectAndParse(text: string): Trade[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Detect delimiter
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  // Map columns by searching for known names
  const findCol = (...names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

  const symbolCol = findCol('symbol', 'pair', 'market', 'coin', 'asset');
  const sideCol = findCol('side', 'type', 'direction', 'order type');
  const priceCol = findCol('price', 'avg', 'filled price', 'exec price', 'execution price', 'deal price');
  const qtyCol = findCol('quantity', 'qty', 'amount', 'size', 'filled', 'executed', 'vol');
  const timeCol = findCol('time', 'date', 'created', 'timestamp');
  const feeCol = findCol('fee', 'commission');

  if (symbolCol === -1 || sideCol === -1 || priceCol === -1) {
    throw new Error(`Could not detect columns. Found headers: ${headers.join(', ')}\nNeed at minimum: symbol/pair, side/type, price`);
  }

  const trades: Trade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV with quoted fields
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter[0] && !inQuotes) { cols.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    cols.push(current.trim());

    const price = parseFloat(cols[priceCol]);
    const qty = qtyCol !== -1 ? parseFloat(cols[qtyCol]) : 1;
    const ts = timeCol !== -1 ? parseTimestamp(cols[timeCol]) : Date.now();

    if (!price || isNaN(price) || price <= 0) continue;

    trades.push({
      symbol: cleanSymbol(cols[symbolCol] || ''),
      side: parseSide(cols[sideCol] || ''),
      price,
      quantity: Math.abs(qty) || 1,
      timestamp: ts,
      fee: feeCol !== -1 ? parseFloat(cols[feeCol]) || 0 : 0,
    });
  }

  return trades;
}

// ═══════════════════════════════════════════════
// CHART COMPONENT
// ═══════════════════════════════════════════════

function TradeChart({ group, onClose }: { group: TradeGroup; onClose: () => void }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCandles = async () => {
      setLoading(true);
      setError('');
      const allTimes = [...group.entries, ...group.exits].map(t => t.timestamp);
      const start = Math.min(...allTimes);
      const end = Math.max(...allTimes);

      try {
        const res = await fetch(`/api/candles?symbol=${group.symbol}&start=${start}&end=${end}`);
        if (!res.ok) throw new Error('Failed to fetch candles');
        const data = await res.json();
        setCandles(data.candles || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCandles();
  }, [group]);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    let chart: any;
    const initChart = async () => {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');

      chartRef.current!.innerHTML = '';
      chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth,
        height: 420,
        layout: { background: { type: ColorType.Solid, color: '#0d1117' }, textColor: '#8b9099' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: 'rgba(255,255,255,0.06)' },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#00c878',
        downColor: '#ff4d4d',
        borderUpColor: '#00c878',
        borderDownColor: '#ff4d4d',
        wickUpColor: '#00c878',
        wickDownColor: '#ff4d4d',
      });
      candleSeries.setData(candles);

      // Add entry markers (green triangles)
      const entryMarkers = group.entries.map(t => ({
        time: Math.floor(t.timestamp / 1000) as any,
        position: 'belowBar' as const,
        color: '#00c878',
        shape: 'arrowUp' as const,
        text: `BUY $${t.price.toFixed(t.price > 1 ? 2 : 6)}`,
      }));

      // Add exit markers (red triangles)
      const exitMarkers = group.exits.map(t => ({
        time: Math.floor(t.timestamp / 1000) as any,
        position: 'aboveBar' as const,
        color: '#ff4d4d',
        shape: 'arrowDown' as const,
        text: `SELL $${t.price.toFixed(t.price > 1 ? 2 : 6)}`,
      }));

      const allMarkers = [...entryMarkers, ...exitMarkers].sort((a, b) => (a.time as number) - (b.time as number));
      candleSeries.setMarkers(allMarkers);

      // Add entry/exit price lines
      candleSeries.createPriceLine({
        price: group.entryAvg,
        color: 'rgba(0,200,120,0.5)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Entry Avg $${group.entryAvg.toFixed(group.entryAvg > 1 ? 2 : 6)}`,
      });

      candleSeries.createPriceLine({
        price: group.exitAvg,
        color: 'rgba(255,77,77,0.5)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Exit Avg $${group.exitAvg.toFixed(group.exitAvg > 1 ? 2 : 6)}`,
      });

      chart.timeScale().fitContent();
    };

    initChart();
    return () => { if (chart) chart.remove(); };
  }, [candles, group]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, width: '100%', maxWidth: 1000, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1rem', color: '#f0f2f5' }}>{group.symbol}</span>
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

        {/* Chart */}
        <div style={{ padding: '0.5rem' }}>
          {loading && <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#545b66' }}>Loading chart data...</div>}
          {error && <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4d', fontSize: '0.8rem' }}>{error}</div>}
          <div ref={chartRef} />
        </div>

        {/* Trade details */}
        <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '1.5rem', fontSize: '0.68rem', color: '#8b9099' }}>
          <span>Entry: <b style={{ color: '#00c878' }}>${group.entryAvg.toFixed(group.entryAvg > 1 ? 2 : 6)}</b></span>
          <span>Exit: <b style={{ color: '#ff4d4d' }}>${group.exitAvg.toFixed(group.exitAvg > 1 ? 2 : 6)}</b></span>
          <span>Held: <b style={{ color: '#f0f2f5' }}>{formatDuration(group.holdingTime)}</b></span>
          <span>Entries: {group.entries.length} · Exits: {group.exits.length}</span>
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════

export default function TradeJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [groups, setGroups] = useState<TradeGroup[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<TradeGroup | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = autoDetectAndParse(text);
        if (parsed.length === 0) throw new Error('No valid trades found in file');
        setTrades(parsed);
        runAnalysis(parsed);
      } catch (err: any) {
        setParseError(err.message);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const runAnalysis = async (tradeData: Trade[]) => {
    setLoading(true);
    setAnalysisLoading(true);
    try {
      const res = await fetch('/api/trade-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: tradeData }),
      });
      const data = await res.json();
      setGroups(data.groups || []);
      setStats(data.stats || null);
      setAnalysis(data.analysis || '');
    } catch (e: any) {
      setParseError(e.message);
    } finally {
      setLoading(false);
      setAnalysisLoading(false);
    }
  };

  const handleSampleData = () => {
    // Generate sample trades for demo
    const now = Date.now();
    const sample: Trade[] = [
      { symbol: 'BTC', side: 'buy', price: 95000, quantity: 0.1, timestamp: now - 86400000 * 5 },
      { symbol: 'BTC', side: 'sell', price: 98500, quantity: 0.1, timestamp: now - 86400000 * 3 },
      { symbol: 'ETH', side: 'buy', price: 3200, quantity: 2, timestamp: now - 86400000 * 7 },
      { symbol: 'ETH', side: 'sell', price: 3050, quantity: 2, timestamp: now - 86400000 * 6 },
      { symbol: 'SOL', side: 'buy', price: 210, quantity: 10, timestamp: now - 86400000 * 4 },
      { symbol: 'SOL', side: 'sell', price: 225, quantity: 10, timestamp: now - 86400000 * 2 },
      { symbol: 'HYPE', side: 'buy', price: 28, quantity: 50, timestamp: now - 86400000 * 3 },
      { symbol: 'HYPE', side: 'sell', price: 26.5, quantity: 50, timestamp: now - 86400000 * 1 },
      { symbol: 'DOGE', side: 'buy', price: 0.32, quantity: 5000, timestamp: now - 86400000 * 6 },
      { symbol: 'DOGE', side: 'sell', price: 0.35, quantity: 5000, timestamp: now - 86400000 * 4 },
    ];
    setTrades(sample);
    runAnalysis(sample);
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
            <span style={{ fontSize: '0.55rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#a855f7', letterSpacing: '0.04em' }}>BETA</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#545b66' }}>Upload your trade history CSV · AI analyzes your performance · View trades on charts</p>
        </div>

        {/* Upload Area */}
        {trades.length === 0 && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#4f8cff' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 12, padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(79,140,255,0.05)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.2s',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📁</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f2f5', marginBottom: '0.35rem' }}>
              Drop your trade history CSV here
            </div>
            <div style={{ fontSize: '0.7rem', color: '#545b66', marginBottom: '1rem' }}>
              Supports Binance, Bybit, OKX, or any CSV with symbol, side, price columns
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b9099' }}>Binance</span>
              <span style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b9099' }}>Bybit</span>
              <span style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b9099' }}>OKX</span>
              <span style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b9099' }}>Custom CSV</span>
            </div>
          </div>
        )}

        {trades.length === 0 && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <button onClick={handleSampleData} style={{
              background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)',
              color: '#4f8cff', padding: '0.4rem 1rem', borderRadius: 6, fontSize: '0.72rem',
              cursor: 'pointer', fontWeight: 600,
            }}>
              Try with sample trades →
            </button>
          </div>
        )}

        {parseError && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#ff4d4d' }}>⚠️ {parseError}</span>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Total Trades', value: stats.totalTrades, color: '#f0f2f5' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: parseFloat(stats.winRate) >= 50 ? '#00c878' : '#ff4d4d' },
              { label: 'Total P&L', value: `$${stats.totalPnl?.toFixed(2)}`, color: stats.totalPnl >= 0 ? '#00c878' : '#ff4d4d' },
              { label: 'Avg Win', value: `+${stats.avgWin?.toFixed(1)}%`, color: '#00c878' },
              { label: 'Avg Loss', value: `${stats.avgLoss?.toFixed(1)}%`, color: '#ff4d4d' },
              { label: 'Avg Hold Time', value: stats.avgHoldingTime, color: '#4f8cff' },
              { label: 'Winners', value: stats.winners, color: '#00c878' },
              { label: 'Losers', value: stats.losers, color: '#ff4d4d' },
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
              {analysisLoading && <span style={{ fontSize: '0.65rem', color: '#545b66' }}>Analyzing...</span>}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#c9cdd3', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {analysis}
            </div>
          </div>
        )}

        {/* Trade List */}
        {groups.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f0f2f5' }}>
                Trades ({groups.length})
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setTrades([]); setGroups([]); setStats(null); setAnalysis(''); }}
                  style={{ fontSize: '0.65rem', padding: '0.25rem 0.6rem', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8b9099', cursor: 'pointer' }}>
                  Upload New
                </button>
                <span style={{ fontSize: '0.62rem', color: '#545b66', alignSelf: 'center' }}>Click a row to view chart</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Symbol</th>
                    <th style={{ textAlign: 'center' }}>Result</th>
                    <th style={{ textAlign: 'right' }}>P&L</th>
                    <th style={{ textAlign: 'right' }}>P&L %</th>
                    <th style={{ textAlign: 'right' }}>Entry</th>
                    <th style={{ textAlign: 'right' }}>Exit</th>
                    <th style={{ textAlign: 'right' }}>Hold Time</th>
                    <th style={{ textAlign: 'center' }}>Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={i} onClick={() => setSelectedGroup(g)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.82rem', color: '#f0f2f5' }}>{g.symbol}</span>
                        <div style={{ fontSize: '0.58rem', color: '#545b66' }}>{g.entries.length} entry · {g.exits.length} exit</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '0.18rem 0.5rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
                          background: g.pnl >= 0 ? 'rgba(0,200,120,0.12)' : 'rgba(255,77,77,0.12)',
                          color: g.pnl >= 0 ? '#00c878' : '#ff4d4d',
                        }}>
                          {g.pnl >= 0 ? '✅ WIN' : '❌ LOSS'}
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
                        ${g.entryAvg.toFixed(g.entryAvg > 1 ? 2 : 6)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#c9cdd3' }}>
                        ${g.exitAvg.toFixed(g.exitAvg > 1 ? 2 : 6)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.72rem', color: '#8b9099' }}>
                        {formatDuration(g.holdingTime)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: '#4f8cff', cursor: 'pointer' }}>📊 View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CSV Format Guide */}
        {trades.length === 0 && (
          <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#f0f2f5', marginBottom: '0.5rem' }}>📋 How to export your trades</div>
            <div style={{ fontSize: '0.7rem', color: '#8b9099', lineHeight: 1.7 }}>
              <p style={{ marginBottom: '0.5rem' }}><b style={{ color: '#f5a623' }}>Binance:</b> Trade History → Export Recent Trade History → Download CSV</p>
              <p style={{ marginBottom: '0.5rem' }}><b style={{ color: '#f5a623' }}>Bybit:</b> Orders → Trade History → Export</p>
              <p style={{ marginBottom: '0.5rem' }}><b style={{ color: '#f5a623' }}>OKX:</b> Assets → Order History → Export</p>
              <p style={{ marginBottom: '0.5rem' }}><b style={{ color: '#f5a623' }}>Custom CSV:</b> Minimum columns needed: <code style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>symbol, side, price</code> (+ optional: quantity, timestamp, fee)</p>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#545b66', fontSize: '0.8rem' }}>
            Analyzing your trades...
          </div>
        )}
      </div>

      {/* Chart Modal */}
      {selectedGroup && <TradeChart group={selectedGroup} onClose={() => setSelectedGroup(null)} />}
    </div>
  );
}
