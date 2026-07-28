// No imports needed for this page
async function init() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังเข้าสู่ระบบ…</div>';

  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    app.innerHTML = '<div class="login-page"><div class="login-card"><div class="alert alert-error">เข้าสู่ระบบล้มเหลว กรุณาลองใหม่</div><a href="login.html" class="btn btn-primary" style="display:block;margin-top:1rem;text-align:center">กลับไปหน้าเข้าสู่ระบบ</a></div></div>';
    return;
  }
  localStorage.setItem('token', token);
  window.location.href = 'dashboard.html';
}
init();
