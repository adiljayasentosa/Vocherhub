# Firestore Schema

Collections read/written so far. The rest are declared (per the fixed
collection list) but stay empty until their feature module arrives.

## Used from Phase 2

### `users/{uid}`
Doc ID **must** be the Firebase Auth UID. Created manually (see README —
"First admin user") or later by a Users module.
```
email:        string
name:         string
role:         "admin" | "operator"
active:       boolean
createdAt:    Timestamp
lastLoginAt:  Timestamp | null
```

### `vouchers/{voucherId}`
```
code:       string     e.g. "VCH-20260804-0045"
nominal:    number
status:     "available" | "sold" | "expired"
createdAt:  Timestamp
soldAt:     Timestamp | null
createdBy:  { uid: string, name: string }   -- added by the Voucher module (Phase 3)
```
Dashboard reads: count where `status == "available"` (Stok Voucher
Tersedia) and count where `status != "expired"` (Voucher Aktif).

**Status display mapping** (Voucher module, Phase 3): the approved UI shows
Indonesian labels, translated at the API boundary only — storage stays the
English enum above so the Phase 2 dashboard queries are untouched.
`available` → "Aktif", `sold` → "Terjual", `expired` → "Nonaktif".

### `counters/vouchers`
Added by the Voucher module for collision-free sequential voucher codes.
Written only inside a Firestore transaction in `voucherService.js`.
```
lastSequence:  number
```

### `sales/{saleId}`
Operator/voucher names are denormalized onto the doc so the dashboard's
recent-transactions list and revenue aggregation don't need extra joins.
```
voucherCode:   string
nominal:       number
operatorId:    string
operatorName:  string
method:        string     "Tunai" | "QRIS"
buyerType:     string     "Siswa" | "Guru" | "Staff"   -- added by the Sales module (Phase 3)
status:        string     e.g. "Selesai"
createdAt:     Timestamp
```
Dashboard reads: today's sum/count (Pendapatan & Penjualan Hari Ini),
last 7 days grouped by day (Revenue Chart), most recent N (Recent
Transactions) — all now served via `salesService.js` rather than
duplicated in `dashboardService.js` (see Architecture decisions in
README).

**Selling a voucher** (Sales module, Phase 3) is a single Firestore
transaction across two collections: it claims one `vouchers` doc with
`status == "available"` and the requested `nominal`, flips it to `sold`
(+ `soldAt`), and writes the `sales` doc — so two operators can never
sell the same last unit, and a sale never exists without a real voucher
behind it. If no matching voucher is `available`, the sale is rejected
(409) before anything is written.

