// Tab switching
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(target + '-view').classList.add('active');
  });
});

// WebSocket
let ws = null;
let reconnectDelay = 1000;
const statusDot = document.getElementById('ws-status');

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    statusDot.classList.add('connected');
    statusDot.title = 'WebSocket connected';
    reconnectDelay = 1000;
  };

  ws.onclose = () => {
    statusDot.classList.remove('connected');
    statusDot.title = 'WebSocket disconnected';
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
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
