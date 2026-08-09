const API = 'https://stockrapido-api.vercel.app';
const loginView = document.querySelector('#login-view');
const connectedView = document.querySelector('#connected-view');
const errorBox = document.querySelector('#error');
const progress = document.querySelector('#progress');
const counter = document.querySelector('#counter strong');
const syncButton = document.querySelector('#sync');

function error(message = '') { errorBox.hidden = !message; errorBox.textContent = message; }
async function render() {
  const stored = await chrome.storage.local.get(['accessToken', 'email', 'syncStatus']);
  loginView.hidden = !!stored.accessToken; connectedView.hidden = !stored.accessToken;
  document.querySelector('#connected-email').textContent = stored.email || 'StockRápido';
  if (stored.syncStatus) { progress.textContent = stored.syncStatus.message; counter.textContent = String(stored.syncStatus.products || 0); syncButton.disabled = stored.syncStatus.status === 'running'; }
}
document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); error('');
  const email = document.querySelector('#email').value.trim(); const password = document.querySelector('#password').value;
  try {
    const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.accessToken) throw new Error(payload.message || 'No se pudo iniciar sesión.');
    await chrome.storage.local.set({ accessToken: payload.accessToken, email, syncStatus: { status: 'idle', message: 'Listo para sincronizar.' } });
    await render();
  } catch (err) { error(err instanceof Error ? err.message : String(err)); }
});
syncButton.addEventListener('click', async () => { error(''); syncButton.disabled = true; counter.textContent = '0'; progress.textContent = 'Iniciando…'; await chrome.runtime.sendMessage({ type: 'START_SYNC' }); });
document.querySelector('#logout').addEventListener('click', async () => { await chrome.storage.local.remove(['accessToken', 'email', 'syncStatus']); await render(); });
chrome.runtime.onMessage.addListener((message) => { if (message?.type !== 'SYNC_PROGRESS') return; progress.textContent = message.payload.message; counter.textContent = String(message.payload.products || 0); syncButton.disabled = message.payload.status === 'running'; });
chrome.storage.onChanged.addListener((changes) => { if (changes.syncStatus) render().catch(() => {}); });
render().catch((err) => error(String(err)));
