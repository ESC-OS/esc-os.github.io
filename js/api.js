const BASE = 'https://os-api.esc68-os.workers.dev';

function getToken() {
  return localStorage.getItem('token');
}

async function req(path, opts = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
    return null;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.error || d.message || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return { success: true };
  return res.json();
}

const api = {
  get:    (path)        => req(path),
  post:   (path, body)  => req(path, { method: 'POST',   body: body != null ? JSON.stringify(body) : undefined }),
  patch:  (path, body)  => req(path, { method: 'PATCH',  body: body != null ? JSON.stringify(body) : undefined }),
  delete: (path)        => req(path, { method: 'DELETE' }),
};

export function photoUrl(key) { return `${BASE}/upload/photo/${key}`; }
export function loginUrl(fromUrl) { return `${BASE}/auth/google?from=${encodeURIComponent(fromUrl)}`; }

// Build query string; if p is a string, treat it as the value for `stringKey` (backward compat)
function q(endpoint, p, stringKey = 'status') {
  if (!p) return endpoint;
  const obj = typeof p === 'string' ? { [stringKey]: p } : p;
  const qs  = new URLSearchParams(obj).toString();
  return qs ? `${endpoint}?${qs}` : endpoint;
}

// Auth
export const postLogout = () => api.post('/auth/logout');

// Users
export const getMe            = ()              => api.get('/users/me');
export const updateMe         = (data)          => api.patch('/users/me', data);
export const getUsers         = (p)             => api.get(q('/users', p, 'role'));
export const updateUserRole   = (id, role)      => api.patch(`/users/${id}/role`, { role });
export const updateUserStatus = (id, isActive)  => api.patch(`/users/${id}/status`, { is_active: isActive });

// Item Categories
export const getCategories    = ()              => api.get('/items/categories');
export const createCategory   = (data)          => api.post('/items/categories', data);
export const updateCategory   = (code, data)    => api.patch(`/items/categories/${code}`, data);
export const deleteCategory   = (code)          => api.delete(`/items/categories/${code}`);

// Items
export const getItems         = (params)        => api.get(`/items${params ? '?' + new URLSearchParams(params).toString() : ''}`);
export const getItem          = (id)            => api.get(`/items/${id}`);
export const createItem       = (data)          => api.post('/items', data);
export const updateItem       = (id, data)      => api.patch(`/items/${id}`, data);
export const deleteItem       = (id)            => api.delete(`/items/${id}`);
export const manageStock      = (id, data)      => api.post(`/items/${id}/stock`, data);
export const getStockLogs     = (id)            => api.get(`/items/${id}/stock-logs`);

// Projects
export const getProjects      = (p)             => api.get(q('/projects', p, 'search'));
export const getProject       = (id)            => api.get(`/projects/${id}`);
export const createProject    = (data)          => api.post('/projects', data);
export const updateProject    = (id, data)      => api.patch(`/projects/${id}`, data);
export const deleteProject    = (id)            => api.delete(`/projects/${id}`);
export const getProjectMembers    = (id)           => api.get(`/projects/${id}/members`);
export const addMember            = (id, data)      => api.post(`/projects/${id}/members`, data);
export const removeMember         = (id, userId)    => api.delete(`/projects/${id}/members/${userId}`);
export const transferLeader       = (id, userId)    => api.patch(`/projects/${id}/leader`, { user_id: userId });
export const leaveProject         = (id)            => api.post(`/projects/${id}/leave`);
export const getProjectIncidents  = (id)            => api.get(`/projects/${id}/incidents`);

// Borrow Requests — create requires all 4 fields upfront
export const getRequests        = (p)              => api.get(q('/requests', p));
export const getRequest         = (id)             => api.get(`/requests/${id}`);
export const createRequest      = (data)           => api.post('/requests', data);
export const updateRequest      = (id, data)       => api.patch(`/requests/${id}`, data);
export const addRequestItem     = (id, data)       => api.post(`/requests/${id}/items`, data);
export const removeRequestItem  = (id, itemId)     => api.delete(`/requests/${id}/items/${itemId}`);
export const adjustRequestItem  = (id, itemId, d)  => api.patch(`/requests/${id}/items/${itemId}`, d);
export const submitRequest      = (id)             => api.post(`/requests/${id}/submit`);
export const processRequest     = (id, data)       => api.patch(`/requests/${id}/process`, data);
export const assignRequest      = (id, userId)     => api.patch(`/requests/${id}/assign`, { user_id: userId });
export const markReady          = (id)             => api.patch(`/requests/${id}/ready`);
export const confirmPickup      = (id, data)       => api.patch(`/requests/${id}/pickup`, data);
export const cancelRequest      = (id)             => api.patch(`/requests/${id}/cancel`);
export const getConditions      = (id)             => api.get(`/requests/${id}/conditions`);
export const submitConditions   = (id, data)       => api.post(`/requests/${id}/conditions`, data);
export const getRequestReturns  = (id)             => api.get(`/requests/${id}/returns`);
export const submitReturn       = (id, data)       => api.post(`/requests/${id}/returns`, data);

