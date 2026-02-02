'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface UnifiedCoin {
  id: string;
  base: string;
  quote: string;
  exchanges: {
    binance?: ExchangeData;
    bybit?: ExchangeData;
  };
  aggregated: {
    avgPrice: number;
    totalVolume: number;
    avgPriceChange24h: number;
    bestBid: { exchange: string; price: number } | null;
    bestAsk: { exchange: string; price: number } | null;
  };
}

interface ExchangeData {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  lastUpdated: number;
}

type ExchangeName = 'binance' | 'bybit';

const EXCHANGE_LABELS: Record<ExchangeName, string> = {
  binance: 'Binance',
  bybit: 'Bybit',
};

const EXCHANGE_EMOJIS: Record<ExchangeName, string> = {
  binance: '🅱️',
  bybit: '🇧',
};

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
  const [coins, setCoins] = useState<UnifiedCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedExchanges, setSelectedExchanges] = useState<ExchangeName[]>(['binance', 'bybit']);
  const [sortField, setSortField] = useState('aggregated.avgPrice');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchCoins = useCallback(async (bust = false) => {
    setError(null);
    if (bust) setRefreshing(true);
    try {
      const exchangesParam = selectedExchanges.join(',');
      const url = bust 
        ? `/api/coins?bust=1&exchanges=${exchangesParam}`
        : `/api/coins?exchanges=${exchangesParam}`;
      
      const res = await fetch(url);
      console.log('[FETCH]', { 
        bust, 
        exchanges: res.headers.get('X-Exchanges'),
        coinCount: res.headers.get('X-Coin-Count'),
        serverTime: res.headers.get('X-Server-Time'),
      });
      
      if (!res.ok) { 
        const d = await res.json(); 
        throw new Error(d.error || 'Failed'); 
      }
      
      const data: UnifiedCoin[] = await res.json();
      console.log('[DATA]', { 
        count: data.length, 
        btcPrice: data.find(c => c.base === 'BTC')?.aggregated.avgPrice 
      });
      
      setCoins(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) { 
      setError(e.message); 
    } finally { 
      setLoading(false); 
      setRefreshing(false); 
    }
  }, [selectedExchanges]);

  useEffect(() => {
    fetchCoins();
    const iv = setInterval(() => fetchCoins(false), 30000);
    return () => clearInterval(iv);
  }, [fetchCoins]);

  const toggleExchange = (exchange: ExchangeName) => {
    setSelectedExchanges(prev => 
      prev.includes(exchange)
        ? prev.filter(e => e !== exchange)
        : [...prev, exchange]
    );
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Filter coins
  let filtered = coins.filter(c => {
    // Search filter
    if (search && !c.base.toLowerCase().includes(search.toLowerCase()) && !c.id.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Sort coins
  filtered.sort((a, b) => {
    let vA: number, vB: number;
    
    switch (sortField) {
      case 'aggregated.avgPrice':
        vA = a.aggregated.avgPrice;
        vB = b.aggregated.avgPrice;
        break;
      case 'aggregated.totalVolume':
        vA = a.aggregated.totalVolume;
        vB = b.aggregated.totalVolume;
        break;
      case 'aggregated.avgPriceChange24h':
        vA = a.aggregated.avgPriceChange24h;
        vB = b.aggregated.avgPriceChange24h;
        break;
      default:
        vA = a.aggregated.totalVolume;
        vB = b.aggregated.totalVolume;
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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>Multi-Exchange Screener</h1>
            <p style={{ fontSize: '0.6875rem', color: '#545b66' }}>
              {loading ? 'Fetching…' : `${filtered.length} pairs across ${selectedExchanges.length} exchanges · Updated ${lastUpdated}`}
              <span style={{ color: '#4f8cff', marginLeft: '0.5rem' }}>● auto</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => fetchCoins(true)} className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem', minWidth: 36, minHeight: 36 }}>
              {refreshing ? '…' : '↻'}
            </button>
            <Link href="/formula/new" className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem' }}>
              Build Formula →
            </Link>
          </div>
        </div>

        {/* Exchange Selector */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b9099', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Exchanges:</span>
            {Object.entries(EXCHANGE_LABELS).map(([key, label]) => {
              const exchangeKey = key as ExchangeName;
              const isSelected = selectedExchanges.includes(exchangeKey);
              return (
                <label 
                  key={key}
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
                    {EXCHANGE_EMOJIS[exchangeKey]} {label}
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
                    <th style={{ textAlign: 'left' }}>Symbol</th>
                    <th style={{ textAlign: 'left' }}>Exchanges</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('aggregated.avgPrice')}>
                      Avg Price<SortIcon field="aggregated.avgPrice" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('aggregated.avgPriceChange24h')}>
                      24h<SortIcon field="aggregated.avgPriceChange24h" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('aggregated.totalVolume')}>
                      Total Volume<SortIcon field="aggregated.totalVolume" />
                    </th>
                    <th style={{ textAlign: 'right' }}>Best Bid</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(coin => {
                    const avgChange = (coin.aggregated.avgPriceChange24h / coin.aggregated.avgPrice) * 100;
                    const exchanges = Object.keys(coin.exchanges) as ExchangeName[];
                    
                    return (
                      <tr key={coin.id}>
                        <td>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: '#f0f2f5' }}>
                            {coin.base}/{coin.quote}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {exchanges.map(ex => (
                              <span key={ex} title={EXCHANGE_LABELS[ex]} style={{ fontSize: '0.9rem' }}>
                                {EXCHANGE_EMOJIS[ex]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#f0f2f5' }}>
                          {fmtPrice(coin.aggregated.avgPrice)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.45rem', borderRadius: 4, background: avgChange >= 0 ? 'rgba(0,200,120,0.1)' : 'rgba(255,77,77,0.1)', color: avgChange >= 0 ? '#00c878' : '#ff4d4d' }}>
                            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#8b9099' }}>
                          {fmtBig(coin.aggregated.totalVolume)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.7rem', color: '#8b9099' }}>
                          {coin.aggregated.bestBid && (
                            <span>
                              {fmtPrice(coin.aggregated.bestBid.price)} 
                              <span style={{ marginLeft: 4, color: '#4f8cff' }}>
                                {EXCHANGE_EMOJIS[coin.aggregated.bestBid.exchange as ExchangeName]}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#545b66', padding: '3rem 0', fontSize: '0.8rem' }}>No coins match your filters</td></tr>
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