Note: the Sales module's "Jual Voucher" form only offers nominals
`3000 / 5000 / 10000` (fixed to match the approved UI exactly), a
smaller set than the Voucher module's `3000 / 5000 / 6000 / 10000 /
20000`. That mismatch already existed between the two approved Phase
2.1 mocks — vouchers created at 6000/20000 currently can't be sold
through this form.

## User Management module (Phase 3, #8)
Extends the existing `users/{uid}` collection (unchanged shape from
Phase 2 — see below) rather than adding a new one. The one real
architectural decision: **create** provisions a genuine Firebase Auth
account (random temp password, since the approved form has no password
field — the new user resets it via "forgot password" on first login),
but **delete** only removes the Firestore profile, never the Auth
account itself — that asymmetry is explicit in the approved UI's own
copy ("Akun Firebase Authentication tidak ikut terhapus otomatis.").
Self-demote/self-deactivate/self-delete are all blocked (a standard
safeguard against accidental lockout, not explicitly spelled out in the
spec but a reasonable default). Admin-only — uses the `requireRole`
middleware Phase 2 built anticipating exactly this.

## System Logs module (Phase 3, #10)
No new collection — this is a real-time viewer over `systemLogs`,
which has been accumulating since Phase 2 (login/logout) and every
module built in Phase 3 that calls `logService.log()` (Voucher, Sales).
Severity (Info/Warning/Error) is derived from the real `type` field
rather than assigned randomly like the approved mock's dummy data.
`user` is resolved via a live join against `users` by `uid` (falling
back to the log's `email`, then "Sistem") rather than being stored
denormalized, since `logService.log()`'s existing signature and every
call site across 8 already-tested files was left untouched. Search
covers the most recent 500 entries (Firestore has no native substring
search) — a real, documented trade-off, not silently glossed over.

## Settings module (Phase 3, #9)
### `schoolInfo/main`
Singleton doc.
```
nama: string, npsn: string, alamat: string, telepon: string, email: string
```

### `voucherPackages/{id}`
A standalone reference price list. **Does not drive Voucher/Sales
validation** — those modules still use their own established fixed
`NOMINALS` lists (see modules #1/#2 above). Wiring them to read this
dynamically would mean changing how two already-shipped, tested modules
validate input; flagged as a deliberate scope boundary, not silently
glossed over. The Settings UI itself says as much in a banner.
```
nominal: number, createdAt: Timestamp
```

### `systemSettings/config`
Singleton doc.
```
lowStockThreshold:        number   REAL override — dashboardService reads
                                    this (falling back to the
                                    LOW_STOCK_THRESHOLD env var if unset)
recentTransactionsLimit:  number   REAL override, same pattern
notifikasiEmail:          boolean  saved for real, NOT enforced (no
                                    email-sending dependency in this project)
modePemeliharaan:         boolean  saved for real, NOT enforced (would mean
                                    changing middlewares/auth.js, which every
                                    other module depends on — too risky to
                                    touch without dedicated scope for it)
```

### `backups/{id}`
A real JSON snapshot of every collection, stored in Firestore itself
(there's no Cloud Storage bucket configured in this project). Genuinely
downloadable and restorable by hand, but **not** the same thing as a
managed `gcloud firestore export` — that needs GCP infrastructure
outside what the Admin SDK alone can do from a request handler.
```
snapshotJson: string   JSON.stringify of { [collectionName]: [{id, data}] }
sizeLabel:    string   e.g. "4.2 MB"
createdBy:    { uid: string, name: string }
createdAt:    Timestamp
```

## Reports module (Phase 3, #7)
`laporan.html`'s 5 reports have no collection of their own — they're
read-only aggregations over `vouchers`, `sales`, `finance`, and
`attendanceRecords` (reusing `voucherService`/`salesService`/
`inventoryService` where possible; see `reportService.js`). "Laporan
Voucher" and "Laporan Stok" are point-in-time snapshots, so the date
filter only applies to Penjualan/Keuangan/Presensi.

### `weeklyGenerations/{id}`
Added by the Weekly Attendance Generator module (Phase 3). One record
per "Generate Absensi" action — persisted so the "Hasil Generate
Terakhir" panel survives page reloads and is the same for every user,
unlike the approved mock's in-memory `lastGenerated` variable which
reset on every load.
```
weekNumber:      number     1-24, semester week (see README: how week
                             numbers are computed — there's no term-start
                             config anywhere in the spec)
weekOf:          string     "YYYY-MM-DD", that week's Monday (WIB)
rangeLabel:      string     "3 Agu 2026 - 9 Agu 2026"
jenis:           string     "Presensi Senin" | "Presensi Jumat"
kelas:           string     "Semua Kelas" | one of the 3 classes
generatedCount:  number     how many NEW attendanceRecords this action created
totalMembers:    number     roster size matching `kelas` at generation time
createdBy:       { uid: string, name: string }
createdAt:       Timestamp
```
Generating is additive/idempotent: it only creates `attendanceRecords`
(status defaults to "Hadir") for roster members in `members` who don't
already have one for that `weekOf`+`day` — running it twice, or running
it after some members were already added by hand via the Attendance
page, never duplicates or overwrites anything.

### `finance/{entryId}`
Added by the Finance module (Phase 3). A standalone manual ledger — it
does **not** automatically pull in Sales revenue; the approved
"Tambah Pemasukan"/"Tambah Pengeluaran" forms take free-text
source/category and a hand-entered amount, so anyone wanting voucher
revenue reflected here enters it themselves (as the mock's own dummy
"Penjualan Voucher" income row already implied).
```
type:         "income" | "expense"
label:        string    "Sumber" (income) or "Kategori" (expense), free text
description:  string
amount:       number
entryDate:    Date       user-chosen date (NOT createdAt) — all balance/
                          cash-flow/monthly-summary math uses this field
                          so backdated entries land in the right period
