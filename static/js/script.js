/* ================= 全局变量 & 缓存 ================= */
const cache = {
  taskList: document.getElementById('task-list'),
  knowledgeList: document.getElementById('knowledge-list'),
  modals: document.querySelectorAll('.modal')
}

let tasks = []
let currentFilter = 'active' // active | completed

/* ================= 工具函数 ================= */
const throttle = (func, limit) => {
  let inThrottle
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

const formatDate = str =>
  new Date(str).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

// 重置搜索和筛选
function resetSearch() {
  // 清空搜索输入框
  document.getElementById('knowledge-search').value = ''
  // 重置类别筛选为"所有类别"
  document.getElementById('knowledge-category-filter').value = ''
  // 重新加载所有知识条目
  loadKnowledge()
}

/* ================= API 请求封装 ================= */
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/* ===================================================================
                            任务相关
=================================================================== */
/* ---------- 拉取 / 渲染 ---------- */
async function loadTasks() {
  try {
    tasks = await apiRequest('/api/tasks')
    renderTasks()
  } catch (e) {
    console.error('加载任务失败:', e)
  }
}

function renderTasks() {
  const arr = filterTasks()
  cache.taskList.innerHTML = arr
    .map(
      t => `
    <div class="task-item ${t.completed ? 'completed' : ''}" data-id="${t.id}">
      <input type="checkbox" class="task-checkbox" ${
        t.completed ? 'checked' : ''
      }>
      <span class="task-content">${t.content}</span>
      <div class="task-meta">
        <span class="priority-badge priority-${t.priority || 'normal'}">
          ${getPriorityLabel(t.priority)}
        </span>
      </div>
      <div class="task-actions">
        <button class="task-delete-btn"><i class="fas fa-trash"></i></button>
      </div>
    </div>`
    )
    .join('')
}

function getPriorityLabel(priority) {
  switch (priority) {
    case 'high':
      return '紧急'
    case 'normal':
      return '计划'
    default:
      return '延后'
  }
}

function filterTasks() {
  switch (currentFilter) {
    case 'completed':
      return tasks.filter(t => t.completed)
    case 'active':
    default:
      return tasks.filter(t => !t.completed)
  }
}

/* ---------- 增 / 删 / 改 ---------- */
async function addTask() {
  const input = document.getElementById('task-input')
  const prioritySelect = document.getElementById('task-priority')
  const content = input.value.trim()
  if (!content) return

  try {
    await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        content,
        priority: prioritySelect.value
      })
    })
    input.value = ''
    // 重新从服务器加载任务列表以确保数据最新
    await loadTasks()
  } catch (e) {
    console.error('添加任务失败:', e)
  }
}

async function deleteTask(id) {
  try {
    await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' })
    tasks = tasks.filter(t => t.id !== id)
    renderTasks()
  } catch (e) {
    console.error('删除任务失败:', e)
  }
}

async function toggleTask(id) {
  const task = tasks.find(t => t.id === id)
  if (!task) return

  const oldStatus = task.completed
  task.completed = !oldStatus // 1. 立即改本地
  renderTasks() // 2. 立即重渲染

  try {
    // 3. 同步后端
    await apiRequest(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: task.completed })
    })
  } catch (e) {
    task.completed = oldStatus // 失败回滚
    renderTasks()
    console.error('更新任务失败:', e)
  }
}

/* ===================================================================
                          知识库相关
=================================================================== */
/* -------------- 加载 / 渲染 -------------- */
async function loadKnowledge(category = '') {
  const url = category
    ? `/api/knowledge?category=${encodeURIComponent(category)}`
    : '/api/knowledge'
  const knowledge = await apiRequest(url)
  cache.knowledgeList.innerHTML = knowledge.length
    ? knowledge.map(k => createKnowledgeItem(k)).join('')
    : `<div class="empty-state"><i class="fas fa-book-open"></i><p>暂无知识条目</p></div>`
}

async function loadKnowledgeCategories() {
  const knowledge = await apiRequest('/api/knowledge')
  const cats = [...new Set(knowledge.map(k => k.category).filter(Boolean))]
  const select = document.getElementById('knowledge-category-filter')
  while (select.options.length > 1) select.remove(1)
  cats.forEach(c => {
    const opt = document.createElement('option')
    opt.value = c
    opt.textContent = c
    select.appendChild(opt)
  })
}

function createKnowledgeItem(item) {
  const content =
    item.content.length > 150
      ? item.content.substring(0, 150) + '...'
      : item.content
  return `
    <div class="knowledge-item" data-id="${item.id}">
      <h3>${item.title}</h3>
      <div class="knowledge-meta">
        <span>${item.category || '未分类'}</span> • <span>${formatDate(
    item.last_modified
  )}</span>
      </div>
      <div class="knowledge-content">${content}</div>
      <div class="item-actions">
        <button class="action-btn view-knowledge" data-id="${
          item.id
        }"><i class="fas fa-eye"></i> 查看</button>
        <button class="action-btn edit-knowledge" data-id="${
          item.id
        }"><i class="fas fa-edit"></i> 编辑</button>
        <button class="action-btn delete-knowledge" data-id="${
          item.id
        }"><i class="fas fa-trash"></i> 删除</button>
      </div>
    </div>`
}

