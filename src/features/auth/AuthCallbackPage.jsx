import { useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import Spinner from '../../shared/Spinner';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) return;
    localStorage.setItem('token', token);
    navigate('/dashboard', { replace: true });
  }, [token, navigate]);

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="alert alert-error">เข้าสู่ระบบล้มเหลว กรุณาลองใหม่</div>
          <Link
            to="/login"
            className="btn btn-primary"
            style={{ display: 'block', marginTop: '1rem', textAlign: 'center' }}
          >
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return <Spinner text="กำลังเข้าสู่ระบบ…" />;
}
