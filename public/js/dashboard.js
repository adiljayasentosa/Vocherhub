// VoucherHub — Dashboard (Phase 2: real data from the backend API,
// which itself reads Firestore. No more local dummy JSON.)

import { esc } from './ui-components.js';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const number = (n) => Number(n).toLocaleString('id-ID');

function icon(name, cls = '') {
  return `<i data-lucide="${name}" class="${cls}"></i>`;
}

async function apiGet(path) {
  const res = await fetch(path, { credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `Gagal memuat ${path}`);
    err.statusCode = res.status;
    throw err;
  }
  return body.data;
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST', credentials: 'include' });
  return res.json().catch(() => ({}));
}

function statCard({ badgeBg, badgeColor, iconName, label, value }) {
  return `
    <div class="vh-card p-4">
      <div class="flex items-start justify-between mb-3">
        <div class="vh-icon-badge" style="background:${badgeBg}">
          <span style="color:${badgeColor}">${icon(iconName, 'w-5 h-5')}</span>
        </div>
      </div>
      <p class="text-xs text-slate-500">${label}</p>
      <p class="text-lg font-extrabold mt-0.5">${value}</p>
    </div>`;
}

function renderStatCards(stats) {
  const el = document.getElementById('statCards');
  el.innerHTML = [
    statCard({
      badgeBg: '#dbeafe', badgeColor: '#2563eb', iconName: 'banknote',
      label: 'Pendapatan Hari Ini', value: rupiah(stats.pendapatanHariIni.value),
    }),
    statCard({
      badgeBg: '#ede9fe', badgeColor: '#7c3aed', iconName: 'shopping-cart',
      label: 'Penjualan Hari Ini', value: `${number(stats.penjualanHariIni.value)} ${stats.penjualanHariIni.unit}`,
    }),
    statCard({
      badgeBg: '#ffedd5', badgeColor: '#ea580c', iconName: 'package',
      label: 'Stok Voucher Tersedia', value: `${number(stats.stokVoucher.value)} ${stats.stokVoucher.unit}`,
    }),
    statCard({
      badgeBg: '#dcfce7', badgeColor: '#16a34a', iconName: 'check-circle-2',
      label: 'Voucher Aktif', value: `${number(stats.voucherAktif.value)} ${stats.voucherAktif.unit}`,
    }),
  ].join('');
  lucide.createIcons();
}

function renderRevenueChart(data) {
  new Chart(document.getElementById('revenueChart'), {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: '#16a34a',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => rupiah(ctx.raw) } } },
      scales: {
        y: { ticks: { callback: (v) => (v >= 1000000 ? (v / 1000000) + 'M' : v) }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderNotifications(list) {
  const listEl = document.getElementById('notifList');
  const emptyEl = document.getElementById('notifEmpty');
  const badge = document.getElementById('notifBadge');

  if (!list.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    badge.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  badge.textContent = list.length;
  badge.classList.remove('hidden');

  listEl.innerHTML = list.map((n) => `
    <li class="flex gap-3">
      <span class="mt-0.5 ${n.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}">
        ${icon(n.type === 'warning' ? 'alert-triangle' : 'info', 'w-4 h-4')}
      </span>
      <div>
        <p class="text-sm text-slate-700">${n.message}</p>
        <p class="text-xs text-slate-400 mt-0.5">${n.time}</p>
      </div>
    </li>`).join('');
  lucide.createIcons();
}

function renderTransactionsTable(list) {
  const tbody = document.getElementById('txTableBody');
  const emptyEl = document.getElementById('txEmpty');

  if (!list.length) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  tbody.innerHTML = list.map((t) => `
    <tr>
      <td>${esc(t.waktu)}</td>
      <td>${esc(t.kode)}</td>
      <td>${rupiah(t.nominal)}</td>
      <td>${esc(t.operator)}</td>
      <td>${esc(t.metode)}</td>
      <td><span class="vh-status-pill">${esc(t.status)}</span></td>
    </tr>`).join('');
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function roleLabel(role) {
  return role === 'admin' ? 'Administrator' : 'Operator';
}

function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const btn = document.getElementById('sidebarBtn');
  const open = () => { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); };
  const close = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };
  btn.addEventListener('click', open);
  overlay.addEventListener('click', close);
}

function setupLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await apiPost('/api/auth/logout');
    window.location.href = 'login.html';
  });
}

async function requireSession() {
  try {
    const { user } = await apiGet('/api/auth/me');
    document.getElementById('userInitials').textContent = initials(user.name || user.email);
    document.getElementById('userName').textContent = user.name || user.email;
    document.getElementById('userRole').textContent = roleLabel(user.role);
    return user;
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

async function init() {
  lucide.createIcons();
  setupSidebarToggle();
  setupLogout();

  const user = await requireSession();
  if (!user) return; // already redirecting to login.html

  const data = await apiGet('/api/dashboard/summary');

  renderStatCards(data.stats);
  renderRevenueChart(data.revenueChart);
  renderNotifications(data.notifications);
  renderTransactionsTable(data.recentTransactions);
}

init().catch((err) => {
  console.error(err);
  const main = document.querySelector('main');
  main.insertAdjacentHTML('afterbegin', `
    <div class="vh-card p-4 border-amber-200 bg-amber-50 text-amber-800 text-sm">
      Gagal memuat data dashboard (${err.message}). Pastikan backend (server.js) berjalan
      dan koneksi Firestore sudah dikonfigurasi lewat .env.
    </div>`);
});
