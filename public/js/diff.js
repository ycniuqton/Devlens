// Diff viewer
let currentFilter = 'all';
let currentViewMode = 'side-by-side';

// Filter buttons
document.querySelectorAll('.diff-filters .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-filters .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadDiff();
  });
});

// View toggle
document.querySelectorAll('.diff-view-toggle .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-view-toggle .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentViewMode = btn.dataset.view;
    loadDiff();
  });
});

async function loadDiff() {
  try {
    const params = currentFilter !== 'all' ? `?filter=${currentFilter}` : '';
    const res = await fetch(`/api/diff${params}`);
    const data = await res.json();
    renderDiff(data.diff);
    renderFileList(data.files);
  } catch (err) {
    console.error('Failed to load diff:', err);
  }
}

function renderDiff(rawDiff) {
  const container = document.getElementById('diff-output');
  if (!rawDiff || rawDiff.trim() === '') {
    container.innerHTML = '<p class="placeholder">No changes detected</p>';
    return;
  }

  const outputFormat = currentViewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line';
  const html = Diff2Html.html(rawDiff, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: outputFormat,
  });
  container.innerHTML = html;
}

function renderFileList(files) {
  const list = document.getElementById('file-list-items');
  if (!files || files.length === 0) {
    list.innerHTML = '<li style="color: var(--text-muted)">No changed files</li>';
    return;
  }

  list.innerHTML = files.map(f => `
    <li title="${f.path}">
      <span class="status-badge ${f.status}"></span>
      ${f.path.split('/').pop()}
      ${f.staged ? '<span class="tag" style="margin-left:4px">staged</span>' : ''}
    </li>
  `).join('');
}

function handleDiffUpdate(payload) {
  renderDiff(payload.diff);
}

function handleStatusUpdate(payload) {
  renderFileList(payload.status);
}

// Initial load
loadDiff();
