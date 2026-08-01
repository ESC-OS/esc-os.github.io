export function showError(msg) {
  const el = document.createElement('div');
  el.className = 'alert alert-error toast-error';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
