# 🚀 COMPLETE DEPLOYMENT GUIDE

## Step-by-Step for Non-Technical Users

---

## ⏱️ TOTAL TIME: 20 MINUTES

### What You'll Do:
1. ✅ Create accounts (5 min)
2. ✅ Set up database (3 min)
3. ✅ Upload to GitHub (5 min)
4. ✅ Deploy to Railway (5 min)
5. ✅ Configure Telegram (2 min)

---

## 📋 STEP 1: CREATE ACCOUNTS (5 minutes)

### A. GitHub (Code Storage)
1. Go to: https://github.com
2. Click "Sign up"
3. Use your email
4. Verify email
5. ✅ Done!

### B. Railway (Hosting)
1. Go to: https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway
4. ✅ Done!

### C. Supabase (Database)
1. Go to: https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub
4. ✅ Done!

### D. Stripe (Payments)
1. Go to: https://stripe.com
2. Click "Sign up"
3. Complete business details
4. ✅ Done!

### E. Telegram (For you - personal use)
Just have Telegram app installed on your phone!

---

## 🗄️ STEP 2: SET UP DATABASE (3 minutes)

### In Supabase:

1. **Create Project:**
   - Click "New Project"
   - Name: `crypto-screener`
   - Database Password: (create strong password, SAVE IT!)
   - Region: Choose closest to you
   - Click "Create new project"
   - ⏱️ Wait 2 minutes

2. **Run Database Schema:**
   - Click "SQL Editor" (left sidebar)
   - Click "New query"
   - Open file: `supabase/migrations/001_initial_schema.sql`
   - Copy ALL the text
   - Paste into Supabase SQL Editor
   - Click "RUN"
   - You should see "Success" ✅

3. **Get API Keys:**
   - Click "Settings" (gear icon)
   - Click "API"
   - Copy these (SAVE THEM!):
     - `Project URL`
     - `anon public` key
     - `service_role` key (click "Reveal" first)

---

## 📤 STEP 3: UPLOAD TO GITHUB (5 minutes)

### Method A: GitHub Desktop (Easiest)

1. **Download GitHub Desktop:**
   - Go to: https://desktop.github.com
   - Download and install

2. **Create Repository:**
   - Open GitHub Desktop
   - Click "Create New Repository"
   - Name: `crypto-screener-pro`
   - Local Path: Choose where you extracted this folder
   - Click "Create Repository"

3. **Publish:**
   - Click "Publish repository"
   - Uncheck "Keep this code private" (or keep checked if you want)
   - Click "Publish repository"
   - ✅ Done!

### Method B: Web Upload

1. Go to: https://github.com/new
2. Repository name: `crypto-screener-pro`
3. Click "Create repository"
4. Click "uploading an existing file"
5. Drag ALL files from this folder
6. Click "Commit changes"
7. ✅ Done!

---

## 🚂 STEP 4: DEPLOY TO RAILWAY (5 minutes)

1. **Go to Railway:**
   - Open: https://railway.app
   - Click "New Project"

2. **Deploy from GitHub:**
   - Click "Deploy from GitHub repo"
   - Select `crypto-screener-pro`
   - Click "Deploy Now"
   - ⏱️ Wait 2 minutes while it builds

3. **Add Environment Variables:**
   - Click "Variables" tab
   - Click "+ New Variable"
   - Add EACH of these:

```
NEXT_PUBLIC_SUPABASE_URL
(paste your Supabase Project URL)

NEXT_PUBLIC_SUPABASE_ANON_KEY
(paste your Supabase anon key)

SUPABASE_SERVICE_ROLE_KEY
(paste your Supabase service_role key)

TELEGRAM_BOT_TOKEN
(we'll get this in Step 5)

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
(from Stripe → Developers → API keys)

STRIPE_SECRET_KEY
(from Stripe → Developers → API keys)

NEXT_PUBLIC_APP_URL
(your Railway URL - see below)
```

4. **Get Your App URL:**
   - Click "Settings" tab
   - Click "Domains"
   - Click "Generate Domain"
   - Copy the URL: `https://xxxxx.up.railway.app`
   - Go back to Variables
   - Add `NEXT_PUBLIC_APP_URL` with this URL

5. **Redeploy:**
   - Click "Deployments" tab
   - Click "Redeploy"
   - ⏱️ Wait 2 minutes

6. **Your App is LIVE!** 🎉
   - Click your Railway URL
   - You should see your crypto screener!

---

## 📱 STEP 5: SET UP TELEGRAM BOT (2 minutes)

1. **Create Bot:**
   - Open Telegram on your phone
   - Search for: `@BotFather`
   - Send message: `/newbot`
   - Bot asks for name: `My Crypto Screener`
   - Bot asks for username: `mycryptoscreener_bot` (must end in _bot)
   - Bot gives you a TOKEN: `123456789:ABC-DEFxxxxx`
   - **COPY THIS TOKEN!**

