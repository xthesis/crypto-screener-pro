# 🚀 CRYPTO SCREENER PRO - QUICK START

## ⏱️ Get Live in 30 Minutes!

---

## 📦 WHAT YOU HAVE

This is a **production-ready crypto screener** with:
- ✅ Top 300 coins (real CoinGecko data)
- ✅ Custom formulas (save unlimited)
- ✅ Technical indicators (RSI, MACD, Bollinger Bands)
- ✅ TradingView charts
- ✅ Beautiful dark UI
- ✅ Authentication (Supabase)
- ✅ Payments (Stripe)
- ✅ Railway-ready deployment

---

## 🎯 STEP 1: Install Dependencies (2 min)

```bash
npm install
```

---

## 🗄️ STEP 2: Set Up Supabase (5 min)

1. Go to https://supabase.com
2. Create new project
3. Wait 2 minutes for provisioning
4. Go to SQL Editor
5. Copy ALL text from `supabase/migrations/001_initial_schema.sql`
6. Paste and RUN in Supabase
7. Go to Settings → API
8. Copy: Project URL, anon key, service_role key

---

## 🔑 STEP 3: Configure Environment (3 min)

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

TELEGRAM_BOT_TOKEN=123:ABC  # Get from @BotFather
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🚀 STEP 4: Run Locally (1 min)

```bash
npm run dev
```

Open: http://localhost:3000

✅ **Your app is running!**

---

## 🌐 STEP 5: Deploy to Railway (10 min)

### A. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git push
```

### B. Deploy on Railway

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Choose your repo
5. Add environment variables (same as .env.local)
6. Deploy!

✅ **Live URL**: `https://yourapp.up.railway.app`

---

## ✅ STEP 6: Test Everything

1. **Sign Up**: Create account
2. **Create Formula**: `RSI < 30 AND Volume > 50M`
3. **Run Screen**: See matching coins
4. **View Charts**: Click any coin
5. **Save Formula**: Save for later

---

## 🎉 YOU'RE LIVE!

**What works:**
- ✅ Real crypto data (top 300 coins)
- ✅ Create & save formulas
- ✅ Screen coins
- ✅ View charts
- ✅ Dark mode UI
- ✅ Authentication
- ✅ Ready for users!

**Next steps:**
- Add Telegram alerts (optional)
- Set up Stripe products (for payments)
- Add custom domain
- Market your app!

---

## 📚 Full Documentation

- `README.md` - Complete guide
- `DEPLOYMENT_GUIDE.md` - Detailed deployment
- `src/types/index.ts` - All data structures

---

## 🆘 Problems?

**App won't start:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Database errors:**
→ Check Supabase URL and keys

**Need help:**
- Railway: support@railway.app
- Supabase: support@supabase.io

---

**Built with ❤️ for crypto traders**

🚀 **Now go get users!**
