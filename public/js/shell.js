// VoucherHub — shared shell for every authenticated page (sidebar, topbar,
// breadcrumb/title header, sidebar toggle, logout, auth guard).
// Dashboard.html/login.html/index.html are NOT touched by this — they keep
// their own hand-written markup exactly as approved. This is only used by
// the new Phase 2.1 feature pages so 10 pages don't hand-duplicate the
// sidebar and drift out of sync over time.

const NAV_ITEMS = [
  { key: 'dashboard', href: 'dashboard.html', icon: 'layout-dashboard', label: 'Dashboard' },
  { key: 'voucher', href: 'voucher.html', icon: 'ticket', label: 'Voucher', chevron: true },
  { key: 'penjualan', href: 'penjualan.html', icon: 'shopping-cart', label: 'Penjualan', chevron: true },
  { key: 'presensi', href: 'presensi.html', icon: 'map-pin', label: 'Presensi', chevron: true },
  { key: 'generate-absensi', href: 'generate-absensi.html', icon: 'calendar-check-2', label: 'Generate Absensi' },
  { key: 'keuangan', href: 'keuangan.html', icon: 'wallet', label: 'Keuangan', chevron: true },
  { key: 'laporan', href: 'laporan.html', icon: 'file-bar-chart', label: 'Laporan', chevron: true },
  { key: 'pengguna', href: 'pengguna.html', icon: 'users', label: 'Pengguna', chevron: true },
  { key: 'pengaturan', href: 'pengaturan.html', icon: 'settings', label: 'Pengaturan', chevron: true },
  { key: 'log-sistem', href: 'log-sistem.html', icon: 'scroll-text', label: 'Log Sistem' },
];

function sidebarHTML(active) {
  const links = NAV_ITEMS.map((item) => `
    <a href="${item.href}" class="vh-sidebar-link${item.key === active ? ' active' : ''}">
      <i data-lucide="${item.icon}"></i> ${item.label}
      ${item.chevron ? '<i data-lucide="chevron-right" class="chev ml-auto" style="width:14px;height:14px"></i>' : ''}
    </a>`).join('');

  return `
    <div class="h-16 flex items-center gap-2 px-5 font-bold text-lg border-b border-slate-100">
      <i data-lucide="wifi" class="text-green-600" style="width:22px;height:22px"></i>
      VoucherHub
    </div>
    <nav class="flex-1 overflow-y-auto p-3 space-y-1">${links}</nav>
    <div class="p-3 border-t border-slate-100">
      <button id="logoutBtn" class="vh-sidebar-link w-full text-red-600">
        <i data-lucide="log-out" class="!text-red-500"></i> Keluar
      </button>
    </div>`;
}

function topbarHTML() {
  return `
    <button id="sidebarBtn" class="lg:hidden" aria-label="Buka menu">
      <i data-lucide="menu" style="width:22px;height:22px"></i>
    </button>
    <div class="hidden lg:block"></div>
    <div class="flex items-center gap-4">
      <button class="relative" aria-label="Notifikasi">
        <i data-lucide="bell" style="width:20px;height:20px" class="text-slate-500"></i>
      </button>
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-sm" id="userInitials">?</div>
        <div class="hidden sm:block leading-tight">
          <p class="text-sm font-semibold" id="userName">-</p>
          <p class="text-xs text-slate-400" id="userRole">-</p>
        </div>
      </div>
    </div>`;
}

function pageHeaderHTML({ breadcrumb, title, description }) {
  const crumbHtml = breadcrumb
    ? `<nav class="vh-breadcrumb mb-2">
        <a href="dashboard.html">Dashboard</a>
        ${breadcrumb.map((b) => `<span class="sep">/</span>${b.href ? `<a href="${b.href}">${b.label}</a>` : `<span class="current">${b.label}</span>`}`).join('')}
      </nav>`
    : '';
  return `
    ${crumbHtml}
    <h1 class="text-2xl font-extrabold">${title}</h1>
    ${description ? `<p class="text-sm text-slate-500 mt-1">${description}</p>` : ''}`;
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
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    window.location.href = 'login.html';
  });
}

async function requireSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error('unauthenticated');
    const body = await res.json();
    return body.data.user;
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

/**
 * Mounts sidebar + topbar + page header into the page's placeholder
 * elements, wires up navigation behaviors, and enforces the session
 * guard used everywhere behind login. Returns the current user (or null
 * if it's already redirecting to login.html — callers should bail out).
 */
export async function initShell({ active, title, description, breadcrumb }) {
  document.getElementById('sidebar').innerHTML = sidebarHTML(active);
  document.getElementById('topbar').innerHTML = topbarHTML();

  const headerMount = document.getElementById('pageHeader');
  if (headerMount) headerMount.innerHTML = pageHeaderHTML({ breadcrumb, title, description });

  lucide.createIcons();
  setupSidebarToggle();
  setupLogout();

  const user = await requireSession();
  if (!user) return null;

  document.getElementById('userInitials').textContent = initials(user.name || user.email);
  document.getElementById('userName').textContent = user.name || user.email;
  document.getElementById('userRole').textContent = roleLabel(user.role);

  return user;
}
