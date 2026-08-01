import { createContext, useContext, useState, useEffect } from 'react';
import { getMe, postLogout, getNotifications } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then(res => setUser(res?.data ?? null))
      .catch(() => { localStorage.removeItem('token'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    getNotifications(1, 1)
      .then(r => setUnread(r?.pagination?.unread ?? 0))
      .catch(() => {});
  }, [user]);

  async function logout() {
    await postLogout().catch(() => {});
    localStorage.removeItem('token');
    setUser(null);
    setUnread(0);
  }

  async function refreshUser() {
    try {
      const res = await getMe();
      setUser(res?.data ?? null);
    } catch {}
  }

  async function refreshUnread() {
    try {
      const r = await getNotifications(1, 1);
      setUnread(r?.pagination?.unread ?? 0);
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, unread, setUser, logout, refreshUser, refreshUnread }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
