# VoucherHub — Phase 2 + Phase 3 + Phase 3.1 (Production Hardening)

Node.js + Express (MVC) backend for the SMK IBG 3 WiFi Voucher
Administration System, wired to Firebase Authentication + Firestore.

## Phase 3.1 — Production Hardening & Final QA
A security/production audit pass over the completed Phase 3 codebase.
Summary (full findings in the audit report delivered alongside this
code, not duplicated here to avoid drift):
- **Fixed:** stored-XSS risk — ~15 free-text fields (names, finance
  descriptions, attendance notes, school info, log messages, report
  rows) were interpolated into `innerHTML` unescaped across the
  frontend. Added a shared `esc()` helper (`public/js/ui-components.js`)
  and applied it at every affected call site.
- **Added:** `.gitignore` (there wasn't one — real risk of committing
  `.env`/credentials), `firestore.rules`, `firestore.indexes.json`.
- **Reviewed, no change needed:** `requireAuth`/`requireRole` wiring on
  every route, input validation on every write endpoint, error handling,
  secret management (`.env.example` has placeholders only, no
  hardcoded credentials anywhere), and the Search+Date-Filter query
  logic in `salesService.js`/`systemLogsService.js` (combines correctly).
- **Not verified:** this environment has no live Firebase project to
  test against, so Authentication/Firestore/Security-Rules behavior
  against a real backend is unverified — see "What I couldn't verify
  here" below. There is also no automated test suite committed in this
  repo (no `__tests__`, no test script in `package.json`) to re-run as
  a regression check; add one before relying on CI for this project.

- **Phase 2** (done): Login + a Dashboard reading real Firestore data.
- **Phase 3, Module 1** (done): Voucher Management — create/edit/delete,
  detail, search, status filter, and pagination, wired to the approved
  Phase 2.1 `voucher.html` UI exactly as designed.
- **Phase 3, Module 2** (done): Sales — Jual Voucher (sell), Sales
  History, Transaction Detail, and daily/monthly/all-time revenue
  stats + a 7-day trend chart, wired to the approved `penjualan.html`
  UI. Selling atomically consumes real Voucher Management stock.
- **Phase 3, Module 3** (done): Voucher Inventory — per-nominal stock
  breakdown, low-stock warning banner, distribution chart, and stock
  movement history, wired to the approved `stok.html` UI. Fed by the
  Voucher and Sales modules rather than tracked separately.
- **Phase 3, Module 4** (done): Finance — a standalone manual
  income/expense ledger (Ringkasan/Pemasukan/Pengeluaran/Arus Kas tabs),
  30-day cash flow chart, and monthly summary, wired to the approved
  `keuangan.html` UI. Does not auto-pull Sales revenue — see SCHEMA.md.
- **Phase 3, Module 5** (done): Attendance — Monday/Friday weekly
  sessions computed live from the real current week, a monthly recap,
  and a member roster built through the page's own "Tambah Presensi"
  form (no separate member-management module exists in the spec),
  wired to the approved `presensi.html` UI.
- **Phase 3, Module 6** (done): Weekly Attendance Generator —
  computes real semester week numbers (see "How week numbers work"
  below), generates that week's attendance records from the roster
  (additive/idempotent), a real preview, and real PDF/Excel exports via
  `pdfkit`/`exceljs`, wired to the approved `generate-absensi.html` UI.
- **Phase 3, Module 7** (done): Reports — 5 real, live reports
  (Penjualan/Keuangan/Voucher/Presensi/Stok) with date filtering, real
  data previews, and PDF/Excel export, wired to the approved
  `laporan.html` UI. No collection of its own — pure read-only
  aggregation over the other modules' data, reusing their services
  where possible instead of re-querying from scratch.
- **Phase 3, Module 8** (done): User Management — admin-only CRUD over
  `users/{uid}` (extends the Phase 2 collection, no schema change).
  Create provisions a real Firebase Auth account; delete only revokes
  app access, never the Auth account — matching the approved UI's own
  confirm-dialog text. Self-demote/deactivate/delete are all blocked.
