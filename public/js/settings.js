// Settings tab — manage .devlens/settings.json (ignore patterns)

var settingsLoaded = false;

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    renderSettings(data);
    settingsLoaded = true;
  } catch {
    showToast('Failed to load settings', 'error');
  }
}

function renderSettings(data) {
  const presetsEl = document.getElementById('settings-presets');
  const customEl = document.getElementById('settings-custom');
  if (!presetsEl || !customEl) return;

  const active = new Set(data.ignorePatterns || []);
  const presets = data.presets || [];

  // Render preset checkboxes
  presetsEl.innerHTML = presets.map(p => `
    <label class="preset-checkbox">
      <input type="checkbox" data-preset="${escapeAttrSettings(p)}" ${active.has(p) ? 'checked' : ''}>
      <span class="preset-name">${escapeHtmlSettings(p)}</span>
    </label>
  `).join('');

  // Custom = active patterns NOT in presets
  const customPatterns = (data.ignorePatterns || []).filter(p => !presets.includes(p));
  customEl.value = customPatterns.join('\n');
}

function collectCurrentPatterns() {
  const checked = Array.from(document.querySelectorAll('#settings-presets input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.preset);
  const custom = (document.getElementById('settings-custom')?.value || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  // Dedupe
  return Array.from(new Set([...checked, ...custom]));
}

async function saveSettings() {
  const patterns = collectCurrentPatterns();
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignorePatterns: patterns }),
    });
    if (!res.ok) {
      showToast('Failed to save settings', 'error');
      return;
    }
    showToast('Settings saved — watcher restarted', 'success');
  } catch {
    showToast('Failed to save settings', 'error');
  }
}

function escapeHtmlSettings(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttrSettings(str) {
  return String(str).replace(/"/g, '&quot;');
}

document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

document.querySelector('[data-tab="settings"]')?.addEventListener('click', () => {
  if (!settingsLoaded) loadSettings();
});

if (location.pathname === '/settings') {
  loadSettings();
}
