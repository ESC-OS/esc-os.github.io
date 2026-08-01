import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getProject, deleteProject, getProjectMembers, addMember, removeMember,
  transferLeader, leaveProject, getProjectIncidents,
  getRequests, getVisits, getDeposits, getStorageAreas, getDonations,
} from '../../api/api';
import { formatDate, formatDateTime } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';
import ConfirmModal from '../../shared/ConfirmModal';
import { showError } from '../../shared/ErrorToast';
import ProjectModal from './ProjectModal';
import RequestModal from '../requests/RequestModal';

function reqTab(status) {
  if (['draft', 'pending'].includes(status)) return 'draft';
  if (['processing', 'ready_for_pickup'].includes(status)) return 'processing';
  if (status === 'in_lend') return 'active';
  return 'done';
}

const INCIDENT_LABELS = {
  late_return: 'คืนล่าช้า',
  policy_violation: 'ละเมิดนโยบาย',
  no_show_visit: 'ไม่มาตามนัดเยี่ยมชม',
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject]     = useState(null);
  const [members, setMembers]     = useState([]);
  const [requests, setRequests]   = useState([]);
  const [visits, setVisits]       = useState([]);
  const [deposits, setDeposits]   = useState([]);
  const [storageAreas, setStorageAreas] = useState([]);
  const [donations, setDonations] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [activeTab, setActiveTab] = useState('draft');

  // Modals
  const [editModalOpen, setEditModalOpen]         = useState(false);
  const [deleteModalOpen, setDeleteModalOpen]     = useState(false);
  const [leaveModalOpen, setLeaveModalOpen]       = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [removeMemberModal, setRemoveMemberModal] = useState(null); // { uid, name }
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen]   = useState(false);

  // Add member form state
  const [memberEmail, setMemberEmail]   = useState('');
  const [memberError, setMemberError]   = useState('');
  const [memberLoading, setMemberLoading] = useState(false);

  // Transfer leader form state
  const [transferUid, setTransferUid]   = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) { navigate('/projects'); return; }
    setLoading(true);
    setError('');
    try {
      const [{ data: proj }, { data: mems }] = await Promise.all([
        getProject(id),
        getProjectMembers(id),
      ]);
      setProject(proj);
      setMembers(mems ?? []);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const [reqs, vis, deps, areas, dons, incs] = await Promise.all([
      getRequests({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getVisits({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getDeposits({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getStorageAreas({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getDonations({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getProjectIncidents(id).then(r => r?.data ?? []).catch(() => []),
    ]);
    setRequests(reqs);
    setVisits(vis);
    setDeposits(deps);
    setStorageAreas(areas);
    setDonations(dons);
    setIncidents(incs);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const isLeader  = project?.leader_id === user?.id;
  const isAdmin   = user?.role === 'admin';
  const canManage = isLeader || isAdmin;
  const isSelfMember = members.some(m => m.user_id === user?.id && m.role === 'member');

  // Group requests
  const reqGroups = { draft: [], processing: [], active: [], done: [] };
  requests.forEach(r => reqGroups[reqTab(r.status)].push(r));

  async function handleDeleteProject() {
    try {
      await deleteProject(id);
      navigate('/projects');
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleLeaveProject() {
    try {
      await leaveProject(id);
      navigate('/projects');
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    const email = memberEmail.trim();
    if (!email) { setMemberError('กรุณากรอกอีเมล'); return; }
    setMemberLoading(true);
    setMemberError('');
    try {
      await addMember(id, { email });
      setAddMemberModalOpen(false);
      setMemberEmail('');
      await load();
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setMemberLoading(false);
    }
  }

  async function handleRemoveMember() {
    if (!removeMemberModal) return;
    try {
      await removeMember(id, removeMemberModal.uid);
      setRemoveMemberModal(null);
      await load();
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleTransferLeader(e) {
    e.preventDefault();
    if (!transferUid) { setTransferError('กรุณาเลือกสมาชิก'); return; }
    setTransferLoading(true);
    setTransferError('');
    try {
      await transferLeader(id, transferUid);
      setTransferModalOpen(false);
      setTransferUid('');
      await load();
    } catch (err) {
      setTransferError(err.message);
    } finally {
      setTransferLoading(false);
    }
  }

  if (loading) return <Spinner />;
  if (error)   return <div className="alert alert-error">{error}</div>;
  if (!project) return <div className="alert alert-error">ไม่พบโครงการ</div>;

  const orgType = project.org_type || project.organization_type || '';
  const eligibleMembers = members.filter(m => m.role === 'member');

  function AvatarEl({ m }) {
    if (m.avatar_url) return <img src={m.avatar_url} alt={m.name} className="member-avatar" />;
    return <div className="member-avatar-ph">{(m.name || '?').charAt(0).toUpperCase()}</div>;
  }

  function SvcRow({ id: rowId, href, label, status }) {
    return (
      <Link to={href} className="svc-row">
        <span className="svc-row-id">{rowId}</span>
        <span className="svc-row-name">{label}</span>
        <span className="svc-row-meta"><StatusBadge status={status} /></span>
        <span className="svc-row-arrow">›</span>
      </Link>
    );
  }

  function SvcSection({ title, href, items, emptyText, children: createBtn }) {
    return (
      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
          <div className="card-title" style={{ margin: 0 }}>
            {title} <span style={{ fontWeight: 400, fontSize: '.85rem', color: 'var(--text-muted)' }}>({items.length})</span>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            {createBtn}
            <Link to={href} className="btn btn-sm btn-secondary">ดูทั้งหมด</Link>
          </div>
        </div>
        {items.length === 0
          ? <p className="empty-text">{emptyText}</p>
          : <div className="svc-list">{items}</div>}
      </div>
    );
  }

  const TAB_LABELS = {
    draft:      `ร่าง/รอ (${reqGroups.draft.length})`,
    processing: `เตรียม (${reqGroups.processing.length})`,
    active:     `กำลังยืม (${reqGroups.active.length})`,
    done:       `คืนแล้ว (${reqGroups.done.length})`,
  };

  return (
    <>
      <Link to="/projects" className="back-btn">← กลับ</Link>

      {/* Header card */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)', margin: '0 0 .4rem' }}>{project.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', fontSize: '.88rem', color: 'var(--text-muted)' }}>
              {orgType && <span className="member-role" style={{ fontSize: '.8rem' }}>{orgType}</span>}
              <span>{formatDate(project.start_date)} – {formatDate(project.end_date)}</span>
              <span>{members.length} สมาชิก</span>
            </div>
            {project.description && <p style={{ marginTop: '.6rem', fontSize: '.9rem', color: 'var(--text-muted)' }}>{project.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {canManage && <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditModalOpen(true)}>แก้ไข</button>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteModalOpen(true)}>ลบโครงการ</button>
            </>}
            {isSelfMember && (
              <button className="btn btn-secondary btn-sm" onClick={() => setLeaveModalOpen(true)}>ออกจากโครงการ</button>
            )}
          </div>
        </div>
      </div>

      {/* Members card */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
          <div className="card-title" style={{ margin: 0 }}>สมาชิก ({members.length})</div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            {isLeader && (
              <button className="btn btn-sm btn-secondary" onClick={() => {
                if (eligibleMembers.length === 0) { showError('ไม่มีสมาชิกที่สามารถโอนตำแหน่งให้ได้'); return; }
                setTransferUid(''); setTransferError(''); setTransferModalOpen(true);
              }}>เปลี่ยนหัวหน้า</button>
            )}
            {canManage && (
              <button className="btn btn-sm btn-primary" onClick={() => { setMemberEmail(''); setMemberError(''); setAddMemberModalOpen(true); }}>+ เพิ่มสมาชิก</button>
            )}
          </div>
        </div>
        <ul className="member-list">
          {members.map(m => {
            const isCurrentLeader = m.role === 'leader';
            const isSelf = m.user_id === user?.id;
            return (
              <li key={m.user_id} className="member-item">
                <AvatarEl m={m} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.88rem', fontWeight: 500 }}>{m.name || m.user_id}</div>
                  {m.email && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{m.email}</div>}
                </div>
                <span className="member-role">{isCurrentLeader ? 'หัวหน้า' : 'สมาชิก'}</span>
                {canManage && !isSelf && !isCurrentLeader && (
                  <button className="btn btn-sm btn-danger" onClick={() => setRemoveMemberModal({ uid: m.user_id, name: m.name || m.user_id })}>
                    ลบ
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Borrow requests with tabs */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
          <div className="card-title" style={{ margin: 0 }}>
            คำขอยืม <span style={{ fontWeight: 400, fontSize: '.85rem', color: 'var(--text-muted)' }}>({requests.length})</span>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <button className="btn btn-sm btn-primary" onClick={() => setRequestModalOpen(true)}>+ คำขอยืม</button>
            <Link to="/requests" className="btn btn-sm btn-secondary">ดูทั้งหมด</Link>
          </div>
        </div>

        <div className="tab-bar" style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: '.75rem' }}>
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`tab-btn${activeTab === key ? ' tab-active' : ''}`}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '.45rem 1rem', background: 'none', border: 'none',
                fontSize: '.88rem', cursor: 'pointer',
                color: activeTab === key ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: `2px solid ${activeTab === key ? 'var(--primary)' : 'transparent'}`,
                marginBottom: '-2px', fontWeight: activeTab === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {reqGroups[activeTab].length === 0
          ? <p className="empty-text" style={{ padding: '.75rem 0' }}>ไม่มีรายการ</p>
          : (
            <div className="svc-list">
              {reqGroups[activeTab].map(r => (
                <Link key={r.id} to={`/requests/${r.id}`} className="svc-row">
                  <span className="svc-row-id">{r.id}</span>
                  <span className="svc-row-name">{r.name || r.title || r.purpose || `คำขอ #${r.id}`}</span>
                  <span className="svc-row-meta"><StatusBadge status={r.status} /></span>
                  <span className="svc-row-arrow">›</span>
                </Link>
              ))}
            </div>
          )}
      </div>

      {/* Visits */}
      <SvcSection title="การเยี่ยมชม" href="/visits" items={visits.map(v => (
        <SvcRow key={v.id} id={v.id} href={`/visits/${v.id}`} label={`เยี่ยมชม ${formatDate(v.visit_date)}`} status={v.status} />
      ))} emptyText="ยังไม่มีการจองเยี่ยมชม">
        {/* no quick-create for visits here */}
      </SvcSection>

      {/* Deposits */}
      <SvcSection title="การฝากของชั่วคราว" href="/deposits" items={deposits.map(d => (
        <SvcRow key={d.id} id={d.id} href={`/deposits/${d.id}`} label={`ฝากของ ${formatDate(d.deposit_date || d.created_at)}`} status={d.status} />
      ))} emptyText="ยังไม่มีการฝากของ" />

      {/* Storage Areas */}
      <SvcSection title="พื้นที่จัดเก็บ" href="/storage-areas" items={storageAreas.map(s => (
        <SvcRow key={s.id} id={s.id} href={`/storage-areas/${s.id}`} label={`พื้นที่จัดเก็บ ${s.location || ''}`} status={s.status} />
      ))} emptyText="ยังไม่มีคำขอพื้นที่จัดเก็บ" />

      {/* Donations */}
      <SvcSection title="การบริจาค" href="/donations" items={donations.map(d => (
        <SvcRow key={d.id} id={d.id} href={`/donations/${d.id}`} label={`บริจาค ${formatDate(d.created_at)}`} status={d.status} />
      ))} emptyText="ยังไม่มีการบริจาค" />

      {/* Incidents */}
      {incidents.length > 0 && (
        <div className="card" style={{ marginTop: '1.25rem', borderLeft: '3px solid var(--error)' }}>
          <div className="card-title" style={{ color: 'var(--error)' }}>ประวัติพฤติกรรม ({incidents.length})</div>
          <div className="svc-list">
            {incidents.map((inc, i) => (
              <div key={i} className="svc-row" style={{ cursor: 'default' }}>
                <span className="svc-row-id" style={{ color: 'var(--error)', fontWeight: 600 }}>
                  {INCIDENT_LABELS[inc.incident_type] || inc.incident_type}
                </span>
                <span className="svc-row-name">{inc.note || '-'}</span>
                <span className="svc-row-meta" style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{formatDate(inc.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      <ProjectModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        editId={id}
        onSuccess={() => load()}
      />

      {/* Delete Project Confirm */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="ยืนยันการลบโครงการ"
        message={<>คุณต้องการลบโครงการ <strong>{project.name}</strong> ใช่หรือไม่?<br /><span style={{ color: 'var(--text-muted)', fontSize: '.88rem' }}>การดำเนินการนี้ไม่สามารถยกเลิกได้</span></>}
        onConfirm={handleDeleteProject}
        confirmLabel="ลบโครงการ"
        confirmClass="btn-danger"
      />

      {/* Leave Project Confirm */}
      <ConfirmModal
        isOpen={leaveModalOpen}
        onClose={() => setLeaveModalOpen(false)}
        title="ออกจากโครงการ"
        message={<>คุณต้องการออกจากโครงการ <strong>{project.name}</strong> ใช่หรือไม่?</>}
        onConfirm={handleLeaveProject}
        confirmLabel="ออกจากโครงการ"
        confirmClass="btn-danger"
      />

      {/* Remove Member Confirm */}
      <ConfirmModal
        isOpen={!!removeMemberModal}
        onClose={() => setRemoveMemberModal(null)}
        title="ลบสมาชิก"
        message={<>คุณต้องการลบ <strong>{removeMemberModal?.name}</strong> ออกจากโครงการใช่หรือไม่?</>}
        onConfirm={handleRemoveMember}
        confirmLabel="ลบสมาชิก"
        confirmClass="btn-danger"
      />

      {/* Add Member Modal */}
      <Modal isOpen={addMemberModalOpen} onClose={() => setAddMemberModalOpen(false)} title="เพิ่มสมาชิก">
        <form onSubmit={handleAddMember}>
          {memberError && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{memberError}</div>}
          <div className="form-group" style={{ marginBottom: '.5rem' }}>
            <label className="form-label" style={{ marginBottom: '.4rem' }}>อีเมลผู้ใช้</label>
            <input
              className="form-input"
              type="email"
              placeholder="อีเมล @chula.ac.th"
              autoComplete="off"
              value={memberEmail}
              onChange={e => setMemberEmail(e.target.value)}
            />
          </div>
          <div style={{ marginTop: '.75rem', display: 'flex', gap: '.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={memberLoading}>
              {memberLoading ? 'กำลังเพิ่ม…' : 'เพิ่ม'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAddMemberModalOpen(false)}>ยกเลิก</button>
          </div>
        </form>
      </Modal>

      {/* Transfer Leader Modal */}
      <Modal isOpen={transferModalOpen} onClose={() => setTransferModalOpen(false)} title="โอนตำแหน่งหัวหน้า">
        <form onSubmit={handleTransferLeader}>
          <p style={{ marginBottom: '.75rem' }}>เลือกสมาชิกที่จะรับตำแหน่งหัวหน้าโครงการ</p>
          {transferError && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{transferError}</div>}
          <div className="form-group">
            <select
              className="form-select"
              value={transferUid}
              onChange={e => setTransferUid(e.target.value)}
            >
              <option value="">-- เลือกสมาชิก --</option>
              {eligibleMembers.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.name || m.user_id}</option>
              ))}
            </select>
          </div>
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={transferLoading}>
              {transferLoading ? 'กำลังโอน…' : 'โอนตำแหน่ง'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setTransferModalOpen(false)}>ยกเลิก</button>
          </div>
        </form>
      </Modal>

      {/* Request Modal */}
      <RequestModal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        projectId={id}
      />
    </>
  );
}
