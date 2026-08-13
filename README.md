# MechShop Suite

A licensed, multi-tenant garage management system with three portals:

1. **Shop Owner Portal** - jobs, kanban board, mechanics, attendance, sales, performance, WhatsApp auto-updates, AI-style workload balancing
2. **Mechanic Portal** - login with Mechanic ID, mark attendance, view pending/ongoing jobs
3. **Provider Admin Portal** (yours) - onboard shop clients and issue/renew software licenses

The whole app is gated by a license key you generate per client. If a shop's license expires, every one of their features locks until you renew it from your admin portal.

---

## 1. Requirements

- **Node.js 22.5 or newer** (the database uses Node's built-in `node:sqlite` module, so there's nothing to compile - no Visual Studio / C++ build tools needed, even on Windows)
- npm
- A phone with WhatsApp installed (for the WhatsApp automation - it uses your own number, not Twilio)

> If `node -v` shows something below v22.5, download the latest LTS from nodejs.org first - old Node versions don't have `node:sqlite` at all.
> You may see a one-line `ExperimentalWarning: SQLite is an experimental feature` when the server starts - that's expected and harmless, not an error.

## 2. Install

```bash
cd mechshop-app
npm install
cp .env.example .env
```

Open `.env` and set:
- `JWT_SECRET` / `LICENSE_SECRET` - any long random strings (these sign your session tokens and license keys - keep them secret)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` - your own provider-admin login
- `WHATSAPP_ENABLED=true` once you're ready to connect WhatsApp

## 3. Create your admin account and start the server

```bash
npm run seed     # creates your provider-admin login from .env values
npm start        # starts the server on http://localhost:3000
```

Visit `http://localhost:3000` and pick a portal:

- Shop owner: `/login/shop.html`
- Mechanic: `/login/mechanic.html`
- Provider admin (you): `/login/admin.html`

## 4. Typical flow

1. Log into the **Admin portal** with the email/password from `.env`.
2. Click **+ Add New Shop** - fill in the shop's details, set a temporary password, and pick a license length (1/3/6/12 months). This immediately generates and activates a license key.
3. Give the shop owner their email + temporary password. They log in at `/login/shop.html`.
4. The shop owner adds mechanics (each gets an auto-generated Mechanic ID like `MEC-001AB`) and starts creating jobs.
5. Mechanics log in at `/login/mechanic.html` using their **Mechanic ID as the username** and their **name as the password**.
6. As jobs move across the kanban board (Pending → In Progress → On Hold → Completed → Delivered), the customer automatically gets a WhatsApp message about the new status.
7. When a license is close to expiring (within 14 days) or has expired, it shows up on the Admin portal's **License Expiry** page as a card, ready to renew in one click.



**Notes:**
- This library needs to run a real Chromium instance, so it must run on a machine with internet access (not a fully offline/sandboxed container).
- Each shop's session is stored under `server/whatsapp-session/` - back this up if you move servers, or the shop will need to re-scan the QR code.
- If you want every shop to use their *own* WhatsApp number rather than yours, run one server instance per shop, or extend `server/utils/whatsapp.js` to keep a `Client` per shop ID (the current version runs one shared client for simplicity - see the comment block in that file for where to extend it).

## 6. How licensing works

- Every shop has `license_key`, `license_expires_at`, and `license_status` (`inactive` / `active` / `expired` / `revoked`) in the database.
- `server/middleware/licenseGuard.js` runs before every shop/mechanic API route and checks expiry on every request - no way to bypass it from the frontend.
- `server/utils/license.js` generates a signed key (`SHOPID-EXPIRY-SIGNATURE` style, HMAC-signed with `LICENSE_SECRET`) - it can be verified offline, but the database `license_expires_at` is the actual source of truth so you can revoke early from the admin portal at any time.
- Renewals only unlock in the admin portal once a license is within 14 days of expiry (or already expired) - this stops accidentally stacking duplicate licenses on an active shop.

## 7. The "AI" workload balancing

`server/utils/workload.js` implements a transparent, rule-based load score per mechanic (weighted by in-progress/pending/on-hold jobs, with a small discount for experience). It's not a trained ML model - it's fast, free to run, fully explainable to a shop owner, and flags a mechanic as "overloaded" past a tunable threshold. You can see the exact math in that file and tune `WEIGHTS` / `OVERLOAD_THRESHOLD` per your needs. If you later want a real ML-based prediction (e.g. estimating job duration from history), this is the file to extend.

## 8. Project structure

```
mechshop-app/
  server/
    server.js            - Express app entrypoint
    db/
      schema.sql          - table definitions
      db.js                - sqlite connection (better-sqlite3, file at server/db/mechshop.db)
      seed.js              - creates your provider-admin account
    routes/
      authRoutes.js        - all 3 login flows
      shopRoutes.js        - jobs, kanban, mechanics, attendance, sales, performance
      mechanicRoutes.js    - mechanic-side jobs & attendance
      adminRoutes.js       - shop onboarding & licensing
    middleware/
      licenseGuard.js      - blocks all shop/mechanic routes if license expired
    utils/
      auth.js              - JWT issue/verify
      license.js           - license key generation & signature verification
      workload.js          - mechanic load scoring
      whatsapp.js           - WhatsApp automation wrapper
  public/
    css/                   - shared design system (base.css) + login styling (auth.css)
    js/                    - frontend logic per portal (common.js, shop.js, mechanic.js, admin.js)
    login/                 - portal picker + 3 login pages
    shop/dashboard.html     - shop owner SPA
    mechanic/dashboard.html - mechanic SPA
    admin/dashboard.html    - provider admin SPA
```

## 9. Extending toward Supabase

The `supabase_credits` field on each shop is tracked today as a plain number you set manually in the admin portal (a simple ledger of what you've allocated to that client). If you want the app to actually provision a Supabase project per shop or sync usage automatically, that would call the Supabase Management API from `adminRoutes.js` when a shop is created - happy to build that out if you tell me how you want provisioning to work.

##  10. Format of the message 
Hi {{customer_name}}, your {{bike_model}} with the number ({{bike_number}}) is now {{status}}. Order #{{order_number}}.

If you have any query kindly contact us 
Thank You 😇
