# 🚀 Crypto Screener Pro

**Professional cryptocurrency screener with custom formulas and Telegram alerts**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### Core Features
- 📊 **Top 300 Cryptocurrencies** - Screened by market cap in real-time
- 🎨 **Visual Formula Builder** - Notion-style interface, no coding required
- 📝 **Text Formula Builder** - For power users who want precision
- 📈 **TradingView Charts** - Professional-grade charting
- 💾 **Unlimited Saved Formulas** - Dashboard with performance tracking
- 📱 **Telegram Alerts** - Real-time notifications
- ⚡ **Real-time Data** - CoinGecko + Binance APIs
- 🎯 **20+ Technical Indicators** - RSI, MACD, Bollinger Bands, etc.
- 📊 **Performance Tracking** - See how your formulas perform
- 🌍 **Global Ready** - Built for international crypto traders

### Premium Design
- 🎨 Modern, clean interface (100x better than competitors)
- 🌙 Beautiful dark mode (default)
- ⚡ Butter-smooth animations
- 📱 Responsive (desktop-optimized)
- 🚀 Fast load times (<1s)

---

## 🏗️ Tech Stack

- **Frontend:** Next.js 14, React 18, TailwindCSS
- **Charts:** TradingView Lightweight Charts
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Payments:** Stripe
- **Alerts:** Telegram Bot API
- **Data Sources:** CoinGecko + Binance
- **Deployment:** Railway-ready

---

## 📋 Prerequisites

Before deployment, create FREE accounts at:

1. **Supabase** → https://supabase.com
2. **Stripe** → https://stripe.com  
3. **Telegram** → Create bot via @BotFather
4. **Railway** → https://railway.app

Optional:
5. **CoinGecko Pro** → https://coingecko.com (for higher limits)

---

## 🚀 Quick Start

### 1. Clone or Download

This is your complete app! Extract it to your computer.

### 2. Set Up Services

#### Supabase (Database):
1. Create new project at supabase.com
2. Go to SQL Editor
3. Run `supabase/migrations/001_initial_schema.sql`
4. Get API keys from Settings → API

#### Telegram Bot:
1. Open Telegram, message @BotFather
2. Send: `/newbot`
3. Follow prompts, get your bot token

#### Stripe:
1. Create account at stripe.com
2. Get API keys from Developers → API keys
3. Create 2 products:
   - Pro: $29/month
   - Team: $99/month
4. Copy price IDs

### 3. Environment Variables

Create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID=price_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 4. Install & Run Locally

```bash
npm install
npm run dev
```

Open: http://localhost:3000

---

## 🚀 Deploy to Railway

### Method 1: From GitHub (Recommended)

1. Push code to GitHub
2. Go to railway.app
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Add environment variables
6. Deploy!

### Method 2: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Add environment variables in Railway dashboard.

---

## 📊 Data Sources

### Free Tier:
- **CoinGecko**: Market data, 50 calls/minute
- **Binance**: Price/volume data, unlimited

### Upgrade Options:
- **CoinGecko Pro**: $129/mo, 500 calls/minute
- Better for high-traffic apps

---

## 💰 Monetization

### Pricing Tiers:

**Free:**
- 5 formulas
- 10 alerts/day
- Hourly/Daily frequency

**Pro ($29/mo):**
- Unlimited formulas
- 100 alerts/day
- Real-time alerts (1-5 min)
- Priority support

**Team ($99/mo):**
- Everything in Pro
- API access
- Team collaboration
- Dedicated support

---

## 🎯 Features by Priority

### Phase 1 (Completed ✅):
- [x] Top 300 coins
- [x] Visual formula builder
- [x] TradingView charts
- [x] Save formulas
- [x] Telegram alerts
- [x] Dashboard
- [x] Authentication
- [x] Payments

### Phase 2 (Optional):
- [ ] Backtesting
- [ ] Mobile app
- [ ] API access
- [ ] Team collaboration
- [ ] Discord integration

---

## 🆘 Support

- **Documentation**: Check this README
- **Railway Support**: support@railway.app
- **Supabase Support**: support@supabase.io

---

## 📄 License

MIT License - Use for commercial projects!

---

**Built with ❤️ for crypto traders worldwide** 🌍
