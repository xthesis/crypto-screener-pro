'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fetchAllExchanges, ExchangeName } from '@/lib/exchanges/client-fetcher';

const SUPABASE_URL = 'https://mzuocbdocvhpffytsvaw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dW9jYmRvY3ZocGZmeXRzdmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTc0OTYsImV4cCI6MjA4NTYzMzQ5Nn0.boaEi1_VmDW6NWC998NwJpEvAY899pLIlFTbr0dHgIc';

const ALL_EXCHANGES: ExchangeName[] = ['binance', 'bybit', 'okx', 'gateio', 'hyperliquid'];

interface Condition {
  id: number;
  fieldA: string;
  operator: string;
  fieldB: string;
  value: string;
  logicalOperator: string;
}

interface CoinResult {
  base: string;
  exchange: string;
  price: number;
  volume_24h: number;
  change_24h: number;
  ma_20: number | null;
  ma_50: number | null;
  ma_200: number | null;
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
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

function fmtMA(v: number | null) {
  if (v === null) return '—';
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(8);
}

// Field definitions
const FIELDS = [
  { value: 'price', label: 'Price', type: 'number' },
  { value: 'change_24h', label: '24h Change %', type: 'number' },
  { value: 'volume_24h', label: 'Volume 24h', type: 'number' },
  { value: 'ma_20', label: '20 MA (1D)', type: 'indicator' },
  { value: 'ma_50', label: '50 MA (1D)', type: 'indicator' },
  { value: 'ma_200', label: '200 MA (1D)', type: 'indicator' },
];

// Compare-to options (field vs field or field vs value)
const COMPARE_TARGETS = [
  { value: '_value', label: 'Value (enter number)' },
  { value: 'price', label: 'Price' },
  { value: 'ma_20', label: '20 MA' },
  { value: 'ma_50', label: '50 MA' },
  { value: 'ma_200', label: '200 MA' },
];

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
];

