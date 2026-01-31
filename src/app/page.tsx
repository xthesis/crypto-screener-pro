import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-6xl font-bold mb-6">
              <span className="gradient-text">Crypto Screener Pro</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Build custom formulas, screen 300+ cryptocurrencies, and get instant Telegram alerts when opportunities arise.
            </p>
            
            <div className="flex gap-4 justify-center mb-12">
              <Link href="/dashboard" className="btn btn-primary text-lg">
                Get Started Free →
              </Link>
              <Link href="/screener" className="btn btn-secondary text-lg">
                View Screener
              </Link>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
              <div className="card p-6">
                <div className="text-3xl mb-2">🗄️</div>
                <h3 className="font-semibold mb-2">Database</h3>
                <p className="text-green-500 font-mono">✅ Connected</p>
              </div>
              
              <div className="card p-6">
                <div className="text-3xl mb-2">🔌</div>
                <h3 className="font-semibold mb-2">APIs</h3>
                <p className="text-green-500 font-mono">✅ Ready</p>
              </div>
              
              <div className="card p-6">
                <div className="text-3xl mb-2">📊</div>
                <h3 className="font-semibold mb-2">Data</h3>
                <p className="text-green-500 font-mono">✅ Real-time</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <h2 className="text-4xl font-bold text-center mb-16">
          Everything You Need
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="card p-8">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-3">Custom Formulas</h3>
            <p className="text-gray-400">
              Build any screening formula with 20+ technical indicators. No coding required.
            </p>
          </div>
          
          <div className="card p-8">
            <div className="text-4xl mb-4">📱</div>
            <h3 className="text-xl font-semibold mb-3">Telegram Alerts</h3>
            <p className="text-gray-400">
              Get instant notifications when coins match your formulas. Never miss an opportunity.
            </p>
          </div>
          
          <div className="card p-8">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-3">300+ Coins</h3>
            <p className="text-gray-400">
              Screen top cryptocurrencies by market cap with real-time price data.
            </p>
          </div>
          
          <div className="card p-8">
            <div className="text-4xl mb-4">💹</div>
            <h3 className="text-xl font-semibold mb-3">TradingView Charts</h3>
            <p className="text-gray-400">
              Professional charts with multiple timeframes and indicator overlays.
            </p>
          </div>
          
          <div className="card p-8">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-xl font-semibold mb-3">Performance Tracking</h3>
            <p className="text-gray-400">
              See how your formulas perform over time with detailed analytics.
            </p>
          </div>
          
          <div className="card p-8">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-semibold mb-3">Real-time Data</h3>
            <p className="text-gray-400">
              Live cryptocurrency prices from CoinGecko and Binance APIs.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <h2 className="text-4xl font-bold text-center mb-16">
          Simple Pricing
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="card p-8">
            <h3 className="text-2xl font-bold mb-4">Free</h3>
            <div className="text-4xl font-bold mb-6">$0<span className="text-lg text-gray-400">/mo</span></div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                5 custom formulas
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                10 alerts per day
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Top 300 coins
              </li>
            </ul>
            <Link href="/dashboard" className="btn btn-secondary w-full block text-center">
              Get Started
            </Link>
          </div>
          
          <div className="card p-8 border-2 border-primary relative">
            <div className="absolute top-0 right-0 bg-primary text-white px-3 py-1 text-sm font-semibold rounded-bl-lg">
              Popular
            </div>
            <h3 className="text-2xl font-bold mb-4">Pro</h3>
            <div className="text-4xl font-bold mb-6">$29<span className="text-lg text-gray-400">/mo</span></div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Unlimited formulas
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                100 alerts per day
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Real-time alerts
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Priority support
              </li>
            </ul>
            <Link href="/dashboard" className="btn btn-primary w-full block text-center">
              Start Free Trial
            </Link>
          </div>
          
          <div className="card p-8">
            <h3 className="text-2xl font-bold mb-4">Team</h3>
            <div className="text-4xl font-bold mb-6">$99<span className="text-lg text-gray-400">/mo</span></div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Everything in Pro
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Unlimited alerts
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                API access
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Dedicated support
              </li>
            </ul>
            <Link href="/dashboard" className="btn btn-secondary w-full block text-center">
              Contact Sales
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
          <p>© 2026 Crypto Screener Pro. Built for traders, by traders.</p>
        </div>
      </footer>
    </div>
  );
}
