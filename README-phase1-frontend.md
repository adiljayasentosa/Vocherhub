# VoucherHub — Phase 1: UI Foundation

Frontend-only prototype for the SMK IBG 3 WiFi Voucher Administration System.
No backend, no Firebase, no auth logic — everything is wired to local dummy
JSON so it's ready to swap for real API/Firebase calls in Phase 2.

## Pages included
- `index.html` — Public landing page
- `login.html` — Login page (submits straight to the dashboard, no real auth)
- `dashboard.html` — Dashboard (overview stats, revenue & sales charts, stock
  and attendance donuts, notifications, recent transactions, finance summary)

Feature modules listed in the brief (Voucher, Sales, Inventory, Finance,
Attendance, Generate Attendance, Reports, Users, Settings, System Logs) are
intentionally **not** built yet — the sidebar links to them but the pages
themselves are scoped for a later phase.

## Stack
Tailwind CSS (CDN), vanilla JS (ES modules), Chart.js, Lucide Icons — all
loaded via CDN, no build step required.

## Running it
Because `dashboard.js` uses `fetch()` to load the JSON files in `/data`,
opening `dashboard.html` directly as a `file://` path will fail in most
browsers (CORS blocks local file fetches). Serve the folder instead:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:PORT/index.html`.

`index.html` and `login.html` don't fetch anything, so those two can be
opened directly if needed — only `dashboard.html` requires a server.

## Structure
```
voucherhub/
├── index.html
├── login.html
├── dashboard.html
├── css/style.css        # design tokens + component classes on top of Tailwind
├── js/dashboard.js       # renders dashboard from dummy JSON
└── data/
    ├── dashboard.json
    ├── sales.json
    ├── notifications.json
    ├── users.json
    └── vouchers.json
```

## Notes on the dashboard layout
The approved mockup's "Overview" and "Detail" frames are treated as one
continuous scrollable dashboard page (matching how the mobile mockup labels
the second frame "DASHBOARD – DETAIL (SCROLL)"), rather than two separate
routes — so the sidebar/topbar aren't duplicated.
