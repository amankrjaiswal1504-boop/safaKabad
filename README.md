# ScrapMate — Doorstep Scrap Collection & Recycling Platform

Customers check live scrap rates, book a free doorstep pickup, verify the collector with a
door code, watch their scrap being weighed (with photo proof) and get paid instantly by eSewa,
Khalti, bank transfer, cash or wallet. Collectors run their day from a mobile partner app. Admins and staff
run operations, pricing, payouts, support and analytics.

Built for **Nepal**: prices in Nepali rupees (Rs.), +977 mobile numbers, 5-digit postal codes
and the 7 provinces, Nepal time (UTC+05:45), English + नेपाली, eSewa / Khalti / bank
payouts, Sparrow SMS for OTPs and PAN/VAT details for businesses. Country settings live in
`backend/src/config/locale.js` and `frontend/src/utils/locale.js`.

An original project: branding, copy, design and code are our own. It is not affiliated with,
and copies nothing from, any existing scrap-collection company.

---

## Contents
1. [Features](#1-features)
2. [Tech stack](#2-tech-stack)
3. [Project structure](#3-project-structure)
4. [Quick start (local)](#4-quick-start-local)
5. [Run with Docker](#5-run-with-docker)
6. [Environment variables](#6-environment-variables)
7. [Demo accounts](#7-demo-accounts)
8. [Scripts, tests and CI](#8-scripts-tests-and-ci)
9. [API reference](#9-api-reference)
10. [How things work](#10-how-things-work)
11. [Deployment](#11-deployment)
12. [Troubleshooting](#12-troubleshooting)
13. [Known limitations](#13-known-limitations)

---

## 1. Features

Everything runs locally **without any paid keys**: each external service (AI, SMS, WhatsApp,
email, Khalti, payouts, Cloudinary, maps, web push) has an env var and a working fallback (console
log, mock, local file, or OpenStreetMap).

**Customer website (English + नेपाली, light/dark mode, installable PWA)**
- Home page with a live price estimator (no login), real stats from the database,
  testimonials from approved reviews, FAQ, trust badges and a city selector
- Rates page by category with search, price-trend chart per item and price alerts
- SEO city pages: `/sell-scrap/<city>` with structured data, sitemap and Open Graph image
- Booking wizard: sell or **donate** to an NGO, item picker with condition grading for
  e-waste/appliances, photos, saved or new address with **search autocomplete, map pin and
  "use my location"**, **city → municipality → ward** picked from the served areas (postal code, district and province filled in), slots with remaining capacity,
  coupons, auto-saved draft, and a confirmation with the door code and a calendar file
- **Guest booking with phone OTP** (account created automatically) and phone-OTP login
- Pickup tracking: status timeline, **4-digit door code**, **live collector map with ETA**,
  accept or dispute the weighed amount, reschedule/cancel, collector rating, PDF receipt,
  donation and **certified e-waste disposal certificates**
- Account: overview with loyalty tier, **wallet** with withdrawals, **eco-impact dashboard**
  (kg, CO₂, trees, badges, shareable card), **referrals** + leaderboard, **recurring
  pickups**, price alerts, addresses, notification centre, profile (business PAN/VAT details,
  notification channels, password, theme, language)
- Business page with bulk-quote requests and volume pricing tiers
- Floating **AI chat assistant** (Claude, or a rule-based bot without a key) and
  **WhatsApp** button on every page

**Collector partner app (mobile-first)**
- Today's jobs, availability toggle, earnings snapshot
- Daily **route** ordered nearest-first on a map, with navigation links and live location sharing
- Job screen: start trip, running late, arrive, **enter the customer's door code**, weigh each
  item with a **scale photo**, see the customer's accept/dispute live, choose the payout
  (cash, eSewa, Khalti, bank, wallet) and add evidence photos
- **Offline-tolerant weighing**: saved on the phone and synced when the connection returns
- Earnings: per-pickup commission, weekly bonus progress and weekly statements
- Settings: working hours and service postal codes

**Admin & staff console**
- Dashboard, **analytics** (revenue, margin vs recycler price, funnel, areas, slots, top
  items, collector performance, repeat customers) with CSV and PDF export
- **Dispatch board** (kanban by status) and **live map** of collectors and pickups
- Pickups table with search/filters/bulk assign/auto-assign/cancel and a detail view
- Customers, collectors and **staff roles** (support / operations / finance) with permissions
- Categories & items (images, units, CO₂ factors, active toggles), **city prices** with
  bulk % change, copy-city and full price history
- **Cities & service areas**: cities (one price list each, one default) and their municipalities with wards, served wards, post-office codes, minimums and map centres; safe rename (updates every reference) and delete guards. **Time slots** (capacity per municipality, cutoffs, holidays, closed days)
- Coupons, review moderation (featured testimonials), NGO partners, business quotes,
  payouts & withdrawals
- **Fraud & abuse**: blocklist (phone/email/IP/postal code), duplicate-booking flags,
  cancellation and active-booking limits
- **Audit log** of sensitive actions and **site settings** (support hours, WhatsApp number,
  banners, home stats, AI assistant, rewards, collector pay, fraud limits, pricing)
- Chat & support: conversations, tickets, FAQ editor and chat analytics

**Platform**
- Server-side pricing, bonuses and payouts (the client is never trusted); collectors can only
  pick min/avg/max within the admin price
- Real-time updates with Socket.IO (status, location, notifications) plus email, WhatsApp,
  SMS and web push
- Security: zod validation on every route, NoSQL-injection sanitising, strict CORS, helmet
  CSP, httpOnly cookies, **rotating refresh tokens**, **account lockout**, per-route rate
  limits, upload type/size/magic-byte checks, ownership checks everywhere (including the AI tools)
- Structured logging (pino), health checks, graceful shutdown, Docker, GitHub Actions CI

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, React Router 6, Tailwind CSS (CSS-variable theme, dark mode), Axios, Socket.IO client, Leaflet + OpenStreetMap, lucide icons, react-markdown, react-hot-toast |
| Backend | Node.js (CommonJS), Express 4, Mongoose 8, JWT, bcryptjs, zod, helmet, express-rate-limit, express-mongo-sanitize, Socket.IO, pino, PDFKit, Nodemailer, Khalti ePayment API, web-push, multer/Cloudinary, Anthropic SDK |
| Database | MongoDB (local, Atlas, or replica set for transactions) |
| Tests | Jest + Supertest + mongodb-memory-server, Vitest + Testing Library, Playwright |
| Ops | Docker, docker compose (MongoDB replica set + API + nginx), GitHub Actions |

## 3. Project structure

```
scrapmate/
  backend/
    src/
      app.js, server.js, socket.js
      config/          db, constants
      models/          User, Pickup, Address, ScrapCategory/Item/Price, PriceHistory, Payment,
                       Chat*, SupportTicket, Faq, platform.js (Setting, AuditLog, Notification,
                       OtpCode, RefreshToken, ServiceArea, Review, Coupon, WalletTransaction,
                       Withdrawal, RecurringPlan, Quote, PriceAlert, Ngo, AnalyticsEvent, Blocklist)
      services/        bookingService (create/complete/payout), slot, serviceability, rate,
                       coupon, wallet, impact, referral, assignment, fraud, otp, channels
                       (email/SMS/WhatsApp/push), notification, storage, geo, pdf,
                       paymentGateway (Khalti + payout provider), settings, audit, jobs, chat/*
      controllers/     auth, users, addresses, scrap, public, pickups, collector, payments,
                       growth (wallet, referrals, impact, recurring, alerts, quotes, uploads),
                       chat, admin, adminCatalog, adminGrowth, adminSystem, supportAdmin
      routes/          one router per area, zod-validated
      middleware/      auth (protect / optionalAuth / authorize / requirePermission), validate, errors
      seed/seed.js
    scripts/e2e-stack.js   throwaway stack for Playwright
    tests/                 Jest suites
  frontend/
    src/
      components/      ui kit, charts, MapView, AddressForm, SlotPicker, Estimator, chat/*, …
      context/         Auth, Config (city), Theme, Realtime
      i18n/            messages (en, hi) + provider
      layouts/         Main, Dashboard (customer/admin), Collector
      pages/           public pages, account/, collector/, admin/
      hooks/, services/, utils/, test/
    e2e/               Playwright spec
    public/            manifest, icons, service worker, OG image
  docker-compose.yml
  .github/workflows/ci.yml
```

## 4. Quick start (local)

Requires **Node.js 18+** (22 recommended) and MongoDB (local or Atlas).

```bash
# 1. Install
cd backend && npm install
cd ../frontend && npm install

# 2. Configure
cp backend/.env.example backend/.env      # set MONGODB_URI (local or Atlas)
cp frontend/.env.example frontend/.env    # VITE_API_URL must match the backend PORT

# 3. Seed demo data (WIPES the database in MONGODB_URI first)
cd backend && npm run seed

# 4. Run
cd backend && npm run dev                  # API  → http://localhost:5000
cd frontend && npm run dev                 # Web  → http://localhost:5173
```

> If you change `PORT` in `backend/.env` (e.g. 3000), set `VITE_API_URL` in `frontend/.env`
> to the same port, and restart `npm run dev` after pulling theme changes (Tailwind reads its
> config at start-up).

**No MongoDB installed?** Use a free MongoDB Atlas cluster, or `docker compose up mongo`.

## 5. Run with Docker

```bash
docker compose up --build                 # → http://localhost:8080
docker compose run --rm seed              # optional demo data (wipes the DB)
```

Compose starts MongoDB as a single-node **replica set** (so wallet/payment transactions are
atomic), the API, and nginx serving the web app and proxying `/api`, `/uploads` and
`/socket.io` on the same origin. Optional secrets are read from `backend/.env`; set
`JWT_SECRET` (and `PUBLIC_URL` when deploying) in your shell or a root `.env`.

## 6. Environment variables

All variables, with comments, are in [`backend/.env.example`](backend/.env.example) and
[`frontend/.env.example`](frontend/.env.example). Without keys, every integration has a
fallback:

| Feature | Variables | Without keys |
|---|---|---|
| AI chat | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_EFFORT`, `ANTHROPIC_FALLBACKS` | Rule-based English/Nepali bot on the same data |
| Phone OTP / SMS | `SMS_PROVIDER` (`sparrow`/`twilio`), `SPARROW_SMS_TOKEN`, `SPARROW_SMS_FROM` (or `TWILIO_*`) | Code printed to the API console and shown on screen in non-production ("test mode") |
| Email | `SMTP_*` | Logged to the console |
| WhatsApp notifications | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Logged to the console |
| Payments & payouts | `KHALTI_SECRET_KEY`, `KHALTI_BASE_URL` (business invoices); `PAYOUT_PROVIDER_URL`, `PAYOUT_PROVIDER_TOKEN` (eSewa/Khalti/bank payouts) | Mock payments in development; in production unpaid payouts are queued and finance marks them paid in Admin → Finance |
| Images | `CLOUDINARY_*` | Saved to `backend/uploads` and served by the API |
| Address search | `MAPS_API_KEY` (Google Geocoding) | OpenStreetMap Nominatim |
| Country timezone | `APP_TIMEZONE` (default `Asia/Kathmandu`), `APP_UTC_OFFSET` (default `+05:45`) | Nepal time |
| Web push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | In-app, email and WhatsApp notifications still work |
| WhatsApp button | `VITE_WHATSAPP_NUMBER` or Site settings → Support | Opens WhatsApp's contact picker |

Support hours, WhatsApp number, banners, rewards, collector pay, fraud limits, slots and the
AI on/off switch are **admin-editable** in Site settings; env values are the defaults.

## 7. Demo accounts

Created by `npm run seed` — **development only, never use in production.**

| Role | Login | Password |
|---|---|---|
| Admin | admin@scrapmate.dev | Admin@123 |
| Staff — support / operations / finance | support@ · ops@ · finance@scrapmate.dev | Staff@123 |
| Collectors (1–3 Kathmandu, 4–5 Lalitpur, 6–7 Bhaktapur) | collector1…7@scrapmate.dev | Collector@123 |
| Customer | customer@scrapmate.dev (or mobile 9800000003 + OTP) | Customer@123 |
| Business customer | business@scrapmate.dev | Business@123 |

The seed covers the **Kathmandu valley only**: 3 cities (Kathmandu, Lalitpur, Bhaktapur, one
price list each) and their 21 municipalities (`backend/src/seed/kathmanduValley.js`: wards,
post-office codes, centres; two hill rural municipalities are inactive). It adds NPR prices with
recycler prices and history, completed pickups with payments and reviews, coupons (`FIRST5`, `BULK100`,
`DASHAIN10`, `EWASTE150`), NGOs, FAQs, a business quote, a recurring plan, a price alert, chat
tickets and funnel events.

**Try:** book as a guest with any phone number (the OTP shows on screen in test mode), then
log in as `collector1`, open the pickup, start the trip, enter the door code from the
customer's page, weigh with photos and complete with "Wallet". Watch the customer's page
update live.

## 8. Scripts, tests and CI

| Where | Command | What |
|---|---|---|
| backend | `npm run dev` / `npm start` | API with nodemon / production |
| backend | `npm run seed` | Wipe + load demo data |
| backend | `npm test` | Jest + Supertest on in-memory MongoDB (auth, booking → OTP → weighing → payout, permissions, fraud, coupons, wallet, analytics, chat) |
| backend | `npm run lint` | ESLint |
| frontend | `npm run dev` / `npm run build` | Vite dev server / production build |
| frontend | `npm test` | Vitest + Testing Library |
| frontend | `npm run e2e` | Playwright: guest books with OTP → confirmation → tracking (boots its own in-memory DB, API on :5055 and Vite on :5199; never touches your `.env` database) |
| frontend | `npm run lint` | ESLint |

GitHub Actions (`.github/workflows/ci.yml`) runs lint, tests and build for both apps, the
Playwright test, and `docker compose build`.

## 9. API reference

All routes are under `/api`. Auth uses httpOnly cookies (a `Bearer` header also works).
Request bodies are validated (zod) and errors look like
`{ success: false, message, errors?: [{ field, message }] }`.

```
AUTH        POST /auth/register · /auth/login · /auth/logout · /auth/refresh
            GET  /auth/me · /auth/session
            POST /auth/otp/request {phone, purpose} · /auth/otp/verify {phone, code, name?}
            POST /auth/forgot-password · /auth/reset-password · /auth/change-password
USERS       GET/PUT /users/profile · POST /users/push/subscribe · /users/push/unsubscribe
ADDRESSES   GET/POST /addresses · PUT/DELETE /addresses/:id   (each with serviceability)
PUBLIC      GET /scrap/categories · /scrap/items · /scrap/rates?city&search&category
            GET /scrap/cities · /scrap/stats · /scrap/trends/:itemId?city
            POST /scrap/estimate {city, items[{itemId, estimatedQuantity, condition?}]}
            GET /public/config · /public/serviceability?area&ward · /public/slots?date&area
            GET /public/slots/calendar · /public/geo/search?q · /public/geo/reverse?lat&lng
            GET /public/testimonials · /public/faqs · /public/ngos · /public/leaderboard
            GET /public/cities/:city · POST /public/events · GET /sitemap.xml
PICKUPS     POST /pickups · POST /pickups/guest (phone OTP) · GET /pickups?status&page
            GET /pickups/:id · /pickups/:id/receipt.pdf · /pickups/:id/calendar.ics
            GET /pickups/:id/certificate/donation|ewaste
            PUT /pickups/:id/cancel · /reschedule · /decision {accepted|disputed}
            POST /pickups/:id/review
COLLECTOR   GET /collector/pickups?view · /collector/route?date · /collector/earnings
            GET /collector/pickups/:id · PUT /collector/pickups/:id/status
            POST /collector/pickups/:id/verify-otp · PUT /collector/pickups/:id/weighing
            PUT /collector/pickups/:id/complete {payoutMethod: cash|esewa|khalti|bank_transfer|wallet, walletId?, bankAccount?{accountNumber, bankName, branch?, holderName}}
            POST /collector/pickups/:id/late · POST /collector/sync (offline queue)
            PUT /collector/location · PUT /collector/availability
GROWTH      GET /wallet · POST /wallet/withdraw · GET /referrals · GET /impact
            POST /coupons/validate · CRUD /recurring · CRUD /price-alerts
            POST /quotes · GET /quotes/mine · GET /notifications · PUT /notifications/:id/read
            POST /uploads?folder (images, 5 MB, JPEG/PNG/WebP)
PAYMENTS    GET /payments · POST /payments/create (Khalti) · POST /payments/verify {paymentId, pidx} · GET /payments/:id
CHAT        GET /chat/config · GET/DELETE /chat/history · POST /chat (SSE) · POST /chat/actions/:id
ADMIN       (admin, or staff with the matching permission)
            GET /admin/dashboard · /admin/analytics?days&city&format=csv|pdf
            /admin/users · /admin/collectors · /admin/staff · /admin/pickups (+ /bulk, /:id,
            /:id/status, /:id/auto-assign, /:id/clear-flags) · /admin/assign-collector
            /admin/dispatch · /admin/live-map · /admin/categories · /admin/scrap-items
            /admin/prices?city (grid) · DELETE /admin/prices/:itemId?city · /admin/prices/bulk
            /admin/prices/copy-city · /admin/prices/history · /admin/cities · /admin/service-areas · /admin/coupons · /admin/reviews · /admin/ngos
            /admin/quotes · /admin/withdrawals · /admin/payments · /admin/settings/:key
            /admin/audit-log · /admin/fraud (+ /blocklist) · /admin/support/* · /admin/faqs
```

## 10. How things work

- **Where we operate (no hard-coding).** Admin → Service areas holds the cities (each owns a
  price list; one is the default) and their municipalities (wards, served wards, post-office
  codes, minimums, map centre). `GET /public/config` sends them to the apps; every city list,
  map centre, address form, chat answer and SEO page reads from there. Customers pick city →
  municipality → ward; the server fills in district, province and postal code. Items a city
  doesn't price can't be booked there. Withdrawal limits, payout/withdrawal methods and business
  tiers are Settings, enforced by the API.

- **Booking.** One server function (`bookingService.createPickupForUser`) handles web, guest,
  recurring, chat and admin bookings. It runs the serviceability and minimum checks, slot
  capacity and cutoff, fraud checks, the server-side estimate and the coupon, then creates
  the door code and auto-assigns the least-loaded nearby collector.
- **Door code.** Customers see a 4-digit code; weighing is locked until the collector enters it.
- **Weighing & payout.** The rate always comes from the admin price list (collector chooses
  min/avg/max). The customer can accept or dispute; disputes block completion and open a
  ticket. On completion: bonus = better of coupon or first-pickup bonus, plus loyalty and
  business tier %. The payout goes to the wallet (transactional on replica sets), cash,
  eSewa, Khalti or bank transfer (via `PAYOUT_PROVIDER_URL`, or queued for finance to mark paid). A PDF receipt is emailed.
- **Roles & permissions.** Customers see only their data; collectors only their assigned
  pickups; staff get role permissions (`support`, `operations`, `finance`); admins get all.
  The AI assistant's tools enforce the same ownership checks.
- **Realtime.** Socket.IO rooms per user, role and pickup carry status changes, collector
  location (ETA) and notifications.
- **Background jobs.** Recurring plans create pickups two days ahead (hourly job). Price
  alerts fire whenever an admin changes a price.

## 11. Deployment

- **Backend**: Render/Railway/Fly/EC2 or the Docker image. Set `NODE_ENV=production`, a long
  random `JWT_SECRET`, `MONGODB_URI` (Atlas or a replica set), `CLIENT_URL` (your web origin),
  `PUBLIC_API_URL`, and `TRUST_PROXY=1` behind a proxy. If the web app and API are on
  different sites, use HTTPS and `COOKIE_SAMESITE=none`. Run a single API instance (or move
  `services/jobs.js` to a worker) so recurring jobs don't run twice.
- **Frontend**: `npm run build` → static `dist/` on Vercel/Netlify/Cloudflare/nginx with SPA
  fallback. Set `VITE_API_URL` at build time. The nginx config in `frontend/` shows the
  same-origin proxy setup.
- Set `KHALTI_SECRET_KEY` (live key) and `KHALTI_BASE_URL=https://khalti.com/api/v2` for business
  invoice payments; Khalti redirects back to `CLIENT_URL/business?paymentId=…` for verification.
- Register a Sparrow SMS sender ID and set `SMS_PROVIDER=sparrow` for OTPs.

## 12. Troubleshooting

- **Page shows a Tailwind "class does not exist" error** — restart `npm run dev` (Tailwind
  loads its config at start-up).
- **API calls fail / CORS errors** — `VITE_API_URL` must point at the API's port, and
  `CLIENT_URL` must exactly match the web origin.
- **OTP not received** — without an SMS provider the code is printed in the API console and
  shown on screen outside production.
- **`npm test` can't start MongoDB** — the first run downloads a MongoDB binary (~100 MB) into
  `backend/node_modules/.cache`; it needs internet once.
- **Rates page empty** — run `npm run seed`, or add prices for your city in Admin → Prices.

## 13. Known limitations

Be upfront about these before treating ScrapMate as production-ready:

- Third-party integrations (Khalti, payout provider, Sparrow SMS/Twilio, WhatsApp Cloud API, Cloudinary,
  Google Geocoding, web push, Anthropic) are implemented against their documented APIs but
  were only exercised in mock/fallback mode here. Test each with sandbox keys before go-live.
- The AI assistant was tested with the Anthropic SDK mocked, not against the live API.
- Wallet operations are atomic per update but only fully transactional on a replica set
  (Atlas or the Docker setup); a standalone local MongoDB runs them without transactions.
- Background jobs run in-process (one API instance) rather than in a queue/worker.
- Collector location is shared from the browser only while the route/job screen is open
  (no native background tracking).
- Offline weighing can't attach scale photos (uploads need a connection).
- Nepali covers the customer-facing site; admin and collector screens are English (i18n-ready).
- CO₂ figures use approximate per-item factors and are labelled as estimates.
- Analytics "repeat customer rate" is all-time; other metrics follow the selected range.
- Docker images are defined and the compose file validates, but were not built in the
  development environment used here (Docker daemon not running); CI builds them.
- Lighthouse scores were not measured; performance work done: route-level code splitting,
  vendor chunking, API caching for rates, DB indexes, lazy images.
#   s a f a K a b a d  
 