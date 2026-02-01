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

function fmtPrice(v: number) {
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(8);
}
function fmtBig(v: number) {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  return '$' + v.toLocaleString();
}

const INDICATORS = [
  { value: 'price', label: 'Price ($)' },
  { value: 'market_cap', label: 'Market Cap' },
  { value: 'volume', label: 'Volume 24h' },
  { value: 'volume_ratio', label: 'Volume Ratio' },
  { value: 'change_24h', label: '24h Change %' },
  { value: 'change_7d', label: '7d Change %' },
  { value: 'change_30d', label: '30d Change %' },
  { value: 'rsi_14', label: 'RSI (14)' },
  { value: 'market_cap_rank', label: 'Mcap Rank' },
];

const OPERATORS = [
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_than_or_equal', label: '>=' },
  { value: 'less_than_or_equal', label: '<=' },
  { value: 'equals', label: '=' },
];

const TEMPLATES = [
  { name: 'Oversold Bounce', desc: 'RSI < 30', conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' }] },
  { name: 'Volume Surge', desc: 'Vol ratio > 1.5', conditions: [{ id: 1, field: 'volume_ratio', operator: 'greater_than', value: '1.5', logicalOperator: 'AND' }] },
  { name: 'Top Gainers', desc: '24h > 5%', conditions: [{ id: 1, field: 'change_24h', operator: 'greater_than', value: '5', logicalOperator: 'AND' }] },
  { name: 'Oversold + Spike', desc: 'RSI < 35 & Vol > 1.2', conditions: [{ id: 1, field: 'rsi_14', operator: 'less_than', value: '35', logicalOperator: 'AND' }, { id: 2, field: 'volume_ratio', operator: 'greater_than', value: '1.2', logicalOperator: 'AND' }] },
  { name: 'Mid Cap Momentum', desc: 'Mid cap + 24h > 3%', conditions: [{ id: 1, field: 'market_cap', operator: 'greater_than', value: '1000000000', logicalOperator: 'AND' }, { id: 2, field: 'market_cap', operator: 'less_than', value: '10000000000', logicalOperator: 'AND' }, { id: 3, field: 'change_24h', operator: 'greater_than', value: '3', logicalOperator: 'AND' }] },
];

export default function FormulaBuilder() {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' },
  ]);
  const [results, setResults] = useState<CoinResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCondition = () => setConditions(prev => [...prev, { id: Date.now(), field: 'rsi_14', operator: 'less_than', value: '', logicalOperator: 'AND' }]);
  const removeCondition = (id: number) => setConditions(prev => prev.filter(c => c.id !== id));
  const updateCondition = (id: number, key: string, val: string) => setConditions(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  const loadTemplate = (t: typeof TEMPLATES[0]) => { setConditions(t.conditions); setResults(null); setError(null); };

  const runScreen = async () => {
    setLoading(true); setError(null); setResults(null);
    try {
      const res = await fetch('/api/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResults(data.results);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const hasEmpty = conditions.some(c => !c.value.trim());

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/formula/new" className="active">Formula Builder</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell" style={{ maxWidth: 820 }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Formula Builder</h1>
          <p style={{ fontSize: '0.6875rem', color: '#545b66' }}>Build conditions and screen 300 live coins instantly</p>
        </div>

        {/* Templates */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.6875rem', color: '#545b66', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick start</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {TEMPLATES.map(t => (
              <button key={t.name} onClick={() => loadTemplate(t)} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Conditions */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b9099', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conditions</span>
            <span style={{ fontSize: '0.6625rem', color: '#545b66' }}>{conditions.length} rule{conditions.length > 1 ? 's' : ''}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {conditions.map((c, i) => (
              <div key={c.id}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={c.field} onChange={e => updateCondition(c.id, 'field', e.target.value)} style={{ flex: '1 1 140px', minWidth: 140 }}>
                    {INDICATORS.map(ind => <option key={ind.value} value={ind.value}>{ind.label}</option>)}
                  </select>
                  <select value={c.operator} onChange={e => updateCondition(c.id, 'operator', e.target.value)} style={{ width: 56 }}>
                    {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input type="number" placeholder="0" value={c.value} onChange={e => updateCondition(c.id, 'value', e.target.value)} style={{ width: 100 }} />
                  {conditions.length > 1 && (
                    <button onClick={() => removeCondition(c.id)} style={{ background: 'none', border: 'none', color: '#545b66', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.25rem', transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.target as HTMLButtonElement).style.color = '#ff4d4d'}
                      onMouseLeave={e => (e.target as HTMLButtonElement).style.color = '#545b66'}
                    >✕</button>
                  )}
                </div>
                {/* AND / OR connector */}
                {i < conditions.length - 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.4rem 0 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }}></div>
                    <select value={c.logicalOperator} onChange={e => updateCondition(c.id, 'logicalOperator', e.target.value)} style={{ width: 60, fontSize: '0.6875rem', padding: '0.25rem 0.4rem', textAlign: 'center' }}>
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }}></div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={addCondition} className="btn btn-ghost" style={{ width: '100%', marginTop: '0.85rem', fontSize: '0.72rem', padding: '0.4rem' }}>
            + Add Condition
          </button>
        </div>

        {/* Preview bar */}
        <div style={{ background: 'rgba(79,140,255,0.05)', border: '1px solid rgba(79,140,255,0.12)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', color: '#4f8cff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</span>
          <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {conditions.map((c, i) => {
              const ind = INDICATORS.find(x => x.value === c.field);
              const op = OPERATORS.find(x => x.value === c.operator);
              return (
                <span key={c.id}>
                  <span style={{ color: '#4f8cff' }}>{ind?.label}</span>
                  <span style={{ color: '#8b9099', margin: '0 0.25rem' }}>{op?.label}</span>
                  <span style={{ color: '#00c878' }}>{c.value || '___'}</span>
                  {i < conditions.length - 1 && <span style={{ color: '#545b66', margin: '0 0.4rem' }}>{c.logicalOperator}</span>}
                </span>
              );
            })}
          </span>
        </div>

        {/* Run button */}
        <button
          onClick={runScreen}
          disabled={loading || hasEmpty}
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.8125rem', opacity: (loading || hasEmpty) ? 0.4 : 1, marginBottom: '1.25rem' }}
        >
          {loading ? 'Screening…' : hasEmpty ? 'Fill in all values' : '▶ Run Screen Against Live Data'}
        </button>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#ff4d4d' }}>{error}</span>
          </div>
        )}

        {/* Results */}
        {results !== null && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {results.length > 0 ? <><span style={{ color: '#4f8cff' }}>{results.length}</span> coins matched</> : 'No coins matched'}
              </span>
              <span style={{ fontSize: '0.6625rem', color: '#545b66' }}>Live · just now</span>
            </div>
            {results.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#545b66', padding: '2.5rem 1rem', fontSize: '0.78rem' }}>Try loosening your conditions</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>#</th>
                      <th style={{ textAlign: 'left' }}>Coin</th>
                      <th style={{ textAlign: 'right' }}>Price</th>
                      <th style={{ textAlign: 'right' }}>24h</th>
                      <th style={{ textAlign: 'right' }}>Volume</th>
                      <th style={{ textAlign: 'right' }}>Mkt Cap</th>
                      <th style={{ textAlign: 'right' }}>RSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(coin => {
                      const rsi = coin.rsi_14 ?? 50;
                      const chg = coin.price_change_percentage_24h;
                      return (
                        <tr key={coin.id}>
                          <td style={{ color: '#545b66', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>{coin.market_cap_rank}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              {coin.image ? (
                                <img src={coin.image} alt={coin.name} width={24} height={24} style={{ borderRadius: '50%' }} />
                              ) : (
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(79,140,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#4f8cff' }}>
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
