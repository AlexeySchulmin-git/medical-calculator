// SuperAdmin Panel JavaScript
let currentClients = [];
let currentAdmins = [];
let currentSignupRequests = [];
let signupOffset = 0;
const signupLimit = 20;
let editingClientId = null;

// Базовый URL для API запросов
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3003' : 'https://medical-calculator.onrender.com';

// Авторизация
async function login() {
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Login successful, calling showApp()');
      localStorage.setItem('superadmin_token', data.token);
      localStorage.setItem('superadmin_email', email);
      showApp();
    } else {
      document.getElementById('loginErr').style.display = 'block';
    }
  } catch (error) {
    console.error('Login error:', error);
    document.getElementById('loginErr').style.display = 'block';
  }
}

function mergeClientsAndLeads(clients, signupRequests) {
  const sourceByClientId = new Map();
  signupRequests.forEach(sr => {
    if (sr.client_id) sourceByClientId.set(sr.client_id, 'website');
  });

  const mappedClients = clients.map(c => ({
    ...c,
    source: sourceByClientId.has(c.id) ? 'website' : 'manual',
  }));

  const pendingLeads = signupRequests
    .filter(sr => !sr.client_id)
    .map(sr => ({
      id: `lead-${sr.id}`,
      company_name: sr.company_name || '(Лид с сайта)',
      api_key: '-',
      contact_email: sr.contact_email || '-',
      source: 'website-lead',
      license_type: sr.status || 'pending',
      trial_until: null,
      paid_until: null,
      allowed_domains: sr.domain ? [sr.domain] : [],
      total_orders: 0,
      total_revenue: 0,
      created_at: sr.created_at,
      _isLead: true,
      _signup_status: sr.status,
      _plan_code: sr.plan_code,
      _payment_provider: sr.payment_provider,
      _payment_id: sr.payment_id,
    }));

  return [...mappedClients, ...pendingLeads];
}

// Показать приложение
function showApp() {
  console.log('showApp() called');
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  console.log('app display set to flex');
  document.getElementById('akDisplay').textContent = localStorage.getItem('superadmin_email');
  
  // Показать страницу клиентов по умолчанию
  document.getElementById('clients-page').style.display = 'block';
  document.getElementById('nav-clients').classList.add('active');
  
  loadClients();
  loadStats();
  loadAdmins();
  loadSignupRequests();
}

// Выход
function logout() {
  localStorage.removeItem('superadmin_token');
  localStorage.removeItem('superadmin_email');
  location.reload();
}

// Переключение страниц
function showPage(page) {
  // Скрыть все страницы
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  
  // Убрать active со всех nav-item
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  
  // Показать выбранную страницу
  document.getElementById(`${page}-page`).style.display = 'block';
  document.getElementById(`nav-${page}`).classList.add('active');
  
  // Загрузить данные для страницы
  if (page === 'clients') loadClients();
  if (page === 'stats') loadStats();
  if (page === 'onboarding') loadSignupRequests();
  if (page === 'admins') loadAdmins();
}

function getSignupStatusClass(status) {
  if (status === 'provisioned') return 'badge-paid';
  if (status === 'failed') return 'badge-blocked';
  return 'badge-trial';
}

function onSignupFilterChange() {
  signupOffset = 0;
  loadSignupRequests();
}

function prevSignupPage() {
  if (signupOffset <= 0) return;
  signupOffset = Math.max(0, signupOffset - signupLimit);
  loadSignupRequests();
}

function nextSignupPage() {
  if (currentSignupRequests.length < signupLimit) return;
  signupOffset += signupLimit;
  loadSignupRequests();
}

function updateSignupPageInfo(total) {
  const info = document.getElementById('signupPageInfo');
  if (!info) return;
  const page = Math.floor(signupOffset / signupLimit) + 1;
  const from = total === 0 ? 0 : signupOffset + 1;
  const to = Math.min(signupOffset + signupLimit, total);
  info.textContent = `Страница ${page} • ${from}-${to} из ${total}`;
}

