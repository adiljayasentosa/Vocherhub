import { initShell } from './shell.js';
import {
  rupiah, number, openModal, confirmDialog, showToast,
  renderPagination, badge, skeletonRows, emptyState, esc,
} from './ui-components.js';

const NOMINALS = [3000, 5000, 6000, 10000, 20000];
const STATUSES = ['Aktif', 'Terjual', 'Nonaktif'];

// id -> voucher, populated from the last list()/detail() response so the
// modals (detail/edit/delete) don't need a second round-trip just to know
// what's already on screen.
const voucherCache = new Map();

let state = { page: 1, pageSize: 5, search: '', status: 'Semua Status' };
let searchDebounce;

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

async function renderStatCards() {
  const cardDefs = [
    { key: 'total', label: 'Total Voucher', icon: 'ticket', bg: '#dcfce7', color: '#16a34a' },
    { key: 'aktif', label: 'Voucher Aktif', icon: 'check-circle-2', bg: '#dbeafe', color: '#2563eb' },
    { key: 'terjual', label: 'Voucher Terjual', icon: 'shopping-cart', bg: '#ede9fe', color: '#7c3aed' },
    { key: 'nonaktif', label: 'Voucher Nonaktif', icon: 'x-circle', bg: '#ffedd5', color: '#ea580c' },
  ];

  const el = document.getElementById('statCards');
  el.innerHTML = cardDefs.map((s) => `
    <div class="vh-card p-4">
      <div class="vh-icon-badge mb-3" style="background:${s.bg}"><span style="color:${s.color}">${iconTag(s.icon)}</span></div>
      <p class="text-xs text-slate-500">${s.label}</p>
      <p class="text-lg font-extrabold mt-0.5" id="stat-${s.key}">-</p>
    </div>`).join('');
  lucide.createIcons();

  try {
    const stats = await api('/api/vouchers/stats');
    cardDefs.forEach((s) => {
      document.getElementById(`stat-${s.key}`).textContent = number(stats[s.key]);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderTable() {
  const tbody = document.getElementById('voucherTbody');
  tbody.innerHTML = skeletonRows(6, 5);

  let data;
  try {
    const params = new URLSearchParams({
      page: state.page,
      pageSize: state.pageSize,
      status: state.status,
    });
    if (state.search) params.set('search', state.search);
    data = await api(`/api/vouchers?${params.toString()}`);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat voucher', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
    return;
  }

  state.page = data.page;
  data.items.forEach((v) => voucherCache.set(v.id, v));

  if (!data.items.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({ icon: 'ticket', title: 'Voucher tidak ditemukan', description: 'Coba ubah kata kunci pencarian atau filter status.' })}</td></tr>`;
  } else {
    tbody.innerHTML = data.items.map((v) => `
      <tr>
        <td class="font-medium">${v.code}</td>
        <td>${rupiah(v.nominal)}</td>
        <td>${badge(v.status)}</td>
        <td>${v.tanggal}</td>
        <td>${esc(v.dibuatOleh)}</td>
        <td>
          <div class="flex items-center gap-1">
            <button class="vh-row-action" data-detail="${v.id}" title="Detail"><i data-lucide="eye" style="width:16px;height:16px"></i></button>
            <button class="vh-row-action" data-edit="${v.id}" title="Edit"><i data-lucide="pencil" style="width:16px;height:16px"></i></button>
            <button class="vh-row-action danger" data-delete="${v.id}" title="Hapus"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination(document.getElementById('voucherPagination'), {
    page: data.page, totalPages: data.totalPages, totalItems: data.totalItems, pageSize: data.pageSize,
  }, (p) => { state.page = p; renderTable(); });

  lucide.createIcons();
  wireRowActions();
}

function wireRowActions() {
  document.querySelectorAll('[data-detail]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.detail)));
  document.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openEdit(btn.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => openDelete(btn.dataset.delete)));
}

function nominalOptions(selected) {
  return NOMINALS.map((n) => `<option value="${n}" ${n === selected ? 'selected' : ''}>${rupiah(n)}</option>`).join('');
}
function statusOptions(selected) {
  return STATUSES.map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

/** Disables a footer button and swaps its label while an async action runs, to prevent double-submits. */
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

/**
 * openModal() (ui-components.js, approved/unmodified) only passes `close`
 * into onClick — not the button element — so the primary button has to be
 * grabbed from the DOM right after the modal mounts (it's built
 * synchronously; only the fade-in is deferred to a rAF).
 */
function getPrimaryButton() {
  const buttons = document.querySelectorAll('#modalRoot .vh-btn-primary');
  return buttons[buttons.length - 1];
}

function openCreate() {
  const bodyHTML = `
    <div class="space-y-4">
      <div class="vh-field">
        <label class="vh-label">Nominal <span class="req">*</span></label>
        <select class="vh-select" id="f-nominal">${nominalOptions()}</select>
      </div>
      <div class="vh-field" id="f-jumlah-field">
        <label class="vh-label">Jumlah Voucher <span class="req">*</span></label>
        <input type="number" min="1" max="500" class="vh-input" id="f-jumlah" placeholder="Contoh: 50">
        <p class="vh-helper">Voucher akan dibuat sekaligus dengan kode berurutan.</p>
        <p class="vh-field-error">Jumlah wajib diisi, minimal 1.</p>
      </div>
      <div class="vh-field">
        <label class="vh-label">Status Awal</label>
        <select class="vh-select" id="f-status">${statusOptions('Aktif')}</select>
      </div>
    </div>`;

  const close = openModal({
    title: 'Tambah Voucher',
    bodyHTML,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan',
        variant: 'primary',
        onClick: () => {
          const jumlahInput = document.getElementById('f-jumlah');
          const jumlah = parseInt(jumlahInput.value, 10);
          const field = document.getElementById('f-jumlah-field');
          if (!jumlah || jumlah < 1) { field.classList.add('invalid'); return; }
          field.classList.remove('invalid');

          const nominal = parseInt(document.getElementById('f-nominal').value, 10);
          const status = document.getElementById('f-status').value;

          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              const data = await api('/api/vouchers', {
                method: 'POST',
                body: JSON.stringify({ nominal, jumlah, status }),
              });
              state.page = 1;
              await Promise.all([renderStatCards(), renderTable()]);
              showToast(`${data.count} voucher berhasil dibuat.`, 'success');
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

function openEdit(id) {
  const v = voucherCache.get(id);
  if (!v) return;
  const bodyHTML = `
    <div class="space-y-4">
      <div class="vh-field">
        <label class="vh-label">Kode Voucher</label>
        <input class="vh-input" value="${v.code}" disabled>
      </div>
      <div class="vh-field">
        <label class="vh-label">Nominal <span class="req">*</span></label>
        <select class="vh-select" id="f-nominal">${nominalOptions(v.nominal)}</select>
      </div>
      <div class="vh-field">
        <label class="vh-label">Status <span class="req">*</span></label>
        <select class="vh-select" id="f-status">${statusOptions(v.status)}</select>
      </div>
    </div>`;

  const close = openModal({
    title: 'Edit Voucher',
    bodyHTML,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan Perubahan', variant: 'primary',
        onClick: () => {
          const nominal = parseInt(document.getElementById('f-nominal').value, 10);
          const status = document.getElementById('f-status').value;

          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              await api(`/api/vouchers/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ nominal, status }),
              });
              await Promise.all([renderStatCards(), renderTable()]);
              showToast('Perubahan voucher disimpan.', 'success');
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

function openDelete(id) {
  const v = voucherCache.get(id);
  if (!v) return;
  confirmDialog({
    title: 'Hapus Voucher?',
    message: `Voucher <strong>${v.code}</strong> akan dihapus permanen dan tidak dapat dikembalikan.`,
    confirmLabel: 'Hapus',
    onConfirm: async () => {
      try {
        await api(`/api/vouchers/${id}`, { method: 'DELETE' });
        voucherCache.delete(id);
        await Promise.all([renderStatCards(), renderTable()]);
        showToast('Voucher berhasil dihapus.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

async function openDetail(id) {
  let v = voucherCache.get(id);
  if (!v) {
    try {
      v = await api(`/api/vouchers/${id}`);
      voucherCache.set(id, v);
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  }
  openModal({
    title: 'Detail Voucher',
    bodyHTML: `
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between"><dt class="text-slate-500">Kode Voucher</dt><dd class="font-semibold">${v.code}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Nominal</dt><dd class="font-semibold">${rupiah(v.nominal)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Status</dt><dd>${badge(v.status)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Tanggal Dibuat</dt><dd>${v.tanggal}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Dibuat Oleh</dt><dd>${esc(v.dibuatOleh)}</dd></div>
      </dl>`,
    footerButtons: [{ label: 'Tutup', variant: 'secondary', onClick: (c) => c() }],
  });
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-semibold">Daftar Voucher</h2>
        <button id="btnCreate" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm">
          <i data-lucide="plus" style="width:16px;height:16px"></i> Tambah Voucher
        </button>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <div class="vh-search-wrap">
          <i data-lucide="search" style="width:16px;height:16px"></i>
          <input id="voucherSearch" class="vh-input" placeholder="Cari kode voucher...">
        </div>
        <select id="voucherFilter" class="vh-select sm:w-48">
          <option>Semua Status</option>
          ${STATUSES.map((s) => `<option>${s}</option>`).join('')}
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[640px]">
          <thead><tr><th>Kode Voucher</th><th>Nominal</th><th>Status</th><th>Tanggal Dibuat</th><th>Dibuat Oleh</th><th>Aksi</th></tr></thead>
          <tbody id="voucherTbody">${skeletonRows(6, 5)}</tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 mt-4" id="voucherPagination"></div>
    </div>`;

  document.getElementById('btnCreate').addEventListener('click', openCreate);
  document.getElementById('voucherSearch').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => { state.search = value; state.page = 1; renderTable(); }, 300);
  });
  document.getElementById('voucherFilter').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; renderTable(); });
  lucide.createIcons();
}

async function init() {
  const user = await initShell({
    active: 'voucher',
    title: 'Daftar Voucher',
    description: 'Kelola voucher WiFi sekolah — buat, ubah, dan pantau statusnya.',
    breadcrumb: [{ label: 'Voucher' }],
  });
  if (!user) return;

  document.getElementById('pageHeader').insertAdjacentHTML('afterend', '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="statCards"></div>');
  renderPageBody();
  await Promise.all([renderStatCards(), renderTable()]);
}

init();
