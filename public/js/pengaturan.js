import { initShell } from './shell.js';
import {
  rupiah, showToast, openModal, confirmDialog, esc,
} from './ui-components.js';

let activeTab = 'sekolah';
let currentUser = null;

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

function withSavingButton(btn, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  return fn().finally(() => {
    btn.disabled = false;
    btn.textContent = original;
  });
}

function tabsHTML() {
  const tabs = [
    { key: 'sekolah', label: 'Informasi Sekolah' },
    { key: 'harga', label: 'Harga Voucher' },
    { key: 'sistem', label: 'Konfigurasi Sistem' },
    { key: 'akun', label: 'Akun Saya' },
    { key: 'backup', label: 'Backup & Restore' },
  ];
  return `<div class="vh-tabs">${tabs.map((t) => `<button class="vh-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>`;
}

// ---- Informasi Sekolah ----
function sekolahHTML(s) {
  return `
    <div class="vh-card p-5 max-w-xl">
      <h2 class="font-semibold mb-4">Informasi Sekolah</h2>
      <div class="space-y-4">
        <div class="vh-field"><label class="vh-label">Nama Sekolah <span class="req">*</span></label><input class="vh-input" id="f-nama" value="${esc(s.nama)}"></div>
        <div class="vh-field"><label class="vh-label">NPSN</label><input class="vh-input" id="f-npsn" value="${esc(s.npsn)}"></div>
        <div class="vh-field"><label class="vh-label">Alamat</label><input class="vh-input" id="f-alamat" value="${esc(s.alamat)}"></div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="vh-field"><label class="vh-label">Telepon</label><input class="vh-input" id="f-telepon" value="${esc(s.telepon)}"></div>
          <div class="vh-field"><label class="vh-label">Email</label><input type="email" class="vh-input" id="f-email" value="${esc(s.email)}"></div>
        </div>
        <button id="btnSaveSekolah" class="vh-btn vh-btn-primary !py-2 !px-5 text-sm">Simpan Perubahan</button>
      </div>
    </div>`;
}