- **Phase 3, Module 9** (done): Settings — School Info, a Voucher
  Prices reference list, System Config (with a *real* dashboard
  integration for the low-stock threshold — see below), self-service
  Account, and real JSON-snapshot Backups, wired to the approved
  `pengaturan.html` UI. Two settings (email notifications, maintenance
  mode) are saved for real but not enforced — flagged deliberately,
  see "Known scope boundaries" below.
- **Phase 3, Module 10** (done): System Logs — a real-time, searchable,
  filterable viewer over `systemLogs` (accumulating since Phase 2),
  with severity derived from real event types and user names resolved
  via a live join, wired to the approved `log-sistem.html` UI.

**All 10 modules of the Phase 3 spec are implemented.** Every module
has service-level tests, HTTP-level tests through the real Express app,
and (Modules 1-2) full jsdom UI-click tests — see "What I couldn't
verify here" below for exactly what that does and doesn't cover.

## Known scope boundaries (Module 9)
Three things in Settings are honest half-measures rather than fully
wired, each for a specific reason:
- **Harga Voucher** is a standalone reference list. It does not drive
  what nominals Voucher/Sales actually accept — those keep their own
  established fixed lists. Wiring them together would mean changing how
  two already-shipped, tested modules validate input this late.
- **Notifikasi Email** toggle is saved, but nothing sends an email —
  this project has no email-sending dependency (SMTP/SendGrid/etc.).
- **Mode Pemeliharaan** toggle is saved, but doesn't block Operator
  access — enforcing it means changing `middlewares/auth.js`, which
  every other module's routes depend on. Too risky to touch without
  dedicated scope and re-testing everything downstream of it.

**Ambang Batas Stok Rendah and Jumlah Transaksi di Dashboard, by
contrast, ARE fully real** — `dashboardService.js` reads both from
Firestore (falling back to the env var default only if nothing's been
saved yet), so changing them in Settings genuinely changes Dashboard
behavior. Verified with a real before/after test, not just "the field
saves".

## How week numbers work
There's no term-start date configured anywhere in the spec (that would
naturally belong to the future Settings module), so "Minggu Ke 1" is
computed: Indonesian schools run two semesters a year (Genap: Jan-Jun,
Ganjil: Jul-Dec), and week 1 is the first Monday on/after the current
semester's 1st. This is a real, live calculation — the "current week"
auto-selected in the dropdown is always today's actual real week,
unlike the approved mock's hardcoded "23".

The Phase 1 frontend now lives in `public/` and is served directly by
Express — one app, one origin, no CORS needed.

## Architecture decisions
- **Session strategy:** httpOnly Firebase session cookie, not a
  client-held ID token.
- **Dashboard data:** read live off the raw `vouchers`/`sales`/`systemLogs`
  collections via `dashboardService`, no CRUD modules built for Phase 2.
- **Frontend hosting:** unified into Express's `public/` folder.
- **Voucher status:** stored in Firestore as `available|sold|expired`
  (unchanged from Phase 2, so the dashboard's existing queries keep
  working) and translated to the approved UI's Indonesian labels
  (`Aktif|Terjual|Nonaktif`) only at the API boundary. See `SCHEMA.md`.
- **Voucher codes:** sequential (`VCH-YYYYMMDD-0001`), reserved via a
  Firestore transaction on `counters/vouchers` so concurrent "Tambah
  Voucher" submissions never collide.
- **Data integrity:** a voucher already marked `sold` can't be edited or
  deleted through the API (409) — protects the ledger once the Sales
  module exists.
- **Selling a voucher is one Firestore transaction across two
  collections:** it claims an `available` voucher of the requested
  nominal, marks it `sold`, and writes the `sales` doc together — so two
  operators can never sell the same last unit, and a sale is never
  recorded without real stock behind it. See `SCHEMA.md`.
- **Shared sales logic, not duplicated:** the day-bucketed revenue chart
  and "recent transactions" formatting used to live only in
  `dashboardService.js`; they're now owned by `salesService.js` and the
  dashboard imports them, since the Sales page's own chart needs the
  exact same logic.
