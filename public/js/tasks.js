// Task board
const modal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
let allTasks = [];

document.getElementById('add-task-btn').addEventListener('click', () => openModal());
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
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
  taskForm.reset();
}

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
  ['pending', 'in-progress', 'completed'].forEach(status => {
    const column = document.querySelector(`.column-cards[data-status="${status}"]`);
    const tasks = allTasks.filter(t => t.status === status);
    const count = column.closest('.kanban-column').querySelector('.count');
    count.textContent = tasks.length;

    column.innerHTML = tasks.map(task => `
      <div class="task-card priority-${task.priority}" draggable="true" data-id="${task.id}">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">${escapeHtml(task.description).substring(0, 100)}</div>` : ''}
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

    // Drag events on cards
    column.querySelectorAll('.task-card').forEach(card => {
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
