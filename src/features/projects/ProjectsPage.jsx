import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProjects } from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import ProjectModal from './ProjectModal';

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await getProjects({ limit: 100 });
      setProjects(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(newProj) {
    if (newProj?.id) navigate(`/projects/${newProj.id}`);
    else load();
  }

  if (loading) return <Spinner />;
  if (error)   return <div className="alert alert-error">{error}</div>;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">โครงการของฉัน</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ สร้างโครงการ</button>
      </div>

      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>📂</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>ยังไม่มีโครงการ</p>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ สร้างโครงการ</button>
        </div>
      ) : (
        <div className="project-list">
          {projects.map(p => {
            const isLeader = p.leader_id === user?.id;
            const orgLabel = p.org_type || p.organization_type || '';
            return (
              <div
                key={p.id}
                className="project-card"
                onClick={() => navigate(`/projects/${p.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="project-card-name">
                    {p.name}
                    {isLeader && (
                      <span className="member-role" style={{ marginLeft: '.4rem', fontSize: '.72rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        หัวหน้า
                      </span>
                    )}
                  </div>
                  {orgLabel && <div className="project-card-meta">{orgLabel}</div>}
                  {p.description && (
                    <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: '.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '480px' }}>
                      {p.description}
                    </div>
                  )}
                </div>
                <div className="project-card-dates">
                  <div>{formatDate(p.start_date)}</div>
                  <div>– {formatDate(p.end_date)}</div>
                  <div style={{ marginTop: '.3rem', fontSize: '.78rem' }}>{p.member_count ?? 0} สมาชิก</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleCreated}
      />
    </>
  );
}
