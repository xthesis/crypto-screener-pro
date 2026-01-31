'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function FormulaBuilder() {
  const [formulaName, setFormulaName] = useState('');
  const [conditions, setConditions] = useState([
    { id: 1, field: 'rsi_14', operator: 'less_than', value: '30', logicalOperator: 'AND' }
  ]);

  const indicators = [
    { value: 'price', label: 'Price' },
    { value: 'market_cap', label: 'Market Cap' },
    { value: 'volume', label: 'Volume (24h)' },
    { value: 'volume_ratio', label: 'Volume Ratio' },
    { value: 'change_24h', label: '24h Change %' },
    { value: 'change_7d', label: '7d Change %' },
    { value: 'rsi_14', label: 'RSI (14)' },
    { value: 'macd', label: 'MACD' },
    { value: 'ema_20', label: 'EMA (20)' },
    { value: 'ema_50', label: 'EMA (50)' },
    { value: 'sma_200', label: 'SMA (200)' },
  ];

  const operators = [
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'equals', label: '=' },
    { value: 'greater_than_or_equal', label: '≥' },
    { value: 'less_than_or_equal', label: '≤' },
  ];

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        id: Date.now(),
        field: 'rsi_14',
        operator: 'less_than',
        value: '',
        logicalOperator: 'AND'
      }
    ]);
  };

  const removeCondition = (id) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id, field, value) => {
    setConditions(conditions.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Create Formula</h1>
          <p className="text-gray-400">Build custom screening criteria with technical indicators</p>
        </div>

        {/* Formula Name */}
        <div className="card p-6 mb-6">
          <label className="block text-sm font-semibold mb-2">Formula Name</label>
          <input
            type="text"
            placeholder="e.g., Oversold Momentum Play"
            value={formulaName}
            onChange={(e) => setFormulaName(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Conditions Builder */}
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Conditions</h2>
          
          <div className="space-y-4">
            {conditions.map((condition, index) => (
              <div key={condition.id}>
                <div className="flex gap-3 items-start">
                  {/* Field Select */}
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(condition.id, 'field', e.target.value)}
                    className="flex-1"
                  >
                    {indicators.map(ind => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>

                  {/* Operator Select */}
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(condition.id, 'operator', e.target.value)}
                    className="w-24"
                  >
                    {operators.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>

                  {/* Value Input */}
                  <input
                    type="text"
                    placeholder="Value"
                    value={condition.value}
                    onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                    className="w-32"
                  />

                  {/* Remove Button */}
                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(condition.id)}
                      className="btn btn-secondary px-3"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Logical Operator */}
                {index < conditions.length - 1 && (
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-gray-700"></div>
                    <select
                      value={condition.logicalOperator}
                      onChange={(e) => updateCondition(condition.id, 'logicalOperator', e.target.value)}
                      className="w-24 text-sm"
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                    <div className="flex-1 h-px bg-gray-700"></div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addCondition}
            className="btn btn-secondary w-full mt-4"
          >
            + Add Condition
          </button>
        </div>

        {/* Formula Preview */}
        <div className="card p-6 mb-6 bg-background-tertiary">
          <h3 className="text-sm font-semibold mb-2 text-gray-400">Formula Preview</h3>
          <div className="font-mono text-sm">
            {conditions.map((condition, index) => {
              const indicator = indicators.find(i => i.value === condition.field);
              const operator = operators.find(o => o.value === condition.operator);
              return (
                <span key={condition.id}>
                  <span className="text-primary">{indicator?.label}</span>{' '}
                  <span className="text-accent">{operator?.label}</span>{' '}
                  <span className="text-green-500">{condition.value || '___'}</span>
                  {index < conditions.length - 1 && (
                    <span className="text-gray-400"> {condition.logicalOperator} </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button className="btn btn-primary flex-1">
            Save & Run Formula
          </button>
          <button className="btn btn-secondary flex-1">
            Save as Draft
          </button>
          <Link href="/dashboard" className="btn btn-secondary px-6">
            Cancel
          </Link>
        </div>

        {/* Example Formulas */}
        <div className="mt-12">
          <h3 className="text-xl font-bold mb-4">Example Formulas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h4 className="font-semibold mb-2">Oversold Bounce</h4>
              <p className="text-sm text-gray-400 mb-2">RSI &lt; 30 AND Volume &gt; 50M</p>
              <button className="btn btn-secondary text-sm w-full">Use Template</button>
            </div>
            <div className="card p-4">
              <h4 className="font-semibold mb-2">Breakout Setup</h4>
              <p className="text-sm text-gray-400 mb-2">Price &gt; EMA(50) AND Volume Ratio &gt; 1.5</p>
              <button className="btn btn-secondary text-sm w-full">Use Template</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
