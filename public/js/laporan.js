import { initShell } from './shell.js';
import { openModal, showToast, skeletonRows, esc } from './ui-components.js';

const REPORTS = [
  { key: 'penjualan', title: 'Laporan Penjualan', desc: 'Rincian transaksi penjualan voucher per periode.', icon: 'shopping-cart' },
  { key: 'keuangan', title: 'Laporan Keuangan', desc: 'Ringkasan pemasukan, pengeluaran, dan saldo.', icon: 'wallet' },
  { key: 'voucher', title: 'Laporan Voucher', desc: 'Daftar voucher yang dibuat, aktif, dan terjual.', icon: 'ticket' },
  { key: 'presensi', title: 'Laporan Presensi', desc: 'Rekap kehadiran anggota per minggu atau bulan.', icon: 'map-pin' },
  { key: 'stok', title: 'Laporan Stok', desc: 'Ketersediaan stok voucher per nominal.', icon: 'package' },
];

let period = { dateFrom: null, dateTo: null, label: 'Semua Periode' };
let visibleKeys = REPORTS.map((r) => r.key);

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

function reportCard(r) {
  return `
    <div class="vh-feature-card flex flex-col">
      <div class="vh-icon-badge bg-green-50 mb-4"><i data-lucide="${r.icon}" class="text-green-600" style="width:20px;height:20px"></i></div>
      <h3 class="font-semibold">${r.title}</h3>
      <p class="text-sm text-slate-500 mt-1.5 flex-1">${r.desc}</p>
      <button class="vh-btn vh-btn-primary !py-2 !px-4 text-sm mt-4 self-start" data-report="${r.key}">Buat Laporan</button>
    </div>`;
}

function reportQuery() {
  const params = new URLSearchParams();
  if (period.dateFrom) params.set('dateFrom', period.dateFrom);
  if (period.dateTo) params.set('dateTo', period.dateTo);
  return params.toString();
}

function summaryHTML(summary) {
  return `<dl class="grid grid-cols-2 gap-3 text-sm">${summary.map((s) => `
    <div class="vh-card p-3 bg-slate-50"><dt class="text-xs text-slate-500">${esc(s.label)}</dt><dd class="font-semibold mt-0.5">${esc(s.value)}</dd></div>`).join('')}</dl>`;
}

