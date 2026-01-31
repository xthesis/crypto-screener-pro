-- Crypto Screener Pro - Complete Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER PROFILES
-- =====================================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'team')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_connect_code TEXT UNIQUE,
  alerts_sent_today INTEGER DEFAULT 0,
  last_alert_reset DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- FORMULAS (User's saved screening formulas)
-- =====================================================
CREATE TABLE public.formulas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL,
  formula_string TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  alert_enabled BOOLEAN DEFAULT false,
  alert_frequency TEXT DEFAULT '1hour' CHECK (alert_frequency IN ('realtime', '5min', '15min', '1hour', 'daily')),
  last_run_at TIMESTAMP WITH TIME ZONE,
  coins_found INTEGER DEFAULT 0,
  performance_24h DECIMAL(10,2),
  performance_7d DECIMAL(10,2),
  performance_30d DECIMAL(10,2),
  folder TEXT,
  tags TEXT[],
  is_public BOOLEAN DEFAULT false,
  uses_count INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ALERTS (Alert history)
-- =====================================================
CREATE TABLE public.alerts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  formula_id UUID REFERENCES public.formulas(id) ON DELETE CASCADE NOT NULL,
  formula_name TEXT NOT NULL,
  coin_symbol TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  conditions_met JSONB NOT NULL,
  sent_to_telegram BOOLEAN DEFAULT false,
  telegram_message_id TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- FORMULA PERFORMANCE (Historical tracking)
-- =====================================================
CREATE TABLE public.formula_performance (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  formula_id UUID REFERENCES public.formulas(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  coins_found INTEGER NOT NULL,
  avg_price_change_24h DECIMAL(10,2),
  best_performer JSONB,
  worst_performer JSONB,
  total_alerts_sent INTEGER DEFAULT 0,
  UNIQUE(formula_id, date)
);

-- =====================================================
-- ALERT COINS (Track which coins triggered alerts)
-- =====================================================
CREATE TABLE public.alert_coins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  formula_id UUID REFERENCES public.formulas(id) ON DELETE CASCADE NOT NULL,
  coin_symbol TEXT NOT NULL,
  first_alert_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_alert_at TIMESTAMP WITH TIME ZONE NOT NULL,
  alert_count INTEGER DEFAULT 1,
  entry_price DECIMAL(20,8),
  current_price DECIMAL(20,8),
  price_change_pct DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(formula_id, coin_symbol)
);

-- =====================================================
-- COMMUNITY FORMULAS (Shared formulas)
-- =====================================================
CREATE TABLE public.community_formulas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  formula_id UUID REFERENCES public.formulas(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  featured BOOLEAN DEFAULT false,
  featured_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- FORMULA RATINGS (User ratings for community formulas)
-- =====================================================
CREATE TABLE public.formula_ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  formula_id UUID REFERENCES public.formulas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(formula_id, user_id)
);

-- =====================================================
-- COIN CACHE (Cache coin data to reduce API calls)
-- =====================================================
CREATE TABLE public.coin_cache (
  symbol TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  indicators JSONB,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_formulas_user ON public.formulas(user_id);
CREATE INDEX idx_formulas_active ON public.formulas(is_active) WHERE is_active = true;
CREATE INDEX idx_formulas_public ON public.formulas(is_public) WHERE is_public = true;
CREATE INDEX idx_alerts_formula ON public.alerts(formula_id);
CREATE INDEX idx_alerts_user ON public.alerts(user_id);
CREATE INDEX idx_alerts_created ON public.alerts(created_at DESC);
CREATE INDEX idx_performance_formula ON public.formula_performance(formula_id);
CREATE INDEX idx_performance_date ON public.formula_performance(date DESC);
CREATE INDEX idx_alert_coins_formula ON public.alert_coins(formula_id);
CREATE INDEX idx_alert_coins_active ON public.alert_coins(is_active) WHERE is_active = true;
CREATE INDEX idx_coin_cache_updated ON public.coin_cache(last_updated);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formula_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formula_ratings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Formulas policies
CREATE POLICY "Users can view own formulas" ON public.formulas
  FOR SELECT USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create own formulas" ON public.formulas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own formulas" ON public.formulas
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own formulas" ON public.formulas
  FOR DELETE USING (auth.uid() = user_id);

-- Alerts policies
CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own alerts" ON public.alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Formula performance policies
CREATE POLICY "Users can view performance for own formulas" ON public.formula_performance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.formulas
      WHERE formulas.id = formula_performance.formula_id
      AND (formulas.user_id = auth.uid() OR formulas.is_public = true)
    )
  );

-- Alert coins policies
CREATE POLICY "Users can view alert coins for own formulas" ON public.alert_coins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.formulas
      WHERE formulas.id = alert_coins.formula_id
      AND formulas.user_id = auth.uid()
    )
  );

-- Formula ratings policies
CREATE POLICY "Anyone can view ratings" ON public.formula_ratings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can rate formulas" ON public.formula_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings" ON public.formula_ratings
  FOR UPDATE USING (auth.uid() = user_id);

-- Coin cache is public read
ALTER TABLE public.coin_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view coin cache" ON public.coin_cache
  FOR SELECT TO authenticated USING (true);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_formulas_updated_at
  BEFORE UPDATE ON public.formulas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Reset daily alert limits
CREATE OR REPLACE FUNCTION reset_daily_alert_limits()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET alerts_sent_today = 0,
      last_alert_reset = CURRENT_DATE
  WHERE last_alert_reset < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update formula rating
CREATE OR REPLACE FUNCTION update_formula_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.formulas
  SET rating = (
    SELECT AVG(rating)::DECIMAL(3,2)
    FROM public.formula_ratings
    WHERE formula_id = NEW.formula_id
  )
  WHERE id = NEW.formula_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rating_on_new_rating
  AFTER INSERT OR UPDATE ON public.formula_ratings
  FOR EACH ROW EXECUTE FUNCTION update_formula_rating();

-- Increment formula uses
CREATE OR REPLACE FUNCTION increment_formula_uses(formula_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.formulas
  SET uses_count = uses_count + 1
  WHERE id = formula_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Create a function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
