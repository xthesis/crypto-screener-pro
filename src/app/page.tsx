import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav-shell">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="logo">Screener Pro</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/screener">Screener</Link>
            <Link href="/formula/new">Formula Builder</Link>
          </div>
        </div>
      </nav>
      <div style={{ padding: '7rem 1.5rem 5rem', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(79,140,255,0.08) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' }}></div>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', background: 'rgba(79,140,255,0.1)', color: '#4f8cff', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.35rem 0.85rem', borderRadius: 20, border: '1px solid rgba(79,140,255,0.2)', marginBottom: '1.75rem' }}>
            Live · 300+ Coins · Auto-refresh
          </span>
          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.75rem)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#f0f2f5', marginBottom: '1.25rem' }}>
            Screen crypto<br /><span style={{ color: '#4f8cff' }}>the smart way</span>
          </h1>
          <p style={{ fontSize: '1.0625rem', color: '#8b9099', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 2.25rem' }}>
            Build custom screening formulas, run them against 300 live coins, and catch opportunities as they happen. No guesswork.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/screener" className="btn btn-primary" style={{ padding: '0.7rem 1.5rem', fontSize: '0.875rem' }}>Open Screener →</Link>
            <Link href="/formula/new" className="btn btn-ghost" style={{ padding: '0.7rem 1.5rem', fontSize: '0.875rem' }}>Build a Formula</Link>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem 5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {[
            { icon: '⚡', title: 'Live Data', desc: 'Prices refresh every 30 seconds from CoinGecko.' },
            { icon: '🎯', title: 'Custom Formulas', desc: 'Combine RSI, volume, price change into any rule.' },
            { icon: '📊', title: '300+ Coins', desc: 'Screen by market cap, technicals, and momentum.' },
            { icon: '🔔', title: 'Alerts (soon)', desc: 'Get notified when coins match your criteria.' },
          ].map(f => (
            <div key={f.title} className="card" style={{ padding: '1.5rem' }}>
              <div style={{ fontSize: '1.375rem', marginBottom: '0.6rem' }}>{f.icon}</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#f0f2f5', marginBottom: '0.35rem' }}>{f.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#8b9099', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1.75rem 1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: '#545b66' }}>© 2026 Crypto Screener Pro · Built for traders</p>
      </footer>
    </div>
  );
}
