'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchAllExchanges, SimpleTicker, ExchangeName } from '@/lib/exchanges/client-fetcher';

interface Coin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  total_volume: number;
  price_change_percentage_24h: number;
}

const SAVED_FORMULAS = [
  { id: '1', name: 'Top Gainers', description: '24h change > 5%', filter: (c: Coin) => c.price_change_percentage_24h > 5 },
  { id: '2', name: 'Top Losers', description: '24h change < -5%', filter: (c: Coin) => c.price_change_percentage_24h < -5 },
  { id: '3', name: 'High Volume', description: 'Volume > $1M', filter: (c: Coin) => c.total_volume > 1000000 },
];

// All exchanges enabled by default
const ALL_EXCHANGES: ExchangeName[] = ['binance', 'bybit', 'okx', 'gateio', 'coinbase', 'hyperliquid'];

// Convert SimpleTicker to Coin format
function tickerToCoin(ticker: SimpleTicker): Coin {
  return {
    id: `${ticker.exchange}-${ticker.symbol}`,
    symbol: ticker.base,
    name: ticker.base,
    current_price: ticker.price,
    total_volume: ticker.volume24h,
    price_change_percentage_24h: ticker.priceChangePercent24h,
  };
}

export default function Dashboard() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [formulaResults, setFormulaResults] = useState<Record<string, Coin[]>>({});
  const [runningFormula, setRunningFormula] = useState<string | null>(null);

  const fetchCoins = useCallback(async () => {
    try {
      const tickers = await fetchAllExchanges(ALL_EXCHANGES);
      
      // Aggregate by base symbol
      const aggregated = new Map<string, Coin>();
      
      tickers.forEach(ticker => {
        const existing = aggregated.get(ticker.base);
        if (existing) {
          existing.current_price = (existing.current_price + ticker.price) / 2;
          existing.total_volume += ticker.volume24h;
          existing.price_change_percentage_24h = (existing.price_change_percentage_24h + ticker.priceChangePercent24h) / 2;
        } else {
          aggregated.set(ticker.base, tickerToCoin(ticker));
        }
      });
      
      setCoins(Array.from(aggregated.values()));
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch coins:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoins();
    const interval = setInterval(fetchCoins, 30000);
    return () => clearInterval(interval);
  }, [fetchCoins]);

  const topGainers = [...coins].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 10);
  const topLosers = [...coins].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 10);
  const highestVolume = [...coins].sort((a, b) => b.total_volume - a.total_volume).slice(0, 10);
  const lowestVolume = [...coins].sort((a, b) => a.total_volume - b.total_volume).slice(0, 10);

  const runFormula = async (f: typeof SAVED_FORMULAS[0]) => {
    setRunningFormula(f.id);
    try {
      const results = coins.filter(f.filter);
      setFormulaResults(prev => ({ ...prev, [f.id]: results }));
    } catch (e) { 
      console.error(e); 
    } finally { 
      setRunningFormula(null); 
    }
  };

  const Skel = ({ h = 20 }: { h?: number }) => (
    <div className="skeleton" style={{ height: h, width: '100%' }}></div>
  );

  const CoinRowChange = ({ c }: { c: Coin }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f0f2f5' }}>{c.symbol}</div>
        <div style={{ fontSize: '0.65rem', color: '#545b66' }}>${c.current_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
      </div>
      <span style={{ color: c.price_change_percentage_24h >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 600, fontSize: '0.8rem' }}>
        {c.price_change_percentage_24h >= 0 ? '+' : ''}{c.price_change_percentage_24h.toFixed(2)}%
      </span>
    </div>
  );

  const CoinRowVolume = ({ c }: { c: Coin }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f0f2f5' }}>{c.symbol}</div>
        <div style={{ fontSize: '0.65rem', color: '#545b66' }}>${c.current_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
      </div>
      <span style={{ color: '#4f8cff', fontWeight: 600, fontSize: '0.75rem' }}>
        ${c.total_volume >= 1000000000 ? (c.total_volume / 1000000000).toFixed(2) + 'B' : 
          c.total_volume >= 1000000 ? (c.total_volume / 1000000).toFixed(2) + 'M' : 
          (c.total_volume / 1000).toFixed(0) + 'K'}
      </span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard" className="active">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/formula/new">Formula Builder</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell">
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>Dashboard</h1>
          <p style={{ fontSize: '0.75rem', color: '#545b66' }}>{loading ? 'Fetching from all exchanges…' : `${coins.length} coins tracked · auto-refreshes every 30s`}</p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Coins', value: loading ? '—' : String(coins.length), color: '#f0f2f5' },
            { label: 'Gainers (>5%)', value: loading ? '—' : String(coins.filter(c => c.price_change_percentage_24h > 5).length), color: '#00c878' },
            { label: 'Losers (<-5%)', value: loading ? '—' : String(coins.filter(c => c.price_change_percentage_24h < -5).length), color: '#ff4d4d' },
            { label: 'Formulas', value: String(SAVED_FORMULAS.length), color: '#4f8cff' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="label">{s.label}</div>
              <div className="value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 4 panels - 2x2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
          {/* Top Gainers */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#00c878' }}>▲</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#00c878', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top 10 Gainers</span>
              <span style={{ fontSize: '0.625rem', color: '#545b66', marginLeft: 'auto' }}>24h</span>
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(5)].map((_, i) => <Skel key={i} h={36} />)}
              </div>
            ) : (
              <div>{topGainers.map(c => <CoinRowChange key={c.id} c={c} />)}</div>
            )}
          </div>

          {/* Top Losers */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#ff4d4d' }}>▼</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ff4d4d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top 10 Losers</span>
              <span style={{ fontSize: '0.625rem', color: '#545b66', marginLeft: 'auto' }}>24h</span>
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(5)].map((_, i) => <Skel key={i} h={36} />)}
              </div>
            ) : (
              <div>{topLosers.map(c => <CoinRowChange key={c.id} c={c} />)}</div>
            )}
          </div>

          {/* Highest Volume */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#4f8cff' }}>◆</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#4f8cff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Highest Volume</span>
              <span style={{ fontSize: '0.625rem', color: '#545b66', marginLeft: 'auto' }}>24h</span>
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(5)].map((_, i) => <Skel key={i} h={36} />)}
              </div>
            ) : (
              <div>{highestVolume.map(c => <CoinRowVolume key={c.id} c={c} />)}</div>
            )}
          </div>

          {/* Lowest Volume */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>◇</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lowest Volume</span>
              <span style={{ fontSize: '0.625rem', color: '#545b66', marginLeft: 'auto' }}>24h</span>
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(5)].map((_, i) => <Skel key={i} h={36} />)}
              </div>
            ) : (
              <div>{lowestVolume.map(c => <CoinRowVolume key={c.id} c={c} />)}</div>
            )}
          </div>
        </div>

        {/* Formulas section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.01em' }}>My Formulas</h2>
          <Link href="/formula/new" className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.7rem' }}>+ New</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
          {SAVED_FORMULAS.map(f => (
            <div key={f.id} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{f.name}</span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00c878', boxShadow: '0 0 6px rgba(0,200,120,0.4)' }}></span>
              </div>
              <p style={{ fontSize: '0.6875rem', color: '#545b66', marginBottom: '0.85rem' }}>{f.description}</p>

              {formulaResults[f.id] && (
                <p style={{ fontSize: '0.6875rem', color: '#00c878', fontWeight: 600, marginBottom: '0.5rem' }}>{formulaResults[f.id].length} coins matched</p>
              )}
              {formulaResults[f.id] && formulaResults[f.id].length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  {formulaResults[f.id].slice(0, 3).map(c => <CoinRowChange key={c.id} c={c} />)}
                </div>
              )}

              <button
                onClick={() => runFormula(f)}
                disabled={runningFormula === f.id || loading}
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: '0.7rem', opacity: (runningFormula === f.id || loading) ? 0.4 : 1 }}
              >
                {runningFormula === f.id ? 'Running…' : formulaResults[f.id] ? '↻ Re-run' : '▶ Run Live'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
