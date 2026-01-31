// src/lib/formulaEngine.ts
import { Coin, Condition, IndicatorField, Operator } from '@/types';
import { Parser } from 'expr-eval';

// ============================================
// GET VALUE FROM COIN BY FIELD
// ============================================
export function getCoinValue(coin: Coin, field: IndicatorField): number {
  switch (field) {
    // Price & Market
    case 'price':
      return coin.current_price;
    case 'market_cap':
      return coin.market_cap;
    case 'volume':
      return coin.total_volume;
    case 'volume_ratio':
      return coin.volume_ratio || 0;
    case 'circulating_supply':
      return coin.circulating_supply;
    case 'market_cap_rank':
      return coin.market_cap_rank;
    
    // Price Changes
    case 'change_24h':
      return coin.price_change_percentage_24h;
    case 'change_7d':
      return coin.price_change_percentage_7d;
    case 'change_30d':
      return coin.price_change_percentage_30d;
    case 'change_1y':
      return coin.price_change_percentage_1y;
    
    // Technical Indicators
    case 'rsi_14':
      return coin.rsi_14 || 50;
    case 'macd':
      return coin.macd?.MACD || 0;
    case 'macd_signal':
      return coin.macd?.signal || 0;
    case 'macd_histogram':
      return coin.macd?.histogram || 0;
    case 'bb_upper':
      return coin.bb?.upper || 0;
    case 'bb_middle':
      return coin.bb?.middle || 0;
    case 'bb_lower':
      return coin.bb?.lower || 0;
    case 'ema_20':
      return coin.ema_20 || 0;
    case 'ema_50':
      return coin.ema_50 || 0;
    case 'sma_200':
      return coin.sma_200 || 0;
    
    // Distance metrics
    case 'distance_from_ath':
      return coin.ath_change_percentage;
    case 'distance_from_atl':
      return coin.atl_change_percentage;
    
    default:
      return 0;
  }
}

// ============================================
// COMPARE VALUES WITH OPERATOR
// ============================================
export function compareValues(value: number, operator: Operator, targetValue: number): boolean {
  switch (operator) {
    case 'greater_than':
      return value > targetValue;
    case 'less_than':
      return value < targetValue;
    case 'equals':
      return Math.abs(value - targetValue) < 0.0001; // Float comparison
    case 'greater_than_or_equal':
      return value >= targetValue;
    case 'less_than_or_equal':
      return value <= targetValue;
    case 'crosses_above':
    case 'crosses_below':
      // These require historical data - for now treat as > or <
      return operator === 'crosses_above' ? value > targetValue : value < targetValue;
    default:
      return false;
  }
}

// ============================================
// EVALUATE SINGLE CONDITION
// ============================================
export function evaluateCondition(coin: Coin, condition: Condition): boolean {
  const value = getCoinValue(coin, condition.field);
  const targetValue = typeof condition.value === 'number' ? condition.value : parseFloat(condition.value);
  
  if (isNaN(targetValue)) {
    return false;
  }
  
  return compareValues(value, condition.operator, targetValue);
}

// ============================================
// EVALUATE FORMULA (Multiple conditions)
// ============================================
export function evaluateFormula(coin: Coin, conditions: Condition[]): boolean {
  if (conditions.length === 0) {
    return true;
  }

  let result = evaluateCondition(coin, conditions[0]);

  for (let i = 1; i < conditions.length; i++) {
    const condition = conditions[i];
    const conditionResult = evaluateCondition(coin, condition);
    
    if (condition.logicalOperator === 'AND') {
      result = result && conditionResult;
    } else if (condition.logicalOperator === 'OR') {
      result = result || conditionResult;
    }
  }

  return result;
}