- **Stock movement history isn't a separate write path:** `voucherService`
  and `salesService` call a shared `stockMovementService.record()`
  whenever an action actually changes a nominal's available count, so
  the Inventory module's history can't drift out of sync with the real
  create/edit/delete/sell flows.
- **Inventory's per-nominal rows come from `voucherService.NOMINALS`**
  (the single real source of truth for which nominals can exist), not a
  separately hardcoded list — the approved `stok.js` mock's own list
  included 50000, a value the Voucher module can never actually create.
- **Finance is a standalone manual ledger, not auto-fed by Sales.** All
  of its money math (balance, cash flow, monthly summary) is keyed on
  the user-chosen `entryDate`, not system `createdAt`, so a backdated
  entry lands in the correct month/day bucket. `createdAt` is used only
  for the "recently entered" activity feed. See SCHEMA.md.
- **Attendance has no separate member-management module** anywhere in
  the spec, so the `members` roster is built incrementally through the
  page's own "Tambah Presensi" form. A weekly session is identified by
  `weekOf` (the Monday of that week, WIB) + `day`, computed live from
  the real current date — nothing is pre-generated by this module
  itself; that's the Weekly Attendance Generator's job (#6), writing
  into these same `members`/`attendanceRecords` collections.
- **The Generator's "Preview" uses the currently-selected form values,**
  not the last-generated result — the approved mock's own preview used
  `lastGenerated` + 5 hardcoded names instead, which doesn't match what
  "preview before you generate" should show.
- **PDF/Excel exports are real files** (`pdfkit`/`exceljs`), not the
  approved mock's "coming in Phase 3" toast placeholder — verified by
  checking actual PDF/ZIP magic bytes in tests, not just that a response
  came back.
- **The table-to-PDF/table-to-Excel writer is shared** (`utils/exportHelpers.js`)
  between the Weekly Attendance Generator and Reports, rather than each
  module carrying its own pdfkit/exceljs boilerplate.
- **Reports has no collection of its own.** All 5 report types are
  read-only aggregations over the other modules' collections, reusing
  `voucherService`/`salesService`/`inventoryService` directly rather
  than re-deriving the same numbers a second way.
- **User Management is admin-only** — the first module to use
  `middlewares/rbac.js`'s `requireRole`, which Phase 2 built specifically
  anticipating this. Create provisions a real Firebase Auth account;
  delete only revokes app access, matching the approved UI's own
  confirm-dialog copy exactly. Self-demote/deactivate/delete are blocked.
- **System Logs has no collection of its own** — it's a real-time viewer
  over `systemLogs`, which has been accumulating since Phase 2. User
  names are resolved via a live join against `users` rather than stored
  denormalized, since that would've meant touching `logService.log()`'s
  signature and every one of its 8 existing call sites this late.

## Project structure
```
config/        env.js, firebase-admin.js
controllers/    thin — parse req, call a service, send res
services/       all business logic + Firestore/Auth calls
middlewares/    auth.js (session verify), rbac.js, validate.js, security.js
routes/         authRoutes, dashboardRoutes, configRoutes, voucherRoutes,
                salesRoutes, inventoryRoutes, financeRoutes, attendanceRoutes,
                attendanceGeneratorRoutes, reportRoutes, userRoutes,
                settingsRoutes, systemLogsRoutes
utils/          asyncHandler, apiResponse, logger, dateRange (WIB helpers)
scripts/        seed.js, createAdmin.js
public/         Phase 1 shell (index/login/dashboard.html) + Phase 2.1
                feature pages (voucher.html, etc.), css, js
app.js          Express app + middleware wiring
server.js       boots the app
firestore.rules         Firestore Security Rules (Phase 3.1)
firestore.indexes.json  Composite indexes inferred from services/*.js (Phase 3.1)
.gitignore              Added in Phase 3.1 — was missing before
SCHEMA.md       Firestore collection field reference
```

## 1. Set up a Firebase project
You need a Firebase project with **Authentication** (Email/Password
provider enabled) and **Firestore** (Native mode) turned on. This backend
doesn't create the Firebase project for you — do that in the
[Firebase Console](https://console.firebase.google.com).

From **Project Settings**:
- **Service accounts** tab → *Generate new private key* → gives you
  `project_id`, `client_email`, `private_key` for the Admin SDK (server-side).
- **General** tab → *Your apps* → *Web app* config → gives you `apiKey`,
  `authDomain`, `storageBucket`, `messagingSenderId`, `appId` for the
  client SDK (used by `public/js/login.js` in the browser).

## 1a. Deploy Firestore Security Rules & Indexes
```bash
npm install -g firebase-tools   # if you don't already have the CLI
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>
```
`firestore.rules` denies all direct client reads/writes by default —
this app's frontend never talks to Firestore directly (see the comment
block at the top of that file for why), so this is a defense-in-depth
backstop, not the primary access control (that's `middlewares/auth.js` +
`middlewares/rbac.js`, enforced on every API route).

`firestore.indexes.json` lists the composite indexes inferred from the
`.where()` chains in `services/*.js` (e.g. Voucher search + status
filter, Sales search + date range). These were derived by reading the
query code, not by running it against a live project — the first time
each query combination actually runs, Firestore will show a "create
index" link in the error if one is still missing. Treat the indexes file
as a head start, not a guarantee; watch server logs after your first
real deploy and add/deploy any index Firestore asks for.

## 2. Configure environment variables
```bash
cp .env.example .env
```
Fill in the Firebase values from step 1. `FIREBASE_PRIVATE_KEY` needs to
keep its `\n` escapes exactly as they appear in the downloaded JSON,
wrapped in quotes.

## 3. Install dependencies
```bash
npm install
```

## 4. Create your first user
Firebase Auth alone doesn't grant access — a matching `users/{uid}`
Firestore doc with a `role` is required (see `SCHEMA.md`). Two steps:

1. Firebase Console → Authentication → Users → **Add user** (email + password).
2. Copy the UID it generates, then run:
   ```bash
   node scripts/createAdmin.js <uid> <email> "Nama Anda" admin
   ```
   (use `operator` instead of `admin` as the last argument for an Operator account)

## 5. (Optional) Seed sample data
So the dashboard has real numbers instead of zeros on a fresh project:
```bash
npm run seed
```
This only populates `vouchers` and `sales` — it does not touch
Authentication or `users`.

## 6. Run it
```bash
npm start        # or: npm run dev (nodemon, auto-restart)
```
Open `http://localhost:3000` — this serves the whole app (landing,
login, dashboard) from one Express server.

## API surface
| Method | Path                        | Auth      | Purpose |
|--------|-----------------------------|-----------|---------|
| GET    | `/api/config/firebase-client` | none    | Firebase client config for the browser SDK |
| POST   | `/api/auth/login`             | none    | Exchanges a Firebase ID token for a session cookie |
| POST   | `/api/auth/logout`            | none    | Clears the session, revokes refresh tokens |
| GET    | `/api/auth/me`                 | session | Current user (uid, email, name, role) |
| GET    | `/api/dashboard/summary`      | session | Today's revenue/sales, voucher stock/active, 7-day revenue chart, notifications, recent transactions |
| GET    | `/api/vouchers/stats`         | session | Total / Aktif / Terjual / Nonaktif counts |
| GET    | `/api/vouchers`               | session | Paginated, searchable, filterable voucher list |
| GET    | `/api/vouchers/:id`           | session | Voucher detail |
| POST   | `/api/vouchers`               | session | Batch-create vouchers (nominal, jumlah, status) |
| PATCH  | `/api/vouchers/:id`           | session | Edit nominal/status (blocked if already sold) |
| DELETE | `/api/vouchers/:id`           | session | Delete (blocked if already sold) |
| GET    | `/api/sales/stats`            | session | Today's revenue/count (+trend), this month's revenue, all-time count |
| GET    | `/api/sales/chart`            | session | 7-day revenue trend |
| GET    | `/api/sales`                  | session | Paginated, searchable, date-filterable Sales History |
| GET    | `/api/sales/:id`               | session | Transaction detail |
| POST   | `/api/sales`                  | session | Sell a voucher (nominal, pembeli, metode) — atomically consumes stock |
| GET    | `/api/inventory/stock`        | session | Per-nominal stock breakdown + today's movement delta |
| GET    | `/api/inventory/movements`    | session | Recent stock movement history |
| GET    | `/api/finance/stats`          | session | Saldo saat ini, total pemasukan/pengeluaran, saldo bulan ini (+trend) |
| GET    | `/api/finance/cashflow`       | session | 30-day income vs expense chart |
| GET    | `/api/finance/monthly-summary`| session | Saldo awal/akhir + this month's totals |
| GET    | `/api/finance/recent`         | session | Merged recent income/expense activity |
| GET    | `/api/finance/income`         | session | Income ledger list |
| GET    | `/api/finance/expense`        | session | Expense ledger list |
| POST   | `/api/finance/income`         | session | Add an income entry |
| POST   | `/api/finance/expense`        | session | Add an expense entry |
| GET    | `/api/attendance/:day`        | session | This week's Monday/Friday session (day = senin\|jumat) |
| POST   | `/api/attendance/:day`        | session | Add a member + record their attendance for this session |
| PATCH  | `/api/attendance/records/:id` | session | Update a status/keterangan |
| GET    | `/api/attendance/recap`       | session | Monthly attendance recap per member |
| GET    | `/api/attendance-generator/weeks`        | session | The 24 selectable semester weeks + which is current |
| GET    | `/api/attendance-generator/last`         | session | Most recent generation (for the result panel) |
| GET    | `/api/attendance-generator/preview`      | session | Real roster preview for a week/jenis/kelas |
| POST   | `/api/attendance-generator/generate`     | session | Generate that week's attendance from the roster |
| GET    | `/api/attendance-generator/export/pdf`   | session | Download a printable PDF attendance sheet |
| GET    | `/api/attendance-generator/export/excel` | session | Download an .xlsx attendance sheet |
| GET    | `/api/reports/:key`                | session | Real preview for one of 5 reports (?dateFrom=&dateTo=) |
| GET    | `/api/reports/:key/export/pdf`     | session | Download that report as PDF |
| GET    | `/api/reports/:key/export/excel`   | session | Download that report as .xlsx |
| GET    | `/api/users/stats`            | admin   | Total/Admin/Operator/Nonaktif counts |
| GET    | `/api/users`                  | admin   | Paginated, searchable, role-filterable user list |
| GET    | `/api/users/:id`              | admin   | User detail |
| POST   | `/api/users`                  | admin   | Create user (provisions a real Auth account) |
| PATCH  | `/api/users/:id`               | admin   | Edit user (blocked for self-demote/deactivate) |
| DELETE | `/api/users/:id`               | admin   | Delete profile only, not the Auth account (blocked for self) |
| PUT    | `/api/settings/account`       | session | Self-service: update own name/password |
| GET    | `/api/settings/school`        | admin   | School info |
| PUT    | `/api/settings/school`        | admin   | Update school info |
| GET    | `/api/settings/prices`        | admin   | Voucher price reference list |
| POST   | `/api/settings/prices`        | admin   | Add a price |
| DELETE | `/api/settings/prices/:id`     | admin   | Remove a price |
| GET    | `/api/settings/system`        | admin   | System config |
| PUT    | `/api/settings/system`        | admin   | Update system config (real dashboard integration) |
| GET    | `/api/settings/backups`       | admin   | List backups |
| POST   | `/api/settings/backups`       | admin   | Create a real JSON snapshot backup |
| GET    | `/api/settings/backups/:id/download` | admin | Download that backup's JSON |
| GET    | `/api/logs/filter-options`    | admin   | Real users + severities for the filter dropdowns |
| GET    | `/api/logs`                   | admin   | Paginated, searchable, filterable activity log |

## What I couldn't verify here
> **Phase 3.1 note:** the in-memory mock test run described below was
> performed during Phase 3 development but its test files were never
> committed to this repository — there's no `__tests__` directory or
> test script in `package.json` here. So this section is a historical
> record of what was checked before, not something Phase 3.1 could
> re-run as a regression suite. If you want a real, repeatable
> regression check, add a test framework (e.g. `jest`) and commit
> actual test files — happy to do that as a follow-up if wanted.

I don't have network access to a live Firebase project in this
environment, so none of this has run against real Firestore/Firebase
Auth yet. I went further than a syntax check, though: for every one of
the 10 Phase 3 modules I built a throwaway in-memory Firestore + Auth
mock and ran the actual `services/`, `controllers/`, and `routes/` code
against it — service-level tests plus full HTTP requests through the
real Express app, for every module, including RBAC checks (confirmed an
authenticated non-admin genuinely gets 403 on User Management/Settings/
System Logs, not just "should"). Modules 1-2 also got a jsdom-driven
test clicking through the actual modals in the actual `public/js/*.js`
files. All of it passed, including real cross-module checks along the
way:
- A sale really flips a voucher's status in Voucher Management and
  shows up in Inventory's stock counts and movement history.
- Backdated Finance entries land in the correct month.
- The Weekly Attendance Generator's output shows up in the Attendance
  module's own session view.
- Generated PDF/Excel exports (Modules 6, 7) were checked for real
  file-format magic bytes (`%PDF-`, ZIP's `PK`), not just "a response
  came back".
- Settings' low-stock threshold change was proven to actually flip the
  Dashboard's warning on and off, before/after.
- User Management's "create" was confirmed to produce a real (mock)
  Firebase Auth account, and "delete" was confirmed to leave that Auth
  account intact — matching the approved UI's own copy.
- System Logs was tested against logs generated by *real actions*
  through Voucher/Sales, not seeded log documents.
- The final full-project regression suite hit all 10 modules' endpoints
  together in one running server.

Along the way this also caught and fixed a few real bugs before they'd
have shipped: a WIB date-math off-by-one in the Attendance service, and
(in my test mock, not the app) a couple of timestamp-precision issues
that were making sort order and range queries unreliable.

What none of this can catch: real Firestore composite index
requirements (noted inline in the affected services — Firestore will
surface these with a direct "create index" link the first time each
query combination runs against your real project) and real Firebase
Auth/session-cookie behavior end to end. Run `npm install` (pulls in
`pdfkit`/`exceljs`, added for Modules 6-7's exports, alongside the
Phase 2 dependencies) and point it at your actual Firebase project —
let me know if anything breaks.

## Nothing left in this phase
All 10 Phase 3 modules are implemented. `systemStats` is the one
collection that stays intentionally unused — Phase 2's architecture
decision was to compute dashboard numbers live from
`vouchers`/`sales`/`systemLogs` rather than maintain a separate summary
doc, and nothing since has needed to revisit that.

## Decisions worth your review
None of these are hidden — each is called out inline above/in
`SCHEMA.md` too — but collecting them here since they're the calls most
worth double-checking against what you actually want:
1. **Nominal mismatch across modules**, pre-existing in the approved
   mocks themselves: Voucher offers 5 nominals, Sales' "Jual Voucher"
   only 3, Settings' price list is a fourth, disconnected list. Not
   unified — would mean changing already-shipped validation logic.
2. **A few inert buttons were wired, others deliberately left alone.**
   Wired: Sales'/Reports'/System Logs' date-range buttons, Reports'
   type filter (all had one unambiguous meaning). Left alone: Voucher
   Inventory's generic "Filter" button (no defined criteria to wire
   without inventing one).
3. **No member-management module exists in the spec**, so Attendance's
   roster is built incrementally through its own "Tambah Presensi" form.
4. **Two Settings toggles (email notifications, maintenance mode) save
   for real but aren't enforced** — one needs an email dependency this
   project doesn't have, the other would mean changing the core auth
   middleware every module depends on. The low-stock threshold and
   dashboard transaction limit, by contrast, ARE fully wired.
5. **User creation provisions a real Firebase Auth account** (temp
   password, resets via "forgot password"); **deletion only revokes
   app access**, never the Auth account — matching the approved
   confirm-dialog text exactly, an intentional asymmetry.
6. **Backups are real JSON snapshots stored in Firestore itself**, not
   a managed `gcloud firestore export` — this project has no Cloud
   Storage bucket configured.
