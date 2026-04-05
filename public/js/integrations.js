// Integrations
async function loadIntegrations() {
  const container = document.getElementById('integrations-content');
  try {
    const res = await fetch('/api/integrations/status');
    const status = await res.json();

    if (!status.jira && !status.linear) {
      container.innerHTML = `
        <div class="integration-card">
          <h4>Setup Required</h4>
          <p style="color:var(--text-secondary);margin-bottom:16px">Configure Jira or Linear to see external tasks here.</p>
          <form id="jira-config-form">
            <h4><span class="source-badge jira">Jira</span> Configuration</h4>
            <label>Base URL<input type="url" id="jira-url" placeholder="https://myorg.atlassian.net"></label>
            <label>Email<input type="email" id="jira-email" placeholder="you@example.com"></label>
            <label>API Token<input type="password" id="jira-token"></label>
            <label>Project Key<input type="text" id="jira-project" placeholder="DEV"></label>
            <button type="submit" class="btn btn-primary" style="margin-top:8px">Save Jira Config</button>
          </form>
          <hr style="border-color:var(--border);margin:24px 0">
          <form id="linear-config-form">
            <h4><span class="source-badge linear">Linear</span> Configuration</h4>
            <label>API Key<input type="password" id="linear-key"></label>
            <label>Team ID (optional)<input type="text" id="linear-team"></label>
            <button type="submit" class="btn btn-primary" style="margin-top:8px">Save Linear Config</button>
          </form>
        </div>
      `;

      document.getElementById('jira-config-form').addEventListener('submit', async (e) => {
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

      document.getElementById('linear-config-form').addEventListener('submit', async (e) => {
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
    container.innerHTML = '<p class="placeholder">Failed to load integrations</p>';
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
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <span style="color:var(--text-secondary)">Connected:</span>
      ${sources.join(' ')}
      <button class="btn btn-sm" onclick="loadIntegrations()" style="margin-left:auto">Refresh</button>
    </div>
    ${tasks.length === 0 ? '<p class="placeholder">No external tasks found</p>' : ''}
    ${tasks.map(t => `
      <div class="integration-card">
        <h4>
          <span class="source-badge ${t.source}">${t.source}</span>
          <a href="${escapeHtml(t.url)}" target="_blank" style="color:var(--accent)">${escapeHtml(t.externalId)}</a>
          — ${escapeHtml(t.title)}
        </h4>
        <p style="color:var(--text-secondary);font-size:13px">${escapeHtml(t.description || '').substring(0, 200)}</p>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <span class="tag">${t.status}</span>
          <span class="tag">${t.priority}</span>
          ${t.assignee ? `<span style="color:var(--text-muted);font-size:12px">${escapeHtml(t.assignee)}</span>` : ''}
        </div>
      </div>
    `).join('')}
  `;
}

// Load when integrations tab is shown
document.querySelector('[data-tab="integrations"]').addEventListener('click', loadIntegrations);
