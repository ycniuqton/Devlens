// Files tab — VSCode-style file explorer

var explorerExpanded = new Set(JSON.parse(localStorage.getItem('devlens-explorer-expanded') || '[]'));
var explorerActiveFile = null;
var explorerCache = {}; // path → entries[]

function saveExplorerState() {
  localStorage.setItem('devlens-explorer-expanded', JSON.stringify(Array.from(explorerExpanded)));
}

async function fetchDir(path) {
  if (explorerCache[path]) return explorerCache[path];
  try {
    const res = await fetch(`/api/browser/files?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    explorerCache[path] = data.entries || [];
    return explorerCache[path];
  } catch {
    return [];
  }
}

function fileIconSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function chevronSvg(expanded) {
  return `<svg class="explorer-chevron ${expanded ? 'expanded' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
}

function folderIconSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
}

async function renderTree() {
  const tree = document.getElementById('explorer-tree');
  if (!tree) return;
  const html = await renderNode('', 0);
  tree.innerHTML = html || '<div class="empty-state-inline">Empty</div>';
  attachTreeHandlers();
}

async function renderNode(path, depth) {
  const entries = await fetchDir(path);
  if (!entries.length) return '';

  let html = '';
  for (const entry of entries) {
    const indent = depth * 12;
    if (entry.type === 'dir') {
      const expanded = explorerExpanded.has(entry.path);
      html += `<div class="explorer-row folder-row" data-path="${escapeAttr(entry.path)}" data-type="dir" style="padding-left:${indent + 8}px">
        ${chevronSvg(expanded)}
        ${folderIconSvg()}
        <span class="explorer-name">${escapeHtmlBrowser(entry.name)}</span>
      </div>`;
      if (expanded) {
        html += await renderNode(entry.path, depth + 1);
      }
    } else {
      const isActive = explorerActiveFile === entry.path;
      html += `<div class="explorer-row file-row ${isActive ? 'active' : ''}" data-path="${escapeAttr(entry.path)}" data-type="file" style="padding-left:${indent + 24}px">
        ${fileIconSvg()}
        <span class="explorer-name">${escapeHtmlBrowser(entry.name)}</span>
      </div>`;
    }
  }
  return html;
}

function attachTreeHandlers() {
  const tree = document.getElementById('explorer-tree');
  if (!tree) return;
  tree.querySelectorAll('.explorer-row').forEach(row => {
    row.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = row.dataset.path;
      const type = row.dataset.type;
      if (type === 'dir') {
        if (explorerExpanded.has(path)) explorerExpanded.delete(path);
        else explorerExpanded.add(path);
        saveExplorerState();
        renderTree();
      } else {
        explorerActiveFile = path;
        loadFileContent(path);
        // Update active highlight without full re-render
        tree.querySelectorAll('.file-row.active').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
      }
    });
  });
}

async function loadFileContent(path) {
  const viewer = document.getElementById('explorer-viewer');
  const breadcrumb = document.getElementById('file-breadcrumb');
  if (!viewer) return;

  viewer.innerHTML = '<div class="empty-state"><span>Loading...</span></div>';
  breadcrumb.textContent = path;

  try {
    const res = await fetch(`/api/browser/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      viewer.innerHTML = '<div class="empty-state"><p>Failed to load</p></div>';
      return;
    }
    const data = await res.json();
    const lines = data.content.split('\n');

    const linesHtml = lines.map((line, i) => `
      <div class="code-line">
        <span class="code-line-num">${i + 1}</span>
        <span class="code-line-text">${escapeHtmlBrowser(line) || ' '}</span>
      </div>
    `).join('');

    viewer.innerHTML = `
      <div class="code-viewer">
        <div class="code-viewer-header">
          <span class="code-file-path">${escapeHtmlBrowser(path)}</span>
          <span class="code-file-meta">${formatSize(data.size)}${data.truncated ? ' · truncated' : ''}</span>
        </div>
        <div class="code-viewer-body">${linesHtml}</div>
      </div>
    `;
  } catch {
    viewer.innerHTML = '<div class="empty-state"><p>Failed to load file</p></div>';
  }
}

function escapeHtmlBrowser(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

document.getElementById('browser-refresh-btn')?.addEventListener('click', () => {
  explorerCache = {};
  renderTree();
});

// Lazy load when tab opens
window.addEventListener('tab-activated', (e) => {
  if (e.detail.tab === 'browser' && !Object.keys(explorerCache).length) renderTree();
});

if (location.pathname === '/browser') {
  renderTree();
}
