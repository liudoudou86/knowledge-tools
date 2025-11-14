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
                          随手记相关
=================================================================== */
let notesContent = ''

/* -------------- 加载随手记 -------------- */
async function loadNotes() {
  // 临时模式：直接显示当前内容，不加载后端数据
  document.getElementById('simple-notes-editor').value = notesContent
  updateNotesStatus()
}

function saveNotes() {
  // 临时模式：只更新本地变量，不保存到后端
  notesContent = document.getElementById('simple-notes-editor').value
  updateNotesStatus()
}

function clearNotes() {
  if (confirm('确定清空随手记内容？')) {
    notesContent = ''
    document.getElementById('simple-notes-editor').value = ''
    updateNotesStatus()
  }
}

function updateNotesStatus() {
  const statusElement = document.getElementById('notes-status')
  const timestampElement = document.getElementById('notes-timestamp')

  // 检查是否在搜索状态
  if (window.currentSearchTerm) {
    const regex = new RegExp(escapeRegExp(window.currentSearchTerm), 'gi')
    const matches = notesContent.match(regex)
    const matchCount = matches ? matches.length : 0

    statusElement.textContent = `找到 ${matchCount} 个匹配项`
    statusElement.className = 'saved'
    timestampElement.textContent = `搜索词: "${window.currentSearchTerm}"`
  } else {
    statusElement.textContent = '临时模式'
    statusElement.className = 'unsaved'

    if (notesContent.trim()) {
      timestampElement.textContent = '内容已输入'
    } else {
      timestampElement.textContent = '暂无内容'
    }
  }
}

/* -------------- 简单文本编辑器功能 -------------- */
function setupSimpleNotesEditor() {
  const editor = document.getElementById('simple-notes-editor')

  // 设置为可编辑模式
  editor.readOnly = false
  editor.style.backgroundColor = '#ffffff'
  editor.style.cursor = 'text'

  // 输入事件：自动保存到本地变量
  editor.addEventListener('input', throttle(() => {
    saveNotes()
  }, 500))

  // 清空按钮
  document.getElementById('clear-notes-btn').addEventListener('click', clearNotes)

  // Json格式化按钮
  document.getElementById('json-format-btn').addEventListener('click', formatJson)

  // Xml格式化按钮
  document.getElementById('xml-format-btn').addEventListener('click', formatXml)

  // 搜索功能
  document.getElementById('notes-search-btn').addEventListener('click', searchNotes)
  document.getElementById('clear-search-btn').addEventListener('click', clearSearch)
  document.getElementById('notes-search-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') searchNotes()
  })
}

/* -------------- 搜索功能 -------------- */
function searchNotes() {
  const searchInput = document.getElementById('notes-search-input')
  const searchTerm = searchInput.value.trim()

  if (!searchTerm) {
    alert('请输入搜索内容')
    return
  }

  const editor = document.getElementById('simple-notes-editor')
  const content = editor.value

  // 计算匹配数量
  const regex = new RegExp(escapeRegExp(searchTerm), 'gi')
  const matches = content.match(regex)
  const matchCount = matches ? matches.length : 0

  if (matchCount === 0) {
    alert('未找到匹配内容')
    return
  }

  // 在notes-status区域显示搜索结果
  const statusElement = document.getElementById('notes-status')
  const timestampElement = document.getElementById('notes-timestamp')

  statusElement.textContent = `找到 ${matchCount} 个匹配项`
  statusElement.className = 'saved'
  timestampElement.textContent = `搜索词: "${searchTerm}"`

  // 滚动到第一个匹配项
  scrollToFirstMatch(editor, searchTerm)

  // 保存搜索状态
  window.currentSearchTerm = searchTerm
}

