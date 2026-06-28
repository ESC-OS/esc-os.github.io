const BASE = 'https://os-api.esc68-os.workers.dev';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let errKey = null;
    try { const d = await res.json(); msg = d.message || d.error || msg; errKey = d.error; } catch {}
    if (res.status === 403 && errKey === 'profile_incomplete') {
      if (!window.location.pathname.startsWith('/profile/')) {
        window.location.href = '/profile/?required=true';
      }
      return null;
    }
    throw new Error(msg);
  }
  return res.json();
}

const api = {
  get:    (path)       => req(path),
  post:   (path, body) => req(path, { method: 'POST',  body: body != null ? JSON.stringify(body) : undefined }),
  patch:  (path, body) => req(path, { method: 'PATCH', body: body != null ? JSON.stringify(body) : undefined }),
  delete: (path)       => req(path, { method: 'DELETE' }),
};

export function photoUrl(key) { return `${BASE}/upload/photo/${key}`; }

export async function fetchPhotoBlobUrl(photoPath) {
  if (!photoPath) return null;
  const url = photoPath.startsWith('http') ? photoPath : BASE + photoPath;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch { return null; }
}

// Status (unread notifications + admin/staff counters in one round-trip)
export const getStatus = () => api.get('/status');

// Auth
export const getMe     = ()    => api.get('/auth/me');
export const postLogout = ()   => api.post('/auth/logout');
export const loginUrl  = ()    => `${BASE}/auth/google`;

// Items
export const getItems = ({ page = 1, limit = 20, search, category } = {}) => {
  const p = new URLSearchParams({ page, limit });
  if (search)   p.set('search',   search);
  if (category) p.set('category', category);
  return api.get(`/items?${p}`);
};
export const getItemCategories = () => api.get('/items/categories');
export const getItem        = (id)        => api.get(`/items/${id}`);
export const createItem     = (data)      => api.post('/items', data);
export const updateItem     = (id, data)  => api.patch(`/items/${id}`, data);
export const deleteItem     = (id)        => api.delete(`/items/${id}`);
export const getStockLogs   = (id)        => api.get(`/items/${id}/stock/logs`);
export const addStock       = (id, data)  => api.post(`/items/${id}/stock/add`, data);
export const removeStock    = (id, data)  => api.post(`/items/${id}/stock/remove`, data);
export const sendToRepair   = (id, data)  => api.post(`/items/${id}/stock/repair`, data);
export const restoreRepair  = (id, data)  => api.post(`/items/${id}/stock/restore`, data);

// Projects
export const getProjects    = ()          => api.get('/projects');
export const getProject     = (id)        => api.get(`/projects/${id}`);
export const createProject  = (data)      => api.post('/projects', data);
export const updateProject  = (id, data)  => api.patch(`/projects/${id}`, data);
export const deleteProject  = (id)        => api.delete(`/projects/${id}`);

export const addProjectMember    = (id, data)   => api.post(`/projects/${id}/members`, data);
export const removeProjectMember = (id, userId) => api.delete(`/projects/${id}/members/${userId}`);
export const transferOwnership   = (id, userId) => api.patch(`/projects/${id}/transfer-ownership`, { user_id: userId });
export const searchUsers         = (q, role)    => { const p = new URLSearchParams({ limit: 10 }); if (q) p.set('q', q); if (role) p.set('role', role); return api.get('/users/search?' + p); };

// Requests
export const getRequests       = (status)       => api.get(`/requests${status ? '?status=' + status : ''}`);
export const getRequest        = (id)           => api.get(`/requests/${id}`);
export const createRequest     = (data)         => api.post('/requests', data);
export const updateRequest     = (id, data)     => api.patch(`/requests/${id}`, data);
export const addRequestItem    = (id, data)     => api.post(`/requests/${id}/items`, data);
export const removeRequestItem = (id, itemId)   => api.delete(`/requests/${id}/items/${itemId}`);
export const patchRequestItem  = (id, itemId, data) => api.patch(`/requests/${id}/items/${itemId}`, data);
export const assignHandler     = (id, userId)       => api.patch(`/requests/${id}/assign`, { user_id: userId });
export const submitRequest     = (id)           => api.post(`/requests/${id}/submit`);
export const cancelRequest     = (id)           => api.patch(`/requests/${id}/cancel`);
export const rejectRequest     = (id, data)     => api.patch(`/requests/${id}/reject`, data);
export const processRequest    = (id, data)     => api.patch(`/requests/${id}/process`, data);
export const tickItem          = (id, itemId)   => api.patch(`/requests/${id}/items/${itemId}/tick`);
export const markReady         = (id)           => api.patch(`/requests/${id}/ready`);
export const confirmPickup     = (id)           => api.patch(`/requests/${id}/pickup`);
export const getRequestReturns = (id)           => api.get(`/requests/${id}/returns`);
export const submitReturn      = (id, data)     => api.post(`/requests/${id}/returns`, data);

// Calendar
export const getCalendar = (from, to) => api.get(`/calendar?from=${from}&to=${to}`);

// Visits (stock room)
export const getVisits    = (status) => api.get(`/visits${status ? '?status=' + status : ''}`);
export const getVisit     = (id)   => api.get(`/visits/${id}`);
export const createVisit  = (data) => api.post('/visits', data);
export const confirmVisit = (id)        => api.patch(`/visits/${id}/confirm`);
export const cancelVisit  = (id, data)  => api.patch(`/visits/${id}/cancel`, data ?? undefined);
export const assignVisit  = (id, userId) => api.patch(`/visits/${id}/assign`, { user_id: userId });

// Returns (admin)
export const getAllReturns  = (status) => api.get(`/returns${status ? '?status=' + status : ''}`);
export const getReturn      = (id)     => api.get(`/returns/${id}`);
export const confirmReturn  = (id, data)  => api.patch(`/returns/${id}/confirm`, data);
export const rejectReturn   = (id, data)  => api.patch(`/returns/${id}/reject`, data);

// Notifications
export const getNotifications = (page, limit) => api.get(`/notifications?page=${page}&limit=${limit}`);
export const markNotifRead    = (id)           => api.patch(`/notifications/${id}/read`);
export const markAllRead      = ()             => api.patch('/notifications/read-all');

// Users
export const updateMe         = (data)          => api.patch('/users/me', data);
export const updateMyProfile  = (data)          => api.patch('/users/me', data);

// Users (admin)
export const getUsers       = (role)          => api.get(`/users${role ? '?role=' + role : ''}`);
export const updateUserRole = (id, role)      => api.patch(`/users/${id}/role`, { role });
export const setUserStatus  = (id, isActive) => api.patch(`/users/${id}/status`, { is_active: isActive });

// Upload
export async function uploadPhoto(file) {
  const { r2Key, uploadPath } = await api.post('/upload/presign');
  await fetch(BASE + uploadPath, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': file.type }, body: file,
  });
  return r2Key;
}
