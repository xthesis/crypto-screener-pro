'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [formulas, setFormulas] = useState([
    {
      id: '1',
      name: 'Oversold Momentum',
      description: 'RSI < 30 with high volume',
      coinsFound: 12,
      performance24h: 8.5,
      isActive: true,
      alertEnabled: true,
    },
    {
      id: '2',
      name: 'Breakout Scanner',
      description: 'Price above EMA with volume spike',
      coinsFound: 8,
      performance24h: 12.3,
      isActive: true,
      alertEnabled: false,
    },
    {
      id: '3',
      name: 'Minervini Setup',
      description: 'Full trend template criteria',
      coinsFound: 5,
      performance24h: 15.7,
      isActive: false,
      alertEnabled: true,
    },
  ]);

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
              <Link href="/dashboard" className="text-primary font-semibold">
                Dashboard
              </Link>
              <Link href="/screener" className="text-gray-400 hover:text-white transition">
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
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-6">
            <div className="text-sm text-gray-400 mb-1">Total Formulas</div>
            <div className="text-3xl font-bold">{formulas.length}</div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-400 mb-1">Active Formulas</div>
            <div className="text-3xl font-bold text-green-500">
              {formulas.filter(f => f.isActive).length}
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-400 mb-1">Total Alerts</div>
            <div className="text-3xl font-bold text-primary">156</div>
          </div>
          <div className="card p-6">
            <div className="text-sm text-gray-400 mb-1">Avg Performance</div>
            <div className="text-3xl font-bold text-green-500">+12.1%</div>
          </div>
        </div>

        {/* Create New Formula Button */}
        <div className="mb-8">
          <Link href="/formula/new" className="btn btn-primary inline-flex items-center gap-2">
            <span className="text-xl">+</span>
            Create New Formula
          </Link>
        </div>

        {/* Formulas Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">My Formulas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {formulas.map((formula) => (
              <div key={formula.id} className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">{formula.name}</h3>
                    <p className="text-sm text-gray-400">{formula.description}</p>
                  </div>
                  <div className="flex gap-2">
                    {formula.isActive && (
                      <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Coins Found</span>
                    <span className="font-semibold">{formula.coinsFound}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">24h Performance</span>
                    <span className={`font-semibold ${formula.performance24h > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formula.performance24h > 0 ? '+' : ''}{formula.performance24h}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Alerts</span>
                    <span className={`text-sm ${formula.alertEnabled ? 'text-green-500' : 'text-gray-500'}`}>
                      {formula.alertEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="btn btn-secondary flex-1 text-sm">
                    View Results
                  </button>
                  <button className="btn btn-secondary text-sm px-4">
                    ⚙️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Alerts */}
        <div>
          <h2 className="text-2xl font-bold mb-6">Recent Alerts</h2>
          <div className="card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Formula</th>
                  <th>Coin</th>
                  <th>Price</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-sm text-gray-400">2 min ago</td>
                  <td className="font-semibold">Oversold Momentum</td>
                  <td className="flex items-center gap-2">
                    <span className="font-mono">BTC</span>
                    <span className="text-sm text-gray-400">Bitcoin</span>
                  </td>
                  <td className="font-mono">$42,150</td>
                  <td className="text-green-500 font-semibold">+2.3%</td>
                </tr>
                <tr>
                  <td className="text-sm text-gray-400">15 min ago</td>
                  <td className="font-semibold">Breakout Scanner</td>
                  <td className="flex items-center gap-2">
                    <span className="font-mono">ETH</span>
                    <span className="text-sm text-gray-400">Ethereum</span>
                  </td>
                  <td className="font-mono">$2,245</td>
                  <td className="text-green-500 font-semibold">+1.8%</td>
                </tr>
                <tr>
                  <td className="text-sm text-gray-400">1 hour ago</td>
                  <td className="font-semibold">Minervini Setup</td>
                  <td className="flex items-center gap-2">
                    <span className="font-mono">SOL</span>
                    <span className="text-sm text-gray-400">Solana</span>
                  </td>
                  <td className="font-mono">$98.50</td>
                  <td className="text-green-500 font-semibold">+5.2%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