function highlightText(text, searchTerm) {
  if (!searchTerm) return text

  // 创建正则表达式，忽略大小写
  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi')

  // 计算匹配数量
  const matches = text.match(regex)
  const matchCount = matches ? matches.length : 0

  // 显示匹配信息
  alert(`找到 ${matchCount} 个匹配项`)

  // 由于textarea不能显示HTML高亮，我们返回原始文本
  // 用户可以通过滚动查看匹配项
  return text
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function scrollToFirstMatch(editor, searchTerm) {
  const content = editor.value
  const index = content.toLowerCase().indexOf(searchTerm.toLowerCase())

  if (index !== -1) {
    // 计算行数和位置
    const lines = content.substring(0, index).split('\n')
    const lineNumber = lines.length - 1
    const lineHeight = 24 // 假设每行高度为24px
    const scrollTop = lineNumber * lineHeight

    // 滚动到匹配位置
    editor.scrollTop = Math.max(0, scrollTop - 100) // 稍微提前一点
  }
}

function clearSearch() {
  const editor = document.getElementById('simple-notes-editor')
  const searchInput = document.getElementById('notes-search-input')

  // 清空搜索框
  searchInput.value = ''

  // 清除搜索状态
  window.currentSearchTerm = null

  // 恢复状态显示
  updateNotesStatus()

  // 保存当前状态
  saveNotes()
}

/* -------------- 格式化功能 -------------- */
function formatJson() {
  const editor = document.getElementById('simple-notes-editor')
  const content = editor.value.trim()

  if (!content) {
    alert('请输入要格式化的内容')
    return
  }

  try {
    // 尝试解析JSON
    const parsed = JSON.parse(content)
    // 格式化JSON，使用2个空格缩进
    const formatted = JSON.stringify(parsed, null, 2)
    editor.value = formatted
    saveNotes()
  } catch (error) {
    alert('JSON格式错误：' + error.message)
  }
}

function formatXml() {
  const editor = document.getElementById('simple-notes-editor')
  const content = editor.value.trim()

  if (!content) {
    alert('请输入要格式化的内容')
    return
  }

  try {
    // 检查内容长度，避免处理过大的XML
    if (content.length > 100000) {
      alert('XML内容过长，建议分批处理')
      return
    }

    // 简单的XML格式化函数
    const formatted = formatXmlString(content)
    editor.value = formatted
    saveNotes()
  } catch (error) {
    console.error('XML格式化错误:', error)
    alert('XML格式错误：' + error.message)
  }
}

function formatXmlString(xml) {
  try {
    // 更安全的XML格式化方法
    let formatted = ''
    let indent = ''
    const tab = '  '

    // 使用更安全的方式分割标签
    const regex = /(<[^>]+>)/g
    const parts = xml.split(regex)

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim()
      if (!part) continue

      // 处理XML声明
      if (part.startsWith('<?xml')) {
        formatted += part + '\n'
        continue
      }

      // 处理注释
      if (part.startsWith('<!--')) {
        formatted += indent + part + '\n'
        continue
      }

      // 处理开始标签
      if (part.startsWith('<') && !part.startsWith('</')) {
        // 检查是否是自闭合标签
        if (part.endsWith('/>') || part.includes('/>')) {
          formatted += indent + part + '\n'
        } else {
          formatted += indent + part + '\n'
          indent += tab
        }
      }
      // 处理结束标签
      else if (part.startsWith('</')) {
        indent = indent.substring(tab.length)
        formatted += indent + part + '\n'
      }
      // 处理文本内容（非标签内容）
      else if (!part.startsWith('<') && !part.endsWith('>')) {
        formatted += indent + part + '\n'
      }
    }

    return formatted.trim()
  } catch (error) {
    // 如果复杂格式化失败，使用简单的美化方法
    console.warn('XML格式化失败，使用简单方法:', error)
    return simpleXmlFormat(xml)
  }
}

function simpleXmlFormat(xml) {
  // 简单的XML美化方法
  return xml
    .replace(/></g, '>\n<')
    .replace(/\s*<\?xml[^>]*\?>\s*/g, '<?xml version="1.0" encoding="UTF-8"?>\n')
    .replace(/(<[^/][^>]*>)(?!\s*<)/g, '$1\n')
    .replace(/(<\/[^>]+>)/g, '$1\n')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

/* ===================================================================
                      标签页 & 模态框 & 初始化
=================================================================== */
function setupTabEvents() {
  const tabButtons = document.querySelectorAll('.tab-button-vertical')
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
      if (tabId === 'notes') {
        loadNotes()
        setupSimpleNotesEditor()
      }
    })
  })
}

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => (m.style.display = 'none'))
}

/* ================= 加载状态管理 ================= */
let isFirstLoad = true

function showLoading() {
  document.getElementById('loading-overlay').style.display = 'flex'
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none'
}

function checkServiceReady() {
  return new Promise((resolve) => {
    let retryCount = 0
    const maxRetries = 30 // 最多重试30次，约15秒
    
    const checkInterval = setInterval(() => {
      retryCount++
      
      // 使用更轻量的HEAD请求来检查服务状态
      fetch('/api/health', { method: 'HEAD', timeout: 1000 })
        .then(response => {
          if (response.ok) {
            clearInterval(checkInterval)
            console.log(`服务就绪，重试次数: ${retryCount}`)
            resolve(true)
          }
        })
        .catch(() => {
          // 服务还未就绪，继续等待
          if (retryCount >= maxRetries) {
            clearInterval(checkInterval)
            console.error('服务启动超时')
            resolve(false)
          }
        })
    }, 500)
  })
}

/* ================= 事件绑定 & 初始化 ================= */
document.addEventListener('DOMContentLoaded', async () => {
  // 显示加载动画
  showLoading()
  
  // 等待服务就绪
  try {
    await checkServiceReady()
    
    // 服务就绪后，加载数据
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
    // 只关闭非知识详情模态框
    if (e.target.classList.contains('modal') && 
        !e.target.id.includes('knowledge-detail')) {
      closeModals()
    }
  })

  /* ---------- 首次数据加载 ---------- */
  // 只加载任务数据（通常较小），知识库数据按需加载
  loadTasks()

  // 延迟加载知识库相关数据
  setTimeout(() => {
    if (document.getElementById('knowledge-tab').classList.contains('active')) {
      loadKnowledge()
      loadKnowledgeCategories()
    }
  }, 500)
  
  // 隐藏加载动画
  hideLoading()
  
  } catch (error) {
    console.error('服务启动失败:', error)
    // 显示错误信息
    document.getElementById('loading-overlay').innerHTML = `
      <div class="loading-container">
        <h2>服务启动失败</h2>
        <p>请检查服务是否正常运行</p>
        <button onclick="location.reload()" class="btn-primary">重新加载</button>
      </div>
    `
  }
})
