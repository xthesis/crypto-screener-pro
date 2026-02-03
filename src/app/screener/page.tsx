'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchAllExchanges, SimpleTicker, ExchangeName, Timeframe } from '@/lib/exchanges/client-fetcher';

const SUPABASE_URL = 'https://mzuocbdocvhpffytsvaw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dW9jYmRvY3ZocGZmeXRzdmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTc0OTYsImV4cCI6MjA4NTYzMzQ5Nn0.boaEi1_VmDW6NWC998NwJpEvAY899pLIlFTbr0dHgIc';

interface MAData {
  base: string;
  price: number;
  ma_20: number | null;
  ma_50: number | null;
  ma_200: number | null;
}

const EXCHANGE_LABELS: Record<ExchangeName, string> = {
  binance: 'Binance',
  bybit: 'Bybit',
  okx: 'OKX',
  gateio: 'Gate.io',
  hyperliquid: 'Hyperliquid',
  aster: 'Aster',
};

const EXCHANGE_EMOJIS: Record<ExchangeName, string> = {
  binance: '🅱️',
  bybit: '🇧',
  okx: '🅾️',
  gateio: '🚪',
  hyperliquid: '💧',
  aster: '⭐',
};

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const ALL_EXCHANGES: ExchangeName[] = ['binance', 'bybit', 'okx', 'gateio', 'hyperliquid', 'aster'];

// MA Filter presets
const MA_FILTERS = [
  { id: 'none', label: 'No MA Filter', description: '' },
  { id: 'above_20', label: 'Price > 20 MA', description: 'Bullish short-term' },
  { id: 'below_20', label: 'Price < 20 MA', description: 'Bearish short-term' },
  { id: 'above_50', label: 'Price > 50 MA', description: 'Bullish mid-term' },
  { id: 'above_200', label: 'Price > 200 MA', description: 'Bullish long-term' },
  { id: 'below_200', label: 'Price < 200 MA', description: 'Bearish long-term' },
  { id: 'golden_cross', label: '20 MA > 50 MA > 200 MA', description: 'Strong uptrend' },
  { id: 'death_cross', label: '20 MA < 50 MA < 200 MA', description: 'Strong downtrend' },
  { id: 'ma20_cross_above_50', label: '20 MA > 50 MA', description: 'Bullish crossover zone' },
  { id: 'squeeze', label: 'Price near 20 MA (±2%)', description: 'Potential breakout' },
];

function fmtPrice(v: number) {
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(8);
}

function fmtMA(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(8);
}

