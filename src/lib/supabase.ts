// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface CoinRecord {
  id: string;
  symbol: string;
  base: string;
  exchange: string;
  price: number;
  volume_24h: number;
  change_24h: number;
  ma_20: number | null;
  ma_50: number | null;
  ma_200: number | null;
  updated_at: string;
}
