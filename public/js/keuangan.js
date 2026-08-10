import { initShell } from './shell.js';
import { rupiah, openModal, showToast, skeletonRows, emptyState, esc } from './ui-components.js';

let activeTab = 'ringkasan';
let cashFlowChart;
let statsCache = null;

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

function formatTrend(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? '+' : '';
  return { text: `${sign}${pct.toFixed(1).replace('.', ',')}%`, up: pct >= 0 };
}

async function renderStatCards() {
  const cardDefs = [
    { key: 'saldoSaatIni', label: 'Saldo Saat Ini', icon: 'wallet', bg: '#dcfce7', color: '#16a34a' },
    { key: 'totalPemasukan', label: 'Total Pemasukan', icon: 'arrow-down-circle', bg: '#dbeafe', color: '#2563eb', trendKey: 'trendPemasukan' },
    { key: 'totalPengeluaran', label: 'Total Pengeluaran', icon: 'arrow-up-circle', bg: '#ffedd5', color: '#ea580c', trendKey: 'trendPengeluaran' },
    { key: 'saldoBulanIni', label: 'Saldo Bulan Ini', icon: 'landmark', bg: '#ede9fe', color: '#7c3aed' },
  ];

  document.getElementById('statCards').innerHTML = cardDefs.map((s) => `
    <div class="vh-card p-4">
      <div class="vh-icon-badge mb-3" style="background:${s.bg}"><span style="color:${s.color}"><i data-lucide="${s.icon}" style="width:20px;height:20px"></i></span></div>
      <p class="text-xs text-slate-500">${s.label}</p>
      <p class="text-lg font-extrabold mt-0.5" id="stat-${s.key}">-</p>
      ${s.trendKey ? `<p class="text-xs mt-1" id="trend-${s.key}"></p>` : ''}
    </div>`).join('');
  lucide.createIcons();

  try {
    statsCache = await api('/api/finance/stats');
    cardDefs.forEach((s) => {
      document.getElementById(`stat-${s.key}`).textContent = rupiah(statsCache[s.key]);
      if (s.trendKey) {
        const trend = formatTrend(statsCache[s.trendKey]);
        const el = document.getElementById(`trend-${s.key}`);
        if (trend) {
          el.textContent = `${trend.text} dari bulan lalu`;
          el.className = `text-xs mt-1 ${trend.up ? 'vh-trend-up' : 'vh-trend-down'}`;
        }
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function tabsHTML() {
  const tabs = [
    { key: 'ringkasan', label: 'Ringkasan' },
    { key: 'pemasukan', label: 'Pemasukan' },
    { key: 'pengeluaran', label: 'Pengeluaran' },
    { key: 'arus-kas', label: 'Arus Kas' },
  ];
  return `<div class="vh-tabs">${tabs.map((t) => `<button class="vh-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>`;
}

function ringkasanHTML() {
  return `
    <div class="grid lg:grid-cols-3 gap-5 mt-5">
      <div class="lg:col-span-2 vh-card p-5">
        <h2 class="font-semibold mb-4">Arus Kas (30 Hari Terakhir)</h2>
        <div class="vh-chart-box"><canvas id="cashFlowChart"></canvas></div>
      </div>
      <div class="vh-card p-5 flex flex-col">
        <h2 class="font-semibold mb-3">Transaksi Terbaru</h2>
        <ul class="space-y-3 flex-1" id="recentActivityList"></ul>
        <button class="vh-btn vh-btn-secondary w-full mt-4 !py-2 text-sm">Lihat Semua</button>
      </div>
    </div>`;
}

async function loadRecentActivity() {
  const el = document.getElementById('recentActivityList');
  if (!el) return;
  try {
    const items = await api('/api/finance/recent?limit=4');
    el.innerHTML = !items.length
      ? '<li class="text-sm text-slate-400">Belum ada transaksi.</li>'
      : items.map((r) => `
        <li class="flex items-center gap-3">
          <i data-lucide="${r.icon}" class="${r.color}" style="width:18px;height:18px"></i>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${esc(r.title)}</p>
            <p class="text-xs text-slate-400">${r.date}</p>
          </div>
          <span class="text-sm font-semibold ${r.amount > 0 ? 'vh-trend-up' : 'vh-trend-down'}">${r.amount > 0 ? '+' : '-'}${rupiah(Math.abs(r.amount))}</span>
        </li>`).join('');
    lucide.createIcons();
  } catch (err) {
    el.innerHTML = `<li class="text-sm text-red-500">${err.message}</li>`;
  }
}

function incomeExpenseTableHTML(rows, cols, onAddLabel) {
  return `
    <div class="vh-card p-5 mt-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-semibold">${onAddLabel === 'Tambah Pemasukan' ? 'Daftar Pemasukan' : 'Daftar Pengeluaran'}</h2>
        <button id="btnAddEntry" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm"><i data-lucide="plus" style="width:16px;height:16px"></i> ${onAddLabel}</button>
      </div>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[520px]">
          <thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody id="entryTbody">${rows}</tbody>
        </table>
      </div>
    </div>`;
}

async function loadEntryList(type) {
  const tbody = document.getElementById('entryTbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(4, 5);
  try {
    const items = await api(`/api/finance/${type}`);
    const colorClass = type === 'income' ? 'text-green-700' : 'text-red-600';
    tbody.innerHTML = !items.length
      ? `<tr><td colspan="4">${emptyState({ icon: type === 'income' ? 'arrow-down-circle' : 'arrow-up-circle', title: `Belum ada ${type === 'income' ? 'pemasukan' : 'pengeluaran'}`, description: 'Catatan akan muncul di sini setelah ditambahkan.' })}</td></tr>`
      : items.map((r) => `<tr><td>${esc(r.tanggal)}</td><td>${esc(r.label)}</td><td>${esc(r.deskripsi)}</td><td class="font-semibold ${colorClass}">${rupiah(r.jumlah)}</td></tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat data', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
  }
}

async function arusKasHTML() {
  return `
    <div class="vh-card p-5 mt-5">
      <h2 class="font-semibold mb-4">Arus Kas (30 Hari Terakhir)</h2>
      <div class="vh-chart-box"><canvas id="cashFlowChartFull"></canvas></div>
    </div>
    <div class="vh-card p-5 mt-5">
      <h2 class="font-semibold mb-4">Ringkasan Bulan Ini</h2>
      <ul class="space-y-3 text-sm max-w-sm" id="monthlySummaryList">
        ${skeletonRows(4, 1)}
      </ul>
    </div>`;
}

async function loadMonthlySummary() {
  const el = document.getElementById('monthlySummaryList');
  if (!el) return;
  try {
    const s = await api('/api/finance/monthly-summary');
    el.innerHTML = `
      <li class="flex justify-between"><span class="text-slate-600">Total Pemasukan</span><span class="font-semibold text-green-700">${rupiah(s.totalPemasukan)}</span></li>
      <li class="flex justify-between"><span class="text-slate-600">Total Pengeluaran</span><span class="font-semibold text-red-600">${rupiah(s.totalPengeluaran)}</span></li>
      <li class="flex justify-between"><span class="text-slate-600">Saldo Awal</span><span class="font-medium">${rupiah(s.saldoAwal)}</span></li>
      <li class="flex justify-between pt-2 border-t border-slate-100"><span class="font-semibold">Saldo Akhir</span><span class="font-extrabold text-lg">${rupiah(s.saldoAkhir)}</span></li>`;
  } catch (err) {
    el.innerHTML = `<li class="text-sm text-red-500">${err.message}</li>`;
    showToast(err.message, 'error');
  }
}

async function renderCashFlowChart(canvasId) {
  try {
    const { labels, income, expense } = await api('/api/finance/cashflow');
    if (cashFlowChart) cashFlowChart.destroy();
    cashFlowChart = new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Pemasukan', data: income, borderColor: '#16a34a', backgroundColor: 'transparent', tension: 0.35, borderWidth: 2 },
          { label: 'Pengeluaran', data: expense, borderColor: '#dc2626', backgroundColor: 'transparent', tension: 0.35, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { y: { ticks: { callback: (v) => (v >= 1000000 ? (v / 1000000) + 'M' : v) }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
      },
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/** openModal() only passes `close` into onClick -- grab the mounted button from the DOM. */
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

function openAddEntry(type) {
  const isIncome = type === 'income';
  const today = new Date().toISOString().slice(0, 10);
  const bodyHTML = `
    <div class="space-y-4">
      <div class="vh-field" id="f-tanggal-field">
        <label class="vh-label">Tanggal <span class="req">*</span></label>
        <input type="date" class="vh-input" id="f-tanggal" value="${today}" max="${today}">
        <p class="vh-field-error">Tanggal wajib diisi dan tidak boleh di masa depan.</p>
      </div>
      <div class="vh-field" id="f-kategori-field">
        <label class="vh-label">${isIncome ? 'Sumber' : 'Kategori'} <span class="req">*</span></label>
        <input class="vh-input" id="f-kategori" placeholder="${isIncome ? 'Contoh: Penjualan Voucher' : 'Contoh: Operasional'}">
        <p class="vh-field-error">${isIncome ? 'Sumber' : 'Kategori'} wajib diisi.</p>
      </div>
      <div class="vh-field">
        <label class="vh-label">Deskripsi</label>
        <input class="vh-input" id="f-deskripsi" placeholder="Opsional">
      </div>
      <div class="vh-field" id="f-jumlah-field">
        <label class="vh-label">Jumlah (Rp) <span class="req">*</span></label>
        <input type="number" min="1" class="vh-input" id="f-jumlah" placeholder="0">
        <p class="vh-field-error">Jumlah wajib diisi, minimal Rp 1.</p>
      </div>
    </div>`;

  const close = openModal({
    title: isIncome ? 'Tambah Pemasukan' : 'Tambah Pengeluaran',
    bodyHTML,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan', variant: 'primary',
        onClick: () => {
          const tanggal = document.getElementById('f-tanggal').value;
          const kategori = document.getElementById('f-kategori').value.trim();
          const deskripsi = document.getElementById('f-deskripsi').value;
          const jumlah = parseInt(document.getElementById('f-jumlah').value, 10);

          let valid = true;
          const tanggalField = document.getElementById('f-tanggal-field');
          const kategoriField = document.getElementById('f-kategori-field');
          const jumlahField = document.getElementById('f-jumlah-field');
          if (!tanggal || new Date(tanggal) > new Date(today + 'T23:59:59')) { tanggalField.classList.add('invalid'); valid = false; } else tanggalField.classList.remove('invalid');
          if (!kategori) { kategoriField.classList.add('invalid'); valid = false; } else kategoriField.classList.remove('invalid');
          if (!jumlah || jumlah < 1) { jumlahField.classList.add('invalid'); valid = false; } else jumlahField.classList.remove('invalid');
          if (!valid) return;

          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              const payload = { tanggal, deskripsi, jumlah, ...(isIncome ? { sumber: kategori } : { kategori }) };
              await api(`/api/finance/${isIncome ? 'income' : 'expense'}`, { method: 'POST', body: JSON.stringify(payload) });
              showToast(`${isIncome ? 'Pemasukan' : 'Pengeluaran'} berhasil ditambahkan.`, 'success');
              close();
              await Promise.all([renderStatCards(), renderTabContent()]);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        },
      },
    ],
  });
}

async function renderTabContent() {
  const body = document.getElementById('financeTabBody');
  if (activeTab === 'ringkasan') {
    body.innerHTML = ringkasanHTML();
    lucide.createIcons();
    await Promise.all([renderCashFlowChart('cashFlowChart'), loadRecentActivity()]);
  } else if (activeTab === 'pemasukan') {
    body.innerHTML = incomeExpenseTableHTML(skeletonRows(4, 4), ['Tanggal', 'Sumber', 'Deskripsi', 'Jumlah'], 'Tambah Pemasukan');
    document.getElementById('btnAddEntry').addEventListener('click', () => openAddEntry('income'));
    lucide.createIcons();
    await loadEntryList('income');
  } else if (activeTab === 'pengeluaran') {
    body.innerHTML = incomeExpenseTableHTML(skeletonRows(4, 4), ['Tanggal', 'Kategori', 'Deskripsi', 'Jumlah'], 'Tambah Pengeluaran');
    document.getElementById('btnAddEntry').addEventListener('click', () => openAddEntry('expense'));
    lucide.createIcons();
    await loadEntryList('expense');
  } else {
    body.innerHTML = await arusKasHTML();
    await Promise.all([renderCashFlowChart('cashFlowChartFull'), loadMonthlySummary()]);
  }
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-card p-2">
      ${tabsHTML()}
    </div>
    <div id="financeTabBody"></div>`;

  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTab));
    renderTabContent();
  }));
  renderTabContent();
}

async function init() {
  const user = await initShell({
    active: 'keuangan',
    title: 'Keuangan',
    description: 'Pantau pemasukan, pengeluaran, dan arus kas sekolah.',
    breadcrumb: [{ label: 'Keuangan' }],
  });
  if (!user) return;

  document.getElementById('pageHeader').insertAdjacentHTML('afterend', '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="statCards"></div>');
  renderPageBody();
  await renderStatCards();
}

init();
