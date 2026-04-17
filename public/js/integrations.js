// Integrations — Tunnel + Task Managers

// ---- Tunnel ----
async function loadTunnelStatus() {
  try {
    const res = await fetch('/api/integrations/tunnel/status');
    const status = await res.json();
    updateTunnelUI(status);
  } catch {}
}

function updateTunnelUI(status) {
  const badge = document.getElementById('tunnel-badge');
  const activeCard = document.getElementById('tunnel-active');
  const controls = document.getElementById('tunnel-controls');
  const urlEl = document.getElementById('tunnel-url');

  badge.className = 'tunnel-status-badge ' + status.status;
  badge.textContent = status.status;

  if (status.status === 'connected' && status.url) {
    activeCard.style.display = '';
    controls.style.display = 'none';
    urlEl.href = status.url;
    urlEl.textContent = status.url;
  } else {
    activeCard.style.display = 'none';
    controls.style.display = '';
  }
}

async function startTunnelAction(provider) {
  const badge = document.getElementById('tunnel-badge');
  badge.className = 'tunnel-status-badge connecting';
  badge.textContent = 'connecting';

  try {
    const res = await fetch('/api/integrations/tunnel/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json();
    if (data.ok) {
      hideNgrokTokenSetup();
      updateTunnelUI({ status: 'connected', url: data.url });
      showToast(`Tunnel connected: ${data.url}`, 'success');
    } else if (data.error === 'ngrok_no_token') {
      updateTunnelUI({ status: 'disconnected' });
      showNgrokTokenSetup();
    } else {
      updateTunnelUI({ status: 'error' });
      showToast(data.message || data.error || 'Tunnel failed', 'error');
    }
  } catch (err) {
    updateTunnelUI({ status: 'error' });
    showToast('Failed to start tunnel', 'error');
  }
}

async function stopTunnelAction() {
  try {
    await fetch('/api/integrations/tunnel/stop', { method: 'POST' });
    updateTunnelUI({ status: 'disconnected' });
    showToast('Tunnel disconnected', 'info');
  } catch {
    showToast('Failed to stop tunnel', 'error');
  }
}

function copyTunnelUrl() {
  const url = document.getElementById('tunnel-url').textContent;
  navigator.clipboard.writeText(url).then(() => {
    showToast('URL copied!', 'success');
  });
}

function showNgrokTokenSetup() {
  document.getElementById('ngrok-token-setup').style.display = '';
  document.getElementById('ngrok-token-input').focus();
}

function hideNgrokTokenSetup() {
  document.getElementById('ngrok-token-setup').style.display = 'none';
  document.getElementById('ngrok-token-input').value = '';
}

async function saveNgrokToken() {
  const token = document.getElementById('ngrok-token-input').value.trim();
  if (!token) { showToast('Please enter your ngrok auth token', 'error'); return; }
  try {
    await fetch('/api/integrations/tunnel/ngrok-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    showToast('Token saved, connecting...', 'info');
    await startTunnelAction('ngrok');
  } catch {
    showToast('Failed to save token', 'error');
  }
}

// ---- Task Managers (Jira / Linear) ----
async function loadIntegrations() {
  const container = document.getElementById('integrations-content');
  try {
    const res = await fetch('/api/integrations/status');
    const status = await res.json();

    if (!status.jira && !status.linear) {
      container.innerHTML = `
        <div class="integration-card">
          <h4><span class="source-badge jira">Jira</span> Configuration</h4>
          <form id="jira-config-form" class="config-form">
            <div class="form-row">
              <div class="form-group"><label>Base URL<input type="url" id="jira-url" placeholder="https://myorg.atlassian.net"></label></div>
              <div class="form-group"><label>Email<input type="email" id="jira-email" placeholder="you@example.com"></label></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>API Token<input type="password" id="jira-token"></label></div>
              <div class="form-group"><label>Project Key<input type="text" id="jira-project" placeholder="DEV"></label></div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:var(--sp-2)">Save Jira Config</button>
          </form>
        </div>
        <div class="integration-card">
          <h4><span class="source-badge linear">Linear</span> Configuration</h4>
          <form id="linear-config-form" class="config-form">
            <div class="form-row">
              <div class="form-group"><label>API Key<input type="password" id="linear-key"></label></div>
              <div class="form-group"><label>Team ID (optional)<input type="text" id="linear-team"></label></div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:var(--sp-2)">Save Linear Config</button>
          </form>
        </div>
      `;

      document.getElementById('jira-config-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfig({
          jira: {
            baseUrl: document.getElementById('jira-url').value,
            email: document.getElementById('jira-email').value,
            apiToken: document.getElementById('jira-token').value,
            projectKey: document.getElementById('jira-project').value,
          }
        });
      });

      document.getElementById('linear-config-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfig({
          linear: {
            apiKey: document.getElementById('linear-key').value,
            teamId: document.getElementById('linear-team').value || undefined,
          }
        });
      });
    } else {
      const issuesRes = await fetch('/api/integrations/all');
      const issues = await issuesRes.json();
      renderExternalTasks(container, issues, status);
    }
  } catch (err) {
    container.innerHTML = '<p class="panel-empty">Failed to load integrations</p>';
  }
}

async function saveConfig(config) {
  try {
    await fetch('/api/integrations/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    showToast('Configuration saved', 'success');
    loadIntegrations();
  } catch (err) {
    showToast('Failed to save config', 'error');
  }
}

function renderExternalTasks(container, tasks, status) {
  const sources = [];
  if (status.jira) sources.push('<span class="source-badge jira">Jira</span>');
  if (status.linear) sources.push('<span class="source-badge linear">Linear</span>');

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4)">
      <span style="color:var(--color-text-secondary)">Connected:</span>
      ${sources.join(' ')}
      <button class="btn btn-ghost btn-sm" onclick="loadIntegrations()" style="margin-left:auto">Refresh</button>
    </div>
    ${tasks.length === 0 ? '<p class="panel-empty">No external tasks found</p>' : ''}
    ${tasks.map(t => `
      <div class="integration-card">
        <h4>
          <span class="source-badge ${t.source}">${t.source}</span>
          <a href="${escapeHtml(t.url)}" target="_blank" style="color:var(--color-primary-hover)">${escapeHtml(t.externalId)}</a>
          — ${escapeHtml(t.title)}
        </h4>
        <p style="color:var(--color-text-secondary);font-size:var(--text-sm)">${escapeHtml(t.description || '').substring(0, 200)}</p>
        <div style="margin-top:var(--sp-2);display:flex;gap:var(--sp-2)">
          <span class="tag">${t.status}</span>
          <span class="tag">${t.priority}</span>
          ${t.assignee ? `<span style="color:var(--color-text-muted);font-size:var(--text-xs)">${escapeHtml(t.assignee)}</span>` : ''}
        </div>
      </div>
    `).join('')}
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.addEventListener('tab-activated', (e) => {
  if (e.detail.tab === 'integrations') {
    loadTunnelStatus();
    loadIntegrations();
  }
});
