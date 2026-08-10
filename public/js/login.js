// VoucherHub — Login (Phase 2: real Firebase Authentication)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const errorBox = document.getElementById('loginError');
const errorText = document.getElementById('loginErrorText');
const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('loginSubmitBtn');

function showError(message) {
  errorText.textContent = message;
  errorBox.classList.remove('hidden');
}
function hideError() {
  errorBox.classList.add('hidden');
}
function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? 'Memproses...' : 'Login';
}

function friendlyAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau password salah.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
    case 'auth/user-disabled':
      return 'Akun dinonaktifkan. Hubungi Admin.';
    default:
      return 'Gagal login. Silakan coba lagi.';
  }
}

async function init() {
  lucide.createIcons();

  // Password show/hide toggle
  const pwInput = document.getElementById('password');
  const toggleBtn = document.getElementById('togglePassword');
  toggleBtn.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    toggleBtn.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" style="width:18px;height:18px"></i>`;
    lucide.createIcons();
  });

  // If already logged in, skip straight to the dashboard.
  try {
    const meRes = await fetch('/api/auth/me', { credentials: 'include' });
    if (meRes.ok) {
      window.location.href = 'dashboard.html';
      return;
    }
  } catch (e) { /* backend not reachable yet — let the user try logging in */ }

  // Fetch Firebase client config from the backend (not hardcoded here) and init.
  let firebaseApp, auth;
  try {
    const cfgRes = await fetch('/api/config/firebase-client');
    const cfgBody = await cfgRes.json();
    firebaseApp = initializeApp(cfgBody.data);
    auth = getAuth(firebaseApp);
  } catch (e) {
    showError('Tidak dapat terhubung ke server. Pastikan backend berjalan.');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showError('Email dan password wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });
      const loginBody = await loginRes.json();

      if (!loginRes.ok) {
        showError(loginBody.message || 'Gagal login.');
        setLoading(false);
        return;
      }

      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(friendlyAuthError(err.code));
      setLoading(false);
    }
  });
}

init();
