import { initShell } from './shell.js';
import {
  openModal, confirmDialog, showToast, renderPagination, badge, emptyState, skeletonRows, esc,
} from './ui-components.js';

const ROLES = ['Admin', 'Operator'];
const STATUSES = ['Aktif', 'Nonaktif'];
const userCache = new Map();
let state = { page: 1, pageSize: 5, search: '', role: 'Semua Role' };
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

async function renderStatCards() {
  const cardDefs = [
    { key: 'total', label: 'Total Pengguna', icon: 'users', bg: '#dcfce7', color: '#16a34a' },
    { key: 'admin', label: 'Admin', icon: 'shield-check', bg: '#dbeafe', color: '#2563eb' },
    { key: 'operator', label: 'Operator', icon: 'user', bg: '#ede9fe', color: '#7c3aed' },
    { key: 'nonaktif', label: 'Nonaktif', icon: 'user-x', bg: '#ffedd5', color: '#ea580c' },
  ];
  document.getElementById('statCards').innerHTML = cardDefs.map((s) => `
    <div class="vh-card p-4">
      <div class="vh-icon-badge mb-3" style="background:${s.bg}"><span style="color:${s.color}"><i data-lucide="${s.icon}" style="width:20px;height:20px"></i></span></div>
      <p class="text-xs text-slate-500">${s.label}</p>
      <p class="text-lg font-extrabold mt-0.5" id="stat-${s.key}">-</p>
    </div>`).join('');
  lucide.createIcons();

  try {
    const stats = await api('/api/users/stats');
    cardDefs.forEach((s) => { document.getElementById(`stat-${s.key}`).textContent = stats[s.key]; });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function initialsOf(name) { return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''); }

async function renderTable() {
  const tbody = document.getElementById('userTbody');
  tbody.innerHTML = skeletonRows(6, 5);

  let data;
  try {
    const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize, role: state.role });
    if (state.search) params.set('search', state.search);
    data = await api(`/api/users?${params.toString()}`);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat pengguna', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
    return;
  }

  state.page = data.page;
  data.items.forEach((u) => userCache.set(u.id, u));

  tbody.innerHTML = !data.items.length
    ? `<tr><td colspan="6">${emptyState({ icon: 'users', title: 'Pengguna tidak ditemukan' })}</td></tr>`
    : data.items.map((u) => `
      <tr>
        <td>
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-xs">${esc(initialsOf(u.nama))}</div>
            <span class="font-medium">${esc(u.nama)}</span>
          </div>
        </td>
        <td>${esc(u.email)}</td>
        <td>${badge(u.role)}</td>
        <td>${badge(u.status)}</td>
        <td>${u.login}</td>
        <td>
          <div class="flex items-center gap-1">
            <button class="vh-row-action" data-detail="${u.id}" title="Detail"><i data-lucide="eye" style="width:16px;height:16px"></i></button>
            <button class="vh-row-action" data-edit="${u.id}" title="Edit"><i data-lucide="pencil" style="width:16px;height:16px"></i></button>
            <button class="vh-row-action danger" data-delete="${u.id}" title="Hapus"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>
          </div>
        </td>
      </tr>`).join('');

  renderPagination(document.getElementById('userPagination'), {
    page: data.page, totalPages: data.totalPages, totalItems: data.totalItems, pageSize: data.pageSize,
  }, (p) => { state.page = p; renderTable(); });

  lucide.createIcons();
  document.querySelectorAll('[data-detail]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.detail)));
  document.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openEdit(btn.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => openDelete(btn.dataset.delete)));
}

function userFormHTML(u = {}) {
  return `
    <div class="space-y-4">
      <div class="vh-field" id="f-nama-field">
        <label class="vh-label">Nama Lengkap <span class="req">*</span></label>
        <input class="vh-input" id="f-nama" value="${esc(u.nama || '')}" placeholder="Contoh: Budi Santoso">
        <p class="vh-field-error">Nama wajib diisi.</p>
      </div>
      <div class="vh-field" id="f-email-field">
        <label class="vh-label">Email <span class="req">*</span></label>
        <input type="email" class="vh-input" id="f-email" value="${esc(u.email || '')}" placeholder="nama@smkibg3.sch.id">
        <p class="vh-helper">Akun Firebase Authentication dibuat terpisah oleh Admin.</p>
        <p class="vh-field-error">Email wajib diisi dan valid.</p>
      </div>
      <div class="vh-field">
        <label class="vh-label">Role <span class="req">*</span></label>
        <select class="vh-select" id="f-role"><option ${u.role === 'Admin' ? 'selected' : ''}>Admin</option><option ${u.role === 'Operator' || !u.role ? 'selected' : ''}>Operator</option></select>
      </div>
      <div class="vh-field">
        <label class="vh-label">Status</label>
        <select class="vh-select" id="f-status"><option ${u.status === 'Aktif' || !u.status ? 'selected' : ''}>Aktif</option><option ${u.status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option></select>
      </div>
    </div>`;
}

