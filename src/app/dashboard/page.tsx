'use client';

import { useState, useEffect } from 'react';
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
  rsi_14?: number;
  volume_ratio?: number;
}

const SAVED_FORMULAS = [
  { id: '1', name: 'Oversold Bounce', description: 'RSI below 30', conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' }] },
  { id: '2', name: 'Top Gainers', description: '24h Change above 5 percent', conditions: [{ id: 1, field: 'change_24h', operator: 'greater_than', value: '5', logicalOperator: 'AND' }] },
  { id: '3', name: 'High Volume Surge', description: 'Volume Ratio above 1.5', conditions: [{ id: 1, field: 'volume_ratio', operator: 'greater_than', value: '1.5', logicalOperator: 'AND' }] },
];

const sStyle: React.CSSProperties = { background: 'linear-gradient(90deg, #26262a 25%, #333 50%, #26262a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' };

export default function Dashboard() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [formulaResults, setFormulaResults] = useState<Record<string, Coin[]>>({});
  const [runningFormula, setRunningFormula] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/coins').then(r => r.json()).then(d => { setCoins(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const topGainers = [...coins].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 3);
  const topLosers = [...coins].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 3);
  const oversoldCount = coins.filter(c => (c.rsi_14 ?? 50) < 30).length;
  const overboughtCount = coins.filter(c => (c.rsi_14 ?? 50) > 70).length;
  const oversoldCoins = coins.filter(c => (c.rsi_14 ?? 50) < 30).slice(0, 3);

  const runFormula = async (f: typeof SAVED_FORMULAS[0]) => {
    setRunningFormula(f.id);
    try {
      const res = await fetch('/api/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions: f.conditions }) });
      const data = await res.json();
      setFormulaResults(prev => ({ ...prev, [f.id]: data.results }));
    } catch (e) { console.error(e); }
    finally { setRunningFormula(null); }
  };

  const CoinRow = ({ c, showRsi }: { c: Coin; showRsi?: boolean }) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {c.image && <img src={c.image} alt={c.name} width={22} height={22} className="rounded-full" />}
        <span className="font-semibold text-sm">{c.symbol}</span>
        <span className="text-gray-500 text-xs">{c.name}</span>
      </div>
      {showRsi ? (
        <span className="text-green-500 font-semibold text-sm font-mono">RSI {(c.rsi_14 ?? 50).toFixed(0)}</span>
      ) : (
        <span className={`font-semibold text-sm font-mono ${c.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {c.price_change_percentage_24h >= 0 ? '+' : ''}{c.price_change_percentage_24h.toFixed(2)}%
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800" style={{ background: '#1A1A1D' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold gradient-text">Crypto Screener Pro</Link>
          <nav className="flex gap-6">
            <Link href="/dashboard" className="text-white font-semibold">Dashboard</Link>
            <Link href="/screener" className="text-gray-400 hover:text-white transition">Screener</Link>
            <Link href="/formula/new" className="text-gray-400 hover:text-white transition">Formula Builder</Link>
          </nav>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-5"><div className="text-xs text-gray-500 uppercase mb-1">Total Coins</div><div className="text-2xl font-bold">{loading ? '—' : coins.length}</div></div>
          <div className="card p-5"><div className="text-xs text-gray-500 uppercase mb-1">Oversold RSI</div><div className="text-2xl font-bold text-green-500">{loading ? '—' : oversoldCount}</div></div>
          <div className="card p-5"><div className="text-xs text-gray-500 uppercase mb-1">Overbought RSI</div><div className="text-2xl font-bold text-red-500">{loading ? '—' : overboughtCount}</div></div>
          <div className="card p-5"><div className="text-xs text-gray-500 uppercase mb-1">Saved Formulas</div><div className="text-2xl font-bold">{SAVED_FORMULAS.length}</div></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-green-500 mb-3">Top Gainers 24h</h3>
            {loading ? (<div className="space-y-3"><div className="h-10 rounded" style={sStyle}></div><div className="h-10 rounded" style={sStyle}></div><div className="h-10 rounded" style={sStyle}></div></div>) : (<div className="space-y-3">{topGainers.map(c => <CoinRow key={c.id} c={c} />)}</div>)}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-red-500 mb-3">Top Losers 24h</h3>
            {loading ? (<div className="space-y-3"><div className="h-10 rounded" style={sStyle}></div><div className="h-10 rounded" style={sStyle}></div><div className="h-10 rounded" style={sStyle}></div></div>) : (<div className="space-y-3">{topLosers.map(c => <CoinRow key={c.id} c={c} />)}</div>)}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-yellow-500 mb-3">Oversold Coins</h3>
            {loading ? (<div className="space-y-3"><div className="h-10 rounded" style={sStyle}></div><div className="h-10 rounded" style={sStyle}></div><div className="h-10 rounded" style={sStyle}></div></div>) : (<div className="space-y-3">{oversoldCoins.length === 0 && <p className="text-gray-500 text-sm">None right now</p>}{oversoldCoins.map(c => <CoinRow key={c.id} c={c} showRsi />)}</div>)}
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">My Formulas</h2>
          <Link href="/formula/new" className="btn btn-primary text-sm">+ New Formula</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SAVED_FORMULAS.map(f => (
            <div key={f.id} className="card p-5">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold">{f.name}</h3>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 mt-0.5"></span>
              </div>
              <p className="text-xs text-gray-500 mb-4">{f.description}</p>
              {formulaResults[f.id] && <p className="text-xs text-green-400 mb-2 font-semibold">{formulaResults[f.id].length} coins matched</p>}
              {formulaResults[f.id] && formulaResults[f.id].length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {formulaResults[f.id].slice(0, 3).map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        {c.image && <img src={c.image} alt={c.name} width={18} height={18} className="rounded-full" />}
                        <span className="font-medium">{c.symbol}</span>
                      </div>
                      <span className={`font-mono text-xs ${c.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>{c.price_change_percentage_24h >= 0 ? '+' : ''}{c.price_change_percentage_24h.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => runFormula(f)} disabled={runningFormula === f.id || loading} className="btn btn-secondary w-full text-sm" style={{ opacity: (runningFormula === f.id || loading) ? 0.5 : 1 }}>
                {runningFormula === f.id ? 'Running...' : formulaResults[f.id] ? 'Re-run' : 'Run Live'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
