'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchAllExchanges, SimpleTicker, ExchangeName } from '@/lib/exchanges/client-fetcher';

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
  rsi_14?: number;
  volume_ratio?: number;
}

const SAVED_FORMULAS = [
  { id: '1', name: 'Oversold Bounce', description: 'RSI < 30', conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' }] },
  { id: '2', name: 'Top Gainers', description: '24h change > 5%', conditions: [{ id: 1, field: 'change_24h', operator: 'greater_than', value: '5', logicalOperator: 'AND' }] },
  { id: '3', name: 'Volume Surge', description: 'Volume ratio > 1.5', conditions: [{ id: 1, field: 'volume_ratio', operator: 'greater_than', value: '1.5', logicalOperator: 'AND' }] },
];

// All exchanges enabled by default
const ALL_EXCHANGES: ExchangeName[] = ['binance', 'bybit', 'okx', 'gateio', 'coinbase', 'hyperliquid'];

// Convert SimpleTicker to Coin format for compatibility
function tickerToCoin(ticker: SimpleTicker): Coin {
  return {
    id: `${ticker.exchange}-${ticker.symbol}`,
    symbol: ticker.base,
    name: ticker.base,
    image: '',
    current_price: ticker.price,
    market_cap: 0,
    market_cap_rank: 0,
    total_volume: ticker.volume24h,
    price_change_percentage_24h: ticker.priceChangePercent24h,
    rsi_14: undefined,
    volume_ratio: undefined,
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
      
      // Aggregate by base symbol (combine same coin from different exchanges)
      const aggregated = new Map<string, Coin>();
      
      tickers.forEach(ticker => {
        const existing = aggregated.get(ticker.base);
        if (existing) {
          // Average the prices and sum volumes
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

  const topGainers = [...coins].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 4);
  const topLosers = [...coins].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 4);
  const oversoldCoins = coins.filter(c => (c.rsi_14 ?? 50) < 30).slice(0, 4);
  const oversoldCount = coins.filter(c => (c.rsi_14 ?? 50) < 30).length;
  const overboughtCount = coins.filter(c => (c.rsi_14 ?? 50) > 70).length;

  const runFormula = async (f: typeof SAVED_FORMULAS[0]) => {
    setRunningFormula(f.id);
    try {
      // Run formula client-side instead of API call
      let results: Coin[] = [];
      
      if (f.id === '1') {
        // Oversold: RSI < 30 (we don't have RSI, so skip)
        results = coins.filter(c => (c.rsi_14 ?? 50) < 30);
      } else if (f.id === '2') {
        // Top Gainers: 24h change > 5%
        results = coins.filter(c => c.price_change_percentage_24h > 5);
      } else if (f.id === '3') {
        // Volume Surge: volume_ratio > 1.5 (we don't have this, so skip)
        results = coins.filter(c => (c.volume_ratio ?? 1) > 1.5);
      }
      
      setFormulaResults(prev => ({ ...prev, [f.id]: results }));
    } catch (e) { 
      console.error(e); 
    } finally { 
      setRunningFormula(null); 
    }
  };

  const Skel = ({ h = 20, w = '100%' }: { h?: number; w?: string }) => (
    <div className="skeleton" style={{ height: h, width: w }}></div>
  );

  const CoinRow = ({ c, badge }: { c: Coin; badge?: 'change' | 'rsi' }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {c.image && <img src={c.image} alt={c.name} width={24} height={24} style={{ borderRadius: '50%' }} />}
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f0f2f5' }}>{c.symbol.toUpperCase()}</div>
          <div style={{ fontSize: '0.6875rem', color: '#545b66' }}>${c.current_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
        </div>
      </div>
      {badge === 'rsi' ? (
        <span className="rsi-pill" style={{ background: 'rgba(0,200,120,0.12)', color: '#00c878' }}>RSI {(c.rsi_14 ?? 50).toFixed(0)}</span>
      ) : (
        <span className="mono" style={{ color: c.price_change_percentage_24h >= 0 ? '#00c878' : '#ff4d4d', fontWeight: 600 }}>
          {c.price_change_percentage_24h >= 0 ? '+' : ''}{c.price_change_percentage_24h.toFixed(2)}%
        </span>
      )}
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
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>Dashboard</h1>
            <p style={{ fontSize: '0.75rem', color: '#545b66' }}>{loading ? 'Fetching from all exchanges…' : `${coins.length} coins tracked · auto-refreshes every 30s`}</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Coins', value: loading ? '—' : String(coins.length), color: '#f0f2f5' },
            { label: 'Oversold', value: loading ? '—' : String(oversoldCount), color: '#00c878' },
            { label: 'Overbought', value: loading ? '—' : String(overboughtCount), color: '#ff4d4d' },
            { label: 'Formulas', value: String(SAVED_FORMULAS.length), color: '#4f8cff' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="label">{s.label}</div>
              <div className="value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 3-col panels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
          {[
            { title: 'Top Gainers', color: '#00c878', data: topGainers, badge: 'change' as const, icon: '▲' },
            { title: 'Top Losers', color: '#ff4d4d', data: topLosers, badge: 'change' as const, icon: '▼' },
            { title: 'Oversold', color: '#f59e0b', data: oversoldCoins, badge: 'rsi' as const, icon: '◐' },
          ].map(panel => (
            <div key={panel.title} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: panel.color }}>{panel.icon}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: panel.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{panel.title}</span>
                <span style={{ fontSize: '0.625rem', color: '#545b66', marginLeft: 'auto' }}>24h</span>
              </div>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Skel h={28} /><Skel h={28} /><Skel h={28} /><Skel h={28} />
                </div>
              ) : panel.data.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: '#545b66', padding: '1rem 0' }}>Nothing here right now</p>
              ) : (
                <div>
                  {panel.data.map(c => <CoinRow key={c.id} c={c} badge={panel.badge} />)}
                </div>
              )}
            </div>
          ))}
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
                  {formulaResults[f.id].slice(0, 3).map(c => <CoinRow key={c.id} c={c} badge="change" />)}
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
