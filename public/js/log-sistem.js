import { initShell } from './shell.js';
import {
  renderPagination, badge, emptyState, skeletonRows, openModal, showToast, esc,
} from './ui-components.js';

let view = 'table';
let state = {
  page: 1, pageSize: 8, search: '', user: 'Semua Pengguna', severity: 'Semua Tipe', dateFrom: null, dateTo: null,
};
let searchDebounce;
let currentData = { items: [], page: 1, totalPages: 1, totalItems: 0, pageSize: 8 };

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

function severityIcon(sev) { return sev === 'Error' ? 'x-circle' : sev === 'Warning' ? 'alert-triangle' : 'info'; }
function severityColor(sev) { return sev === 'Error' ? 'text-red-600' : sev === 'Warning' ? 'text-amber-500' : 'text-blue-500'; }

function renderTableView() {
  const rows = currentData.items;
  const tbody = rows.length
    ? rows.map((l) => `
      <tr>
        <td>${l.waktu}</td>
        <td class="font-medium">${esc(l.user)}</td>
        <td>${esc(l.aktivitas)}</td>
        <td>${badge(l.severity)}</td>
        <td class="text-slate-400">${l.ip}</td>
      </tr>`).join('')
    : `<tr><td colspan="5">${emptyState({ icon: 'scroll-text', title: 'Tidak ada log ditemukan' })}</td></tr>`;

  return `
    <div class="overflow-x-auto">
      <table class="vh-table w-full min-w-[620px]">
        <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Tipe</th><th>IP Address</th></tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3 mt-4" id="logPagination"></div>`;
}

function renderTimelineView() {
  const rows = currentData.items;
  if (!rows.length) return emptyState({ icon: 'scroll-text', title: 'Tidak ada aktivitas ditemukan' });
  return `
    <ul class="space-y-5">
      ${rows.map((l) => `
        <li class="flex gap-3">
          <span class="mt-0.5 ${severityColor(l.severity)}"><i data-lucide="${severityIcon(l.severity)}" style="width:16px;height:16px"></i></span>
          <div class="flex-1 min-w-0 pb-5 border-b border-slate-100">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium">${esc(l.aktivitas)}</p>
              ${badge(l.severity)}
            </div>
            <p class="text-xs text-slate-400 mt-1">${esc(l.user)} &middot; ${esc(l.waktu)} &middot; ${esc(l.ip)}</p>
          </div>
        </li>`).join('')}
    </ul>`;
}

async function renderBody() {
  const content = document.getElementById('logContent');
  content.innerHTML = skeletonRows(5, 6);

  try {
    const params = new URLSearchParams({
      page: state.page, pageSize: state.pageSize, user: state.user, severity: state.severity,
    });
    if (state.search) params.set('search', state.search);
    if (state.dateFrom) params.set('dateFrom', state.dateFrom);
    if (state.dateTo) params.set('dateTo', state.dateTo);
    currentData = await api(`/api/logs?${params.toString()}`);
  } catch (err) {
    content.innerHTML = `${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat log', description: err.message })}`;
    showToast(err.message, 'error');
    return;
  }

  state.page = currentData.page;
  content.innerHTML = view === 'table' ? renderTableView() : renderTimelineView();
  if (view === 'table') {
    renderPagination(document.getElementById('logPagination'), {
      page: currentData.page, totalPages: currentData.totalPages, totalItems: currentData.totalItems, pageSize: currentData.pageSize,
    }, (p) => { state.page = p; renderBody(); });
  }
  lucide.createIcons();
}

function openDateFilter() {
  const today = new Date().toISOString().slice(0, 10);
  const close = openModal({
    title: 'Filter Tanggal',
    bodyHTML: `
      <div class="space-y-4">
        <div class="vh-field"><label class="vh-label">Dari Tanggal</label><input type="date" class="vh-input" id="f-from" value="${state.dateFrom ? state.dateFrom.slice(0, 10) : ''}" max="${today}"></div>
        <div class="vh-field"><label class="vh-label">Sampai Tanggal</label><input type="date" class="vh-input" id="f-to" value="${state.dateTo ? state.dateTo.slice(0, 10) : ''}" max="${today}"></div>
      </div>`,
    footerButtons: [
      {
        label: 'Reset', variant: 'secondary',
        onClick: (c) => {
          state.dateFrom = null; state.dateTo = null; state.page = 1;
          document.getElementById('dateFilterLabel').textContent = 'Semua Tanggal';
          renderBody();
          c();
        },
      },
      {
        label: 'Terapkan', variant: 'primary',
        onClick: (c) => {
          const from = document.getElementById('f-from').value;
          const to = document.getElementById('f-to').value;
          state.dateFrom = from ? `${from}T00:00:00` : null;
          if (to) {
            const toExclusive = new Date(`${to}T00:00:00`);
            toExclusive.setDate(toExclusive.getDate() + 1);
            state.dateTo = toExclusive.toISOString();
          } else {
            state.dateTo = null;
          }
          state.page = 1;
          document.getElementById('dateFilterLabel').textContent = from && to ? `${from} - ${to}` : 'Semua Tanggal';
          renderBody();
          c();
        },
      },
    ],
  });
  return close;
}

function renderPageBody(filterOptions) {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-semibold">Log Aktivitas Sistem</h2>
        <div class="vh-tabs" style="border-bottom:none">
          <button class="vh-tab ${view === 'table' ? 'active' : ''}" data-view="table">Tabel</button>
          <button class="vh-tab ${view === 'timeline' ? 'active' : ''}" data-view="timeline">Timeline</button>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <div class="vh-search-wrap">
          <i data-lucide="search" style="width:16px;height:16px"></i>
          <input id="logSearch" class="vh-input" placeholder="Cari aktivitas...">
        </div>
        <select id="logUserFilter" class="vh-select sm:w-48">
          <option>Semua Pengguna</option>
          ${filterOptions.users.map((u) => `<option>${u}</option>`).join('')}
        </select>
        <select id="logSeverityFilter" class="vh-select sm:w-40">
          <option>Semua Tipe</option>
          ${filterOptions.severities.map((s) => `<option>${s}</option>`).join('')}
        </select>
        <button id="btnDateFilter" class="vh-btn vh-btn-secondary !py-2 !px-4 text-sm sm:w-44"><i data-lucide="calendar" style="width:16px;height:16px"></i> <span id="dateFilterLabel">Semua Tanggal</span></button>
      </div>

      <div id="logContent">${skeletonRows(5, 6)}</div>
    </div>`;

  document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    view = btn.dataset.view;
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    renderBody();
  }));
  document.getElementById('logSearch').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => { state.search = value; state.page = 1; renderBody(); }, 300);
  });
  document.getElementById('logUserFilter').addEventListener('change', (e) => { state.user = e.target.value; state.page = 1; renderBody(); });
  document.getElementById('logSeverityFilter').addEventListener('change', (e) => { state.severity = e.target.value; state.page = 1; renderBody(); });
  document.getElementById('btnDateFilter').addEventListener('click', openDateFilter);
  lucide.createIcons();
}

async function init() {
  const user = await initShell({
    active: 'log-sistem',
    title: 'Log Sistem',
    description: 'Riwayat aktivitas dan keamanan sistem VoucherHub.',
    breadcrumb: [{ label: 'Log Sistem' }],
  });
  if (!user) return;

  let filterOptions = { users: [], severities: ['Info', 'Warning', 'Error'] };
  try {
    filterOptions = await api('/api/logs/filter-options');
  } catch (err) {
    showToast(err.message, 'error');
  }

  renderPageBody(filterOptions);
  await renderBody();
}

init();