createdBy:    { uid: string, name: string }
createdAt:    Timestamp  system time; used only for the "Transaksi
                          Terbaru" recently-entered feed, not for money math
```

### `members/{memberId}`
Added by the Attendance module (Phase 3). There's no separate
member-management module anywhere in the 10-module spec, so this roster
is built incrementally through the Attendance page's own "Tambah
Presensi" form (the approved UI's form has no member picker — just
Nama/Kelas/Status/Keterangan) rather than through a dedicated CRUD.
```
nama:       string
kelas:      string    "XI TKJ 1" | "XI TKJ 2" | "XI RPL"
createdAt:  Timestamp
```

### `attendanceRecords/{recordId}`
One row per member per weekly session (Monday or Friday).
```
memberId:    string    -> members/{memberId}
memberName:  string    denormalized, so the table doesn't need a join
kelas:       string    denormalized
day:         "senin" | "jumat"
weekOf:      string    "YYYY-MM-DD", the Monday of that week (WIB) --
                        the canonical identifier for a weekly session
status:      string    "Hadir" | "Izin" | "Sakit" | "Alpa"
keterangan:  string
createdBy:   { uid: string, name: string }
createdAt:   Timestamp
updatedAt:   Timestamp
updatedBy:   { uid: string, name: string }  -- present after the first status edit
```
The Attendance page (`presensi.html`) computes the *current* week's
`weekOf` live from today's date and reads/writes only that session — it
does not pre-generate anything. Auto-creating a new week's session from
the roster is the Weekly Attendance Generator module's job (#6), which
writes into these same two collections rather than its own.

### `stockMovements/{movementId}`
Added by the Inventory module (Phase 3). Written from `voucherService.js`
(create/update/delete) and `salesService.js` (sell) via the shared
`stockMovementService.record()` — never written directly. Only entries
that actually change a nominal's *available* count are recorded (e.g.
creating a voucher as Nonaktif, or deleting one that already was, write
nothing here — no stock impact).
```
nominal:     number
action:      "Ditambahkan" | "Terjual" | "Kedaluwarsa" | "Diaktifkan" | "Dihapus"
delta:       number     positive = added to stock, negative = removed
actorName:   string
createdAt:   Timestamp
```

### `systemLogs/{logId}`
Write-only from the backend; the dashboard's Notifications only reads a
`login_failed` count from the last 24h right now.
```
type:       string   "login_success" | "login_failed" | "logout" |
                      "voucher_created" | "voucher_updated" | "voucher_deleted" |
                      "sale_created"
uid:        string | null
email:      string | null
message:    string
ip:         string | null
createdAt:  Timestamp
```
The `voucher_*` and `sale_created` types are written by their modules
(Phase 3) but not yet surfaced anywhere in the UI — that's the System
Logs module (#10).

## Reserved for later phases (not yet written to)

- `systemStats` — intentionally unused; Phase 2 computes dashboard numbers
  live from `vouchers`/`sales`/`systemLogs` instead of a maintained
  summary doc (per the agreed architecture decision)

`voucherPackages`, `schoolInfo`, `systemSettings`, and `backups` are now
implemented (Settings module, #9) — see above.