const TEMPLATES = [
  {
    name: 'Golden Cross',
    desc: 'Price > 20MA > 50MA > 200MA',
    conditions: [
      { id: 1, fieldA: 'price', operator: '>', fieldB: 'ma_20', value: '', logicalOperator: 'AND' },
      { id: 2, fieldA: 'ma_20', operator: '>', fieldB: 'ma_50', value: '', logicalOperator: 'AND' },
      { id: 3, fieldA: 'ma_50', operator: '>', fieldB: 'ma_200', value: '', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'Death Cross',
    desc: 'Price < 20MA < 50MA < 200MA',
    conditions: [
      { id: 1, fieldA: 'price', operator: '<', fieldB: 'ma_20', value: '', logicalOperator: 'AND' },
      { id: 2, fieldA: 'ma_20', operator: '<', fieldB: 'ma_50', value: '', logicalOperator: 'AND' },
      { id: 3, fieldA: 'ma_50', operator: '<', fieldB: 'ma_200', value: '', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'Price Above All MAs',
    desc: 'Price > 20MA, 50MA, 200MA',
    conditions: [
      { id: 1, fieldA: 'price', operator: '>', fieldB: 'ma_20', value: '', logicalOperator: 'AND' },
      { id: 2, fieldA: 'price', operator: '>', fieldB: 'ma_50', value: '', logicalOperator: 'AND' },
      { id: 3, fieldA: 'price', operator: '>', fieldB: 'ma_200', value: '', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'Bullish + Gainer',
    desc: 'Price > 50MA & 24h > 5%',
    conditions: [
      { id: 1, fieldA: 'price', operator: '>', fieldB: 'ma_50', value: '', logicalOperator: 'AND' },
      { id: 2, fieldA: 'change_24h', operator: '>', fieldB: '_value', value: '5', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'MA Squeeze',
    desc: '20MA near 50MA (potential breakout)',
    conditions: [
      { id: 1, fieldA: 'price', operator: '>', fieldB: 'ma_20', value: '', logicalOperator: 'AND' },
      { id: 2, fieldA: 'ma_20', operator: '>=', fieldB: 'ma_50', value: '', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'Below 200MA Oversold',
    desc: 'Price below 200MA (potential reversal)',
    conditions: [
      { id: 1, fieldA: 'price', operator: '<', fieldB: 'ma_200', value: '', logicalOperator: 'AND' },
      { id: 2, fieldA: 'change_24h', operator: '<', fieldB: '_value', value: '-5', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'Top Gainers',
    desc: '24h > 10%',
    conditions: [
      { id: 1, fieldA: 'change_24h', operator: '>', fieldB: '_value', value: '10', logicalOperator: 'AND' },
    ],
  },
  {
    name: 'High Volume Breakout',
    desc: 'Vol > $10M & Price > 200MA',
    conditions: [
      { id: 1, fieldA: 'volume_24h', operator: '>', fieldB: '_value', value: '10000000', logicalOperator: 'AND' },
      { id: 2, fieldA: 'price', operator: '>', fieldB: 'ma_200', value: '', logicalOperator: 'AND' },
    ],
  },
];

function getCoinFieldValue(coin: CoinResult, field: string): number | null {
  switch (field) {
    case 'price': return coin.price;
    case 'change_24h': return coin.change_24h;
    case 'volume_24h': return coin.volume_24h;
    case 'ma_20': return coin.ma_20;
    case 'ma_50': return coin.ma_50;
    case 'ma_200': return coin.ma_200;
    default: return null;
  }
}

function evaluateCoin(coin: CoinResult, conditions: Condition[]): boolean {
  if (conditions.length === 0) return true;

  let result = evalSingle(coin, conditions[0]);
  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i];
    const val = evalSingle(coin, cond);
    if (cond.logicalOperator === 'OR') {
      result = result || val;
    } else {
      result = result && val;
    }
  }
  return result;
}

function evalSingle(coin: CoinResult, cond: Condition): boolean {
  const leftVal = getCoinFieldValue(coin, cond.fieldA);
  if (leftVal === null) return false;

  let rightVal: number;
  if (cond.fieldB === '_value') {
    rightVal = parseFloat(cond.value);
    if (isNaN(rightVal)) return false;
  } else {
    const rv = getCoinFieldValue(coin, cond.fieldB);
    if (rv === null) return false;
    rightVal = rv;
  }

  switch (cond.operator) {
    case '>': return leftVal > rightVal;
    case '<': return leftVal < rightVal;
    case '>=': return leftVal >= rightVal;
    case '<=': return leftVal <= rightVal;
    default: return false;
  }
}

export default function FormulaBuilder() {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: 1, fieldA: 'price', operator: '>', fieldB: 'ma_20', value: '', logicalOperator: 'AND' },
  ]);
  const [results, setResults] = useState<CoinResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('volume_24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const addCondition = () => setConditions(prev => [...prev, { id: Date.now(), fieldA: 'price', operator: '>', fieldB: 'ma_50', value: '', logicalOperator: 'AND' }]);
  const removeCondition = (id: number) => setConditions(prev => prev.filter(c => c.id !== id));
  const updateCondition = (id: number, key: string, val: string) => setConditions(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  const loadTemplate = (t: typeof TEMPLATES[0]) => { setConditions(t.conditions); setResults(null); setError(null); };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const runScreen = async () => {
    setLoading(true); setError(null); setResults(null);
    try {
      // Fetch LIVE prices from all exchanges
      const tickers = await fetchAllExchanges(ALL_EXCHANGES);

      // Fetch MA data from Supabase
      const maRes = await fetch(
        `${SUPABASE_URL}/rest/v1/coins?select=base,ma_20,ma_50,ma_200`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          }
        }
      );
      const maData: { base: string; ma_20: number | null; ma_50: number | null; ma_200: number | null }[] = maRes.ok ? await maRes.json() : [];

      // Build MA lookup (use first match per base)
      const maMap = new Map<string, { ma_20: number | null; ma_50: number | null; ma_200: number | null }>();
      for (const m of maData) {
        if (!maMap.has(m.base)) maMap.set(m.base, { ma_20: m.ma_20, ma_50: m.ma_50, ma_200: m.ma_200 });
      }

      // Aggregate tickers by base (keep best volume per exchange, deduplicate)
      const coinMap = new Map<string, CoinResult>();
      for (const t of tickers) {
        const key = `${t.base}-${t.exchange}`;
        const ma = maMap.get(t.base);
        const coin: CoinResult = {
          base: t.base,
          exchange: t.exchange,
          price: t.price,
          volume_24h: t.volume24h,
          change_24h: t.priceChangePercent24h,
          ma_20: ma?.ma_20 ?? null,
          ma_50: ma?.ma_50 ?? null,
          ma_200: ma?.ma_200 ?? null,
        };
        const existing = coinMap.get(key);
        if (!existing || coin.volume_24h > existing.volume_24h) {
          coinMap.set(key, coin);
        }
      }
      const allCoins = Array.from(coinMap.values());

      // Filter using conditions
      const matched = allCoins.filter(coin => evaluateCoin(coin, conditions));
      setResults(matched);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const hasEmpty = conditions.some(c => c.fieldB === '_value' && !c.value.trim());

  // Sort results
  let sortedResults = results ? [...results] : null;
  if (sortedResults) {
    sortedResults.sort((a, b) => {
      const vA = getCoinFieldValue(a, sortField) ?? -Infinity;
      const vB = getCoinFieldValue(b, sortField) ?? -Infinity;
      return sortDir === 'asc' ? vA - vB : vB - vA;
    });
  }

  const SortIcon = ({ field }: { field: string }) => (
    <span style={{ opacity: sortField === field ? 1 : 0.25, color: sortField === field ? '#4f8cff' : 'inherit', marginLeft: 4, fontSize: '0.6rem' }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  function getFieldLabel(val: string) {
    return FIELDS.find(f => f.value === val)?.label || COMPARE_TARGETS.find(f => f.value === val)?.label || val;
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/patterns">Pattern Scanner</Link>
            <Link href="/formula/new" className="active">Formula Builder</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell" style={{ maxWidth: 920 }}>
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Formula Builder</h1>
          <p style={{ fontSize: '0.6875rem', color: '#545b66' }}>Build custom screens with live prices + MA indicators across all exchanges</p>
        </div>

        {/* Templates */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.6875rem', color: '#545b66', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick templates</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {TEMPLATES.map(t => (
              <button key={t.name} onClick={() => loadTemplate(t)} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                title={t.desc}>
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
                  {/* Left field */}
                  <select value={c.fieldA} onChange={e => updateCondition(c.id, 'fieldA', e.target.value)} style={{ flex: '1 1 130px', minWidth: 130 }}>
                    {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  {/* Operator */}
                  <select value={c.operator} onChange={e => updateCondition(c.id, 'operator', e.target.value)} style={{ width: 56 }}>
                    {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  {/* Right field or value */}
                  <select value={c.fieldB} onChange={e => updateCondition(c.id, 'fieldB', e.target.value)} style={{ flex: '1 1 130px', minWidth: 130 }}>
                    {COMPARE_TARGETS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  {/* Numeric value input (only when comparing to value) */}
                  {c.fieldB === '_value' && (
                    <input type="number" placeholder="0" value={c.value} onChange={e => updateCondition(c.id, 'value', e.target.value)} style={{ width: 110 }} />
                  )}
                  {conditions.length > 1 && (
                    <button onClick={() => removeCondition(c.id)} style={{ background: 'none', border: 'none', color: '#545b66', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.25rem', transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.target as HTMLButtonElement).style.color = '#ff4d4d'}
                      onMouseLeave={e => (e.target as HTMLButtonElement).style.color = '#545b66'}
                    >✕</button>
                  )}
                </div>
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

        {/* Preview */}
        <div style={{ background: 'rgba(79,140,255,0.05)', border: '1px solid rgba(79,140,255,0.12)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', color: '#4f8cff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</span>
          <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {conditions.map((c, i) => (
              <span key={c.id}>
                <span style={{ color: '#f5a623' }}>{getFieldLabel(c.fieldA)}</span>
                <span style={{ color: '#8b9099', margin: '0 0.25rem' }}>{c.operator}</span>
                {c.fieldB === '_value' ? (
                  <span style={{ color: '#00c878' }}>{c.value || '___'}</span>
                ) : (
                  <span style={{ color: '#a855f7' }}>{getFieldLabel(c.fieldB)}</span>
                )}
                {i < conditions.length - 1 && <span style={{ color: '#545b66', margin: '0 0.4rem' }}>{c.logicalOperator}</span>}
              </span>
            ))}
          </span>
        </div>

        {/* Run */}
        <button
          onClick={runScreen}
          disabled={loading || hasEmpty}
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.8125rem', opacity: (loading || hasEmpty) ? 0.4 : 1, marginBottom: '1.25rem' }}
        >
          {loading ? 'Screening…' : hasEmpty ? 'Fill in all values' : '▶ Run Screen (Live Prices + MAs)'}
        </button>

        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#ff4d4d' }}>{error}</span>
          </div>
        )}

        {/* Results */}
        {sortedResults !== null && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {sortedResults.length > 0 ? <><span style={{ color: '#4f8cff' }}>{sortedResults.length}</span> coins matched</> : 'No coins matched'}
              </span>
              <span style={{ fontSize: '0.6625rem', color: '#545b66' }}>Live prices · 1D MAs</span>
            </div>
            {sortedResults.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#545b66', padding: '2.5rem 1rem', fontSize: '0.78rem' }}>No coins match. Try loosening your conditions.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Symbol</th>
                      <th style={{ textAlign: 'left' }}>Exchange</th>
                      <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('price')}>
                        Price<SortIcon field="price" />
                      </th>
                      <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('change_24h')}>
                        24h<SortIcon field="change_24h" />
                      </th>
                      <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('volume_24h')}>
                        Volume<SortIcon field="volume_24h" />
                      </th>
                      <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: '#f5a623' }} onClick={() => handleSort('ma_20')}>
                        20 MA<SortIcon field="ma_20" />
                      </th>
                      <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: '#4f8cff' }} onClick={() => handleSort('ma_50')}>
                        50 MA<SortIcon field="ma_50" />
                      </th>
                      <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: '#a855f7' }} onClick={() => handleSort('ma_200')}>
                        200 MA<SortIcon field="ma_200" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map(coin => {
                      const chg = coin.change_24h ?? 0;
                      return (
                        <tr key={coin.base + '-' + coin.exchange}>
                          <td>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: '#f0f2f5' }}>
                              {coin.base}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.7rem', color: '#8b9099', textTransform: 'capitalize' }}>{coin.exchange}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#f0f2f5' }}>
                            {fmtPrice(coin.price)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.45rem', borderRadius: 4, background: chg >= 0 ? 'rgba(0,200,120,0.1)' : 'rgba(255,77,77,0.1)', color: chg >= 0 ? '#00c878' : '#ff4d4d' }}>
                              {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#8b9099' }}>
                            {fmtBig(coin.volume_24h)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: coin.ma_20 && coin.price > coin.ma_20 ? '#00c878' : '#ff4d4d' }}>
                            {fmtMA(coin.ma_20)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: coin.ma_50 && coin.price > coin.ma_50 ? '#00c878' : '#ff4d4d' }}>
                            {fmtMA(coin.ma_50)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: coin.ma_200 && coin.price > coin.ma_200 ? '#00c878' : '#ff4d4d' }}>
                            {fmtMA(coin.ma_200)}
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

        {/* Footer */}
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '0.65rem', color: '#545b66', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>📊 MA data: Daily (1D) timeframe</span>
            <span style={{ color: '#f5a623' }}>● 20 MA</span>
            <span style={{ color: '#4f8cff' }}>● 50 MA</span>
            <span style={{ color: '#a855f7' }}>● 200 MA</span>
            <span>🟢 Price above MA · 🔴 Price below MA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