function validateUserForm() {
  let valid = true;
  const nama = document.getElementById('f-nama');
  const namaField = document.getElementById('f-nama-field');
  if (!nama.value.trim()) { namaField.classList.add('invalid'); valid = false; } else namaField.classList.remove('invalid');

  const email = document.getElementById('f-email');
  const emailField = document.getElementById('f-email-field');
  if (!email.value.includes('@')) { emailField.classList.add('invalid'); valid = false; } else emailField.classList.remove('invalid');

  return valid;
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

function openCreate() {
  const close = openModal({
    title: 'Tambah Pengguna',
    bodyHTML: userFormHTML(),
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan', variant: 'primary',
        onClick: () => {
          if (!validateUserForm()) return;
          const nama = document.getElementById('f-nama').value.trim();
          const email = document.getElementById('f-email').value.trim();
          const role = document.getElementById('f-role').value;
          const status = document.getElementById('f-status').value;

          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              await api('/api/users', {
                method: 'POST', body: JSON.stringify({
                  nama, email, role, status,
                }),
              });
              state.page = 1;
              await Promise.all([renderStatCards(), renderTable()]);
              showToast('Pengguna berhasil ditambahkan.', 'success');
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
  const u = userCache.get(id);
  if (!u) return;
  const close = openModal({
    title: 'Edit Pengguna',
    bodyHTML: userFormHTML(u),
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan Perubahan', variant: 'primary',
        onClick: () => {
          if (!validateUserForm()) return;
          const nama = document.getElementById('f-nama').value.trim();
          const email = document.getElementById('f-email').value.trim();
          const role = document.getElementById('f-role').value;
          const status = document.getElementById('f-status').value;

          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              await api(`/api/users/${id}`, {
                method: 'PATCH', body: JSON.stringify({
                  nama, email, role, status,
                }),
              });
              await Promise.all([renderStatCards(), renderTable()]);
              showToast('Perubahan pengguna disimpan.', 'success');
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
  const u = userCache.get(id);
  if (!u) return;
  confirmDialog({
    title: 'Hapus Pengguna?',
    message: `Akses <strong>${esc(u.nama)}</strong> ke VoucherHub akan dihapus. Akun Firebase Authentication tidak ikut terhapus otomatis.`,
    onConfirm: async () => {
      try {
        await api(`/api/users/${id}`, { method: 'DELETE' });
        userCache.delete(id);
        await Promise.all([renderStatCards(), renderTable()]);
        showToast('Pengguna berhasil dihapus.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

function openDetail(id) {
  const u = userCache.get(id);
  if (!u) return;
  openModal({
    title: 'Detail Pengguna',
    bodyHTML: `
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">${esc(initialsOf(u.nama))}</div>
        <div><p class="font-semibold">${esc(u.nama)}</p><p class="text-sm text-slate-500">${esc(u.email)}</p></div>
      </div>
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between"><dt class="text-slate-500">Role</dt><dd>${badge(u.role)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Status</dt><dd>${badge(u.status)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Terakhir Login</dt><dd class="font-semibold">${u.login}</dd></div>
      </dl>`,
    footerButtons: [{ label: 'Tutup', variant: 'secondary', onClick: (c) => c() }],
  });
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-semibold">Daftar Pengguna</h2>
        <button id="btnCreate" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm"><i data-lucide="plus" style="width:16px;height:16px"></i> Tambah Pengguna</button>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <div class="vh-search-wrap">
          <i data-lucide="search" style="width:16px;height:16px"></i>
          <input id="userSearch" class="vh-input" placeholder="Cari nama atau email...">
        </div>
        <select id="userFilter" class="vh-select sm:w-48">
          <option>Semua Role</option>
          <option>Admin</option>
          <option>Operator</option>
        </select>
      </div>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[620px]">
          <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Terakhir Login</th><th>Aksi</th></tr></thead>
          <tbody id="userTbody">${skeletonRows(6, 5)}</tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 mt-4" id="userPagination"></div>
    </div>`;

  document.getElementById('btnCreate').addEventListener('click', openCreate);
  document.getElementById('userSearch').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => { state.search = value; state.page = 1; renderTable(); }, 300);
  });
  document.getElementById('userFilter').addEventListener('change', (e) => { state.role = e.target.value; state.page = 1; renderTable(); });
  lucide.createIcons();
}

async function init() {
  const user = await initShell({
    active: 'pengguna',
    title: 'Pengguna',
    description: 'Kelola akun Admin dan Operator yang memiliki akses ke VoucherHub.',
    breadcrumb: [{ label: 'Pengguna' }],
  });
  if (!user) return;

  document.getElementById('pageHeader').insertAdjacentHTML('afterend', '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="statCards"></div>');
  renderPageBody();
  await Promise.all([renderStatCards(), renderTable()]);
}

init();
