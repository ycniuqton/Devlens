// Diff viewer
var currentFilter = 'all';
var currentViewMode = localStorage.getItem('devlens-diff-view') || 'side-by-side';
var fileListMode = localStorage.getItem('devlens-file-view') || 'tree';
var diffFiles = [];
var currentFiles = [];

// Restore view mode + file list mode from localStorage
(function restoreDiffSettings() {
  const flatBtn = document.getElementById('file-view-flat');
  const treeBtn = document.getElementById('file-view-tree');
  if (fileListMode === 'tree') {
    treeBtn?.classList.add('active');
    flatBtn?.classList.remove('active');
  } else {
    flatBtn?.classList.add('active');
    treeBtn?.classList.remove('active');
  }

  // Restore active button for diff view mode (split / unified)
  document.querySelectorAll('[data-view]').forEach(b => {
    if (b.dataset.view === currentViewMode) b.classList.add('active');
    else b.classList.remove('active');
  });
})();

// Filter and view toggle
document.querySelector('.header-actions')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]') || e.target.closest('[data-view]');
  if (!btn) return;

  if (btn.dataset.filter !== undefined) {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadDiff();
  }

  if (btn.dataset.view !== undefined) {
    document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentViewMode = btn.dataset.view;
    localStorage.setItem('devlens-diff-view', currentViewMode);
    renderAllFiles();
  }
});

// File list click → collapse all, expand clicked, scroll to it
document.getElementById('file-list-items').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li || li.classList.contains('empty-state-inline')) return;

  // Folder click → toggle expand/collapse
  if (li.classList.contains('tree-folder')) {
    const folderPath = li.dataset.folder;
    if (folderPath) toggleFolder(folderPath);
    return;
  }

  const fileName = li.getAttribute('title');
  if (!fileName) return;

  document.querySelectorAll('#file-list-items li').forEach(l => l.classList.remove('selected'));
  li.classList.add('selected');

  // Collapse all, expand only the clicked file (lazy-render its body)
  const sections = document.querySelectorAll('.diff-file-section');
  for (const section of sections) {
    if (section.dataset.file === fileName) {
      section.classList.add('expanded');
      renderFileBodyIfNeeded(section);
    } else {
      section.classList.remove('expanded');
    }
  }

  // Wait for reflow, then scroll with fixed header offset
  setTimeout(() => {
    const target = document.querySelector(`.diff-file-section[data-file="${fileName}"]`);
    if (target) {
      const headerOffset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, 50);
});

// Expand all / Collapse all folders (tree view only)
function getAllFolderPaths(files) {
  const folderSet = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      folderSet.add(current);
    }
  }
  return Array.from(folderSet);
}

document.getElementById('expand-all-btn')?.addEventListener('click', () => {
  collapsedFolders.clear();
  saveCollapsedFolders();
  renderFileList(currentFiles);
});

document.getElementById('collapse-all-btn')?.addEventListener('click', () => {
  const allFolders = getAllFolderPaths(currentFiles);
  collapsedFolders = new Set(allFolders);
  saveCollapsedFolders();
  renderFileList(currentFiles);
});

// Word wrap toggle
document.getElementById('toggle-wrap')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  btn.classList.toggle('active');
  document.getElementById('diff-output').classList.toggle('word-wrap');
});

// File list view mode toggles — persist to localStorage
function updateExpandButtonsVisibility() {
  const visible = fileListMode === 'tree';
  const expandBtn = document.getElementById('expand-all-btn');
  const collapseBtn = document.getElementById('collapse-all-btn');
  const divider = document.querySelector('.file-list-divider');
  if (expandBtn) expandBtn.style.display = visible ? '' : 'none';
  if (collapseBtn) collapseBtn.style.display = visible ? '' : 'none';
  if (divider) divider.style.display = visible ? '' : 'none';
}

document.getElementById('file-view-flat')?.addEventListener('click', () => {
  fileListMode = 'flat';
  localStorage.setItem('devlens-file-view', 'flat');
  document.getElementById('file-view-flat').classList.add('active');
  document.getElementById('file-view-tree').classList.remove('active');
  updateExpandButtonsVisibility();
  renderFileList(currentFiles);
});
document.getElementById('file-view-tree')?.addEventListener('click', () => {
  fileListMode = 'tree';
  localStorage.setItem('devlens-file-view', 'tree');
  document.getElementById('file-view-tree').classList.add('active');
  document.getElementById('file-view-flat').classList.remove('active');
  updateExpandButtonsVisibility();
  renderFileList(currentFiles);
});

// Initial visibility
updateExpandButtonsVisibility();

async function loadDiff() {
  try {
    const params = currentFilter !== 'all' ? `?filter=${currentFilter}` : '';
    const res = await fetch(`/api/diff${params}`);
    const data = await res.json();
    diffFiles = splitDiffByFile(data.diff || '');
    currentFiles = data.files || [];
    renderFileList(currentFiles);
    renderAllFiles();
  } catch (err) {
    console.error('Failed to load diff:', err);
  }
}

function splitDiffByFile(rawDiff) {
  if (!rawDiff || !rawDiff.trim()) return [];

  const files = [];
  const lines = rawDiff.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      current = {
        name: match ? match[2] : 'unknown',
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) files.push(current);

  return files.map(f => ({
    name: f.name,
    diff: f.lines.join('\n'),
  }));
}

