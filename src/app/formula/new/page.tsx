'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Condition {
  id: number;
  field: string;
  operator: string;
  value: string;
  logicalOperator: string;
}

interface CoinResult {
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
}

function formatPrice(v: number): string {
  if (v >= 1000) return '$'+v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return '$'+v.toFixed(2);
  if (v >= 0.01) return '$'+v.toFixed(4);
  return '$'+v.toFixed(8);
}

function formatLarge(v: number): string {
  if (v >= 1e12) return '$'+(v / 1e12).toFixed(2)+'T';
  if (v >= 1e9) return '$'+(v / 1e9).toFixed(2)+'B';
  if (v >= 1e6) return '$'+(v / 1e6).toFixed(2)+'M';
  return '$'+v.toLocaleString();
}

const INDICATORS = [
  { value: 'price', label: 'Price ($)' },
  { value: 'market_cap', label: 'Market Cap ($)' },
  { value: 'volume', label: 'Volume 24h ($)' },
  { value: 'volume_ratio', label: 'Volume Ratio' },
  { value: 'change_24h', label: '24h Change (%)' },
  { value: 'change_7d', label: '7d Change (%)' },
  { value: 'change_30d', label: '30d Change (%)' },
  { value: 'rsi_14', label: 'RSI (14)' },
  { value: 'market_cap_rank', label: 'Market Cap Rank' },
];

const OPERATORS = [
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_than_or_equal', label: '>=' },
  { value: 'less_than_or_equal', label: '<=' },
  { value: 'equals', label: '=' },
];