2. **Add to Railway:**
   - Go back to Railway
   - Click "Variables"
   - Add new variable:
     - Name: `TELEGRAM_BOT_TOKEN`
     - Value: (paste the token)
   - Click "Redeploy"

3. **Connect Your Telegram:**
   - Open your live app
   - Sign up/Login
   - Go to Settings
   - Click "Connect Telegram"
   - You'll get a code like: `CONNECT-ABC123`
   - In Telegram, message your bot: `/start CONNECT-ABC123`
   - Bot replies: "✅ Connected!"
   - ✅ Done!

---

## 💳 STEP 6: SET UP STRIPE PRODUCTS (3 minutes)

1. **Go to Stripe Dashboard:**
   - Open: https://dashboard.stripe.com

2. **Create Pro Plan:**
   - Click "Products" → "+ Add Product"
   - Name: `Pro Plan`
   - Description: `Unlimited formulas and alerts`
   - Pricing:
     - Price: `29`
     - Currency: `USD`
     - Recurring: `Monthly`
   - Click "Save product"
   - **Copy the Price ID** (starts with `price_`)

3. **Create Team Plan:**
   - Click "+ Add Product"
   - Name: `Team Plan`
   - Pricing: `99` USD Monthly
   - Click "Save product"
   - **Copy the Price ID**

4. **Add to Railway:**
   - Go to Railway → Variables
   - Add:
     - `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` = (Pro price ID)
     - `NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID` = (Team price ID)
   - Click "Redeploy"

5. **Set Up Webhook:**
   - In Stripe: Developers → Webhooks
   - Click "+ Add endpoint"
   - Endpoint URL: `https://your-railway-url.up.railway.app/api/webhooks/stripe`
   - Events to send: Select all `customer.subscription.*` and `invoice.*`
   - Click "Add endpoint"
   - Click "Reveal" on Signing secret
   - **Copy the signing secret**
   - Add to Railway Variables:
     - `STRIPE_WEBHOOK_SECRET` = (paste secret)
   - Redeploy

---

## ✅ STEP 7: TEST YOUR APP

1. **Open Your App:**
   - Go to your Railway URL
   - Should load the homepage ✅

2. **Sign Up:**
   - Create an account
   - Verify email (check Supabase email templates if needed)
   - Login ✅

3. **Create Formula:**
   - Click "Create New Formula"
   - Add condition: `RSI < 30`
   - Click "Save"
   - Click "Run Screen"
   - Should show coins matching! ✅

4. **Test Telegram:**
   - Enable alerts on your formula
   - Wait for alert (or test immediately)
   - Should receive Telegram message! ✅

5. **Test Payment:**
   - Click "Upgrade to Pro"
   - Use test card: `4242 4242 4242 4242`
   - Any future date, any CVC
   - Should upgrade successfully! ✅

---

## 🎉 YOU'RE LIVE!

Your crypto screener is now:
- ✅ Live on the internet
- ✅ Using real crypto data
- ✅ Sending Telegram alerts
- ✅ Accepting payments
- ✅ Ready for users!

---

## 🔄 MAKING UPDATES

**When you need to update code:**

1. Make changes in your local files
2. In GitHub Desktop: Click "Commit" → "Push"
3. Railway auto-deploys in 2 minutes
4. ✅ Done!

**You NEVER re-enter environment variables!**

---

## 🆘 TROUBLESHOOTING

### "Database connection failed"
→ Check Supabase URL and keys in Railway Variables

### "Telegram bot not responding"
→ Verify TELEGRAM_BOT_TOKEN in Railway Variables

### "Stripe payments fail"
→ Check Stripe keys and webhook secret

### "App shows errors"
→ Check Railway Logs (Deployments → View Logs)

### Need Help?
- Railway Support: Very responsive
- Supabase Support: Great docs
- Check logs in Railway dashboard

---

## 💰 MONTHLY COSTS

**Starting Out:**
- Railway: $5/month
- Supabase: $0 (free tier)
- Stripe: $0 (2.9% + 30¢ per transaction)
- **Total: $5/month**

**With 1000 Users:**
- Railway: $50/month (more resources)
- Supabase Pro: $25/month
- CoinGecko Pro: $129/month
- **Total: $204/month**

**Revenue (10% paid conversion):**
- 100 Pro users × $29 = $2,900/month
- **Profit: ~$2,700/month** 💰

---

## 📞 SUPPORT

- **Railway:** support@railway.app
- **Supabase:** support@supabase.io
- **Stripe:** Dashboard → Help

---

**Congratulations! You deployed a production app!** 🎊

**Now go get users and make money!** 💰
