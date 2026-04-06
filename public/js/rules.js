// Rules tab — manage .devlens/rules.md

let currentRules = [];

async function loadRules() {
  try {
    const res = await fetch('/api/rules');
    currentRules = await res.json();
    renderRules();
  } catch (err) {
    showToast('Failed to load rules', 'error');
  }
}

function renderRules() {
  const list = document.getElementById('rules-list');
  if (!list) return;

  if (!currentRules.length) {
    list.innerHTML = '<p class="panel-empty">No rules defined</p>';
    return;
  }

  // Sort: protected (default) first
  const sorted = [...currentRules].sort((a, b) => (b.protected ? 1 : 0) - (a.protected ? 1 : 0));

  list.innerHTML = sorted.map(rule => {
    const lockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

    return `
      <div class="rule-card ${rule.active ? 'active' : 'inactive'} ${rule.protected ? 'protected' : ''}">
        <label class="rule-toggle">
          <input type="checkbox" ${rule.active ? 'checked' : ''} onchange="toggleRule(${rule.index})">
          <span class="rule-toggle-slider"></span>
        </label>
        <div class="rule-content">
          <div class="rule-text">${escapeHtml(rule.content)}</div>
          ${rule.protected ? '<span class="rule-default-badge">DEFAULT</span>' : ''}
        </div>
        <div class="rule-actions">
          ${rule.protected
            ? `<span class="rule-lock" title="Protected — cannot be deleted">${lockIcon}</span>`
            : `<button class="btn-icon btn-icon-sm rule-delete" onclick="deleteRule(${rule.index})" title="Delete rule">${trashIcon}</button>`}
        </div>
      </div>
    `;
  }).join('');
}

async function toggleRule(index) {
  try {
    await fetch(`/api/rules/${index}/toggle`, { method: 'PATCH' });
    showToast('Rule toggled', 'success');
    loadRules();
  } catch {
    showToast('Failed to toggle rule', 'error');
  }
}

async function deleteRule(index) {
  if (!confirm('Delete this rule?')) return;
  try {
    const res = await fetch(`/api/rules/${index}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Cannot delete', 'error');
      return;
    }
    showToast('Rule deleted', 'success');
    loadRules();
  } catch {
    showToast('Failed to delete rule', 'error');
  }
}

async function addRule(content) {
  if (!content || !content.trim()) return;
  try {
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim() }),
    });
    showToast('Rule added', 'success');
    loadRules();
  } catch {
    showToast('Failed to add rule', 'error');
  }
}

// Add Rule button → simple prompt
document.getElementById('add-rule-btn')?.addEventListener('click', () => {
  const content = prompt('Enter the new rule:');
  if (content) addRule(content);
});

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.getAttribute('data-preset');
    if (preset) addRule(preset);
  });
});

// ============================================================
// Commit Approval
// ============================================================
async function loadCommitApproval() {
  try {
    const res = await fetch('/api/rules/commit-approval/status');
    const data = await res.json();
    renderCommitApproval(data);
  } catch {}
}

function renderCommitApproval(data) {
  const pendingBanner = document.getElementById('commit-approval-banner');
  const approvedBanner = document.getElementById('commit-approved-banner');
  if (!pendingBanner || !approvedBanner) return;

  if (data.pending) {
    pendingBanner.style.display = '';
    document.getElementById('commit-approval-message').textContent = data.pending;
    approvedBanner.style.display = 'none';
  } else {
    pendingBanner.style.display = 'none';
  }

  if (data.approved && data.approvedAt) {
    approvedBanner.style.display = '';
    document.getElementById('commit-approved-time').textContent = new Date(data.approvedAt).toLocaleString();
  } else if (!data.pending) {
    approvedBanner.style.display = 'none';
  }
}

document.getElementById('approve-commit-btn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/rules/commit-approval/approve', { method: 'POST' });
    showToast('Commit approved', 'success');
    loadCommitApproval();
  } catch {
    showToast('Failed to approve', 'error');
  }
});

document.getElementById('reject-commit-btn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/rules/commit-approval/reject', { method: 'POST' });
    showToast('Commit rejected', 'info');
    loadCommitApproval();
  } catch {
    showToast('Failed to reject', 'error');
  }
});

// WebSocket handlers
function handleRulesUpdate(payload) {
  if (payload?.rules) {
    currentRules = payload.rules;
    renderRules();
  } else {
    loadRules();
  }
}

function handleCommitApprovalUpdate(payload) {
  if (payload) renderCommitApproval(payload);
}

// Initial load
loadRules();
loadCommitApproval();