async function loadSignupRequests() {
  try {
    const statusEl = document.getElementById('signupStatusFilter');
    const status = statusEl ? statusEl.value : '';
    const params = new URLSearchParams();
    params.set('limit', String(signupLimit));
    params.set('offset', String(signupOffset));
    if (status) params.set('status', status);

    const response = await fetch(`${API_BASE}/api/superadmin/signup-requests?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });

    if (response.ok) {
      const data = await response.json();
      currentSignupRequests = data.items || [];
      renderSignupRequests(currentSignupRequests);
      updateSignupPageInfo(data.total || 0);
    } else {
      currentSignupRequests = [];
      renderSignupRequests([]);
      updateSignupPageInfo(0);
    }
  } catch (error) {
    console.error('Error loading signup requests:', error);
    currentSignupRequests = [];
    renderSignupRequests([]);
    updateSignupPageInfo(0);
  }
}

function renderSignupRequests(items) {
  const tbody = document.getElementById('signupRequestsTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!items || items.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="10" style="text-align:center; padding:20px; color:#6b7280;">Нет заявок</td>';
    tbody.appendChild(row);
    return;
  }

  items.forEach(item => {
    const key = item.client_api_key || '';
    const keyShort = key ? `${key.substring(0, 8)}...` : '-';
    const payment = [item.payment_provider, item.payment_id].filter(Boolean).join(':') || '-';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.id}</td>
      <td>${item.company_name || item.client_company_name || '-'}</td>
      <td>${item.contact_email || '-'}</td>
      <td>${item.domain || '-'}</td>
      <td>${item.plan_code || '-'}</td>
      <td><span class="badge ${getSignupStatusClass(item.status)}">${item.status || '-'}</span></td>
      <td>${payment}</td>
      <td>${item.client_id || '-'}</td>
      <td><code style="font-size:11px; background:#f5f5f5; padding:2px 6px; border-radius:4px; cursor:${key ? 'pointer' : 'default'}" title="${key}" onclick="if('${key}') this.textContent = this.textContent.includes('...') ? '${key}' : '${keyShort}'">${keyShort}</code></td>
      <td>${item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '-'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Загрузка клиентов
async function loadClients() {
  try {
    console.log('Loading clients from:', `${API_BASE}/api/superadmin/clients`);
    const token = localStorage.getItem('superadmin_token');
    const response = await fetch(`${API_BASE}/api/superadmin/clients`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Clients data:', data);
      const signupResp = await fetch(`${API_BASE}/api/superadmin/signup-requests?limit=200`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const signupData = signupResp.ok ? await signupResp.json() : { items: [] };
      currentSignupRequests = signupData.items || [];

      currentClients = mergeClientsAndLeads(data.clients || [], currentSignupRequests);
      renderClients(currentClients);
      updateStats(data.stats);
    } else {
      const errorData = await response.json();
      console.error('API Error:', errorData);
      alert('Ошибка загрузки клиентов: ' + (errorData.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error loading clients:', error);
    alert('Ошибка сети при загрузке клиентов');
  }
}

// Отрисовка таблицы клиентов
function renderClients(clients) {
  console.log('Rendering clients:', clients);
  const tbody = document.getElementById('clientsTable');
  tbody.innerHTML = '';
  
  if (!clients || clients.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="13" style="text-align: center; padding: 20px; color: #6b7280;">Нет клиентов</td>';
    tbody.appendChild(row);
    return;
  }
  
  clients.forEach(client => {
    // Расчёт срока действия и дней до окончания
    let expiryDate = null;
    let daysLeft = null;
    
    console.log('Client data:', client);
    
    if (client.license_type === 'trial') {
      console.log('Trial client, trial_until:', client.trial_until);
      if (client.trial_until) {
        expiryDate = new Date(client.trial_until);
      } else {
        // Если trial_until null, устанавливаем дату по умолчанию (14 дней от создания)
        const createdDate = client.created_at ? new Date(client.created_at) : new Date();
        expiryDate = new Date(createdDate);
        expiryDate.setDate(expiryDate.getDate() + 14);
        console.log('Using default trial date:', expiryDate);
      }
    } else if (client.license_type === 'paid' && client.paid_until) {
      expiryDate = new Date(client.paid_until);
    }
    
    if (expiryDate) {
      const now = new Date();
      const diffTime = expiryDate - now;
      daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    const expiryText = expiryDate ? expiryDate.toLocaleDateString('ru-RU') : '-';
    const daysLeftText = daysLeft !== null ? 
      (daysLeft < 0 ? `Просрочено (${Math.abs(daysLeft)} дн.)` : `${daysLeft} дн.`) : 
      '-';
    
    // Форматирование тысяч
    const formatNumber = (num) => {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    };
    
    const row = document.createElement('tr');
    const sourceLabel = client.source === 'website'
      ? 'Сайт (оплата)'
      : client.source === 'website-lead'
        ? 'Сайт (лид)'
        : 'Вручную';
    const canManage = !client._isLead;
    row.innerHTML = `
      <td>${client.id}</td>
      <td>${client.company_name || '-'}</td>
      <td>${client.api_key && client.api_key !== '-' ? `<code style="font-size: 11px; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; cursor: pointer;" onclick="this.textContent = this.textContent === '${client.api_key.substring(0, 5)}...' ? '${client.api_key}' : '${client.api_key.substring(0, 5)}...';" title="${client.api_key}">${client.api_key.substring(0, 5)}...</code>` : '-'}</td>
      <td>${client.contact_email || '-'}</td>
      <td>${sourceLabel}</td>
      <td><span class="badge badge-${client.license_type}">${client.license_type}</span></td>
      <td>${expiryText}</td>
      <td style="color: ${daysLeft < 0 ? '#ef4444' : daysLeft !== null && daysLeft <= 7 ? '#f59e0b' : 'inherit'}">${daysLeftText}</td>
      <td>${client.allowed_domains && client.allowed_domains.length > 0 ? client.allowed_domains.join(', ') : '-'}</td>
      <td>${formatNumber(client.total_orders || 0)}</td>
      <td>${client.total_revenue ? formatNumber(client.total_revenue) + ' ₽' : '0 ₽'}</td>
      <td>${client.created_at ? new Date(client.created_at).toLocaleDateString('ru-RU') : '-'}</td>
      <td>
        <div class="client-actions">
          ${canManage ? `<button class="btn btn-s btn-sm" onclick="editClient(${client.id})">✏️</button>` : ''}
          ${canManage ? `<button class="btn btn-g btn-sm" onclick="regenerateApiKey(${client.id})">🔑</button>` : ''}
          ${canManage ? `<button class="btn btn-r btn-sm" onclick="deleteClient(${client.id})">🗑️</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Обновление статистики
function updateStats(stats) {
  document.getElementById('totalClients').textContent = stats.total || 0;
  document.getElementById('trialClients').textContent = stats.trial || 0;
  document.getElementById('paidClients').textContent = stats.paid || 0;
  document.getElementById('blockedClients').textContent = stats.blocked || 0;
}

// Загрузка общей статистики
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/stats`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      document.getElementById('totalRevenue').textContent = (data.total_revenue || 0) + ' ₽';
      document.getElementById('totalOrders').textContent = data.total_orders || 0;
      document.getElementById('avgOrderValue').textContent = (data.avg_order_value || 0) + ' ₽';
      document.getElementById('activeClients').textContent = data.active_clients || 0;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Загрузка админов
async function loadAdmins() {
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/admins`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      currentAdmins = data.admins;
      renderAdmins(data.admins);
    }
  } catch (error) {
    console.error('Error loading admins:', error);
  }
}

// Отрисовка таблицы админов
function renderAdmins(admins) {
  const tbody = document.getElementById('adminsTable');
  tbody.innerHTML = '';
  
  admins.forEach(admin => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${admin.id}</td>
      <td>${admin.email}</td>
      <td>${new Date(admin.created_at).toLocaleDateString('ru-RU')}</td>
      <td>
        <div class="client-actions">
          <button class="btn btn-r btn-sm" onclick="deleteAdmin(${admin.id})">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Фильтрация клиентов
function filterClients() {
  const licenseFilter = document.getElementById('licenseFilter').value;
  const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
  
  let filtered = currentClients;
  
  if (licenseFilter) {
    filtered = filtered.filter(c => c.license_type === licenseFilter);
  }
  
  if (searchFilter) {
    filtered = filtered.filter(c => 
      (c.company_name && c.company_name.toLowerCase().includes(searchFilter)) ||
      (c.contact_email && c.contact_email.toLowerCase().includes(searchFilter)) ||
      (c.email && c.email.toLowerCase().includes(searchFilter))
    );
  }
  
  renderClients(filtered);
}

// Модальное окно клиента
function showCreateClientModal() {
  editingClientId = null;
  document.getElementById('clientModalTitle').textContent = 'Создать клиента';
  document.getElementById('clientForm').reset();
  document.getElementById('clientModal').style.display = 'block';
  
  // Установить дату trial по умолчанию
  const trialUntil = new Date();
  trialUntil.setDate(trialUntil.getDate() + 14);
  document.getElementById('trialUntil').value = trialUntil.toISOString().split('T')[0];
}

function editClient(clientId) {
  const client = currentClients.find(c => c.id === clientId);
  if (!client) return;
  
  editingClientId = clientId;
  document.getElementById('clientModalTitle').textContent = 'Редактировать клиента';
  
  document.getElementById('companyName').value = client.company_name || '';
  document.getElementById('contactEmail').value = client.contact_email || '';
  document.getElementById('licenseType').value = client.license_type;
  
  updateLicenseFields();
  
  if (client.trial_until) {
    document.getElementById('trialUntil').value = new Date(client.trial_until).toISOString().split('T')[0];
  }
  if (client.paid_until) {
    document.getElementById('paidUntil').value = new Date(client.paid_until).toISOString().split('T')[0];
  }
  
  // Загрузить домены
  const domainsContainer = document.getElementById('domainsContainer');
  domainsContainer.innerHTML = '';
  
  if (client.allowed_domains && client.allowed_domains.length > 0) {
    client.allowed_domains.forEach(domain => {
      addDomain(domain);
    });
  } else {
    addDomain();
  }
  
  document.getElementById('clientModal').style.display = 'block';
}

function closeClientModal() {
  document.getElementById('clientModal').style.display = 'none';
}

function updateLicenseFields() {
  const licenseType = document.getElementById('licenseType').value;
  const trialUntilGroup = document.getElementById('trialUntilGroup');
  const paidUntilGroup = document.getElementById('paidUntilGroup');
  
  if (licenseType === 'trial') {
    trialUntilGroup.style.display = 'block';
    paidUntilGroup.style.display = 'none';
  } else if (licenseType === 'paid') {
    trialUntilGroup.style.display = 'none';
    paidUntilGroup.style.display = 'block';
  } else {
    trialUntilGroup.style.display = 'none';
    paidUntilGroup.style.display = 'none';
  }
}

function addDomain(value = '') {
  const domainsContainer = document.getElementById('domainsContainer');
  const domainItem = document.createElement('div');
  domainItem.className = 'domain-item';
  domainItem.innerHTML = `
    <input type="text" placeholder="example.com" class="domain-input" value="${value}">
    <button type="button" class="btn btn-g btn-sm" onclick="removeDomain(this)">×</button>
  `;
  domainsContainer.appendChild(domainItem);
}

function removeDomain(button) {
  button.parentElement.remove();
}

// Сохранение клиента
document.getElementById('clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const domains = Array.from(document.querySelectorAll('.domain-input'))
    .map(input => input.value.trim())
    .filter(domain => domain);
  
  const clientData = {
    company_name: document.getElementById('companyName').value,
    contact_email: document.getElementById('contactEmail').value,
    license_type: document.getElementById('licenseType').value,
    allowed_domains: domains
  };
  
  if (clientData.license_type === 'trial') {
    clientData.trial_until = document.getElementById('trialUntil').value;
  } else if (clientData.license_type === 'paid') {
    clientData.paid_until = document.getElementById('paidUntil').value;
  }
  
  try {
    const url = editingClientId 
      ? `${API_BASE}/api/superadmin/clients/${editingClientId}`
      : `${API_BASE}/api/superadmin/clients`;
    
    const response = await fetch(url, {
      method: editingClientId ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
      },
      body: JSON.stringify(clientData)
    });
    
    if (response.ok) {
      closeClientModal();
      loadClients();
    } else {
      alert('Ошибка сохранения клиента');
    }
  } catch (error) {
    console.error('Error saving client:', error);
    alert('Ошибка сохранения клиента');
  }
});

// Удаление клиента
async function deleteClient(clientId) {
  if (!confirm('Удалить клиента?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/clients/${clientId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });
    
    if (response.ok) {
      loadClients();
    } else {
      alert('Ошибка удаления клиента');
    }
  } catch (error) {
    console.error('Error deleting client:', error);
    alert('Ошибка удаления клиента');
  }
}

// Регенерация API ключа
async function regenerateApiKey(clientId) {
  if (!confirm('Сгенерировать новый API ключ? Старый перестанет работать.')) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/clients/${clientId}/regenerate-key`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      alert(`Новый API ключ: ${data.api_key}`);
    } else {
      alert('Ошибка генерации ключа');
    }
  } catch (error) {
    console.error('Error regenerating key:', error);
    alert('Ошибка генерации ключа');
  }
}

// Модальное окно админа
function showCreateAdminModal() {
  document.getElementById('adminForm').reset();
  document.getElementById('adminModal').style.display = 'block';
}

function closeAdminModal() {
  document.getElementById('adminModal').style.display = 'none';
}

// Создание админа
document.getElementById('adminForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const adminData = {
    email: document.getElementById('adminEmail').value,
    password: document.getElementById('adminPassword').value
  };
  
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
      },
      body: JSON.stringify(adminData)
    });
    
    if (response.ok) {
      closeAdminModal();
      loadAdmins();
    } else {
      alert('Ошибка создания админа');
    }
  } catch (error) {
    console.error('Error creating admin:', error);
    alert('Ошибка создания админа');
  }
});

// Удаление админа
async function deleteAdmin(adminId) {
  if (!confirm('Удалить администратора?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/superadmin/admins/${adminId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
    });
    
    if (response.ok) {
      loadAdmins();
    } else {
      alert('Ошибка удаления админа');
    }
  } catch (error) {
    console.error('Error deleting admin:', error);
    alert('Ошибка удаления админа');
  }
}

// Закрытие модальных окон по клику вне их
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
}

// Проверка авторизации при загрузке
document.addEventListener('DOMContentLoaded', function() {
  const token = localStorage.getItem('superadmin_token');
  if (token) {
    showApp();
  }
});