function fmtBig(v: number) {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

function maColor(price: number, ma: number | null | undefined): string {
  if (ma === null || ma === undefined) return '#545b66';
  return price > ma ? '#00c878' : '#ff4d4d';
}

export default function Screener() {
  const [tickers, setTickers] = useState<SimpleTicker[]>([]);
  const [maData, setMaData] = useState<Record<string, MAData>>({});
  const [loading, setLoading] = useState(true);
  const [maLoading, setMaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedExchanges, setSelectedExchanges] = useState<ExchangeName[]>(['binance', 'bybit']);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1d');
  const [sortField, setSortField] = useState<string>('volume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMAFilter, setSelectedMAFilter] = useState('none');
  const [showMAColumns, setShowMAColumns] = useState(true);

  // Fetch MA data from Supabase
  const fetchMAData = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    setMaLoading(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/coins?select=base,price,ma_20,ma_50,ma_200`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          }
        }
      );
      if (res.ok) {
        const data: MAData[] = await res.json();
        const map: Record<string, MAData> = {};
        data.forEach(d => { map[d.base] = d; });
        setMaData(map);
      }
    } catch (e) {
      console.error('Failed to fetch MA data:', e);
    } finally {
      setMaLoading(false);
    }
  }, []);

  const fetchTickers = useCallback(async (bust = false) => {
    setError(null);
    if (bust) setRefreshing(true);
    else setLoading(true);
    
    try {
      const data = await fetchAllExchanges(selectedExchanges);
      setTickers(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedExchanges]);

  useEffect(() => {
    fetchTickers();
    fetchMAData();
    const iv = setInterval(() => fetchTickers(false), 30000);
    // Refresh MA data every 5 minutes
    const maIv = setInterval(() => fetchMAData(), 300000);
    return () => { clearInterval(iv); clearInterval(maIv); };
  }, [fetchTickers, fetchMAData]);

  const toggleExchange = (exchange: ExchangeName) => {
    setSelectedExchanges(prev =>
      prev.includes(exchange)
        ? prev.filter(e => e !== exchange)
        : [...prev, exchange]
    );
  };

  const selectAllExchanges = () => setSelectedExchanges([...ALL_EXCHANGES]);
  const deselectAllExchanges = () => setSelectedExchanges([]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Group tickers by symbol
  const grouped = tickers.reduce((acc, ticker) => {
    if (!acc[ticker.symbol]) acc[ticker.symbol] = [];
    acc[ticker.symbol].push(ticker);
    return acc;
  }, {} as Record<string, SimpleTicker[]>);

  // Create unified view with MA data
  const unified = Object.entries(grouped).map(([symbol, tickerList]) => {
    const avgPrice = tickerList.reduce((sum, t) => sum + t.price, 0) / tickerList.length;
    const totalVolume = tickerList.reduce((sum, t) => sum + t.volume24h, 0);
    const avgChange = tickerList.reduce((sum, t) => sum + t.priceChangePercent24h, 0) / tickerList.length;
    const base = tickerList[0].base;
    const ma = maData[base];
    
    return {
      symbol,
      base,
      quote: tickerList[0].quote,
      avgPrice,
      totalVolume,
      avgChange,
      exchanges: tickerList.map(t => t.exchange as ExchangeName),
      tickers: tickerList,
      ma_20: ma?.ma_20 ?? null,
      ma_50: ma?.ma_50 ?? null,
      ma_200: ma?.ma_200 ?? null,
    };
  });

  // Apply MA filter
  function applyMAFilter(coin: typeof unified[0]): boolean {
    switch (selectedMAFilter) {
      case 'above_20':
        return coin.ma_20 !== null && coin.avgPrice > coin.ma_20;
      case 'below_20':
        return coin.ma_20 !== null && coin.avgPrice < coin.ma_20;
      case 'above_50':
        return coin.ma_50 !== null && coin.avgPrice > coin.ma_50;
      case 'above_200':
        return coin.ma_200 !== null && coin.avgPrice > coin.ma_200;
      case 'below_200':
        return coin.ma_200 !== null && coin.avgPrice < coin.ma_200;
      case 'golden_cross':
        return coin.ma_20 !== null && coin.ma_50 !== null && coin.ma_200 !== null &&
          coin.ma_20 > coin.ma_50 && coin.ma_50 > coin.ma_200;
      case 'death_cross':
        return coin.ma_20 !== null && coin.ma_50 !== null && coin.ma_200 !== null &&
          coin.ma_20 < coin.ma_50 && coin.ma_50 < coin.ma_200;
      case 'ma20_cross_above_50':
        return coin.ma_20 !== null && coin.ma_50 !== null && coin.ma_20 > coin.ma_50;
      case 'squeeze':
        if (coin.ma_20 === null) return false;
        const pctDiff = Math.abs((coin.avgPrice - coin.ma_20) / coin.ma_20) * 100;
        return pctDiff <= 2;
      default:
        return true;
    }
  }

  // Filter and sort
  let filtered = unified.filter(coin => {
    if (search && !coin.base.toLowerCase().includes(search.toLowerCase())) return false;
    if (!applyMAFilter(coin)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    let vA: number, vB: number;
    switch (sortField) {
      case 'price': vA = a.avgPrice; vB = b.avgPrice; break;
      case 'volume24h': vA = a.totalVolume; vB = b.totalVolume; break;
      case 'priceChangePercent24h': vA = a.avgChange; vB = b.avgChange; break;
      case 'ma_20': vA = a.ma_20 ?? -Infinity; vB = b.ma_20 ?? -Infinity; break;
      case 'ma_50': vA = a.ma_50 ?? -Infinity; vB = b.ma_50 ?? -Infinity; break;
      case 'ma_200': vA = a.ma_200 ?? -Infinity; vB = b.ma_200 ?? -Infinity; break;
      default: vA = a.totalVolume; vB = b.totalVolume;
    }
    return sortDir === 'asc' ? vA - vB : vB - vA;
  });

  const SortIcon = ({ field }: { field: string }) => (
    <span style={{ opacity: sortField === field ? 1 : 0.25, color: sortField === field ? '#4f8cff' : 'inherit', marginLeft: 4, fontSize: '0.6rem' }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const maFilterInfo = MA_FILTERS.find(f => f.id === selectedMAFilter);

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener" className="active">Screener</Link>
            <Link href="/formula/new">Formula Builder</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>Multi-Exchange Screener</h1>
            <p style={{ fontSize: '0.6875rem', color: '#545b66' }}>
              {loading ? 'Fetching…' : `${filtered.length} pairs across ${selectedExchanges.length} exchanges · Updated ${lastUpdated}`}
              {maLoading ? ' · Loading MAs…' : ` · ${Object.keys(maData).length} MAs loaded`}
              <span style={{ color: '#4f8cff', marginLeft: '0.5rem' }}>● auto</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => fetchTickers(true)} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem', opacity: refreshing ? 0.5 : 1 }}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
            <Link href="/formula/new" className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem' }}>
              Build Formula →
            </Link>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b9099', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timeframe:</span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setSelectedTimeframe(tf.value)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: selectedTimeframe === tf.value ? 'rgba(79,140,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedTimeframe === tf.value ? 'rgba(79,140,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: selectedTimeframe === tf.value ? '#4f8cff' : '#8b9099',
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Exchange Selector */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b9099', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Exchanges:</span>
            <div style={{ display: 'flex', gap: '0.35rem', marginRight: '0.5rem' }}>
              <button onClick={selectAllExchanges} style={{ padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 500, cursor: 'pointer', background: 'rgba(79,140,255,0.08)', border: '1px solid rgba(79,140,255,0.2)', color: '#4f8cff' }}>All</button>
              <button onClick={deselectAllExchanges} style={{ padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 500, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#8b9099' }}>None</button>
            </div>
            {ALL_EXCHANGES.map(exchangeKey => {
              const isSelected = selectedExchanges.includes(exchangeKey);
              return (
                <label key={exchangeKey} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: 6, background: isSelected ? 'rgba(79,140,255,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSelected ? 'rgba(79,140,255,0.3)' : 'rgba(255,255,255,0.06)'}`, transition: 'all 0.15s' }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleExchange(exchangeKey)} style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{EXCHANGE_EMOJIS[exchangeKey]} {EXCHANGE_LABELS[exchangeKey]}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* MA Filter */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b9099', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MA Filter (1D):</span>
            <select
              value={selectedMAFilter}
              onChange={e => setSelectedMAFilter(e.target.value)}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: 6,
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: selectedMAFilter !== 'none' ? 'rgba(79,140,255,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${selectedMAFilter !== 'none' ? 'rgba(79,140,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: selectedMAFilter !== 'none' ? '#4f8cff' : '#c0c4cc',
                outline: 'none',
              }}
            >
              {MA_FILTERS.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            {maFilterInfo && maFilterInfo.description && (
              <span style={{ fontSize: '0.68rem', color: '#8b9099', fontStyle: 'italic' }}>{maFilterInfo.description}</span>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto', cursor: 'pointer' }}>
              <input type="checkbox" checked={showMAColumns} onChange={e => setShowMAColumns(e.target.checked)} style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: '0.7rem', color: '#8b9099' }}>Show MA columns</span>
            </label>
          </div>
        </div>

        {/* Search */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <input type="text" placeholder="Search by symbol (BTC, ETH, SOL...)" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', maxWidth: 320 }} />
        </div>

        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: '#ff4d4d' }}>{error}</span>
            <button onClick={() => fetchTickers(true)} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>Retry</button>
          </div>
        )}

        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '1rem' }}>
              {[...Array(10)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 6 }}></div>)}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Symbol</th>
                    <th style={{ textAlign: 'left' }}>Exchanges</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('price')}>
                      Price<SortIcon field="price" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('priceChangePercent24h')}>
                      24h<SortIcon field="priceChangePercent24h" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('volume24h')}>
                      Volume<SortIcon field="volume24h" />
                    </th>
                    {showMAColumns && (
                      <>
                        <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: '#f5a623' }} onClick={() => handleSort('ma_20')}>
                          20 MA<SortIcon field="ma_20" />
                        </th>
                        <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: '#4f8cff' }} onClick={() => handleSort('ma_50')}>
                          50 MA<SortIcon field="ma_50" />
                        </th>
                        <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: '#a855f7' }} onClick={() => handleSort('ma_200')}>
                          200 MA<SortIcon field="ma_200" />
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(coin => (
                    <tr key={coin.symbol}>
                      <td>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: '#f0f2f5' }}>
                          {coin.base}/{coin.quote}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {coin.exchanges.map((ex, i) => (
                            <span key={i} title={EXCHANGE_LABELS[ex]} style={{ fontSize: '0.9rem' }}>{EXCHANGE_EMOJIS[ex]}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#f0f2f5' }}>
                        {fmtPrice(coin.avgPrice)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.45rem', borderRadius: 4, background: coin.avgChange >= 0 ? 'rgba(0,200,120,0.1)' : 'rgba(255,77,77,0.1)', color: coin.avgChange >= 0 ? '#00c878' : '#ff4d4d' }}>
                          {coin.avgChange >= 0 ? '+' : ''}{coin.avgChange.toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#8b9099' }}>
                        {fmtBig(coin.totalVolume)}
                      </td>
                      {showMAColumns && (
                        <>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: maColor(coin.avgPrice, coin.ma_20) }}>
                            {fmtMA(coin.ma_20)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: maColor(coin.avgPrice, coin.ma_50) }}>
                            {fmtMA(coin.ma_50)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: maColor(coin.avgPrice, coin.ma_200) }}>
                            {fmtMA(coin.ma_200)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={showMAColumns ? 8 : 5} style={{ textAlign: 'center', color: '#545b66', padding: '3rem 0', fontSize: '0.8rem' }}>No coins match your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '0.65rem', color: '#545b66', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>📊 MA data: Daily (1D) timeframe</span>
            <span style={{ color: '#f5a623' }}>● 20 MA</span>
            <span style={{ color: '#4f8cff' }}>● 50 MA</span>
            <span style={{ color: '#a855f7' }}>● 200 MA</span>
            <span>🟢 Green = Price above MA · 🔴 Red = Price below MA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