// ============================================
// PARSE TEXT FORMULA (Advanced)
// ============================================
export function parseTextFormula(formulaString: string): Condition[] {
  // Example: "RSI < 30 AND Volume > 50000000"
  const conditions: Condition[] = [];
  
  try {
    // Split by AND/OR
    const parts = formulaString.split(/\s+(AND|OR)\s+/gi);
    
    for (let i = 0; i < parts.length; i += 2) {
      const part = parts[i].trim();
      const logicalOp = parts[i + 1] as 'AND' | 'OR' | undefined;
      
      // Parse condition: "RSI < 30"
      const match = part.match(/^(\w+)\s*([<>=≥≤]+)\s*(.+)$/);
      
      if (match) {
        const [, fieldStr, operatorStr, valueStr] = match;
        
        // Map field string to IndicatorField
        const field = mapStringToField(fieldStr);
        const operator = mapStringToOperator(operatorStr);
        const value = parseValue(valueStr);
        
        if (field && operator) {
          conditions.push({
            id: `cond-${Date.now()}-${i}`,
            field,
            operator,
            value,
            logicalOperator: i < parts.length - 1 ? logicalOp : undefined,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing formula:', error);
  }
  
  return conditions;
}

function mapStringToField(str: string): IndicatorField | null {
  const map: Record<string, IndicatorField> = {
    'price': 'price',
    'marketcap': 'market_cap',
    'market_cap': 'market_cap',
    'volume': 'volume',
    'vol': 'volume',
    'volume_ratio': 'volume_ratio',
    'volumeratio': 'volume_ratio',
    'rsi': 'rsi_14',
    'rsi14': 'rsi_14',
    'macd': 'macd',
    'macdsignal': 'macd_signal',
    'macd_signal': 'macd_signal',
    'bb_upper': 'bb_upper',
    'bb_lower': 'bb_lower',
    'ema20': 'ema_20',
    'ema50': 'ema_50',
    'sma200': 'sma_200',
    'change24h': 'change_24h',
    'change_24h': 'change_24h',
    'change7d': 'change_7d',
    'change_7d': 'change_7d',
    'rank': 'market_cap_rank',
  };
  
  return map[str.toLowerCase()] || null;
}

function mapStringToOperator(str: string): Operator | null {
  const map: Record<string, Operator> = {
    '>': 'greater_than',
    '<': 'less_than',
    '=': 'equals',
    '==': 'equals',
    '>=': 'greater_than_or_equal',
    '≥': 'greater_than_or_equal',
    '<=': 'less_than_or_equal',
    '≤': 'less_than_or_equal',
  };
  
  return map[str] || null;
}

function parseValue(str: string): number {
  // Handle suffixes like 50M, 1B, etc.
  const match = str.match(/^(\d+\.?\d*)([KMB]?)$/i);
  
  if (match) {
    const [, num, suffix] = match;
    const value = parseFloat(num);
    
    switch (suffix.toUpperCase()) {
      case 'K':
        return value * 1000;
      case 'M':
        return value * 1000000;
      case 'B':
        return value * 1000000000;
      default:
        return value;
    }
  }
  
  return parseFloat(str);
}

// ============================================
// SCREEN COINS WITH FORMULA
// ============================================
export function screenCoins(coins: Coin[], conditions: Condition[]): Coin[] {
  return coins.filter(coin => evaluateFormula(coin, conditions));
}

// ============================================
// VALIDATE FORMULA
// ============================================
export function validateFormula(conditions: Condition[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (conditions.length === 0) {
    errors.push('Formula must have at least one condition');
  }
  
  conditions.forEach((condition, index) => {
    if (!condition.field) {
      errors.push(`Condition ${index + 1}: Field is required`);
    }
    if (!condition.operator) {
      errors.push(`Condition ${index + 1}: Operator is required`);
    }
    if (condition.value === undefined || condition.value === null) {
      errors.push(`Condition ${index + 1}: Value is required`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// GENERATE FORMULA STRING FROM CONDITIONS
// ============================================
export function generateFormulaString(conditions: Condition[]): string {
  return conditions
    .map((condition, index) => {
      const field = condition.field.toUpperCase().replace(/_/g, ' ');
      const operator = {
        'greater_than': '>',
        'less_than': '<',
        'equals': '=',
        'greater_than_or_equal': '≥',
        'less_than_or_equal': '≤',
        'crosses_above': 'crosses above',
        'crosses_below': 'crosses below',
      }[condition.operator];
      
      const value = typeof condition.value === 'number' 
        ? formatConditionValue(condition.value)
        : condition.value;
      
      const condStr = `${field} ${operator} ${value}`;
      
      if (index < conditions.length - 1 && condition.logicalOperator) {
        return `${condStr} ${condition.logicalOperator}`;
      }
      
      return condStr;
    })
    .join(' ');
}

function formatConditionValue(value: number): string {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return value.toString();
}