/* -------------- 增 / 删 / 改 / 查 -------------- */
async function saveKnowledge() {
  const id = document.getElementById('knowledge-id').value
  const data = {
    title: document.getElementById('knowledge-title').value.trim(),
    content: document.getElementById('knowledge-content').value.trim(),
    category: document.getElementById('knowledge-category').value.trim()
  }
  if (!data.title || !data.content) return alert('标题和内容不能为空')

  const url = id ? `/api/knowledge/${id}` : '/api/knowledge'
  const method = id ? 'PUT' : 'POST'
  try {
    await apiRequest(url, { method, body: JSON.stringify(data) })
    closeModals()
    loadKnowledge()
    loadKnowledgeCategories()
  } catch (e) {
    console.error('保存知识失败:', e)
  }
}

async function deleteKnowledge(id) {
  if (!confirm('确定删除这条知识？')) return
  try {
    await apiRequest(`/api/knowledge/${id}`, { method: 'DELETE' })
    loadKnowledge()
    loadKnowledgeCategories()
  } catch (e) {
    console.error('删除知识失败:', e)
  }
}

function viewKnowledge(id) {
  apiRequest('/api/knowledge').then(list => {
    const item = list.find(k => k.id === id)
    if (!item) return
    document.getElementById('knowledge-detail-title').textContent = item.title
    document.getElementById('knowledge-detail-category').textContent =
      item.category || '未分类'
    document.getElementById('knowledge-detail-date').textContent = formatDate(
      item.last_modified
    )
    document.getElementById('knowledge-detail-content').textContent =
      item.content
    document.getElementById('knowledge-detail-modal').style.display = 'block'
  })
}

function editKnowledge(id) {
  apiRequest('/api/knowledge').then(list => {
    const item = list.find(k => k.id === id)
    if (!item) return
    document.getElementById('knowledge-modal-title').textContent = '编辑知识'
    document.getElementById('knowledge-id').value = item.id
    document.getElementById('knowledge-title').value = item.title
    document.getElementById('knowledge-content').value = item.content
    document.getElementById('knowledge-category').value = item.category || ''
    document.getElementById('knowledge-modal').style.display = 'block'
  })
}

function searchKnowledge(keyword) {
  apiRequest(
    `/api/knowledge/search?keyword=${encodeURIComponent(keyword)}`
  ).then(list => {
    cache.knowledgeList.innerHTML = list.length
      ? list.map(k => createKnowledgeItem(k)).join('')
      : `<div class="empty-state"><i class="fas fa-search"></i><p>没有找到相关结果</p></div>`
  })
}

/* ===================================================================
                      标签页 & 模态框 & 初始化
=================================================================== */
function setupTabEvents() {
  const tabButtons = document.querySelectorAll('.tab-button')
  const tabContents = document.querySelectorAll('.tab-content')

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab
      tabButtons.forEach(b => b.classList.remove('active'))
      tabContents.forEach(c => c.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById(`${tabId}-tab`).classList.add('active')

      if (tabId === 'tasks') loadTasks()
      if (tabId === 'knowledge') {
        loadKnowledge()
        loadKnowledgeCategories()
      }
    })
  })
}

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => (m.style.display = 'none'))
}

/* ================= 事件绑定 & 初始化 ================= */
document.addEventListener('DOMContentLoaded', () => {
  setupTabEvents()

  /* ---------- 任务 ---------- */
  document.getElementById('add-task-btn').addEventListener('click', addTask)
  document.getElementById('task-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') addTask()
  })
  // 任务过滤器
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      document
        .querySelectorAll('.filter-btn')
        .forEach(b => b.classList.remove('active'))
      e.target.classList.add('active')
      currentFilter = e.target.dataset.filter
      renderTasks()
    })
  })
  // 任务列表事件委托（勾选、删除）
  cache.taskList.addEventListener('click', e => {
    const item = e.target.closest('.task-item')
    if (!item) return
    const id = +item.dataset.id
    if (e.target.classList.contains('task-checkbox')) toggleTask(id)
    if (e.target.closest('.task-delete-btn')) {
      if (confirm('确定删除该任务？')) deleteTask(id)
    }
  })

  /* ---------- 知识库 ---------- */
  document.getElementById('add-knowledge-btn').addEventListener('click', () => {
    document.getElementById('knowledge-modal-title').textContent = '添加知识'
    document.getElementById('knowledge-form').reset()
    document.getElementById('knowledge-id').value = ''
    document.getElementById('knowledge-modal').style.display = 'block'
  })
  document.getElementById('knowledge-form').addEventListener('submit', e => {
    e.preventDefault()
    saveKnowledge()
  })
  document.getElementById('knowledge-search').addEventListener(
    'input',
    throttle(e => {
      const kw = e.target.value.trim()
      kw ? searchKnowledge(kw) : loadKnowledge()
    }, 300)
  )
  document
    .getElementById('knowledge-category-filter')
    .addEventListener('change', e => {
      loadKnowledge(e.target.value)
    })
  // 重置搜索和筛选
  document.getElementById('reset-search-btn').addEventListener('click', () => {
    resetSearch()
  })
  // 知识库卡片按钮事件委托（查看/编辑/删除）
  cache.knowledgeList.addEventListener('click', e => {
    const card = e.target.closest('.knowledge-item')
    if (!card) return
    const id = +card.dataset.id
    if (e.target.closest('.view-knowledge')) viewKnowledge(id)
    if (e.target.closest('.edit-knowledge')) editKnowledge(id)
    if (e.target.closest('.delete-knowledge')) {
      if (confirm('确定删除这条知识？')) deleteKnowledge(id)
    }
  })

  /* ---------- 模态框关闭 ---------- */
  closeModals()
  document.querySelectorAll('.close, .btn-secondary').forEach(btn => {
    btn.addEventListener('click', closeModals)
  })
  window.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) closeModals()
  })

  /* ---------- 首次数据加载 ---------- */
  loadKnowledge()
  loadKnowledgeCategories()
  loadTasks()
})
