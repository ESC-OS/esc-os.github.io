import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getUsers, updateUserRole, updateUserStatus } from '../../../api/api';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import ConfirmModal from '../../../shared/ConfirmModal';

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null, confirmLabel: 'ยืนยัน' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers({ limit: 100 });
      setAllUsers(res?.data ?? []);
    } catch (err) {
      showError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filteredUsers = allUsers.filter(u => {
    if (filterRole && u.role !== filterRole) return false;
    if (filterActive === '1' && !(u.is_active === 1 || u.is_active === true)) return false;
    if (filterActive === '0' && !(u.is_active === 0 || u.is_active === false)) return false;
    return true;
  });

  async function handleRoleChange(uid, newRole, prevRole, sel) {
    try {
      await updateUserRole(uid, newRole);
      setAllUsers(prev => prev.map(u => String(u.id) === uid ? { ...u, role: newRole } : u));
    } catch (err) {
      showError(err.message);
      sel.value = prevRole;
    }
  }

  function handleToggleStatus(u) {
    const isActive = u.is_active === 1 || u.is_active === true;
    const action   = isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน';
    setConfirm({
      open: true,
      message: `${action}ผู้ใช้ "${u.name ?? u.id}"?`,
      confirmLabel: action,
      onConfirm: async () => {
        try {
          await updateUserStatus(String(u.id), !isActive);
          setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: isActive ? 0 : 1 } : x));
        } catch (err) { showError(err.message); }
      },
    });
  }

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">จัดการผู้ใช้</h1>
      </div>

      <div className="filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <select className="filter-select" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">ทุกบทบาท</option>
          <option value="user">ผู้ใช้</option>
          <option value="admin">ผู้ดูแลระบบ</option>
        </select>
        <select className="filter-select" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="1">ใช้งาน</option>
          <option value="0">ไม่ใช้งาน</option>
        </select>
      </div>

      {filteredUsers.length === 0 ? (
        <p className="empty-text">ไม่พบผู้ใช้</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>อีเมล</th>
                <th>ชื่อเล่น</th>
                <th>ภาควิชา</th>
                <th>สถานะ</th>
                <th>บทบาท</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const isSelf   = u.id === me?.id;
                const isActive = u.is_active === 1 || u.is_active === true;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <div className="nav-avatar-placeholder" style={{ width: 30, height: 30, fontSize: '.82rem', flexShrink: 0 }}>
                          {(u.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span>{u.name ?? '-'}</span>
                        {isSelf && <span style={{ fontSize: '.72rem', color: 'var(--primary)', marginLeft: '.3rem' }}>(คุณ)</span>}
                      </div>
                    </td>
                    <td>{u.email ?? '-'}</td>
                    <td>{u.nickname ?? '-'}</td>
                    <td>{u.department ?? '-'}</td>
                    <td>
                      {isActive
                        ? <span className="badge" style={{ background: 'var(--success)', color: '#fff' }}>ใช้งาน</span>
                        : <span className="badge" style={{ background: 'var(--text-muted)', color: '#fff' }}>ไม่ใช้งาน</span>}
                    </td>
                    <td>
                      <select
                        defaultValue={u.role}
                        disabled={isSelf}
                        title={isSelf ? 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้' : undefined}
                        onChange={e => {
                          const prev = e.target.dataset.prev ?? u.role;
                          handleRoleChange(String(u.id), e.target.value, prev, e.target);
                          e.target.dataset.prev = e.target.value;
                        }}
                      >
                        <option value="user">ผู้ใช้</option>
                        <option value="admin">ผู้ดูแลระบบ</option>
                      </select>
                    </td>
                    <td>
                      {!isSelf ? (
                        <button
                          className="btn btn-sm"
                          style={isActive
                            ? { color: 'var(--error)', borderColor: 'var(--error)' }
                            : { color: 'var(--success)', borderColor: 'var(--success)' }}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => setConfirm(c => ({ ...c, open: false }))}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        confirmLabel={confirm.confirmLabel}
      />
    </>
  );
}
