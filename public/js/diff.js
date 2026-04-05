// Diff viewer
let currentFilter = 'all';
let currentViewMode = 'line-by-line';
let fileListMode = 'flat'; // 'flat' or 'tree'
let diffFiles = []; // parsed per-file diffs
let currentFiles = []; // file status list

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
    renderAllFiles();
  }
});

// File list click → expand that file, collapse others
document.getElementById('file-list-items').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li || li.classList.contains('empty-state-inline')) return;

  const fileName = li.getAttribute('title');
  if (!fileName) return;

  document.querySelectorAll('#file-list-items li').forEach(l => l.classList.remove('selected'));
  li.classList.add('selected');

  // Find and expand the matching file section
  const sections = document.querySelectorAll('.diff-file-section');
  sections.forEach(section => {
    const name = section.dataset.file;
    if (name === fileName) {
      section.classList.add('expanded');
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      section.classList.remove('expanded');
    }
  });
});

// Word wrap toggle
document.getElementById('toggle-wrap')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  btn.classList.toggle('active');
  document.getElementById('diff-output').classList.toggle('word-wrap');
});

// File list view mode toggles
document.getElementById('file-view-flat')?.addEventListener('click', () => {
  fileListMode = 'flat';
  document.getElementById('file-view-flat').classList.add('active');
  document.getElementById('file-view-tree').classList.remove('active');
  renderFileList(currentFiles);
});
document.getElementById('file-view-tree')?.addEventListener('click', () => {
  fileListMode = 'tree';
  document.getElementById('file-view-tree').classList.add('active');
  document.getElementById('file-view-flat').classList.remove('active');
  renderFileList(currentFiles);
});

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

// Split a unified diff string into per-file chunks
function splitDiffByFile(rawDiff) {
  if (!rawDiff || !rawDiff.trim()) return [];

  const files = [];
  const lines = rawDiff.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      // Extract filename from "diff --git a/path b/path"
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

  const outputFormat = currentViewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line';

  // First file expanded by default
  container.innerHTML = diffFiles.map((file, i) => {
    const diffHtml = Diff2Html.html(file.diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: outputFormat,
      colorScheme: 'dark',
    });

    const shortName = file.name.split('/').pop();

    return `
      <div class="diff-file-section ${i === 0 ? 'expanded' : ''}" data-file="${file.name}">
        <div class="diff-file-header" onclick="toggleFileSection(this)">
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span class="diff-file-name">${file.name}</span>
          <span class="diff-file-badge">${shortName}</span>
        </div>
        <div class="diff-file-body">${diffHtml}</div>
      </div>
    `;
  }).join('');
}

function toggleFileSection(headerEl) {
  const section = headerEl.closest('.diff-file-section');
  section.classList.toggle('expanded');
}

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
    list.innerHTML = files.map((f, i) => `
      <li title="${f.path}" role="button" tabindex="0" class="${i === 0 ? 'selected' : ''}">
        <span class="status-badge ${f.status}"></span>
        <span class="file-name">${f.path.split('/').pop()}</span>
        ${f.staged ? '<span class="tag">staged</span>' : ''}
      </li>
    `).join('');
  }
}

function renderTreeView(files) {
  // Build folder tree
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

  function renderNode(obj, depth) {
    let html = '';
    // Folders first, then files
    const folders = Object.keys(obj).filter(k => typeof obj[k] === 'object' && !obj[k].path);
    const fileKeys = Object.keys(obj).filter(k => typeof obj[k] === 'object' && obj[k].path);

    for (const folder of folders.sort()) {
      html += `<li class="tree-folder" style="padding-left:${depth * 16}px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--color-text-muted)">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="folder-name">${folder}</span>
      </li>`;
      html += renderNode(obj[folder], depth + 1);
    }

    for (const key of fileKeys.sort()) {
      const f = obj[key];
      html += `<li title="${f.path}" role="button" tabindex="0" style="padding-left:${depth * 16 + 8}px">
        <span class="status-badge ${f.status}"></span>
        <span class="file-name">${key}</span>
        ${f.staged ? '<span class="tag">staged</span>' : ''}
      </li>`;
    }

    return html;
  }

  return renderNode(tree, 0);
}

function handleDiffUpdate(payload) {
  // Re-fetch full diff on file change
  loadDiff();
}

function handleStatusUpdate(payload) {
  // Status updates handled by loadDiff
}

// Initial load
loadDiff();
