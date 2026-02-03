'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PatternSignal {
  base: string;
  exchange: string;
  price: number;
  volume_24h: number;
  change_24h: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  bullish_score: number;
  bearish_score: number;
  patterns: string;
  pattern_count: number;
  pattern_details: string;
  scanned_at: string;
}

function fmtPrice(v: number) {
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(8);
}

function fmtBig(v: number) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

const signalColor = (s: string) => s === 'bullish' ? '#00c878' : s === 'bearish' ? '#ff4d4d' : '#f5a623';
const strengthBg = (s: string) => s === 'strong' ? 0.15 : s === 'moderate' ? 0.1 : 0.06;

export default function PatternScanner() {
  const [signals, setSignals] = useState<PatternSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'moderate'>('all');
  const [sortField, setSortField] = useState<string>('bullish_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [scanTime, setScanTime] = useState<string>('');

  useEffect(() => {
    fetchPatterns();
  }, []);

  const fetchPatterns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/patterns?limit=500');
      if (!res.ok) throw new Error('Failed to fetch patterns');
      const data = await res.json();
      setSignals(data.signals || []);
      if (data.generatedAt) {
        setScanTime(new Date(data.generatedAt).toLocaleString());
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter
  let filtered = signals;
  if (filter !== 'all') filtered = filtered.filter(s => s.signal === filter);
  if (strengthFilter !== 'all') filtered = filtered.filter(s => s.strength === strengthFilter);

  // Sort
  filtered.sort((a, b) => {
    let vA: number, vB: number;
    switch (sortField) {
      case 'bullish_score': vA = a.bullish_score; vB = b.bullish_score; break;
      case 'bearish_score': vA = a.bearish_score; vB = b.bearish_score; break;
      case 'pattern_count': vA = a.pattern_count; vB = b.pattern_count; break;
      case 'volume_24h': vA = a.volume_24h; vB = b.volume_24h; break;
      case 'change_24h': vA = a.change_24h; vB = b.change_24h; break;
      case 'price': vA = a.price; vB = b.price; break;
      default: vA = a.bullish_score; vB = b.bullish_score;
    }
    return sortDir === 'asc' ? vA - vB : vB - vA;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: string }) => (
    <span style={{ opacity: sortField === field ? 1 : 0.25, color: sortField === field ? '#4f8cff' : 'inherit', marginLeft: 4, fontSize: '0.6rem' }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  // Stats
  const bullishCount = signals.filter(s => s.signal === 'bullish').length;
  const bearishCount = signals.filter(s => s.signal === 'bearish').length;
  const strongCount = signals.filter(s => s.strength === 'strong').length;
  const strongBullish = signals.filter(s => s.signal === 'bullish' && s.strength === 'strong').length;
  const strongBearish = signals.filter(s => s.signal === 'bearish' && s.strength === 'strong').length;

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/patterns" className="active">Pattern Scanner</Link>
            <Link href="/formula/new">Formula Builder</Link>
          </div>
        </div>
      </nav>

      <div className="page-shell" style={{ maxWidth: 1300 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>🔍 AI Pattern Scanner</h1>
            <span style={{
              fontSize: '0.55rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: 4,
              background: 'rgba(168,85,247,0.15)', color: '#a855f7', letterSpacing: '0.04em',
            }}>BETA</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#545b66' }}>
            {loading ? 'Loading patterns...' : `${signals.length} coins with active patterns · Last scan: ${scanTime || 'N/A'}`}
          </p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Total Signals', value: signals.length, color: '#f0f2f5' },
            { label: 'Bullish', value: bullishCount, color: '#00c878' },
            { label: 'Bearish', value: bearishCount, color: '#ff4d4d' },
            { label: 'Strong Signals', value: strongCount, color: '#4f8cff' },
            { label: 'Strong Bullish', value: strongBullish, color: '#00c878' },
            { label: 'Strong Bearish', value: strongBearish, color: '#ff4d4d' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="label">{s.label}</div>
              <div className="value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: '#545b66', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signal:</span>
          {(['all', 'bullish', 'bearish'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '0.3rem 0.65rem', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                background: filter === f ? (f === 'bullish' ? 'rgba(0,200,120,0.15)' : f === 'bearish' ? 'rgba(255,77,77,0.15)' : 'rgba(79,140,255,0.15)') : 'rgba(255,255,255,0.04)',
                color: filter === f ? (f === 'bullish' ? '#00c878' : f === 'bearish' ? '#ff4d4d' : '#4f8cff') : '#8b9099',
                border: `1px solid ${filter === f ? 'rgba(79,140,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{f}</button>
          ))}

          <span style={{ fontSize: '0.65rem', color: '#545b66', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '0.5rem' }}>Strength:</span>
          {(['all', 'strong', 'moderate'] as const).map(f => (
            <button key={f} onClick={() => setStrengthFilter(f)}
              style={{
                padding: '0.3rem 0.65rem', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                background: strengthFilter === f ? 'rgba(79,140,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: strengthFilter === f ? '#4f8cff' : '#8b9099',
                border: `1px solid ${strengthFilter === f ? 'rgba(79,140,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{f}</button>
          ))}

          <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#545b66' }}>
            Showing {filtered.length} of {signals.length}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#ff4d4d' }}>{error}</span>
          </div>
        )}

        {/* Results Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#545b66', fontSize: '0.8rem' }}>Loading pattern data...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#545b66', fontSize: '0.8rem' }}>
              No patterns found. Run the scanner first: <code style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.4rem', borderRadius: 4 }}>node scan-patterns.js</code>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Symbol</th>
                    <th style={{ textAlign: 'center' }}>Signal</th>
                    <th style={{ textAlign: 'center' }}>Strength</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('bullish_score')}>
                      Bull Score<SortIcon field="bullish_score" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('bearish_score')}>
                      Bear Score<SortIcon field="bearish_score" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('pattern_count')}>
                      Patterns<SortIcon field="pattern_count" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('price')}>
                      Price<SortIcon field="price" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('change_24h')}>
                      24h<SortIcon field="change_24h" />
                    </th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('volume_24h')}>
                      Volume<SortIcon field="volume_24h" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const isExpanded = expandedRow === s.base;
                    const patternList: { pattern: string; type: string; weight: number }[] = (() => {
                      try { return JSON.parse(s.pattern_details); } catch { return []; }
                    })();

                    return (
                      <tr key={s.base} onClick={() => setExpandedRow(isExpanded ? null : s.base)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: '#f0f2f5' }}>
                            {s.base}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: '#545b66', textTransform: 'capitalize' }}>{s.exchange}</div>
                          {isExpanded && patternList.length > 0 && (
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {patternList.map((p, i) => (
                                <span key={i} style={{
                                  fontSize: '0.6rem', padding: '0.2rem 0.45rem', borderRadius: 4,
                                  background: `rgba(${p.type === 'bullish' ? '0,200,120' : p.type === 'bearish' ? '255,77,77' : '245,158,35'},0.1)`,
                                  color: p.type === 'bullish' ? '#00c878' : p.type === 'bearish' ? '#ff4d4d' : '#f5a623',
                                  fontWeight: 600,
                                }}>
                                  {p.pattern} ({p.weight})
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
                            background: `rgba(${s.signal === 'bullish' ? '0,200,120' : s.signal === 'bearish' ? '255,77,77' : '245,158,35'},${strengthBg(s.strength)})`,
                            color: signalColor(s.signal),
                            textTransform: 'uppercase',
                          }}>
                            {s.signal === 'bullish' ? '📈' : s.signal === 'bearish' ? '📉' : '➡️'} {s.signal}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 600,
                            color: s.strength === 'strong' ? '#4f8cff' : s.strength === 'moderate' ? '#8b9099' : '#545b66',
                            textTransform: 'uppercase',
                          }}>
                            {s.strength === 'strong' ? '🔥' : s.strength === 'moderate' ? '⚡' : '·'} {s.strength}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#00c878', fontWeight: 600 }}>
                          {s.bullish_score}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#ff4d4d', fontWeight: 600 }}>
                          {s.bearish_score}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#8b9099' }}>
                          {s.pattern_count}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#f0f2f5' }}>
                          {fmtPrice(s.price)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 600,
                            padding: '0.2rem 0.45rem', borderRadius: 4,
                            background: s.change_24h >= 0 ? 'rgba(0,200,120,0.1)' : 'rgba(255,77,77,0.1)',
                            color: s.change_24h >= 0 ? '#00c878' : '#ff4d4d',
                          }}>
                            {s.change_24h >= 0 ? '+' : ''}{s.change_24h?.toFixed(2) || '0.00'}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#8b9099' }}>
                          {fmtBig(s.volume_24h)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer legend */}
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '0.65rem', color: '#545b66', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>📈 Click a row to see all detected patterns</span>
            <span>🔥 Strong = score ≥ 6 · ⚡ Moderate = score ≥ 3</span>
            <span>Patterns: Candlesticks + MA Crossovers + Volume Spikes + RSI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
