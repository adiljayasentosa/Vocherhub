import { initShell } from './shell.js';
import { openModal, showToast, esc } from './ui-components.js';

let weeksData = null; // { options: [...], currentWeek }
let lastGenerated = null;

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

function weekOptions() {
  return weeksData.options.map((w) => `<option value="${w.value}" data-range="${w.rangeLabel}" ${w.isCurrent ? 'selected' : ''}>${w.label}</option>`).join('');
}

function resultPanelHTML() {
  if (!lastGenerated) {
    return `
      <div class="vh-card p-5">
        <h2 class="font-semibold mb-4">Hasil Generate Terakhir</h2>
        <p class="text-sm text-slate-400">Belum ada absensi yang di-generate.</p>
      </div>`;
  }
  return `
    <div class="vh-card p-5">
      <h2 class="font-semibold mb-4">Hasil Generate Terakhir</h2>
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between"><dt class="text-slate-500">Minggu Ke</dt><dd class="font-semibold">${lastGenerated.minggu}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Rentang</dt><dd class="font-semibold">${lastGenerated.rentang}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Jenis Presensi</dt><dd class="font-semibold">${lastGenerated.jenis}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Kelas</dt><dd class="font-semibold text-right max-w-[60%]">${lastGenerated.kelas}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Dibuat Oleh</dt><dd class="font-semibold">${esc(lastGenerated.dibuatOleh)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Dibuat Pada</dt><dd class="font-semibold">${lastGenerated.dibuatPada}</dd></div>
      </dl>
      <div class="flex flex-wrap gap-2 mt-5">
        <button id="btnPreview" class="vh-btn vh-btn-secondary !py-2 !px-3 text-sm"><i data-lucide="eye" style="width:16px;height:16px"></i> Preview</button>
        <button id="btnPdf" class="vh-btn vh-btn-secondary !py-2 !px-3 text-sm"><i data-lucide="file-down" style="width:16px;height:16px"></i> Download PDF</button>
        <button id="btnExcel" class="vh-btn vh-btn-secondary !py-2 !px-3 text-sm"><i data-lucide="table" style="width:16px;height:16px"></i> Download Excel</button>
      </div>
    </div>`;
}

function formPanelHTML() {
  const currentRange = weeksData.options.find((w) => w.isCurrent)?.rangeLabel || '';
  return `
    <div class="vh-card p-5">
      <h2 class="font-semibold mb-4">Pilih Minggu</h2>
      <div class="space-y-4">
        <div class="vh-field">
          <label class="vh-label">Minggu Ke <span class="req">*</span></label>
          <select class="vh-select" id="f-minggu">${weekOptions()}</select>
          <p class="vh-helper" id="f-rentang-label">${currentRange}</p>
        </div>
        <div class="vh-field">
          <label class="vh-label">Jenis Presensi <span class="req">*</span></label>
          <select class="vh-select" id="f-jenis">
            <option>Presensi Senin</option>
            <option>Presensi Jumat</option>
          </select>
        </div>
        <div class="vh-field">
          <label class="vh-label">Kelas <span class="req">*</span></label>
          <select class="vh-select" id="f-kelas">
            <option>Semua Kelas</option>
            <option>XI TKJ 1</option>
            <option>XI TKJ 2</option>
            <option>XI RPL</option>
          </select>
        </div>
        <button id="btnGenerate" class="vh-btn vh-btn-primary w-full">
          <i data-lucide="zap" style="width:16px;height:16px"></i> Generate Absensi
        </button>
      </div>
    </div>`;
}

/**
 * Uses the *currently selected form values*, not the last-generated
 * result — previewing what generating now would look like is what
 * "Preview" is for. (The approved mock's own openPreview() used
 * lastGenerated + 5 hardcoded fake names instead; this is real data.)
 */
