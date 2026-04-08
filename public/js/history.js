// History tab — git commits + diff viewer

var historyLoaded = false;
var historySelectedHash = null;
var historyViewMode = localStorage.getItem('devlens-history-view') || 'side-by-side';
var historyCachedData = null; // last loaded commit { hash, files, diff }

async function loadBranchInfo() {
  try {
    const res = await fetch('/api/browser/branch');
    const data = await res.json();
    document.getElementById('current-branch-name').textContent = data.branch || '—';
  } catch {}
}

async function loadCommits() {
  const list = document.getElementById('commits-list');
  if (!list) return;
  list.innerHTML = '<li class="empty-state-inline">Loading commits...</li>';
  try {
    const res = await fetch('/api/browser/commits?limit=100');
    const commits = await res.json();
    document.getElementById('commit-count').textContent = commits.length;

    if (!commits.length) {
      list.innerHTML = '<li class="empty-state-inline">No commits</li>';
      return;
    }

    list.innerHTML = commits.map(c => `
      <li class="commit-item" data-hash="${c.hash}">
        <div class="commit-marker"></div>
        <div class="commit-content">
          <div class="commit-message">${escapeHtmlHistory(c.message)}</div>
          <div class="commit-meta">
            <span class="commit-hash">${c.hash}</span>
            <span class="commit-author">${escapeHtmlHistory(c.author)}</span>
            <span class="commit-date">${formatRelativeDate(c.date)}</span>
          </div>
        </div>
      </li>
    `).join('');

    list.querySelectorAll('.commit-item').forEach(item => {
      item.addEventListener('click', () => {
        list.querySelectorAll('.commit-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        historySelectedHash = item.dataset.hash;
        loadCommitDetails(item.dataset.hash);
      });
    });

    historyLoaded = true;
  } catch {
    list.innerHTML = '<li class="empty-state-inline">Failed to load</li>';
  }
}

// Split a unified diff into per-file chunks (reused pattern from diff.js)
function historySplitDiffByFile(rawDiff) {
  if (!rawDiff || !rawDiff.trim()) return [];
  const files = [];
  const lines = rawDiff.split('\n');
  let current = null;
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      current = { name: match ? match[2] : 'unknown', lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) files.push(current);
  return files.map(f => ({ name: f.name, diff: f.lines.join('\n') }));
}

async function loadCommitDetails(hash) {
  const headerEl = document.getElementById('commit-detail-header');
  const diffEl = document.getElementById('commit-detail-diff');
  if (!headerEl || !diffEl) return;

  headerEl.innerHTML = '<div class="empty-state"><span>Loading...</span></div>';
  diffEl.innerHTML = '';

  try {
    const res = await fetch(`/api/browser/commit/${hash}`);
    const data = await res.json();
    historyCachedData = data;
    renderCommitDetails(hash, data);
  } catch {
    headerEl.innerHTML = '<div class="empty-state"><p>Failed to load commit</p></div>';
  }
}

function renderCommitDetails(hash, data) {
  const headerEl = document.getElementById('commit-detail-header');
  const diffEl = document.getElementById('commit-detail-diff');
  if (!headerEl || !diffEl) return;

  const isUnified = historyViewMode === 'line-by-line';

  headerEl.innerHTML = `
    <div class="commit-header-content">
      <div class="commit-header-hash">${hash}</div>
      <div class="commit-header-files">${data.files.length} file(s) changed</div>
      <div class="commit-header-actions">
        <div class="btn-group">
          <button class="btn btn-ghost btn-sm ${!isUnified ? 'active' : ''}" id="history-view-split" title="Side by side">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>
            Split
          </button>
          <button class="btn btn-ghost btn-sm ${isUnified ? 'active' : ''}" id="history-view-unified" title="Unified">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
            Unified
          </button>
        </div>
        <button class="btn btn-ghost btn-sm" id="commit-expand-all" title="Expand all files">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          Expand all
        </button>
        <button class="btn btn-ghost btn-sm" id="commit-collapse-all" title="Collapse all files">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          Collapse all
        </button>
      </div>
    </div>
  `;

  if (!data.diff) {
    diffEl.innerHTML = `<pre class="raw-diff">(no diff)</pre>`;
    return;
  }

  const files = historySplitDiffByFile(data.diff);

  // Stash raw diffs on a closure-accessible array indexed by data-idx
  const renderCommitFileBody = (section) => {
    const body = section.querySelector('.commit-file-body');
    if (!body || body.dataset.rendered === 'true') return;
    const idx = parseInt(section.dataset.idx, 10);
    const f = files[idx];
    if (!f) return;
    body.innerHTML = Diff2Html.html(f.diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: historyViewMode,
      colorScheme: 'dark',
    });
    body.dataset.rendered = 'true';
  };

  diffEl.innerHTML = files.map((file, i) => `
    <div class="commit-file-section" data-file="${escapeAttrHistory(file.name)}" data-idx="${i}">
      <div class="commit-file-header">
        <svg class="commit-file-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="commit-file-name">${escapeHtmlHistory(file.name)}</span>
      </div>
      <div class="commit-file-body" data-rendered="false"></div>
    </div>
  `).join('');

  // Wire collapse/expand with lazy render on first expand
  diffEl.querySelectorAll('.commit-file-header').forEach(h => {
    h.addEventListener('click', () => {
      const section = h.closest('.commit-file-section');
      section.classList.toggle('expanded');
      if (section.classList.contains('expanded')) {
        renderCommitFileBody(section);
      }
    });
  });

  document.getElementById('commit-expand-all')?.addEventListener('click', () => {
    diffEl.querySelectorAll('.commit-file-section').forEach(s => {
      s.classList.add('expanded');
      renderCommitFileBody(s);
    });
  });
  document.getElementById('commit-collapse-all')?.addEventListener('click', () => {
    diffEl.querySelectorAll('.commit-file-section').forEach(s => s.classList.remove('expanded'));
  });
  document.getElementById('history-view-split')?.addEventListener('click', () => {
    if (historyViewMode === 'side-by-side') return;
    historyViewMode = 'side-by-side';
    localStorage.setItem('devlens-history-view', historyViewMode);
    if (historyCachedData) renderCommitDetails(hash, historyCachedData);
  });
  document.getElementById('history-view-unified')?.addEventListener('click', () => {
    if (historyViewMode === 'line-by-line') return;
    historyViewMode = 'line-by-line';
    localStorage.setItem('devlens-history-view', historyViewMode);
    if (historyCachedData) renderCommitDetails(hash, historyCachedData);
  });
}

function escapeAttrHistory(str) {
  return String(str).replace(/"/g, '&quot;');
}

function escapeHtmlHistory(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatRelativeDate(iso) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

document.getElementById('history-refresh-btn')?.addEventListener('click', () => {
  loadBranchInfo();
  loadCommits();
});

// Lazy load when tab opens
document.querySelector('[data-tab="history"]')?.addEventListener('click', () => {
  if (!historyLoaded) {
    loadBranchInfo();
    loadCommits();
  }
});

if (location.pathname === '/history') {
  loadBranchInfo();
  loadCommits();
}
