// VoucherHub — shared design-system component helpers used by every
// Phase 2.1 feature page. Keeping these in one place is what makes 10
// separate pages actually feel like one product instead of 10 one-offs.

export const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
export const number = (n) => Number(n || 0).toLocaleString('id-ID');

// Escapes free-text values before they're interpolated into innerHTML
// templates (user names, descriptions, notes, etc. all pass through the
// API and can contain arbitrary characters) — prevents stored XSS from a
// name/description field like `<img src=x onerror=...>` ever executing
// in another user's browser. Numbers/booleans pass through untouched.
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---------------------------------------------------------------- Modal --
let modalRoot;
function getModalRoot() {
  if (!modalRoot) modalRoot = document.getElementById('modalRoot');
  return modalRoot;
}

/**
 * Opens a modal with the given title + inner HTML body + footer buttons.
 * footerButtons: [{ label, variant: 'primary'|'secondary', onClick }]
 * Returns a close() function the caller can invoke programmatically.
 */
export function openModal({ title, bodyHTML, footerButtons = [], size = 'md' }) {
  const root = getModalRoot();
  const maxWidth = size === 'lg' ? '640px' : size === 'sm' ? '380px' : '480px';

  const overlay = document.createElement('div');
  overlay.className = 'vh-modal-overlay';
  overlay.innerHTML = `
    <div class="vh-modal" style="max-width:${maxWidth}">
      <div class="vh-modal-header">
        <h3 class="text-lg font-bold">${title}</h3>
        <button class="vh-modal-close" data-close><i data-lucide="x" style="width:20px;height:20px"></i></button>
      </div>
      <div class="vh-modal-body">${bodyHTML}</div>
      <div class="vh-modal-footer" data-footer></div>
    </div>`;
  root.appendChild(overlay);

  const footer = overlay.querySelector('[data-footer]');
  footerButtons.forEach((btn) => {
    const el = document.createElement('button');
    el.className = `vh-btn ${btn.variant === 'primary' ? 'vh-btn-primary' : 'vh-btn-secondary'} !py-2 !px-4 text-sm`;
    el.textContent = btn.label;
    el.addEventListener('click', () => btn.onClick?.(close));
    footer.appendChild(el);
  });

  function close() {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 150);
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);

  requestAnimationFrame(() => overlay.classList.add('open'));
  lucide.createIcons();

  return close;
}

/** Convenience wrapper for a Yes/No confirmation (used for all delete actions). */
export function confirmDialog({ title = 'Konfirmasi', message, confirmLabel = 'Hapus', danger = true, onConfirm }) {
  return openModal({
    title,
    size: 'sm',
    bodyHTML: `
      <div class="flex gap-3">
        <div class="vh-icon-badge ${danger ? 'bg-red-50' : 'bg-amber-50'} shrink-0">
          <i data-lucide="${danger ? 'trash-2' : 'alert-triangle'}" class="${danger ? 'text-red-600' : 'text-amber-600'}" style="width:20px;height:20px"></i>
        </div>
        <p class="text-sm text-slate-600 pt-1.5">${message}</p>
      </div>`,
    footerButtons: [
      { label: 'Batal', variant: 'secondary', onClick: (close) => close() },
      {
        label: confirmLabel,
        variant: 'primary',
        onClick: (close) => { onConfirm?.(); close(); },
      },
    ],
  });
}

// ---------------------------------------------------------------- Toast --
function getToastContainer() {
  let el = document.getElementById('toastContainer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'vh-toast-container';
    document.body.appendChild(el);
  }
  return el;
}

export function showToast(message, type = 'success') {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `vh-toast ${type}`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle-2' : 'alert-circle'}"
       class="${type === 'success' ? 'text-green-600' : 'text-red-600'}" style="width:18px;height:18px"></i>
    <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.style.transition = 'opacity .2s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

// ----------------------------------------------------------- Pagination --
/**
 * Renders a compact pagination control into `container` and calls
 * onChange(page) when the user picks a different page.
 */
export function renderPagination(container, { page, totalPages, totalItems, pageSize }, onChange) {
  if (totalPages <= 1) {
    container.innerHTML = `<p class="text-xs text-slate-400">Menampilkan ${totalItems} dari ${totalItems}</p>`;
    return;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }

  container.innerHTML = `
    <p class="text-xs text-slate-400">Menampilkan ${start}-${end} dari ${number(totalItems)}</p>
    <div class="vh-pagination">
      <button class="vh-page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>
        <i data-lucide="chevron-left" style="width:16px;height:16px"></i>
      </button>
      ${pages.map((p) => p === '...'
        ? `<span class="vh-page-btn" style="pointer-events:none">...</span>`
        : `<button class="vh-page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`
      ).join('')}
      <button class="vh-page-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>
        <i data-lucide="chevron-right" style="width:16px;height:16px"></i>
      </button>
    </div>`;

  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages) onChange(p);
    });
  });
  lucide.createIcons();
}

// ---------------------------------------------------------------- Badge --
const BADGE_MAP = {
  aktif: 'vh-badge-green', tersedia: 'vh-badge-green', hadir: 'vh-badge-green',
  selesai: 'vh-badge-green', berhasil: 'vh-badge-green', admin: 'vh-badge-green',
  terjual: 'vh-badge-blue', operator: 'vh-badge-blue', info: 'vh-badge-blue',
  nonaktif: 'vh-badge-red', gagal: 'vh-badge-red', alpa: 'vh-badge-red',
  rendah: 'vh-badge-amber', izin: 'vh-badge-blue', sakit: 'vh-badge-amber',
};
export function badge(label) {
  const cls = BADGE_MAP[String(label).toLowerCase()] || 'vh-badge-slate';
  return `<span class="vh-badge ${cls}">${label}</span>`;
}

// ------------------------------------------------------- Skeleton / Empty --
export function skeletonRows(columns, rows = 5) {
  return Array.from({ length: rows }).map(() => `
    <tr>${Array.from({ length: columns }).map(() => `<td><div class="vh-skeleton h-4 w-full"></div></td>`).join('')}</tr>
  `).join('');
}

export function emptyState({ icon = 'inbox', title = 'Belum ada data', description = '' }) {
  return `
    <div class="vh-empty">
      <div class="vh-icon-badge bg-slate-100 mx-auto"><i data-lucide="${icon}" class="text-slate-400" style="width:24px;height:24px"></i></div>
      <p class="font-semibold text-slate-600 mt-1">${title}</p>
      ${description ? `<p class="text-sm mt-1">${description}</p>` : ''}
    </div>`;
}
