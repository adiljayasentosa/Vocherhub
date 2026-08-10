import { initShell } from './shell.js';
import { openModal, showToast, badge, skeletonRows, emptyState, esc } from './ui-components.js';

let activeTab = 'senin';
let sessionCache = { senin: null, jumat: null };
let kelasFilter = 'Semua Kelas';

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

function statChips(stats) {
  const map = [
    { key: 'Hadir', color: '#16a34a', icon: 'check-circle-2' },
    { key: 'Izin', color: '#2563eb', icon: 'file-text' },
    { key: 'Sakit', color: '#f59e0b', icon: 'thermometer' },
    { key: 'Alpa', color: '#dc2626', icon: 'x-circle' },
  ];
  return `
    <div class="flex flex-wrap gap-4">
      ${map.map((m) => `
        <div class="flex items-center gap-2">
          <span class="vh-icon-badge" style="width:36px;height:36px;background:${m.color}1a"><i data-lucide="${m.icon}" style="width:16px;height:16px;color:${m.color}"></i></span>
          <div><p class="text-lg font-extrabold leading-none">${stats[m.key] || 0}</p><p class="text-xs text-slate-500">${m.key}</p></div>
        </div>`).join('')}
      <div class="flex items-center gap-2">
        <span class="vh-icon-badge bg-slate-100" style="width:36px;height:36px"><i data-lucide="users" style="width:16px;height:16px;color:#475569"></i></span>
        <div><p class="text-lg font-extrabold leading-none">${stats.total || 0}</p><p class="text-xs text-slate-500">Total</p></div>
      </div>
    </div>`;
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

const STATUSES = ['Hadir', 'Izin', 'Sakit', 'Alpa'];
const KELAS = ['XI TKJ 1', 'XI TKJ 2', 'XI RPL'];

function openEditStatus(day, recordId) {
  const session = sessionCache[day];
  const m = session.members.find((x) => x.id === recordId);
  if (!m) return;

  const close = openModal({
    title: `Ubah Status - ${esc(m.nama)}`,
    bodyHTML: `
      <div class="space-y-4">
        <div class="vh-field">
          <label class="vh-label">Status Kehadiran <span class="req">*</span></label>
          <select class="vh-select" id="f-status">${STATUSES.map((s) => `<option ${s === m.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="vh-field">
          <label class="vh-label">Keterangan</label>
          <input class="vh-input" id="f-ket" value="${esc(m.keterangan === '-' ? '' : m.keterangan)}" placeholder="Opsional">
        </div>
      </div>`,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan', variant: 'primary',
        onClick: () => {
          const status = document.getElementById('f-status').value;
          const keterangan = document.getElementById('f-ket').value;
          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              await api(`/api/attendance/records/${recordId}`, { method: 'PATCH', body: JSON.stringify({ status, keterangan }) });
              showToast('Status presensi diperbarui.', 'success');
              close();
              await loadSession(day);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        },
      },
    ],
  });
}

function openAddAttendance(day) {
  const close = openModal({
    title: 'Tambah Presensi',
    bodyHTML: `
      <div class="space-y-4">
        <div class="vh-field" id="f-nama-field">
          <label class="vh-label">Nama <span class="req">*</span></label>
          <input class="vh-input" id="f-nama" placeholder="Nama anggota">
          <p class="vh-field-error">Nama wajib diisi.</p>
        </div>
        <div class="vh-field">
          <label class="vh-label">Kelas <span class="req">*</span></label>
          <select class="vh-select" id="f-kelas">${KELAS.map((k) => `<option>${k}</option>`).join('')}</select>
        </div>
        <div class="vh-field">
          <label class="vh-label">Status Kehadiran <span class="req">*</span></label>
          <select class="vh-select" id="f-status">${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
        </div>
        <div class="vh-field">
          <label class="vh-label">Keterangan</label>
          <input class="vh-input" id="f-ket" placeholder="Opsional">
        </div>
      </div>`,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan', variant: 'primary',
        onClick: () => {
          const nama = document.getElementById('f-nama').value.trim();
          const namaField = document.getElementById('f-nama-field');
          if (!nama) { namaField.classList.add('invalid'); return; }
          namaField.classList.remove('invalid');
          const kelas = document.getElementById('f-kelas').value;
          const status = document.getElementById('f-status').value;
          const keterangan = document.getElementById('f-ket').value;

          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              await api(`/api/attendance/${day}`, {
                method: 'POST', body: JSON.stringify({
                  nama, kelas, status, keterangan,
                }),
              });
              showToast('Presensi berhasil ditambahkan.', 'success');
              close();
              await loadSession(day);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        },
      },
    ],
  });
}

function renderMembersTable(day) {
  const session = sessionCache[day];
  const rows = kelasFilter === 'Semua Kelas' ? session.members : session.members.filter((m) => m.kelas === kelasFilter);
  const tbody = document.getElementById('attendanceTbody');
  if (!tbody) return;

  tbody.innerHTML = !rows.length
    ? `<tr><td colspan="6">${emptyState({ icon: 'users', title: 'Belum ada data presensi', description: 'Gunakan tombol Tambah Presensi untuk mulai mencatat kehadiran.' })}</td></tr>`
    : rows.map((m) => `
      <tr>
        <td>${m.no}</td>
        <td class="font-medium">${esc(m.nama)}</td>
        <td>${m.kelas}</td>
        <td>${badge(m.status)}</td>
        <td>${esc(m.keterangan)}</td>
        <td><button class="vh-row-action" data-editstatus="${m.id}" title="Ubah status"><i data-lucide="pencil" style="width:16px;height:16px"></i></button></td>
      </tr>`).join('');

  document.getElementById('attendanceCountLabel').textContent = `Menampilkan 1-${rows.length} dari ${session.members.length}`;
  lucide.createIcons();
  document.querySelectorAll('[data-editstatus]').forEach((btn) => btn.addEventListener('click', () => openEditStatus(day, btn.dataset.editstatus)));
}

function attendanceTabHTML() {
  return `
    <div class="vh-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 class="font-semibold">Presensi Anggota</h2>
        <button id="btnAddAttendance" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm"><i data-lucide="plus" style="width:16px;height:16px"></i> Tambah Presensi</button>
      </div>
      <p class="text-xs text-slate-400 mb-4" id="sessionDateLabel">Memuat...</p>
      <div id="statChipsBox"></div>
      <div class="flex flex-col sm:flex-row gap-3 mt-5 mb-4">
        <select class="vh-select sm:w-56" id="kelasFilter"><option>Semua Kelas</option>${KELAS.map((k) => `<option>${k}</option>`).join('')}</select>
      </div>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[560px]">
          <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Keterangan</th><th>Aksi</th></tr></thead>
          <tbody id="attendanceTbody">${skeletonRows(6, 5)}</tbody>
        </table>
      </div>
      <p class="text-xs text-slate-400 mt-4" id="attendanceCountLabel">Menampilkan 1-0 dari 0</p>
    </div>`;
}

async function loadSession(day) {
  try {
    sessionCache[day] = await api(`/api/attendance/${day}`);
    if (activeTab !== day) return;
    document.getElementById('sessionDateLabel').textContent = `${sessionCache[day].dayLabel}, ${sessionCache[day].dateLabel}`;
    document.getElementById('statChipsBox').innerHTML = statChips(sessionCache[day].stats);
    lucide.createIcons();
    renderMembersTable(day);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function rekapHTML() {
  return `
    <div class="vh-card p-5">
      <h2 class="font-semibold mb-4">Rekap Presensi Bulanan</h2>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[560px]">
          <thead><tr><th>Nama</th><th>Kelas</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>% Kehadiran</th></tr></thead>
          <tbody id="rekapTbody">${skeletonRows(7, 5)}</tbody>
        </table>
      </div>
    </div>`;
}

async function loadRekap() {
  const tbody = document.getElementById('rekapTbody');
  if (!tbody) return;
  try {
    const rows = await api('/api/attendance/recap');
    tbody.innerHTML = !rows.length
      ? `<tr><td colspan="7">${emptyState({ icon: 'calendar', title: 'Belum ada data bulan ini', description: 'Rekap akan muncul setelah ada presensi Senin/Jumat yang tercatat bulan ini.' })}</td></tr>`
      : rows.map((m) => `
        <tr>
          <td class="font-medium">${esc(m.nama)}</td><td>${esc(m.kelas)}</td>
          <td>${m.Hadir}</td><td>${m.Izin}</td><td>${m.Sakit}</td><td>${m.Alpa}</td>
          <td><span class="font-semibold ${m.persenKehadiran >= 80 ? 'vh-trend-up' : 'vh-trend-down'}">${m.persenKehadiran}%</span></td>
        </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState({ icon: 'alert-triangle', title: 'Gagal memuat rekap', description: err.message })}</td></tr>`;
    showToast(err.message, 'error');
  }
}

function tabsHTML() {
  const tabs = [{ key: 'senin', label: 'Presensi Senin' }, { key: 'jumat', label: 'Presensi Jumat' }, { key: 'rekap', label: 'Rekap Presensi' }];
  return `<div class="vh-tabs">${tabs.map((t) => `<button class="vh-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>`;
}

async function renderTabContent() {
  const body = document.getElementById('presensiTabBody');
  if (activeTab === 'senin' || activeTab === 'jumat') {
    body.innerHTML = attendanceTabHTML();
    lucide.createIcons();
    document.getElementById('btnAddAttendance').addEventListener('click', () => openAddAttendance(activeTab));
    document.getElementById('kelasFilter').addEventListener('change', (e) => { kelasFilter = e.target.value; renderMembersTable(activeTab); });
    if (sessionCache[activeTab]) {
      document.getElementById('sessionDateLabel').textContent = `${sessionCache[activeTab].dayLabel}, ${sessionCache[activeTab].dateLabel}`;
      document.getElementById('statChipsBox').innerHTML = statChips(sessionCache[activeTab].stats);
      lucide.createIcons();
      renderMembersTable(activeTab);
    } else {
      await loadSession(activeTab);
    }
  } else {
    body.innerHTML = rekapHTML();
    await loadRekap();
  }
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `<div class="vh-card p-2">${tabsHTML()}</div><div id="presensiTabBody" class="mt-5"></div>`;
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    kelasFilter = 'Semua Kelas';
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTab));
    renderTabContent();
  }));
  renderTabContent();
}

async function init() {
  const user = await initShell({
    active: 'presensi',
    title: 'Presensi Anggota',
    description: 'Catat dan pantau kehadiran anggota setiap Senin dan Jumat.',
    breadcrumb: [{ label: 'Presensi' }],
  });
  if (!user) return;

  renderPageBody();
}

init();
