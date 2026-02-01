'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d?: number;
  price_change_percentage_30d?: number;
  rsi_14?: number;
  volume_ratio?: number;
}

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
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mcapFilter, setMcapFilter] = useState('all');
  const [rsiFilter, setRsiFilter] = useState('all');
  const [sortField, setSortField] = useState('market_cap_rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchCoins = useCallback(async (bust = false) => {
    setError(null);
    try {
      const res = await fetch(bust ? '/api/coins?bust=1' : '/api/coins');
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const data = await res.json();
      setCoins(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCoins();
    const iv = setInterval(() => fetchCoins(false), 30000);
    return () => clearInterval(iv);
  }, [fetchCoins]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'market_cap_rank' ? 'asc' : 'desc'); }
  };

  let filtered = coins.filter(c => {
    if (search && !c.symbol.toLowerCase().includes(search.toLowerCase()) && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (mcapFilter === 'large' && c.market_cap < 1e10) return false;
    if (mcapFilter === 'mid' && (c.market_cap < 1e9 || c.market_cap >= 1e10)) return false;
    if (mcapFilter === 'small' && c.market_cap >= 1e9) return false;
    const rsi = c.rsi_14 ?? 50;
    if (rsiFilter === 'oversold' && rsi >= 30) return false;
    if (rsiFilter === 'neutral' && (rsi < 30 || rsi > 70)) return false;
    if (rsiFilter === 'overbought' && rsi <= 70) return false;
    return true;
  });

  filtered.sort((a, b) => {
    let vA: number, vB: number;
    switch (sortField) {
      case 'current_price': vA = a.current_price; vB = b.current_price; break;
      case 'price_change_percentage_24h': vA = a.price_change_percentage_24h; vB = b.price_change_percentage_24h; break;
      case 'total_volume': vA = a.total_volume; vB = b.total_volume; break;
      case 'market_cap': vA = a.market_cap; vB = b.market_cap; break;
      case 'rsi_14': vA = a.rsi_14 ?? 50; vB = b.rsi_14 ?? 50; break;
      default: vA = a.market_cap_rank; vB = b.market_cap_rank;
    }
    return sortDir === 'asc' ? vA - vB : vB - vA;
  });

  const SortIcon = ({ field }: { field: string }) => (
    <span style={{ opacity: sortField === field ? 1 : 0.25, color: sortField === field ? '#4f8cff' : 'inherit', marginLeft: 4, fontSize: '0.6rem' }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const cols = [
    { key: 'market_cap_rank', label: '#', align: 'left' as const, sortable: false },
    { key: 'coin', label: 'Coin', align: 'left' as const, sortable: false },
    { key: 'current_price', label: 'Price', align: 'right' as const, sortable: true },
    { key: 'price_change_percentage_24h', label: '24h', align: 'right' as const, sortable: true },
    { key: 'total_volume', label: 'Volume', align: 'right' as const, sortable: true },
    { key: 'market_cap', label: 'Mkt Cap', align: 'right' as const, sortable: true },
    { key: 'rsi_14', label: 'RSI', align: 'right' as const, sortable: true },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>Live Screener</h1>
            <p style={{ fontSize: '0.6875rem', color: '#545b66' }}>
              {loading ? 'Fetching…' : `${filtered.length} of ${coins.length} coins · Updated ${lastUpdated}`}
              <span style={{ color: '#4f8cff', marginLeft: '0.5rem' }}>● auto</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => fetchCoins(true)} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem' }} disabled={loading}>
              {loading ? '…' : '↻'}
            </button>
            <Link href="/formula/new" className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem' }}>
              Build Formula →
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 160px', maxWidth: 220 }}
          />
          <select value={mcapFilter} onChange={e => setMcapFilter(e.target.value)} style={{ flex: '0 0 auto', width: 160 }}>
            <option value="all">All Market Caps</option>
            <option value="large">Large (&gt;$10B)</option>
            <option value="mid">Mid ($1B–$10B)</option>
            <option value="small">Small (&lt;$1B)</option>
          </select>
          <select value={rsiFilter} onChange={e => setRsiFilter(e.target.value)} style={{ flex: '0 0 auto', width: 155 }}>
            <option value="all">All RSI</option>
            <option value="oversold">Oversold (&lt;30)</option>
            <option value="neutral">Neutral (30–70)</option>
            <option value="overbought">Overbought (&gt;70)</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: '#ff4d4d' }}>{error}</span>
            <button onClick={() => fetchCoins(true)} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>Retry</button>
          </div>
        )}

        {/* Table */}
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
                    {cols.map(col => (
                      <th
                        key={col.key}
                        style={{ textAlign: col.align, cursor: col.sortable ? 'pointer' : 'default', userSelect: 'none' }}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        {col.label}{col.sortable && <SortIcon field={col.key} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(coin => {
                    const rsi = coin.rsi_14 ?? 50;
                    const chg = coin.price_change_percentage_24h;
                    return (
                      <tr key={coin.id}>
                        <td style={{ color: '#545b66', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>{coin.market_cap_rank}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {coin.image ? (
                              <img src={coin.image} alt={coin.name} width={26} height={26} style={{ borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(79,140,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#4f8cff' }}>
                                {coin.symbol[0]}
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f0f2f5' }}>{coin.symbol.toUpperCase()}</div>
                              <div style={{ fontSize: '0.6625rem', color: '#545b66' }}>{coin.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#f0f2f5' }}>{fmtPrice(coin.current_price)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.45rem', borderRadius: 4, background: chg >= 0 ? 'rgba(0,200,120,0.1)' : 'rgba(255,77,77,0.1)', color: chg >= 0 ? '#00c878' : '#ff4d4d' }}>
                            {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#8b9099' }}>{fmtBig(coin.total_volume)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#8b9099' }}>{fmtBig(coin.market_cap)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="rsi-pill" style={{ background: rsi < 30 ? 'rgba(0,200,120,0.12)' : rsi > 70 ? 'rgba(255,77,77,0.12)' : 'rgba(139,144,153,0.12)', color: rsi < 30 ? '#00c878' : rsi > 70 ? '#ff4d4d' : '#8b9099' }}>
                            {rsi.toFixed(0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#545b66', padding: '3rem 0', fontSize: '0.8rem' }}>No coins match your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