function renderAllFiles() {
  const container = document.getElementById('diff-output');

  if (diffFiles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <p>No changes detected</p>
        <span>Edit files in your project to see diffs here</span>
      </div>`;
    return;
  }

  // Render only headers — diffs are computed lazily on expand
  // diffFiles[i].diff holds the raw unified diff string for this file
  container.innerHTML = diffFiles.map((file, i) => {
    const shortName = file.name.split('/').pop();
    return `
      <div class="diff-file-section ${i === 0 ? 'expanded' : ''}" data-file="${file.name}" data-idx="${i}">
        <div class="diff-file-header" onclick="toggleFileSection(this)">
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span class="diff-file-name">${file.name}</span>
          <span class="diff-file-badge">${shortName}</span>
        </div>
        <div class="diff-file-body" data-rendered="false"></div>
      </div>
    `;
  }).join('');

  // Pre-render only the first (expanded by default) file
  const first = container.querySelector('.diff-file-section.expanded');
  if (first) renderFileBodyIfNeeded(first);
}

// Render the diff HTML for a file section if not already done
function renderFileBodyIfNeeded(section) {
  const body = section.querySelector('.diff-file-body');
  if (!body || body.dataset.rendered === 'true') return;

  const idx = parseInt(section.dataset.idx, 10);
  const file = diffFiles[idx];
  if (!file) return;

  const outputFormat = currentViewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line';
  body.innerHTML = Diff2Html.html(file.diff, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: outputFormat,
    colorScheme: 'dark',
  });
  body.dataset.rendered = 'true';
}

// Chevron click — toggle just this file, lazy-render on first expand
function toggleFileSection(headerEl) {
  const section = headerEl.closest('.diff-file-section');
  section.classList.toggle('expanded');
  if (section.classList.contains('expanded')) {
    renderFileBodyIfNeeded(section);
  }
}

var STATUS_LABELS = { modified: 'M', added: 'A', deleted: 'D', untracked: 'U', renamed: 'R' };

function renderFileList(files) {
  const list = document.getElementById('file-list-items');
  const countEl = document.getElementById('file-count');

  if (!files || files.length === 0) {
    list.innerHTML = '<li class="empty-state-inline">No changed files</li>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  if (countEl) countEl.textContent = files.length;

  if (fileListMode === 'tree') {
    list.innerHTML = renderTreeView(files);
  } else {
    list.innerHTML = files.map(f => `
      <li title="${f.path}" role="button" tabindex="0" class="file-status-${f.status}">
        <span class="status-badge ${f.status}"></span>
        <span class="file-name">${f.path.split('/').pop()}</span>
        <span class="status-label-tag ${f.status}">${STATUS_LABELS[f.status] || '?'}</span>
        ${f.staged ? '<span class="tag">S</span>' : ''}
      </li>
    `).join('');
  }
}

// Track collapsed folder state across renders
var collapsedFolders = new Set(JSON.parse(localStorage.getItem('devlens-collapsed-folders') || '[]'));

function saveCollapsedFolders() {
  localStorage.setItem('devlens-collapsed-folders', JSON.stringify(Array.from(collapsedFolders)));
}

function toggleFolder(folderPath) {
  if (collapsedFolders.has(folderPath)) {
    collapsedFolders.delete(folderPath);
  } else {
    collapsedFolders.add(folderPath);
  }
  saveCollapsedFolders();
  renderFileList(currentFiles);
}

function renderTreeView(files) {
  const tree = {};
  for (const f of files) {
    const parts = f.path.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = f;
  }

  function renderNode(obj, depth, parentPath) {
    let html = '';
    const folders = Object.keys(obj).filter(k => typeof obj[k] === 'object' && !obj[k].path);
    const fileKeys = Object.keys(obj).filter(k => typeof obj[k] === 'object' && obj[k].path);

    for (const folder of folders.sort()) {
      const folderPath = parentPath ? `${parentPath}/${folder}` : folder;
      const isCollapsed = collapsedFolders.has(folderPath);
      html += `<li class="tree-folder" data-folder="${folderPath}" style="padding-left:${depth * 16}px">
        <svg class="tree-chevron ${isCollapsed ? '' : 'expanded'}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--color-text-muted)">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="folder-name">${folder}</span>
      </li>`;
      if (!isCollapsed) {
        html += renderNode(obj[folder], depth + 1, folderPath);
      }
    }

    for (const key of fileKeys.sort()) {
      const f = obj[key];
      html += `<li title="${f.path}" role="button" tabindex="0" style="padding-left:${depth * 16 + 8}px" class="file-status-${f.status}">
        <span class="status-badge ${f.status}"></span>
        <span class="file-name">${key}</span>
        <span class="status-label-tag ${f.status}">${STATUS_LABELS[f.status] || '?'}</span>
        ${f.staged ? '<span class="tag">S</span>' : ''}
      </li>`;
    }

    return html;
  }

  return renderNode(tree, 0, '');
}

function handleDiffUpdate(payload) {
  document.getElementById('diff-update-banner').style.display = 'block';
}

function applyDiffUpdate() {
  document.getElementById('diff-update-banner').style.display = 'none';
  loadDiff();
}

function handleStatusUpdate(payload) {}

// Initial load
loadDiff();