async function openPreview() {
  const minggu = document.getElementById('f-minggu').value;
  const jenis = document.getElementById('f-jenis').value;
  const kelas = document.getElementById('f-kelas').value;
  const rentang = document.getElementById('f-rentang-label').textContent;

  let rows;
  try {
    rows = await api(`/api/attendance-generator/preview?minggu=${minggu}&jenis=${encodeURIComponent(jenis)}&kelas=${encodeURIComponent(kelas)}`);
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  openModal({
    title: 'Preview Absensi',
    size: 'lg',
    bodyHTML: `
      <p class="text-sm text-slate-500 mb-4">${jenis} — ${rentang}</p>
      <div class="overflow-x-auto">
        <table class="vh-table w-full min-w-[420px]">
          <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((r) => `<tr><td>${r.no}</td><td>${esc(r.nama)}</td><td>${esc(r.kelas)}</td><td class="${r.status === 'Belum diisi' ? 'text-slate-400' : ''}">${esc(r.status)}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-slate-400 py-4">Belum ada anggota untuk kelas ini.</td></tr>'}
          </tbody>
        </table>
      </div>`,
    footerButtons: [{ label: 'Tutup', variant: 'secondary', onClick: (c) => c() }],
  });
}

function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function wireActions() {
  document.getElementById('f-minggu').addEventListener('change', (e) => {
    const range = e.target.selectedOptions[0].dataset.range;
    document.getElementById('f-rentang-label').textContent = range;
  });

  const generateBtn = document.getElementById('btnGenerate');
  generateBtn.addEventListener('click', async () => {
    const minggu = document.getElementById('f-minggu').value;
    const jenis = document.getElementById('f-jenis').value;
    const kelas = document.getElementById('f-kelas').value;

    const originalLabel = generateBtn.innerHTML;
    generateBtn.disabled = true;
    generateBtn.style.opacity = '0.6';
    generateBtn.textContent = 'Memproses...';
    try {
      lastGenerated = await api('/api/attendance-generator/generate', {
        method: 'POST', body: JSON.stringify({ minggu, jenis, kelas }),
      });
      renderPageBody();
      showToast('Absensi mingguan berhasil dibuat.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      generateBtn.disabled = false;
      generateBtn.style.opacity = '';
      generateBtn.innerHTML = originalLabel;
    }
  });

  const previewBtn = document.getElementById('btnPreview');
  if (previewBtn) previewBtn.addEventListener('click', openPreview);

  const pdfBtn = document.getElementById('btnPdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      const w = weeksData.options.find((o) => o.label === lastGenerated.minggu);
      triggerDownload(`/api/attendance-generator/export/pdf?minggu=${w.value}&jenis=${encodeURIComponent(lastGenerated.jenis)}&kelas=${encodeURIComponent(lastGenerated.kelas)}`);
    });
  }

  const excelBtn = document.getElementById('btnExcel');
  if (excelBtn) {
    excelBtn.addEventListener('click', () => {
      const w = weeksData.options.find((o) => o.label === lastGenerated.minggu);
      triggerDownload(`/api/attendance-generator/export/excel?minggu=${w.value}&jenis=${encodeURIComponent(lastGenerated.jenis)}&kelas=${encodeURIComponent(lastGenerated.kelas)}`);
    });
  }
}

function renderPageBody() {
  document.getElementById('pageBody').innerHTML = `
    <div class="vh-alert-banner vh-alert-blue">
      <i data-lucide="info" style="width:16px;height:16px" class="mt-0.5 shrink-0"></i>
      <div>Absensi yang sudah di-generate tidak dapat diedit. Pastikan data presensi sudah benar sebelum generate.</div>
    </div>
    <div class="grid lg:grid-cols-2 gap-5">
      ${formPanelHTML()}
      ${resultPanelHTML()}
    </div>`;
  lucide.createIcons();
  wireActions();
}

async function init() {
  const user = await initShell({
    active: 'generate-absensi',
    title: 'Generate Absensi Mingguan',
    description: 'Buat daftar absensi mingguan siap cetak untuk Presensi Senin atau Jumat.',
    breadcrumb: [{ label: 'Generate Absensi' }],
  });
  if (!user) return;

  try {
    [weeksData, lastGenerated] = await Promise.all([
      api('/api/attendance-generator/weeks'),
      api('/api/attendance-generator/last'),
    ]);
  } catch (err) {
    showToast(err.message, 'error');
    weeksData = weeksData || { options: [], currentWeek: 1 };
  }

  renderPageBody();
}

init();
