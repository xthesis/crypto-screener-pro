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

interface AISummaryData {
  summary: string;
  stats: {
    totalCoins: number;
    gainers: number;
    losers: number;
    bigGainers: number;
    bigLosers: number;
    avgChange: string;
    aboveMA20: number;
    aboveMA50: number;
    aboveMA200: number;
    goldenCross: number;
    deathCross: number;
    maCoinsCount: number;
    btcPrice: number;
    btcChange: number;
    ethPrice: number;
    ethChange: number;
    solPrice: number;
    solChange: number;
  };
  generatedAt: string;
}

const SAVED_FORMULAS = [
  { id: '1', name: 'Top Gainers', description: '24h change > 5%', filter: (c: Coin) => c.price_change_percentage_24h > 5 },
  { id: '2', name: 'Top Losers', description: '24h change < -5%', filter: (c: Coin) => c.price_change_percentage_24h < -5 },
  { id: '3', name: 'High Volume', description: 'Volume > $1M', filter: (c: Coin) => c.total_volume > 1000000 },
];

const ALL_EXCHANGES: ExchangeName[] = ['binance', 'bybit', 'okx', 'gateio', 'hyperliquid'];

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

function fmtPrice(v: number) {
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(2);
  return '$' + v.toFixed(4);
}

// Parse the AI summary into sections
function parseSummary(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  // Match **TITLE** pattern or numbered headers
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^\d*\.?\s*\*\*(.+?)\*\*\s*[-–:]?\s*(.*)/);
    if (headerMatch) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join(' ').trim() });
      }
      currentTitle = headerMatch[1].trim();
      currentContent = headerMatch[2] ? [headerMatch[2].trim()] : [];
    } else if (line.trim()) {
      currentContent.push(line.trim());
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join(' ').trim() });
  }

  // If parsing failed, return as single block
  if (sections.length === 0 && text.trim()) {
    sections.push({ title: 'Market Summary', content: text.trim() });
  }

  return sections;
}

function getSentimentIcon(title: string) {
  const t = title.toUpperCase();
  if (t.includes('PULSE') || t.includes('SENTIMENT')) return '🎯';
  if (t.includes('MOVE') || t.includes('KEY')) return '📊';
  if (t.includes('MA') || t.includes('AVERAGE') || t.includes('STRUCTURE')) return '📈';
  if (t.includes('SIGNAL') || t.includes('NOTABLE') || t.includes('WATCH')) return '🔍';
  if (t.includes('RISK')) return '⚠️';
  return '📋';
}

function getRiskColor(content: string) {
  const lower = content.toLowerCase();
  if (lower.includes('high')) return '#ff4d4d';
  if (lower.includes('low')) return '#00c878';
  return '#f5a623';
}