function tableHTML(columns, rows) {
  return `
    <div class="overflow-x-auto mt-4 max-h-64 overflow-y-auto">
      <table class="vh-table w-full">
        <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="text-center text-slate-400 py-4">Tidak ada data untuk periode ini.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function openReportModal(key) {
  const report = REPORTS.find((r) => r.key === key);

  openModal({
    title: report.title,
    size: 'lg',
    bodyHTML: `<p class="text-sm text-slate-500 mb-4" id="reportPeriodLabel">Memuat...</p><div id="reportPreviewBox">${skeletonRows(4, 3)}</div>
      <div class="flex gap-2 mt-4">
        <button id="btnExportPdf" class="vh-btn vh-btn-secondary !py-2 !px-4 text-sm flex-1"><i data-lucide="file-down" style="width:16px;height:16px"></i> Export PDF</button>
        <button id="btnExportExcel" class="vh-btn vh-btn-secondary !py-2 !px-4 text-sm flex-1"><i data-lucide="table" style="width:16px;height:16px"></i> Export Excel</button>
      </div>`,
    footerButtons: [{ label: 'Tutup', variant: 'secondary', onClick: (c) => c() }],
  });
  lucide.createIcons();

  document.getElementById('btnExportPdf').addEventListener('click', () => {
    triggerDownload(`/api/reports/${key}/export/pdf?${reportQuery()}`);
  });
  document.getElementById('btnExportExcel').addEventListener('click', () => {
    triggerDownload(`/api/reports/${key}/export/excel?${reportQuery()}`);
  });

  try {
    const data = await api(`/api/reports/${key}?${reportQuery()}`);
    document.getElementById('reportPeriodLabel').textContent = `Periode: ${data.periode}`;
    document.getElementById('reportPreviewBox').innerHTML = summaryHTML(data.summary) + tableHTML(data.columns, data.rows);
  } catch (err) {
    document.getElementById('reportPreviewBox').innerHTML = `<p class="text-sm text-red-500">${err.message}</p>`;
    showToast(err.message, 'error');
  }
}

function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openPeriodPicker() {
  const today = new Date().toISOString().slice(0, 10);
  const close = openModal({
    title: 'Pilih Periode',
    bodyHTML: `
      <div class="space-y-4">
        <div class="vh-field"><label class="vh-label">Dari Tanggal</label><input type="date" class="vh-input" id="f-from" value="${period.dateFrom ? period.dateFrom.slice(0, 10) : ''}" max="${today}"></div>
        <div class="vh-field"><label class="vh-label">Sampai Tanggal</label><input type="date" class="vh-input" id="f-to" value="${period.dateTo ? period.dateTo.slice(0, 10) : ''}" max="${today}"></div>
      </div>`,
    footerButtons: [
      {
        label: 'Reset', variant: 'secondary',
        onClick: (c) => {
          period = { dateFrom: null, dateTo: null, label: 'Semua Periode' };
          document.getElementById('periodLabel').textContent = period.label;
          c();
        },
      },
      {
        label: 'Terapkan', variant: 'primary',
        onClick: (c) => {
          const from = document.getElementById('f-from').value;
          const to = document.getElementById('f-to').value;
          period.dateFrom = from ? `${from}T00:00:00` : null;
          if (to) {
            const toExclusive = new Date(`${to}T00:00:00`);
            toExclusive.setDate(toExclusive.getDate() + 1);
            period.dateTo = toExclusive.toISOString();
          } else {
            period.dateTo = null;
          }
          period.label = from && to ? `${from} - ${to}` : 'Semua Periode';
          document.getElementById('periodLabel').textContent = period.label;
          c();
        },
      },
    ],
  });
  return close;
}

function renderCards() {
  document.getElementById('reportCardsGrid').innerHTML = REPORTS.filter((r) => visibleKeys.includes(r.key)).map(reportCard).join('');
  lucide.createIcons();
  document.querySelectorAll('[data-report]').forEach((btn) => btn.addEventListener('click', () => openReportModal(btn.dataset.report)));
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-card p-5">
      <div class="flex flex-col sm:flex-row gap-3 items-end">
        <div class="vh-field flex-1">
          <label class="vh-label">Jenis Laporan</label>
          <select class="vh-select" id="jenisFilter">
            <option>Semua Laporan</option>
            ${REPORTS.map((r) => `<option>${r.title}</option>`).join('')}
          </select>
        </div>
        <div class="vh-field flex-1">
          <label class="vh-label">Periode</label>
          <button id="btnPeriod" class="vh-btn vh-btn-secondary w-full !py-2.5 text-sm justify-start"><i data-lucide="calendar" style="width:16px;height:16px"></i> <span id="periodLabel">${period.label}</span></button>
        </div>
        <button id="btnTampilkan" class="vh-btn vh-btn-primary !py-2.5 !px-6 text-sm">Tampilkan</button>
      </div>
    </div>

    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" id="reportCardsGrid"></div>

    <p class="text-xs text-slate-400 text-center">Semua laporan dapat di-export ke PDF dan Excel.</p>`;

  lucide.createIcons();
  renderCards();

  document.getElementById('btnPeriod').addEventListener('click', openPeriodPicker);
  document.getElementById('btnTampilkan').addEventListener('click', () => {
    const selected = document.getElementById('jenisFilter').value;
    visibleKeys = selected === 'Semua Laporan' ? REPORTS.map((r) => r.key) : [REPORTS.find((r) => r.title === selected).key];
    renderCards();
  });
}

async function init() {
  const user = await initShell({
    active: 'laporan',
    title: 'Laporan',
    description: 'Buat dan unduh laporan penjualan, keuangan, voucher, presensi, dan stok.',
    breadcrumb: [{ label: 'Laporan' }],
  });
  if (!user) return;

  renderPageBody();
}

init();
