// Tab switching — sidebar nav
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.dataset.tab;
    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(target + '-view').classList.add('active');
  });
});

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
      if (msg.type === 'todo-update' && typeof handleTodoUpdate === 'function') {
        handleTodoUpdate(msg.payload);
      }
      if (msg.type === 'claude-tasks-update' && typeof handleClaudeTasksUpdate === 'function') {
        handleClaudeTasksUpdate(msg.payload);
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