export default function Dashboard() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [formulaResults, setFormulaResults] = useState<Record<string, Coin[]>>({});
  const [runningFormula, setRunningFormula] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<AISummaryData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(false);

  const fetchCoins = useCallback(async () => {
    try {
      const tickers = await fetchAllExchanges(ALL_EXCHANGES);
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

  const fetchAISummary = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai-summary');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch AI summary');
      }
      const data = await res.json();
      setAiSummary(data);
      setAiExpanded(true);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
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
    } catch (e) { console.error(e); }
    finally { setRunningFormula(null); }
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

  const summaryTime = aiSummary?.generatedAt
    ? new Date(aiSummary.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const sections = aiSummary ? parseSummary(aiSummary.summary) : [];

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

        {/* ═══════════════ AI MARKET SUMMARY (Collapsible) ═══════════════ */}
        <div style={{
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, rgba(79,140,255,0.06) 0%, rgba(168,85,247,0.06) 100%)',
          border: '1px solid rgba(79,140,255,0.15)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {/* Header bar - always visible, clickable to expand/collapse */}
          <div
            onClick={() => aiSummary && setAiExpanded(e => !e)}
            style={{
              padding: '0.7rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(79,140,255,0.03)',
              cursor: aiSummary ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1rem' }}>🤖</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f0f2f5', letterSpacing: '-0.01em' }}>AI Market Summary</span>
              <span style={{
                fontSize: '0.55rem',
                fontWeight: 600,
                padding: '0.15rem 0.4rem',
                borderRadius: 4,
                background: 'rgba(79,140,255,0.15)',
                color: '#4f8cff',
                letterSpacing: '0.04em',
              }}>POWERED BY CLAUDE</span>
              {aiSummary && (
                <span style={{ fontSize: '0.65rem', color: '#545b66', marginLeft: '0.25rem' }}>
                  {aiExpanded ? '▼' : '▶'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {summaryTime && (
                <span style={{ fontSize: '0.625rem', color: '#545b66' }}>Generated {summaryTime}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); fetchAISummary(); }}
                disabled={aiLoading}
                style={{
                  background: 'rgba(79,140,255,0.1)',
                  border: '1px solid rgba(79,140,255,0.2)',
                  borderRadius: 6,
                  color: '#4f8cff',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.3rem 0.6rem',
                  cursor: aiLoading ? 'wait' : 'pointer',
                  opacity: aiLoading ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {aiLoading ? '⟳ Analyzing...' : aiSummary ? '↻ Refresh' : '▶ Generate Summary'}
              </button>
            </div>
          </div>

          {/* Expandable content */}
          {aiLoading && !aiSummary && (
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '2px solid rgba(79,140,255,0.2)',
                borderTopColor: '#4f8cff',
                animation: 'spin 1s linear infinite',
              }}></div>
              <span style={{ fontSize: '0.72rem', color: '#8b9099' }}>AI is analyzing {'>'}1400 coins across 5 exchanges...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {aiError && (
            <div style={{ padding: '0.85rem 1.25rem' }}>
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255,77,77,0.06)',
                border: '1px solid rgba(255,77,77,0.15)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: '0.72rem', color: '#ff4d4d' }}>⚠ {aiError}</span>
              </div>
            </div>
          )}

          {aiSummary && aiExpanded && (
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(79,140,255,0.1)' }}>
              {/* Quick stats bar */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}>
                {[
                  { label: 'BTC', value: fmtPrice(aiSummary.stats.btcPrice), change: aiSummary.stats.btcChange },
                  { label: 'ETH', value: fmtPrice(aiSummary.stats.ethPrice), change: aiSummary.stats.ethChange },
                  { label: 'SOL', value: fmtPrice(aiSummary.stats.solPrice), change: aiSummary.stats.solChange },
                  { label: 'Above 20MA', value: `${((aiSummary.stats.aboveMA20 / aiSummary.stats.maCoinsCount) * 100).toFixed(0)}%`, change: null },
                  { label: 'Golden Cross', value: String(aiSummary.stats.goldenCross), change: null },
                  { label: 'Death Cross', value: String(aiSummary.stats.deathCross), change: null },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '0.5rem',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.5rem', color: '#545b66', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f0f2f5', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
                    {s.change !== null && (
                      <div style={{
                        fontSize: '0.6rem', fontWeight: 600, marginTop: '0.1rem',
                        color: s.change >= 0 ? '#00c878' : '#ff4d4d',
                      }}>
                        {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* AI Analysis sections */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {sections.map((section, idx) => {
                  const isRisk = section.title.toUpperCase().includes('RISK');
                  return (
                    <div key={idx} style={{
                      padding: '0.7rem 0.85rem',
                      borderRadius: 8,
                      background: isRisk
                        ? `rgba(${getRiskColor(section.content) === '#ff4d4d' ? '255,77,77' : getRiskColor(section.content) === '#00c878' ? '0,200,120' : '245,158,35'},0.04)`
                        : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isRisk
                        ? `rgba(${getRiskColor(section.content) === '#ff4d4d' ? '255,77,77' : getRiskColor(section.content) === '#00c878' ? '0,200,120' : '245,158,35'},0.15)`
                        : 'rgba(255,255,255,0.04)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem' }}>{getSentimentIcon(section.title)}</span>
                        <span style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          color: isRisk ? getRiskColor(section.content) : '#8b9099',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}>{section.title}</span>
                      </div>
                      <p style={{
                        fontSize: '0.75rem',
                        color: '#c8ccd2',
                        lineHeight: 1.5,
                        margin: 0,
                      }}>{section.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

        {/* 4 panels */}
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
