import { initShell } from './shell.js';
import { rupiah, number, badge, showToast, skeletonRows, emptyState, esc } from './ui-components.js';

let overviewRows = []; // full per-nominal dataset, kept client-side for the (tiny, ≤5 row) search filter
let stockChart;

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

function renderStatCards() {
  document.getElementById('statCards').innerHTML = overviewRows.map((r) => `
    <div class="vh-card p-4">
      <div class="vh-icon-badge mb-3 ${r.status === 'Rendah' ? 'bg-amber-50' : 'bg-green-50'}">
        <span class="${r.status === 'Rendah' ? 'text-amber-600' : 'text-green-600'}"><i data-lucide="package" style="width:20px;height:20px"></i></span>
      </div>
      <p class="text-xs text-slate-500">${rupiah(r.nominal)}</p>
      <p class="text-lg font-extrabold mt-0.5">${number(r.stok)}</p>
      <p class="text-xs ${r.deltaHariIni > 0 ? 'vh-trend-up' : r.deltaHariIni < 0 ? 'vh-trend-down' : 'text-slate-400'} mt-1">
        ${r.deltaHariIni === 0 ? 'Tidak ada perubahan' : `${r.deltaHariIni > 0 ? '+' : ''}${r.deltaHariIni} dari kemarin`}
      </p>
    </div>`).join('');
  lucide.createIcons();
}

function renderWarningBanner() {
  const low = overviewRows.filter((r) => r.status === 'Rendah');
  const el = document.getElementById('warningBanner');
  if (!low.length) { el.innerHTML = ''; return; }
  const names = low.map((r) => rupiah(r.nominal)).join(' dan ');
  el.innerHTML = `
    <div class="vh-alert-banner vh-alert-amber">
      <i data-lucide="alert-triangle" style="width:16px;height:16px" class="mt-0.5 shrink-0"></i>
      <div><strong>Stok rendah:</strong> ${names} sudah di bawah ambang batas. Segera lakukan Generate Voucher.</div>
    </div>`;
  lucide.createIcons();
}

function renderChart() {
  if (stockChart) stockChart.destroy();
  stockChart = new Chart(document.getElementById('stockChart'), {
    type: 'bar',
    data: {
      labels: overviewRows.map((r) => rupiah(r.nominal)),
      datasets: [{
        data: overviewRows.map((r) => r.stok),
        backgroundColor: overviewRows.map((r) => (r.status === 'Rendah' ? '#f59e0b' : '#16a34a')),
        borderRadius: 6, maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
    },
  });
}

/**
 * Client-side filter, not a server round-trip: the table is at most one
 * row per real nominal (currently ≤5 total, bounded by
 * voucherService.NOMINALS) — already fully loaded, so filtering on
 * every keystroke locally is both simpler and snappier than a network
 * request per character.
 */
function renderStockTable(searchTerm = '') {
  const term = searchTerm.trim();
  const filtered = term ? overviewRows.filter((r) => String(r.nominal).includes(term)) : overviewRows;
  const tbody = document.getElementById('stockTbody');

  tbody.innerHTML = !filtered.length
    ? `<tr><td colspan="7">${emptyState({ icon: 'package', title: 'Nominal tidak ditemukan', description: 'Coba ubah kata kunci pencarian.' })}</td></tr>`
    : filtered.map((r) => `
      <tr>
        <td class="font-medium">${rupiah(r.nominal)}</td>
        <td>${number(r.total)}</td>
        <td>${number(r.aktif)}</td>
        <td>${number(r.terjual)}</td>
        <td>${number(r.nonaktif)}</td>
        <td class="font-semibold">${number(r.stok)}</td>
        <td>${badge(r.status)}</td>
      </tr>`).join('');

  document.getElementById('stockCountLabel').textContent = `Menampilkan 1-${filtered.length} dari ${overviewRows.length}`;
}

async function loadOverview() {
  document.getElementById('stockTbody').innerHTML = skeletonRows(7, 5);
  try {
    const { rows } = await api('/api/inventory/stock');
    overviewRows = rows;
    renderStatCards();
    renderWarningBanner();
    renderChart();
    renderStockTable();
  } catch (err) {
    document.getElementById('stockTbody').innerHTML = `<tr><td colspan="7">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat data stok', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
  }
}

async function loadMovements() {
  const tbody = document.getElementById('movementTbody');
  tbody.innerHTML = skeletonRows(5, 5);
  try {
    const movements = await api('/api/inventory/movements?limit=20');
    tbody.innerHTML = !movements.length
      ? `<tr><td colspan="5">${emptyState({ icon: 'history', title: 'Belum ada pergerakan stok', description: 'Riwayat akan muncul setelah ada voucher ditambahkan atau terjual.' })}</td></tr>`
      : movements.map((m) => `
        <tr>
          <td>${esc(m.tanggal)}</td>
          <td>${badge(m.aksi === 'Ditambahkan' ? 'Aktif' : m.aksi === 'Terjual' ? 'Terjual' : 'Nonaktif')} ${esc(m.aksi)}</td>
          <td>${rupiah(m.nominal)}</td>
          <td class="${m.jumlah > 0 ? 'vh-trend-up' : 'vh-trend-down'} font-medium">${m.jumlah > 0 ? '+' : ''}${m.jumlah}</td>
          <td>${esc(m.oleh)}</td>
        </tr>`).join('');
    lucide.createIcons();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat riwayat', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
  }
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div id="warningBanner"></div>

    <div class="vh-card p-5">
      <h2 class="font-semibold mb-4">Distribusi Stok per Nominal</h2>
      <div class="vh-chart-box"><canvas id="stockChart"></canvas></div>
    </div>

    <div class="vh-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-semibold">Stok Voucher</h2>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <div class="vh-search-wrap">
          <i data-lucide="search" style="width:16px;height:16px"></i>
          <input id="stockSearch" class="vh-input" placeholder="Cari nominal...">
        </div>
        <button class="vh-btn vh-btn-secondary !py-2 !px-4 text-sm sm:w-40">
          <i data-lucide="filter" style="width:16px;height:16px"></i> Filter
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[620px]">
          <thead><tr><th>Nominal</th><th>Total Voucher</th><th>Aktif</th><th>Terjual</th><th>Nonaktif</th><th>Stok</th><th>Status</th></tr></thead>
          <tbody id="stockTbody">${skeletonRows(7, 5)}</tbody>
        </table>
      </div>
      <p class="text-xs text-slate-400 mt-4" id="stockCountLabel">Menampilkan 1-0 dari 0</p>
    </div>

    <div class="vh-card p-5">
      <h2 class="font-semibold mb-4">Riwayat Pergerakan Stok</h2>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[560px]">
          <thead><tr><th>Tanggal</th><th>Aksi</th><th>Nominal</th><th>Jumlah</th><th>Oleh</th></tr></thead>
          <tbody id="movementTbody">${skeletonRows(5, 5)}</tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('stockSearch').addEventListener('input', (e) => renderStockTable(e.target.value));
  lucide.createIcons();
}

async function init() {
  const user = await initShell({
    active: 'voucher',
    title: 'Stok Voucher',
    description: 'Pantau ketersediaan stok voucher per nominal dan riwayat pergerakannya.',
    breadcrumb: [{ label: 'Voucher', href: 'voucher.html' }, { label: 'Stok Voucher' }],
  });
  if (!user) return;

  document.getElementById('pageHeader').insertAdjacentHTML('afterend', '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="statCards"></div>');
  renderPageBody();
  await Promise.all([loadOverview(), loadMovements()]);
}

init();