async function loadSekolah() {
  const body = document.getElementById('settingsTabBody');
  body.innerHTML = '<div class="vh-card p-5 max-w-xl"><p class="text-sm text-slate-400">Memuat...</p></div>';
  try {
    const s = await api('/api/settings/school');
    body.innerHTML = sekolahHTML(s);
    document.getElementById('btnSaveSekolah').addEventListener('click', (e) => {
      withSavingButton(e.target, async () => {
        try {
          await api('/api/settings/school', {
            method: 'PUT',
            body: JSON.stringify({
              nama: document.getElementById('f-nama').value,
              npsn: document.getElementById('f-npsn').value,
              alamat: document.getElementById('f-alamat').value,
              telepon: document.getElementById('f-telepon').value,
              email: document.getElementById('f-email').value,
            }),
          });
          showToast('Informasi sekolah disimpan.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="vh-card p-5 max-w-xl"><p class="text-sm text-red-500">${err.message}</p></div>`;
    showToast(err.message, 'error');
  }
}

// ---- Harga Voucher ----
function hargaShell() {
  return `
    <div class="vh-card p-5 max-w-xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-semibold">Harga Voucher</h2>
        <button id="btnAddPrice" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm"><i data-lucide="plus" style="width:16px;height:16px"></i> Tambah Harga</button>
      </div>
      <p class="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">Daftar referensi harga. Nominal yang bisa dipilih saat membuat voucher tetap mengikuti pilihan tetap di modul Voucher &amp; Penjualan.</p>
      <ul class="divide-y divide-slate-100" id="priceList"></ul>
    </div>`;
}

async function loadHarga() {
  const body = document.getElementById('settingsTabBody');
  body.innerHTML = hargaShell();
  lucide.createIcons();
  document.getElementById('btnAddPrice').addEventListener('click', openAddPrice);
  await renderPriceList();
}

async function renderPriceList() {
  const el = document.getElementById('priceList');
  el.innerHTML = '<li class="py-3 text-sm text-slate-400">Memuat...</li>';
  try {
    const prices = await api('/api/settings/prices');
    el.innerHTML = !prices.length
      ? '<li class="py-3 text-sm text-slate-400">Belum ada harga voucher.</li>'
      : prices.map((p) => `
        <li class="flex items-center justify-between py-3">
          <span class="font-medium">${rupiah(p.nominal)}</span>
          <button class="vh-row-action danger" data-removeprice="${p.id}" title="Hapus"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>
        </li>`).join('');
    lucide.createIcons();
    document.querySelectorAll('[data-removeprice]').forEach((btn) => btn.addEventListener('click', () => removePrice(btn.dataset.removeprice)));
  } catch (err) {
    el.innerHTML = `<li class="py-3 text-sm text-red-500">${err.message}</li>`;
    showToast(err.message, 'error');
  }
}

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

function openAddPrice() {
  const close = openModal({
    title: 'Tambah Harga Voucher',
    bodyHTML: `
      <div class="vh-field">
        <label class="vh-label">Nominal (Rp) <span class="req">*</span></label>
        <input type="number" min="0" step="500" class="vh-input" id="f-nominal" placeholder="Contoh: 15000">
      </div>`,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Simpan', variant: 'primary',
        onClick: () => {
          const nominal = parseInt(document.getElementById('f-nominal').value, 10);
          if (!nominal) return;
          withSavingState(getPrimaryButton(), 'Menyimpan...', async () => {
            try {
              await api('/api/settings/prices', { method: 'POST', body: JSON.stringify({ nominal }) });
              await renderPriceList();
              showToast('Harga voucher baru ditambahkan.', 'success');
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

function removePrice(id) {
  confirmDialog({
    title: 'Hapus Harga Voucher?',
    message: 'Pilihan harga akan dihapus dari daftar.',
    onConfirm: async () => {
      try {
        await api(`/api/settings/prices/${id}`, { method: 'DELETE' });
        await renderPriceList();
        showToast('Harga voucher dihapus.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

// ---- Konfigurasi Sistem ----
function sistemHTML(s) {
  return `
    <div class="vh-card p-5 max-w-xl">
      <h2 class="font-semibold mb-4">Konfigurasi Sistem</h2>
      <div class="space-y-4">
        <div class="vh-field">
          <label class="vh-label">Ambang Batas Stok Rendah</label>
          <input type="number" class="vh-input" id="f-lowstock" value="${s.lowStockThreshold}">
          <p class="vh-helper">Notifikasi stok rendah muncul saat stok voucher di bawah angka ini.</p>
        </div>
        <div class="vh-field">
          <label class="vh-label">Jumlah Transaksi di Dashboard</label>
          <input type="number" class="vh-input" id="f-txlimit" value="${s.recentTransactionsLimit}">
        </div>
        <div class="flex items-center justify-between py-2">
          <div><p class="text-sm font-medium">Notifikasi Email</p><p class="text-xs text-slate-500">Kirim ringkasan harian ke email Admin.</p></div>
          <input type="checkbox" class="w-5 h-5 accent-green-600" id="f-email-notif" ${s.notifikasiEmail ? 'checked' : ''}>
        </div>
        <div class="flex items-center justify-between py-2">
          <div><p class="text-sm font-medium">Mode Pemeliharaan</p><p class="text-xs text-slate-500">Nonaktifkan sementara akses Operator.</p></div>
          <input type="checkbox" class="w-5 h-5 accent-green-600" id="f-maintenance" ${s.modePemeliharaan ? 'checked' : ''}>
        </div>
        <button id="btnSaveSistem" class="vh-btn vh-btn-primary !py-2 !px-5 text-sm">Simpan Perubahan</button>
      </div>
    </div>`;
}

async function loadSistem() {
  const body = document.getElementById('settingsTabBody');
  body.innerHTML = '<div class="vh-card p-5 max-w-xl"><p class="text-sm text-slate-400">Memuat...</p></div>';
  try {
    const s = await api('/api/settings/system');
    body.innerHTML = sistemHTML(s);
    document.getElementById('btnSaveSistem').addEventListener('click', (e) => {
      withSavingButton(e.target, async () => {
        try {
          await api('/api/settings/system', {
            method: 'PUT',
            body: JSON.stringify({
              lowStockThreshold: parseInt(document.getElementById('f-lowstock').value, 10),
              recentTransactionsLimit: parseInt(document.getElementById('f-txlimit').value, 10),
              notifikasiEmail: document.getElementById('f-email-notif').checked,
              modePemeliharaan: document.getElementById('f-maintenance').checked,
            }),
          });
          showToast('Konfigurasi sistem disimpan.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="vh-card p-5 max-w-xl"><p class="text-sm text-red-500">${err.message}</p></div>`;
    showToast(err.message, 'error');
  }
}

// ---- Akun Saya ----
function akunHTML() {
  return `
    <div class="vh-card p-5 max-w-xl">
      <h2 class="font-semibold mb-4">Akun Saya</h2>
      <div class="space-y-4">
        <div class="vh-field"><label class="vh-label">Nama</label><input class="vh-input" id="f-akun-nama" value="${esc(currentUser.name || '')}"></div>
        <div class="vh-field"><label class="vh-label">Email</label><input class="vh-input" value="${esc(currentUser.email || '')}" disabled></div>
        <div class="vh-field"><label class="vh-label">Password Baru</label><input type="password" class="vh-input" id="f-akun-pw" placeholder="Kosongkan jika tidak diubah"></div>
        <div class="vh-field"><label class="vh-label">Konfirmasi Password</label><input type="password" class="vh-input" id="f-akun-pw2"></div>
        <button id="btnSaveAkun" class="vh-btn vh-btn-primary !py-2 !px-5 text-sm">Simpan Perubahan</button>
      </div>
    </div>`;
}

function loadAkun() {
  document.getElementById('settingsTabBody').innerHTML = akunHTML();
  document.getElementById('btnSaveAkun').addEventListener('click', (e) => {
    withSavingButton(e.target, async () => {
      try {
        await api('/api/settings/account', {
          method: 'PUT',
          body: JSON.stringify({
            nama: document.getElementById('f-akun-nama').value,
            password: document.getElementById('f-akun-pw').value,
            confirmPassword: document.getElementById('f-akun-pw2').value,
          }),
        });
        showToast('Profil akun diperbarui.', 'success');
        document.getElementById('f-akun-pw').value = '';
        document.getElementById('f-akun-pw2').value = '';
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// ---- Backup & Restore ----
function backupHTML() {
  return `
    <div class="vh-card p-5 max-w-xl">
      <div class="flex items-center justify-between mb-1">
        <h2 class="font-semibold">Backup &amp; Restore</h2>
        <button id="btnBackupNow" class="vh-btn vh-btn-primary !py-2 !px-4 text-sm"><i data-lucide="database-backup" style="width:16px;height:16px"></i> Buat Backup Sekarang</button>
      </div>
      <p class="text-xs text-slate-400 mb-4">Backup berisi snapshot JSON seluruh data VoucherHub saat ini.</p>
      <ul class="divide-y divide-slate-100" id="backupList"></ul>
    </div>`;
}

async function renderBackupList() {
  const el = document.getElementById('backupList');
  el.innerHTML = '<li class="py-3 text-sm text-slate-400">Memuat...</li>';
  try {
    const backups = await api('/api/settings/backups');
    el.innerHTML = !backups.length
      ? '<li class="py-3 text-sm text-slate-400">Belum ada backup.</li>'
      : backups.map((b) => `
        <li class="flex items-center justify-between py-3">
          <div><p class="text-sm font-medium">${b.tanggal}</p><p class="text-xs text-slate-400">${b.ukuran}</p></div>
          <button class="vh-row-action" data-download="${b.id}" title="Unduh"><i data-lucide="download" style="width:16px;height:16px"></i></button>
        </li>`).join('');
    lucide.createIcons();
    document.querySelectorAll('[data-download]').forEach((btn) => btn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = `/api/settings/backups/${btn.dataset.download}/download`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }));
  } catch (err) {
    el.innerHTML = `<li class="py-3 text-sm text-red-500">${err.message}</li>`;
    showToast(err.message, 'error');
  }
}

async function loadBackup() {
  document.getElementById('settingsTabBody').innerHTML = backupHTML();
  lucide.createIcons();
  await renderBackupList();
  document.getElementById('btnBackupNow').addEventListener('click', (e) => {
    withSavingButton(e.target, async () => {
      try {
        await api('/api/settings/backups', { method: 'POST' });
        showToast('Backup baru berhasil dibuat.', 'success');
        await renderBackupList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function renderTabContent() {
  if (activeTab === 'sekolah') await loadSekolah();
  else if (activeTab === 'harga') await loadHarga();
  else if (activeTab === 'sistem') await loadSistem();
  else if (activeTab === 'akun') loadAkun();
  else await loadBackup();
  lucide.createIcons();
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `<div class="vh-card p-2">${tabsHTML()}</div><div id="settingsTabBody" class="mt-5"></div>`;
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTab));
    renderTabContent();
  }));
  renderTabContent();
}

async function init() {
  const user = await initShell({
    active: 'pengaturan',
    title: 'Pengaturan',
    description: 'Kelola informasi sekolah, harga voucher, konfigurasi sistem, dan backup data.',
    breadcrumb: [{ label: 'Pengaturan' }],
  });
  if (!user) return;
  currentUser = user;

  renderPageBody();
}

init();
