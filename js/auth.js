import { getMe, getNotifications } from './api.js';
import { renderNavbar } from './ui.js';

const LOGIN_PAGE   = 'login.html';
const PROFILE_PAGE = 'profile.html';

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

export async function requireAuth(roles = null) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = LOGIN_PAGE;
    return null;
  }

  let user;
  try {
    const res = await getMe();
    user = res?.data;
  } catch {
    localStorage.removeItem('token');
    window.location.href = LOGIN_PAGE;
    return null;
  }

  if (!user) {
    localStorage.removeItem('token');
    window.location.href = LOGIN_PAGE;
    return null;
  }

  // Profile gate: redirect to setup unless already there
  const page = currentPage();
  if (user.is_profile_complete === 0 && page !== PROFILE_PAGE) {
    window.location.href = PROFILE_PAGE;
    return null;
  }

  if (roles && !roles.includes(user.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }

  let unread = 0;
  try {
    const notifRes = await getNotifications(1, 1);
    unread = notifRes?.pagination?.unread ?? 0;
  } catch {}

  renderNavbar(user, unread);

  return user;
}
