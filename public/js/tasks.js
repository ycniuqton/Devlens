// Task board + Claude Todos/Sessions
const modal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
let allTasks = [];

document.getElementById('add-task-btn').addEventListener('click', () => openModal());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});
document.getElementById('modal-cancel').addEventListener('click', () => closeModal());
document.getElementById('modal-close').addEventListener('click', () => closeModal());
document.querySelector('.modal-backdrop').addEventListener('click', () => closeModal());

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const body = {
    title: document.getElementById('task-title-input').value,
    description: document.getElementById('task-desc-input').value,
    priority: document.getElementById('task-priority-input').value,
    status: document.getElementById('task-status-input').value,
    tags: document.getElementById('task-tags-input').value
      .split(',').map(t => t.trim()).filter(Boolean),
  };

  try {
    if (id) {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    closeModal();
    loadTasks();
  } catch (err) {
    showToast('Failed to save task', 'error');
  }
});

function openModal(task = null) {
  document.getElementById('modal-title').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('task-id').value = task ? task.id : '';
  document.getElementById('task-title-input').value = task ? task.title : '';
  document.getElementById('task-desc-input').value = task ? task.description : '';
  document.getElementById('task-priority-input').value = task ? task.priority : 'medium';
  document.getElementById('task-status-input').value = task ? task.status : 'pending';
  document.getElementById('task-tags-input').value = task ? task.tags.join(', ') : '';

  // Show context if available
  const contextGroup = document.getElementById('task-context-group');
  const contextDisplay = document.getElementById('task-context-display');
  if (task?.context) {
    contextDisplay.textContent = task.context;
    contextGroup.style.display = '';
  } else {
    contextGroup.style.display = 'none';
  }

  // Show Claude metadata if available
  const metaGroup = document.getElementById('task-claude-meta-group');
  const metaDisplay = document.getElementById('task-claude-meta');
  const metaParts = [];
  if (task?.claudeTaskId) metaParts.push(`Task ID: #${task.claudeTaskId}`);
  if (task?.claudeSessionId) metaParts.push(`Session: ${task.claudeSessionId.substring(0, 8)}`);
  if (task?.activeForm) metaParts.push(`Active: ${task.activeForm}`);
  if (task?.owner) metaParts.push(`Owner: ${task.owner}`);
  if (task?.completedAt) metaParts.push(`Completed: ${task.completedAt}`);
  if (task?.metadata) metaParts.push(`Metadata: ${JSON.stringify(task.metadata)}`);

  if (metaParts.length > 0) {
    metaDisplay.textContent = metaParts.join('\n');
    metaGroup.style.display = '';
  } else {
    metaGroup.style.display = 'none';
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
  taskForm.reset();
}

// ---- Kanban Board ----
async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    allTasks = await res.json();
    renderBoard();
  } catch (err) {
    showToast('Failed to load tasks', 'error');
  }
}

function renderBoard() {
  ['pending', 'in-progress', 'completed', 'archived'].forEach(status => {
    const column = document.querySelector(`.column-cards[data-status="${status}"]`);
    const tasks = allTasks.filter(t => t.status === status);
    const count = column.closest('.kanban-column').querySelector('.count');
    count.textContent = tasks.length;

    column.innerHTML = tasks.map(task => `
      <div class="task-card priority-${task.priority}" draggable="true" data-id="${task.id}">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px">${escapeHtml(task.description).substring(0, 100)}</div>` : ''}
        <div class="task-meta">
          ${task.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        ${task.dependencies.length ? `<div class="task-deps">Blocked by: ${task.dependencies.length} task(s)</div>` : ''}
        <div class="card-actions">
          <button onclick="editTask('${task.id}')">Edit</button>
          <button class="delete" onclick="deleteTask('${task.id}')">Delete</button>
        </div>
      </div>
    `).join('');

    // Click to edit + drag events
    column.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-actions')) return; // don't trigger on Edit/Delete buttons
        editTask(card.dataset.id);
      });
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
  });

  // Drop targets
  document.querySelectorAll('.column-cards').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        loadTasks();
      } catch (err) {
        showToast('Failed to update task', 'error');
      }
    });
  });
}

async function editTask(id) {
  const task = allTasks.find(t => t.id === id);
  if (task) openModal(task);
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    loadTasks();
  } catch (err) {
    showToast('Failed to delete task', 'error');
  }
}

// ---- WebSocket handlers ----
function handleTaskUpdate() {
  loadTasks();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initial load
loadTasks();
