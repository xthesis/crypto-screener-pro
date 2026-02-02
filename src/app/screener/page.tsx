'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchAllExchanges, SimpleTicker, ExchangeName, Timeframe } from '@/lib/exchanges/client-fetcher';

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

function fmtPrice(v: number) {
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(8);
}

function fmtBig(v: number) {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

export default function Screener() {
  const [tickers, setTickers] = useState<SimpleTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedExchanges, setSelectedExchanges] = useState<ExchangeName[]>(['binance', 'bybit']);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1d');
  const [sortField, setSortField] = useState<'price' | 'volume24h' | 'priceChangePercent24h'>('volume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTickers = useCallback(async (bust = false) => {
    setError(null);
    if (bust) setRefreshing(true);
    else setLoading(true);
    
    try {
      console.log('[Screener] Fetching from', selectedExchanges);
      const data = await fetchAllExchanges(selectedExchanges);
      console.log('[Screener] Received', data.length, 'tickers');
      
      setTickers(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error('[Screener] Error:', e);
      setError(e.message || 'Failed to fetch');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedExchanges]);

  useEffect(() => {
    fetchTickers();
    const iv = setInterval(() => fetchTickers(false), 30000);
    return () => clearInterval(iv);
  }, [fetchTickers]);

  const toggleExchange = (exchange: ExchangeName) => {
    setSelectedExchanges(prev =>
      prev.includes(exchange)
        ? prev.filter(e => e !== exchange)
        : [...prev, exchange]
    );
  };

  const selectAllExchanges = () => {
    setSelectedExchanges([...ALL_EXCHANGES]);
  };

  const deselectAllExchanges = () => {
    setSelectedExchanges([]);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Group tickers by symbol
  const grouped = tickers.reduce((acc, ticker) => {
    if (!acc[ticker.symbol]) {
      acc[ticker.symbol] = [];
    }
    acc[ticker.symbol].push(ticker);
    return acc;
  }, {} as Record<string, SimpleTicker[]>);

  // Create unified view
  const unified = Object.entries(grouped).map(([symbol, tickerList]) => {
    const avgPrice = tickerList.reduce((sum, t) => sum + t.price, 0) / tickerList.length;
    const totalVolume = tickerList.reduce((sum, t) => sum + t.volume24h, 0);
    const avgChange = tickerList.reduce((sum, t) => sum + t.priceChangePercent24h, 0) / tickerList.length;
    
    return {
      symbol,
      base: tickerList[0].base,
      quote: tickerList[0].quote,
      avgPrice,
      totalVolume,
      avgChange,
      exchanges: tickerList.map(t => t.exchange as ExchangeName),
      tickers: tickerList,
    };
  });

  // Filter and sort
  let filtered = unified.filter(coin => {
    if (search && !coin.base.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let vA: number, vB: number;
    switch (sortField) {
      case 'price':
        vA = a.avgPrice;
        vB = b.avgPrice;
        break;
      case 'volume24h':
        vA = a.totalVolume;
        vB = b.totalVolume;
        break;
      case 'priceChangePercent24h':
        vA = a.avgChange;
        vB = b.avgChange;
        break;
    }
    return sortDir === 'asc' ? vA - vB : vB - vA;
  });

  const SortIcon = ({ field }: { field: string }) => (
    <span style={{ opacity: sortField === field ? 1 : 0.25, color: sortField === field ? '#4f8cff' : 'inherit', marginLeft: 4, fontSize: '0.6rem' }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

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
              <span style={{ color: '#4f8cff', marginLeft: '0.5rem' }}>● auto</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => fetchTickers(true)} className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem', minWidth: 36, minHeight: 36 }}>
              {refreshing ? '…' : '↻'}
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
              <button
                onClick={selectAllExchanges}
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: 'rgba(79,140,255,0.08)',
                  border: '1px solid rgba(79,140,255,0.2)',
                  color: '#4f8cff',
                }}
              >
                All
              </button>
              <button
                onClick={deselectAllExchanges}
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#8b9099',
                }}
              >
                None
              </button>
            </div>
            {ALL_EXCHANGES.map(exchangeKey => {
              const isSelected = selectedExchanges.includes(exchangeKey);
              return (
                <label
                  key={exchangeKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer',
                    padding: '0.3rem 0.6rem',
                    borderRadius: 6,
                    background: isSelected ? 'rgba(79,140,255,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(79,140,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleExchange(exchangeKey)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                    {EXCHANGE_EMOJIS[exchangeKey]} {EXCHANGE_LABELS[exchangeKey]}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Search by symbol (BTC, ETH, SOL...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: 320 }}
          />
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
                      Avg Price<SortIcon field="price" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('priceChangePercent24h')}>
                      24h<SortIcon field="priceChangePercent24h" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('volume24h')}>
                      Total Volume<SortIcon field="volume24h" />
                    </th>
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
                            <span key={i} title={EXCHANGE_LABELS[ex]} style={{ fontSize: '0.9rem' }}>
                              {EXCHANGE_EMOJIS[ex]}
                            </span>
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
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#545b66', padding: '3rem 0', fontSize: '0.8rem' }}>No coins match your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Exchange Status Footer */}
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '0.65rem', color: '#545b66', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>✅ Binance, Bybit, OKX, Gate.io working</span>
            <span>⚠️ Coinbase: rate limited (50 pairs)</span>
            <span>🔄 Hyperliquid: perpetuals only</span>
            <span>🆕 Aster: coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}