// Returns (admin)
export const getAllReturns     = (status)        => api.get(`/returns${status ? '?status=' + status : ''}`);
export const getReturn        = (id)             => api.get(`/returns/${id}`);
export const confirmReturn    = (id, data)       => api.patch(`/returns/${id}/confirm`, data);

// Storage Visits
export const getVisits        = (p)              => api.get(q('/visits', p));
export const getVisit         = (id)             => api.get(`/visits/${id}`);
export const createVisit      = (data)           => api.post('/visits', data);
export const confirmVisit     = (id, data)       => api.patch(`/visits/${id}/confirm`, data);
export const rejectVisit      = (id, data)       => api.patch(`/visits/${id}/reject`, data);
export const completeVisit    = (id)             => api.patch(`/visits/${id}/complete`);
export const cancelVisit      = (id, data)       => api.patch(`/visits/${id}/cancel`, data);

// Temporary Deposits (2-step: create draft → add items)
export const getDeposits      = (p)              => api.get(q('/deposits', p));
export const getDeposit       = (id)             => api.get(`/deposits/${id}`);
export const createDeposit    = (projectId)      => api.post('/deposits', { project_id: projectId });
export const updateDeposit    = (id, data)       => api.patch(`/deposits/${id}`, data);
export const addDepositItem   = (id, data)       => api.post(`/deposits/${id}/items`, data);
export const removeDepositItem = (id, itemId)    => api.delete(`/deposits/${id}/items/${itemId}`);
export const submitDeposit    = (id)             => api.post(`/deposits/${id}/submit`);
export const approveDeposit   = (id, data)       => api.patch(`/deposits/${id}/approve`, data);
export const rejectDeposit    = (id, data)       => api.patch(`/deposits/${id}/reject`, data);
export const depositItems     = (id, data)       => api.patch(`/deposits/${id}/deposit`, data);
export const completeDeposit  = (id, data)       => api.patch(`/deposits/${id}/complete`, data);

// Storage Area Requests (2-step: create draft → set dates → submit)
export const getStorageAreas     = (p)           => api.get(q('/storage-areas', p));
export const getStorageArea      = (id)          => api.get(`/storage-areas/${id}`);
export const createStorageArea   = (projectId)   => api.post('/storage-areas', { project_id: projectId });
export const updateStorageArea   = (id, data)    => api.patch(`/storage-areas/${id}`, data);
export const submitStorageArea   = (id)          => api.post(`/storage-areas/${id}/submit`);
export const approveStorageArea  = (id, data)    => api.patch(`/storage-areas/${id}/approve`, data);
export const rejectStorageArea   = (id, data)    => api.patch(`/storage-areas/${id}/reject`, data);
export const checkoutStorageArea = (id, data)    => api.patch(`/storage-areas/${id}/checkout`, data);

// Donations (2-step: create draft → add items → submit)
export const getDonations      = (p)             => api.get(q('/donations', p));
export const getDonation       = (id)            => api.get(`/donations/${id}`);
export const createDonation    = (projectId)     => api.post('/donations', { project_id: projectId });
export const addDonationItem   = (id, data)      => api.post(`/donations/${id}/items`, data);
export const removeDonationItem = (id, itemId)   => api.delete(`/donations/${id}/items/${itemId}`);
export const submitDonation    = (id)            => api.post(`/donations/${id}/submit`);
export const reviewDonationItem = (id, itemId, d) => api.patch(`/donations/${id}/items/${itemId}`, d);
export const approveDonation   = (id, data)      => api.patch(`/donations/${id}/approve`, data);
export const rejectDonation    = (id, data)      => api.patch(`/donations/${id}/reject`, data);
export const donateDonation    = (id, data)      => api.patch(`/donations/${id}/donate`, data);
export const completeDonation  = (id)            => api.patch(`/donations/${id}/complete`);

// Notifications — response: { notifications: [...], pagination: { page, limit, total, unread } }
export const getNotifications = (page, limit)    => api.get(`/notifications?page=${page}&limit=${limit}`);
export const markNotifRead    = (id)             => api.patch(`/notifications/${id}/read`);
export const markAllRead      = ()               => api.patch('/notifications/read-all');
export const broadcast        = (data)           => api.post('/notifications/broadcast', data);

// Operational Slots
export const getSlots         = (serviceType)    => api.get(`/slots${serviceType ? '?service_type=' + serviceType : ''}`);
export const createSlot       = (data)           => api.post('/slots', data);
export const updateSlot       = (id, data)       => api.patch(`/slots/${id}`, data);
export const deleteSlot       = (id)             => api.delete(`/slots/${id}`);

// Thai Holidays
export const getHolidays      = (year)           => api.get(`/holidays${year ? '?year=' + year : ''}`);
export const createHoliday    = (data)           => api.post('/holidays', data);
export const deleteHoliday    = (id)             => api.delete(`/holidays/${id}`);

// Calendar & Status
export const getCalendar      = ()               => api.get('/calendar');
export const getStatus        = ()               => api.get('/status');

// Upload — presign → PUT binary → use r2Key
export async function uploadPhoto(file) {
  const token = getToken();
  const presign = await api.post('/upload/presign');
  const { r2Key, uploadPath } = presign.data;
  await fetch(BASE + uploadPath, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: file,
  });
  return r2Key;
}
