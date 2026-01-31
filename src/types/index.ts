// src/types/index.ts

export interface Coin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d: number;
  price_change_percentage_30d: number;
  price_change_percentage_1y: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
  image: string;
  
  // Technical indicators (calculated)
  rsi_14?: number;
  macd?: MACDValue;
  bb?: BollingerBands;
  ema_20?: number;
  ema_50?: number;
  sma_200?: number;
  volume_ratio?: number;
}

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MACDValue {
  MACD: number;
  signal: number;
  histogram: number;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

export interface Formula {
  id: string;
  user_id: string;
  name: string;
  description: string;
  conditions: Condition[];
  formula_string: string;
  is_active: boolean;
  alert_enabled: boolean;
  alert_frequency: 'realtime' | '5min' | '15min' | '1hour' | 'daily';
  telegram_chat_id?: string;
  last_run_at?: string;
  coins_found: number;
  performance_24h?: number;
  performance_7d?: number;
  performance_30d?: number;
  created_at: string;
  updated_at: string;
}

export interface Condition {
  id: string;
  field: IndicatorField;
  operator: Operator;
  value: number | string;
  logicalOperator?: 'AND' | 'OR';
}

export type IndicatorField =
  // Price & Market
  | 'price'
  | 'market_cap'
  | 'volume'
  | 'volume_ratio'
  | 'circulating_supply'
  | 'market_cap_rank'
  
  // Price Changes
  | 'change_24h'
  | 'change_7d'
  | 'change_30d'
  | 'change_1y'
  
  // Technical Indicators
  | 'rsi_14'
  | 'macd'
  | 'macd_signal'
  | 'macd_histogram'
  | 'bb_upper'
  | 'bb_middle'
  | 'bb_lower'
  | 'ema_20'
  | 'ema_50'
  | 'sma_200'
  
  // Distance metrics
  | 'distance_from_ath'
  | 'distance_from_atl';

export type Operator =
  | 'greater_than'
  | 'less_than'
  | 'equals'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'crosses_above'
  | 'crosses_below';

export const INDICATOR_LABELS: Record<IndicatorField, string> = {
  // Price & Market
  price: 'Price',
  market_cap: 'Market Cap',
  volume: '24h Volume',
  volume_ratio: 'Volume Ratio (vs 30d avg)',
  circulating_supply: 'Circulating Supply',
  market_cap_rank: 'Market Cap Rank',
  
  // Price Changes
  change_24h: '24h Change %',
  change_7d: '7d Change %',
  change_30d: '30d Change %',
  change_1y: '1y Change %',
  
  // Technical Indicators
  rsi_14: 'RSI (14)',
  macd: 'MACD',
  macd_signal: 'MACD Signal',
  macd_histogram: 'MACD Histogram',
  bb_upper: 'Bollinger Upper',
  bb_middle: 'Bollinger Middle',
  bb_lower: 'Bollinger Lower',
  ema_20: 'EMA (20)',
  ema_50: 'EMA (50)',
  sma_200: 'SMA (200)',
  
  // Distance metrics
  distance_from_ath: 'Distance from ATH %',
  distance_from_atl: 'Distance from ATL %',
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  greater_than: '>',
  less_than: '<',
  equals: '=',
  greater_than_or_equal: '≥',
  less_than_or_equal: '≤',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};

export interface Alert {
  id: string;
  formula_id: string;
  formula_name: string;
  coin_symbol: string;
  coin_name: string;
  price: number;
  conditions_met: string[];
  sent_to_telegram: boolean;
  created_at: string;
}

export interface FormulaPerformance {
  formula_id: string;
  date: string;
  coins_found: number;
  avg_price_change_24h: number;
  best_performer: string;
  worst_performer: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  subscription_tier: 'free' | 'pro' | 'team';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  telegram_chat_id?: string;
  telegram_username?: string;
  alerts_sent_today: number;
  last_alert_reset: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionLimits {
  max_formulas: number;
  max_alerts_per_day: number;
  alert_frequency: string[];
  community_formulas: boolean;
  api_access: boolean;
  priority_support: boolean;
}

export const SUBSCRIPTION_LIMITS: Record<string, SubscriptionLimits> = {
  free: {
    max_formulas: 5,
    max_alerts_per_day: 10,
    alert_frequency: ['1hour', 'daily'],
    community_formulas: true,
    api_access: false,
    priority_support: false,
  },
  pro: {
    max_formulas: Infinity,
    max_alerts_per_day: 100,
    alert_frequency: ['realtime', '5min', '15min', '1hour', 'daily'],
    community_formulas: true,
    api_access: false,
    priority_support: true,
  },
  team: {
    max_formulas: Infinity,
    max_alerts_per_day: Infinity,
    alert_frequency: ['realtime', '5min', '15min', '1hour', 'daily'],
    community_formulas: true,
    api_access: true,
    priority_support: true,
  },
};

export interface PricingPlan {
  id: 'free' | 'pro' | 'team';
  name: string;
  price: number;
  interval: 'month';
  features: string[];
  stripePriceId: string;
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    stripePriceId: '',
    features: [
      '5 custom formulas',
      '10 alerts per day',
      'Hourly/Daily alerts',
      'Top 300 coins',
      'Community formulas',
      'Basic charts',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    interval: 'month',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    popular: true,
    features: [
      'Unlimited formulas',
      '100 alerts per day',
      'Real-time alerts (1-5 min)',
      'Advanced indicators',
      'Performance tracking',
      'Export to CSV',
      'Priority support',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: 99,
    interval: 'month',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || '',
    features: [
      'Everything in Pro',
      'Unlimited alerts',
      'API access',
      'Team collaboration',
      'Custom indicators',
      'Dedicated support',
      'White-label reports',
    ],
  },
];

export interface CommunityFormula {
  id: string;
  name: string;
  description: string;
  author: string;
  uses: number;
  rating: number;
  formula_string: string;
  conditions: Condition[];
  created_at: string;
  tags: string[];
}