const TEMPLATES = [
  {
    name: 'Oversold Bounce',
    desc: 'RSI < 30',
    conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' }],
  },
  {
    name: 'High Volume Surge',
    desc: 'Volume ratio > 1.5',
    conditions: [{ id: 1, field: 'volume_ratio', operator: 'greater_than', value: '1.5', logicalOperator: 'AND' }],
  },
  {
    name: 'Top Gainers',
    desc: '24h change > 5%',
    conditions: [{ id: 1, field: 'change_24h', operator: 'greater_than', value: '5', logicalOperator: 'AND' }],
  },
  {
    name: 'Oversold + Volume Spike',
    desc: 'RSI < 35 AND Volume Ratio > 1.2',
    conditions: [
      { id: 1, field: 'rsi_14', operator: 'less_than', value: '35', logicalOperator: 'AND' },
      { id: 2, field: 'volume_ratio', operator: 'greater_than', value: '1.2', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'Mid Cap Momentum',
    desc: 'Mid-cap coins gaining > 3% in 24h',
    conditions: [
      { id: 1, field: 'market_cap', operator: 'greater_than', value: '1000000000', logicalOperator: 'AND' },
      { id: 2, field: 'market_cap', operator: 'less_than', value: '10000000000', logicalOperator: 'AND' },
      { id: 3, field: 'change_24h', operator: 'greater_than', value: '3', logicalOperator: 'AND' },
    ],
  },
];

export default function FormulaBuilder() {
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([
    { id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' },
  ]);
  const [results, setResults] = useState<CoinResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCondition = () => {
    setConditions(prev => [...prev, { id: Date.now(), field: 'rsi_14', operator: 'less_than', value: '', logicalOperator: 'AND' }]);
  };

  const removeCondition = (id: number) => {
    setConditions(prev => prev.filter(c => c.id !== id));
  };

  const updateCondition = (id: number, key: string, val: string) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  };

  const loadTemplate = (t: typeof TEMPLATES[0]) => {
    setName(t.name);
    setConditions(t.conditions);
    setResults(null);
    setError(null);
  };

  const runScreen = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Screening failed');
      setResults(data.results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const hasEmptyValue = conditions.some(c => !c.value.trim());

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800" style={{ background: '#1A1A1D' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold gradient-text">Crypto Screener Pro</Link>
          <nav className="flex gap-6">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition">Dashboard</Link>
            <Link href="/screener" className="text-gray-400 hover:text-white transition">Screener</Link>
            <Link href="/formula/new" className="text-white font-semibold">Formula Builder</Link>
          </nav>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-1">Formula Builder</h1>
        <p className="text-gray-400 mb-8">Build conditions and run them against 300 live coins</p>
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-2">Quick templates:</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map(t => (
              <button key={t.name} onClick={() => loadTemplate(t)} className="btn btn-secondary text-sm px-3 py-1">{t.name}</button>
            ))}
          </div>
        </div>
        <div className="card p-5 mb-4">
          <label className="block text-sm text-gray-400 mb-1">Formula Name (optional)</label>
          <input type="text" placeholder="e.g. My Oversold Scanner" value={name} onChange={e => setName(e.target.value)} className="w-full" />
        </div>
        <div className="card p-5 mb-4">
          <h2 className="text-lg font-semibold mb-4">Conditions</h2>
          <div className="space-y-3">
            {conditions.map((c, i) => (
              <div key={c.id}>
                <div className="flex gap-2 items-center flex-wrap">
                  <select value={c.field} onChange={e => updateCondition(c.id, 'field', e.target.value)} className="flex-1" style={{ minWidth: 160 }}>
                    {INDICATORS.map(ind => <option key={ind.value} value={ind.value}>{ind.label}</option>)}
                  </select>
                  <select value={c.operator} onChange={e => updateCondition(c.id, 'operator', e.target.value)} className="w-20">
                    {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input type="number" placeholder="Value" value={c.value} onChange={e => updateCondition(c.id, 'value', e.target.value)} className="w-32" />
                  {conditions.length > 1 && (
                    <button onClick={() => removeCondition(c.id)} className="text-gray-500 hover:text-red-400 transition text-lg px-2">X</button>
                  )}
                </div>
                {i < conditions.length - 1 && (
                  <div className="flex items-center gap-2 my-2 ml-2">
                    <div className="flex-1 h-px bg-gray-700"></div>
                    <select value={c.logicalOperator} onChange={e => updateCondition(c.id, 'logicalOperator', e.target.value)} className="text-sm w-20" style={{ background: '#26262A' }}>
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                    <div className="flex-1 h-px bg-gray-700"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addCondition} className="btn btn-secondary w-full mt-4 text-sm">+ Add Condition</button>
        </div>
        <div className="card p-4 mb-4" style={{ background: '#1e1e22' }}>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Preview: </span>
          <span className="font-mono text-sm">
            {conditions.map((c, i) => {
              const ind = INDICATORS.find(x => x.value === c.field);
              const op = OPERATORS.find(x => x.value === c.operator);
              return (
                <span key={c.id}>
                  <span style={{ color: '#667eea' }}>{ind?.label}</span>{' '}
                  <span style={{ color: '#a78bfa' }}>{op?.label}</span>{' '}
                  <span style={{ color: '#34d399' }}>{c.value || '___'}</span>
                  {i < conditions.length - 1 && <span className="text-gray-500"> {c.logicalOperator} </span>}
                </span>
              );
            })}
          </span>
        </div>
        <button onClick={runScreen} disabled={loading || hasEmptyValue} className="btn btn-primary w-full text-lg py-3 mb-6" style={{ opacity: (loading || hasEmptyValue) ? 0.5 : 1 }}>
          {loading ? 'Screening live coins...' : hasEmptyValue ? 'Fill in all values to run' : '▶ Run Screen Against Live Data'}
        </button>
        {error && (
          <div className="card p-4 mb-6" style={{ background: '#3b1c1c', border: '1px solid #ef4444' }}>
            <p className="text-red-400">{error}</p>
          </div>
        )}
        {results !== null && (
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{results.length > 0 ? `${results.length} coins matched` : 'No coins matched'}</h3>
              <span className="text-xs text-gray-500">Live data · just now</span>
            </div>
            {results.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Try adjusting your conditions — no coins matched this criteria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full">
                  <thead>
                    <tr>
                      <th className="text-left">#</th>
                      <th className="text-left">Coin</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">24h %</th>
                      <th className="text-right">Volume</th>
                      <th className="text-right">Mkt Cap</th>
                      <th className="text-right">RSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((coin) => {
                      const rsi = coin.rsi_14 ?? 50;
                      const change = coin.price_change_percentage_24h;
                      return (
                        <tr key={coin.id}>
                          <td className="text-gray-500 font-mono text-sm">{coin.market_cap_rank}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              {coin.image ? (
                                <img src={coin.image} alt={coin.name} width={24} height={24} className="rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#667eea33' }}>{coin.symbol[0]}</div>
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
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
