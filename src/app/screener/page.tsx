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
  price_change_percentage_7d: number;
  price_change_percentage_30d: number;
  rsi_14?: number;
  volume_ratio?: number;
}

function formatPrice(value: number): string {
  if (value >= 1000) return '$'+value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value >= 1) return '$'+value.toFixed(2);
  if (value >= 0.01) return '$'+value.toFixed(4);
  return '$'+value.toFixed(8);
}

function formatLarge(value: number): string {
  if (value >= 1e12) return '$'+(value / 1e12).toFixed(2)+'T';
  if (value >= 1e9) return '$'+(value / 1e9).toFixed(2)+'B';
  if (value >= 1e6) return '$'+(value / 1e6).toFixed(2)+'M';
  if (value >= 1e3) return '$'+(value / 1e3).toFixed(2)+'K';
  return '$'+value.toFixed(2);
}

export default function Screener() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [marketCapFilter, setMarketCapFilter] = useState('all');
  const [rsiFilter, setRsiFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('market_cap_rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const fetchCoins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coins');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch');
      }
      const data = await res.json();
      setCoins(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // auto-refresh
    fetchCoins();
    const interval = setInterval(fetchCoins, 30000);
    return () => clearInterval(interval);
    const interval = setInterval(fetchCoins, 30000);
    return () => clearInterval(interval);
  }, [fetchCoins]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'market_cap_rank' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  let filtered = coins.filter(c => {
    const matchesSearch = !search ||
      c.symbol.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase());
    let matchesMcap = true;
    if (marketCapFilter === 'large') matchesMcap = c.market_cap >= 1e10;
    else if (marketCapFilter === 'mid') matchesMcap = c.market_cap >= 1e9 && c.market_cap < 1e10;
    else if (marketCapFilter === 'small') matchesMcap = c.market_cap < 1e9;
    let matchesRsi = true;
    const rsi = c.rsi_14 ?? 50;
    if (rsiFilter === 'oversold') matchesRsi = rsi < 30;
    else if (rsiFilter === 'neutral') matchesRsi = rsi >= 30 && rsi <= 70;
    else if (rsiFilter === 'overbought') matchesRsi = rsi > 70;
    return matchesSearch && matchesMcap && matchesRsi;
  });

  filtered.sort((a, b) => {
    let valA: number, valB: number;
    switch (sortField) {
      case 'current_price': valA = a.current_price; valB = b.current_price; break;
      case 'price_change_percentage_24h': valA = a.price_change_percentage_24h; valB = b.price_change_percentage_24h; break;
      case 'total_volume': valA = a.total_volume; valB = b.total_volume; break;
      case 'market_cap': valA = a.market_cap; valB = b.market_cap; break;
      case 'rsi_14': valA = a.rsi_14 ?? 50; valB = b.rsi_14 ?? 50; break;
      default: valA = a.market_cap_rank; valB = b.market_cap_rank;
    }
    return sortDir === 'asc' ? valA - valB : valB - valA;
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800" style={{ background: '#1A1A1D' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold gradient-text">Crypto Screener Pro</Link>
          <nav className="flex gap-6">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition">Dashboard</Link>
            <Link href="/screener" className="text-white font-semibold">Screener</Link>
            <Link href="/formula/new" className="text-gray-400 hover:text-white transition">Formula Builder</Link>
          </nav>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Live Crypto Screener</h1>
          <button onClick={fetchCoins} className="btn btn-secondary text-sm" disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
        <p className="text-gray-400 mb-6">
          {loading ? 'Fetching live data...' : `Showing ${filtered.length} of ${coins.length} coins · Updated ' + lastUpdated + ' · Auto-refreshes every 30s`}
        </p>
        {error && (
          <div className="card p-4 mb-6" style={{ background: '#3b1c1c', border: '1px solid #ef4444' }}>
            <p className="text-red-400">{error}</p>
            <button onClick={fetchCoins} className="btn btn-secondary text-sm mt-2">Retry</button>
          </div>
        )}
        <div className="card p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input type="text" placeholder="Search coins..." value={search} onChange={e => setSearch(e.target.value)} className="w-full" />
            <select value={marketCapFilter} onChange={e => setMarketCapFilter(e.target.value)} className="w-full">
              <option value="all">All Market Caps</option>
              <option value="large">Large Cap (&gt;$10B)</option>
              <option value="mid">Mid Cap ($1B-$10B)</option>
              <option value="small">Small Cap (&lt;$1B)</option>
            </select>
            <select value={rsiFilter} onChange={e => setRsiFilter(e.target.value)} className="w-full">
              <option value="all">All RSI</option>
              <option value="oversold">Oversold (&lt;30)</option>
              <option value="neutral">Neutral (30-70)</option>
              <option value="overbought">Overbought (&gt;70)</option>
            </select>
            <Link href="/formula/new" className="btn btn-primary text-center">Build Custom Formula</Link>
          </div>
        </div>
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 w-full rounded" style={{ background: 'linear-gradient(90deg, #26262a 25%, #333 50%, #26262a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}></div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Coin</th>
                    <th className="text-right cursor-pointer" onClick={() => handleSort('current_price')}>Price <SortIcon field="current_price" /></th>
                    <th className="text-right cursor-pointer" onClick={() => handleSort('price_change_percentage_24h')}>24h % <SortIcon field="price_change_percentage_24h" /></th>
                    <th className="text-right cursor-pointer" onClick={() => handleSort('total_volume')}>Volume <SortIcon field="total_volume" /></th>
                    <th className="text-right cursor-pointer" onClick={() => handleSort('market_cap')}>Mkt Cap <SortIcon field="market_cap" /></th>
                    <th className="text-right cursor-pointer" onClick={() => handleSort('rsi_14')}>RSI <SortIcon field="rsi_14" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((coin) => {
                    const rsi = coin.rsi_14 ?? 50;
                    const change = coin.price_change_percentage_24h;
                    return (
                      <tr key={coin.id}>
                        <td className="text-gray-500 font-mono text-sm">{coin.market_cap_rank}</td>
                        <td>
                          <div className="flex items-center gap-3">
                            {coin.image ? (
                              <img src={coin.image} alt={coin.name} width={28} height={28} className="rounded-full" />
                            ) : (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#667eea33' }}>{coin.symbol[0]}</div>
                            )}
                            <div>
                              <div className="font-semibold text-sm">{coin.symbol}</div>
                              <div className="text-xs text-gray-500">{coin.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-mono text-sm">{formatPrice(coin.current_price)}</td>
                        <td className={`text-right font-mono text-sm font-semibold ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </td>
                        <td className="text-right font-mono text-sm text-gray-400">{formatLarge(coin.total_volume)}</td>
                        <td className="text-right font-mono text-sm">{formatLarge(coin.market_cap)}</td>
                        <td className={`text-right font-mono text-sm font-semibold ${rsi > 70 ? 'text-red-500' : rsi < 30 ? 'text-green-500' : 'text-gray-400'}`}>
                          {rsi.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !loading && (
                    <tr><td colSpan={7} className="text-center text-gray-500 py-8">No coins match your filters</td></tr>
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
