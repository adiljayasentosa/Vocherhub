import { initShell } from './shell.js';
import {
  rupiah, number, openModal, showToast, renderPagination, badge, skeletonRows, emptyState, esc,
} from './ui-components.js';

const NOMINALS = [3000, 5000, 10000];
const METHODS = ['Tunai', 'QRIS'];
const BUYERS = ['Siswa', 'Guru', 'Staff'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const saleCache = new Map();
let state = { page: 1, pageSize: 5, search: '', dateFrom: null, dateTo: null };
let searchDebounce;
let chartInstance;

/** Thin fetch wrapper matching the backend's { success, message, data } envelope. */
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Terjadi kesalahan pada server.');
  return body.data;
}

function iconTag(name) { return `<i data-lucide="${name}" style="width:20px;height:20px"></i>`; }

function formatDateLabel(isoDateStr) {
  const d = new Date(`${isoDateStr}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTrend(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return { text: '', up: true };
  const sign = pct >= 0 ? '+' : '';
  return { text: `${sign}${pct.toFixed(1).replace('.', ',')}% dari kemarin`, up: pct >= 0 };
}

const CARD_DEFS = [
  { key: 'pendapatanHariIni', label: 'Pendapatan Hari Ini', icon: 'banknote', bg: '#dcfce7', color: '#16a34a', money: true, trendKey: 'trendPendapatan' },
  { key: 'transaksiHariIni', label: 'Transaksi Hari Ini', icon: 'receipt', bg: '#dbeafe', color: '#2563eb', money: false, trendKey: 'trendTransaksi' },
  { key: 'pendapatanBulanIni', label: 'Pendapatan Bulan Ini', icon: 'trending-up', bg: '#ede9fe', color: '#7c3aed', money: true },
  { key: 'totalTransaksi', label: 'Total Transaksi', icon: 'shopping-cart', bg: '#ffedd5', color: '#ea580c', money: false },
];

async function renderStatCards() {
  document.getElementById('statCards').innerHTML = CARD_DEFS.map((s) => `
    <div class="vh-card p-4">
      <div class="vh-icon-badge mb-3" style="background:${s.bg}"><span style="color:${s.color}">${iconTag(s.icon)}</span></div>
      <p class="text-xs text-slate-500">${s.label}</p>
      <p class="text-lg font-extrabold mt-0.5" id="stat-${s.key}">-</p>
      ${s.trendKey ? `<p class="text-xs vh-trend-up mt-1" id="trend-${s.key}"></p>` : ''}
    </div>`).join('');
  lucide.createIcons();

  try {
    const stats = await api('/api/sales/stats');
    CARD_DEFS.forEach((s) => {
      const value = stats[s.key];
      document.getElementById(`stat-${s.key}`).textContent = s.money ? rupiah(value) : number(value);
      if (s.trendKey) {
        const { text, up } = formatTrend(stats[s.trendKey]);
        const el = document.getElementById(`trend-${s.key}`);
        el.textContent = text;
        el.className = `text-xs mt-1 ${up ? 'vh-trend-up' : 'vh-trend-down'}`;
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderChart() {
  try {
    const { labels, values } = await api('/api/sales/chart');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('salesTrendChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)', fill: true,
          tension: 0.35, pointRadius: 3, pointBackgroundColor: '#16a34a', borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => rupiah(ctx.raw) } } },
        scales: { y: { ticks: { callback: (v) => (v >= 1000000 ? (v / 1000000) + 'M' : v) }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
      },
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderTable() {
  const tbody = document.getElementById('salesTbody');
  tbody.innerHTML = skeletonRows(7, 5);

  let data;
  try {
    const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    if (state.search) params.set('search', state.search);
    if (state.dateFrom) params.set('dateFrom', state.dateFrom);
    if (state.dateTo) params.set('dateTo', state.dateTo);
    data = await api(`/api/sales?${params.toString()}`);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat transaksi', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
    return;
  }

  state.page = data.page;
  data.items.forEach((s) => saleCache.set(s.id, s));

  tbody.innerHTML = !data.items.length
    ? `<tr><td colspan="7">${emptyState({ icon: 'shopping-cart', title: 'Belum ada transaksi', description: 'Transaksi penjualan akan muncul di sini.' })}</td></tr>`
    : data.items.map((s) => `
      <tr>
        <td>${s.waktu}</td>
        <td class="font-medium">${s.kode}</td>
        <td>${rupiah(s.nominal)}</td>
        <td>${badge(s.metode)}</td>
        <td>${s.pembeli}</td>
        <td>${esc(s.operator)}</td>
        <td><button class="vh-row-action" data-detail="${s.id}" title="Detail"><i data-lucide="eye" style="width:16px;height:16px"></i></button></td>
      </tr>`).join('');

  renderPagination(document.getElementById('salesPagination'), {
    page: data.page, totalPages: data.totalPages, totalItems: data.totalItems, pageSize: data.pageSize,
  }, (p) => { state.page = p; renderTable(); });

  lucide.createIcons();
  document.querySelectorAll('[data-detail]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.detail)));
}

async function openDetail(id) {
  let s = saleCache.get(id);
  if (!s) {
    try {
      s = await api(`/api/sales/${id}`);
      saleCache.set(id, s);
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  }
  openModal({
    title: 'Detail Transaksi',
    bodyHTML: `
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between"><dt class="text-slate-500">Waktu</dt><dd class="font-semibold">${s.waktu}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Kode Voucher</dt><dd class="font-semibold">${s.kode}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Nominal</dt><dd class="font-semibold">${rupiah(s.nominal)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Metode</dt><dd>${badge(s.metode)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Pembeli</dt><dd>${s.pembeli}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Operator</dt><dd>${esc(s.operator)}</dd></div>
      </dl>`,
    footerButtons: [{ label: 'Tutup', variant: 'secondary', onClick: (c) => c() }],
  });
}

/** openModal() only passes `close` into onClick, never the button — grab the mounted button from the DOM. */
function getPrimaryButton() {
  const buttons = document.querySelectorAll('#modalRoot .vh-btn-primary');
  return buttons[buttons.length - 1];
}

function withSavingState(button, savingLabel, fn) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.style.opacity = '0.6';
  button.textContent = savingLabel;
  return fn().finally(() => {
    button.disabled = false;
    button.style.opacity = '';
    button.textContent = originalLabel;
  });
}

function openSell() {
  const bodyHTML = `
    <div class="space-y-4">
      <div class="vh-field">
        <label class="vh-label">Nominal <span class="req">*</span></label>
        <select class="vh-select" id="f-nominal">${NOMINALS.map((n) => `<option value="${n}">${rupiah(n)}</option>`).join('')}</select>
      </div>
      <div class="vh-field">
        <label class="vh-label">Pembeli</label>
        <select class="vh-select" id="f-pembeli">${BUYERS.map((b) => `<option>${b}</option>`).join('')}</select>
      </div>
      <div class="vh-field">
        <label class="vh-label">Metode Pembayaran <span class="req">*</span></label>
        <select class="vh-select" id="f-metode">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select>
      </div>
    </div>`;

  const close = openModal({
    title: 'Jual Voucher',
    bodyHTML,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Proses Penjualan', variant: 'primary',
        onClick: () => {
          const nominal = parseInt(document.getElementById('f-nominal').value, 10);
          const pembeli = document.getElementById('f-pembeli').value;
          const metode = document.getElementById('f-metode').value;

          withSavingState(getPrimaryButton(), 'Memproses...', async () => {
            try {
              await api('/api/sales', { method: 'POST', body: JSON.stringify({ nominal, pembeli, metode }) });
              state.page = 1;
              await Promise.all([renderStatCards(), renderChart(), renderTable()]);
              showToast('Penjualan voucher berhasil dicatat.', 'success');
              close();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        },
      },
    ],
  });
}

/**
 * The approved UI's calendar button ("3 Jun 2024 - 3 Jun 2024") has no
 * click handler in the Phase 2.1 mock. Wiring it here since every table
 * needs a working Filter — reuses only existing modal/field components,
 * no new visual element.
 */
function openDateFilter() {
  const today = new Date().toISOString().slice(0, 10);
  const bodyHTML = `
    <div class="space-y-4">
      <div class="vh-field">
        <label class="vh-label">Dari Tanggal</label>
        <input type="date" class="vh-input" id="f-date-from" value="${state.dateFrom ? state.dateFrom.slice(0, 10) : today}">
      </div>
      <div class="vh-field">
        <label class="vh-label">Sampai Tanggal</label>
        <input type="date" class="vh-input" id="f-date-to" value="${state.dateTo ? state.dateTo.slice(0, 10) : today}">
      </div>
    </div>`;

  const close = openModal({
    title: 'Filter Tanggal',
    bodyHTML,
    footerButtons: [
      {
        label: 'Reset', variant: 'secondary',
        onClick: (c) => {
          state.dateFrom = null; state.dateTo = null; state.page = 1;
          document.getElementById('dateFilterLabel').textContent = 'Semua Tanggal';
          renderTable();
          c();
        },
      },
      {
        label: 'Terapkan', variant: 'primary',
        onClick: (c) => {
          const from = document.getElementById('f-date-from').value;
          const to = document.getElementById('f-date-to').value;
          if (!from || !to) return;
          state.dateFrom = `${from}T00:00:00`;
          // Upper bound is exclusive, so push to the start of the *next* day
          // to include every transaction on the selected end date.
          const toExclusive = new Date(`${to}T00:00:00`);
          toExclusive.setDate(toExclusive.getDate() + 1);
          state.dateTo = toExclusive.toISOString();
          state.page = 1;
          document.getElementById('dateFilterLabel').textContent = `${formatDateLabel(from)} - ${formatDateLabel(to)}`;
          renderTable();
          c();
        },
      },
    ],
  });
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-card p-5">
      <h2 class="font-semibold mb-4">Grafik Pendapatan (7 Hari Terakhir)</h2>
      <div class="vh-chart-box"><canvas id="salesTrendChart"></canvas></div>
    </div>

    <div class="vh-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-semibold">Riwayat Penjualan</h2>
        <button id="btnSell" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm">
          <i data-lucide="plus" style="width:16px;height:16px"></i> Jual Voucher
        </button>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <div class="vh-search-wrap">
          <i data-lucide="search" style="width:16px;height:16px"></i>
          <input id="salesSearch" class="vh-input" placeholder="Cari kode voucher / nama pembeli...">
        </div>
        <button id="btnDateFilter" class="vh-btn vh-btn-secondary !py-2 !px-4 text-sm sm:w-48">
          <i data-lucide="calendar" style="width:16px;height:16px"></i> <span id="dateFilterLabel">Semua Tanggal</span>
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[680px]">
          <thead><tr><th>Waktu</th><th>Kode Voucher</th><th>Nominal</th><th>Metode</th><th>Pembeli</th><th>Operator</th><th>Aksi</th></tr></thead>
          <tbody id="salesTbody">${skeletonRows(7, 5)}</tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 mt-4" id="salesPagination"></div>
    </div>`;

  document.getElementById('btnSell').addEventListener('click', openSell);
  document.getElementById('btnDateFilter').addEventListener('click', openDateFilter);
  document.getElementById('salesSearch').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => { state.search = value; state.page = 1; renderTable(); }, 300);
  });
  lucide.createIcons();
}

async function init() {
  const user = await initShell({
    active: 'penjualan',
    title: 'Riwayat Penjualan',
    description: 'Pantau transaksi penjualan voucher dan catat penjualan baru.',
    breadcrumb: [{ label: 'Penjualan' }],
  });
  if (!user) return;

  document.getElementById('pageHeader').insertAdjacentHTML('afterend', '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="statCards"></div>');
  renderPageBody();
  await Promise.all([renderStatCards(), renderChart(), renderTable()]);
}

init();
