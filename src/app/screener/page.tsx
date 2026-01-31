'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Screener() {
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setCoins([
        { rank: 1, symbol: 'BTC', name: 'Bitcoin', price: 42150.23, change24h: 2.34, volume: 28500000000, marketCap: 825000000000, rsi: 58.5 },
        { rank: 2, symbol: 'ETH', name: 'Ethereum', price: 2245.67, change24h: 1.82, volume: 15200000000, marketCap: 270000000000, rsi: 62.1 },
        { rank: 3, symbol: 'BNB', name: 'BNB', price: 305.42, change24h: -0.51, volume: 1200000000, marketCap: 47000000000, rsi: 45.2 },
        { rank: 4, symbol: 'SOL', name: 'Solana', price: 98.15, change24h: 5.23, volume: 2800000000, marketCap: 43000000000, rsi: 71.3 },
        { rank: 5, symbol: 'XRP', name: 'XRP', price: 0.5234, change24h: -1.23, volume: 1500000000, marketCap: 28000000000, rsi: 42.8 },
        { rank: 6, symbol: 'ADA', name: 'Cardano', price: 0.4812, change24h: 3.15, volume: 580000000, marketCap: 17000000000, rsi: 55.9 },
        { rank: 7, symbol: 'AVAX', name: 'Avalanche', price: 36.24, change24h: 4.52, volume: 420000000, marketCap: 13000000000, rsi: 68.2 },
        { rank: 8, symbol: 'DOGE', name: 'Dogecoin', price: 0.0812, change24h: 1.12, volume: 890000000, marketCap: 11000000000, rsi: 51.4 },
        { rank: 9, symbol: 'DOT', name: 'Polkadot', price: 7.23, change24h: -2.34, volume: 320000000, marketCap: 9500000000, rsi: 38.7 },
        { rank: 10, symbol: 'MATIC', name: 'Polygon', price: 0.8534, change24h: 2.91, volume: 450000000, marketCap: 8200000000, rsi: 59.3 },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const formatPrice = (price) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  };

  const formatLargeNumber = (num) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const filteredCoins = coins.filter(coin =>
    coin.symbol.toLowerCase().includes(search.toLowerCase()) ||
    coin.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-background-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold gradient-text">
              Crypto Screener Pro
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/dashboard" className="text-gray-400 hover:text-white transition">
                Dashboard
              </Link>
              <Link href="/screener" className="text-primary font-semibold">
                Screener
              </Link>
              <Link href="/settings" className="text-gray-400 hover:text-white transition">
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-2">Crypto Screener</h1>
        <p className="text-gray-400 mb-8">Screen top 300 cryptocurrencies with real-time data</p>

        {/* Filters */}
        <div className="card p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              type="text"
              placeholder="Search coins..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
            <select className="w-full">
              <option>All Market Caps</option>
              <option>Large Cap (&gt;$10B)</option>
              <option>Mid Cap ($1B-$10B)</option>
              <option>Small Cap (&lt;$1B)</option>
            </select>
            <select className="w-full">
              <option>All RSI</option>
              <option>Oversold (&lt;30)</option>
              <option>Neutral (30-70)</option>
              <option>Overbought (&gt;70)</option>
            </select>
            <select className="w-full">
              <option>24 Hours</option>
              <option>7 Days</option>
              <option>30 Days</option>
              <option>1 Year</option>
            </select>
            <button className="btn btn-primary w-full">
              Apply Filters
            </button>
          </div>
        </div>

        {/* Coin Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="loading h-8 w-full mb-4 rounded"></div>
              <div className="loading h-8 w-full mb-4 rounded"></div>
              <div className="loading h-8 w-full rounded"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Coin</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">24h %</th>
                    <th className="text-right">Volume (24h)</th>
                    <th className="text-right">Market Cap</th>
                    <th className="text-right">RSI (14)</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoins.map((coin) => (
                    <tr key={coin.symbol} className="hover:bg-background-tertiary transition">
                      <td className="text-gray-400 font-mono">{coin.rank}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                            {coin.symbol[0]}
                          </div>
                          <div>
                            <div className="font-semibold">{coin.symbol}</div>
                            <div className="text-sm text-gray-400">{coin.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-mono">{formatPrice(coin.price)}</td>
                      <td className={`text-right font-mono font-semibold ${coin.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                      </td>
                      <td className="text-right font-mono text-gray-400">{formatLargeNumber(coin.volume)}</td>
                      <td className="text-right font-mono">{formatLargeNumber(coin.marketCap)}</td>
                      <td className={`text-right font-mono font-semibold ${
                        coin.rsi > 70 ? 'text-red-500' : 
                        coin.rsi < 30 ? 'text-green-500' : 
                        'text-gray-400'
                      }`}>
                        {coin.rsi.toFixed(1)}
                      </td>
                      <td className="text-right">
                        <button className="btn btn-secondary text-sm py-1 px-3">
                          Chart
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-center text-gray-400 mt-6 text-sm">
          Showing {filteredCoins.length} of 300 coins • Updated every 60 seconds
        </div>
      </div>
    </div>
  );
}
