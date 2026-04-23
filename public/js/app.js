// Auth
fetch('/api/auth/status').then(r => r.json()).then(data => {
  if (!data.authenticated) location.href = '/login';
}).catch(() => {});

async function logoutAction() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
}

function showChangePassword() {
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('change-password-modal').style.display = 'flex';
  document.getElementById('cp-current').focus();
}

function hideChangePassword() {
  document.getElementById('change-password-modal').style.display = 'none';
}

async function submitChangePassword() {
  const current = document.getElementById('cp-current').value;
  const newPw = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  if (!current || !newPw) { showToast('Please fill in all fields', 'error'); return; }
  if (newPw !== confirm) { showToast('Passwords do not match', 'error'); return; }
  if (newPw.length < 4) { showToast('Password must be at least 4 characters', 'error'); return; }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
    });
    const data = await res.json();
    if (data.ok) {
      hideChangePassword();
      showToast('Password updated', 'success');
    } else {
      showToast(data.error || 'Failed to update password', 'error');
    }
  } catch {
    showToast('Connection error', 'error');
  }
}

// Close modal on backdrop click
document.getElementById('change-password-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideChangePassword();
});

// Load project info into sidebar + page title
fetch('/api/info').then(r => r.json()).then(info => {
  if (info.projectName) {
    document.title = `${info.projectName} — Devlens`;
    const el = document.getElementById('brand-project');
    if (el) {
      el.textContent = info.projectName;
      el.title = info.projectDir || info.projectName;
    }
  }
}).catch(() => {});

// Tab switching — sidebar nav with URL routing
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tab) {
  navItems.forEach(n => n.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');
  const view = document.getElementById(tab + '-view');
  if (view) view.classList.add('active');
  window.dispatchEvent(new CustomEvent('tab-activated', { detail: { tab } }));
}

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    switchTab(tab);
    history.pushState(null, '', '/' + tab);
  });
});

// Handle browser back/forward
window.addEventListener('popstate', () => {
  const tab = location.pathname.replace('/', '') || 'diff';
  switchTab(tab);
});

// Load initial tab from URL — redirect / to /diff
(function() {
  const path = location.pathname.replace('/', '');
  const tab = ['diff', 'tasks', 'browser', 'history', 'rules', 'integrations', 'settings'].includes(path) ? path : 'diff';
  if (!path || path === '') {
    history.replaceState(null, '', '/diff');
  }
  switchTab(tab);
})();

// WebSocket
let ws = null;
let reconnectDelay = 1000;
const statusEl = document.getElementById('ws-status');
const statusIndicator = statusEl.querySelector('.status-indicator');
const statusLabel = statusEl.querySelector('.status-label');

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    statusIndicator.classList.add('connected');
    statusLabel.textContent = 'Connected';
    statusEl.title = 'WebSocket connected';
    reconnectDelay = 1000;
  };

  ws.onclose = () => {
    statusIndicator.classList.remove('connected');
    statusLabel.textContent = 'Disconnected';
    statusEl.title = 'WebSocket disconnected';
    setTimeout(connectWebSocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'diff-update' && typeof handleDiffUpdate === 'function') {
        handleDiffUpdate(msg.payload);
      }
      if (msg.type === 'status-update' && typeof handleStatusUpdate === 'function') {
        handleStatusUpdate(msg.payload);
      }
      if (msg.type === 'task-update' && typeof handleTaskUpdate === 'function') {
        handleTaskUpdate(msg.payload);
      }
      if (msg.type === 'rules-update' && typeof handleRulesUpdate === 'function') {
        handleRulesUpdate(msg.payload);
      }
      if (msg.type === 'commit-approval-update' && typeof handleCommitApprovalUpdate === 'function') {
        handleCommitApprovalUpdate(msg.payload);
      }
    } catch (e) {
      console.error('WebSocket message parse error:', e);
    }
  };
}

connectWebSocket();

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = `opacity ${250}ms`;
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}
