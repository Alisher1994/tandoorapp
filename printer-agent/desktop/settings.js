const serverInput = document.getElementById('serverUrl');
const tokenInput = document.getElementById('agentToken');
const errorBox = document.getElementById('errorBox');
const saveBtn = document.getElementById('saveBtn');
const closeBtn = document.getElementById('closeBtn');
const openDirBtn = document.getElementById('openDirBtn');

function setError(message) {
  errorBox.textContent = String(message || '').trim();
}

async function loadInitialSettings() {
  try {
    const settings = await window.talablarDesktop.loadSettings();
    serverInput.value = settings?.serverUrl || '';
    tokenInput.value = settings?.agentToken || '';
  } catch (error) {
    setError('Не удалось загрузить текущие настройки.');
  }
}

async function saveSettings() {
  setError('');
  saveBtn.disabled = true;
  try {
    const result = await window.talablarDesktop.saveSettings({
      serverUrl: serverInput.value,
      agentToken: tokenInput.value
    });
    if (!result?.ok) {
      setError(result?.error || 'Ошибка сохранения.');
      return;
    }
    await window.talablarDesktop.closeSettingsWindow();
  } catch (error) {
    setError('Ошибка сохранения настроек.');
  } finally {
    saveBtn.disabled = false;
  }
}

saveBtn.addEventListener('click', saveSettings);
closeBtn.addEventListener('click', async () => {
  await window.talablarDesktop.closeSettingsWindow();
});
openDirBtn.addEventListener('click', async () => {
  await window.talablarDesktop.openDataDir();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveSettings();
  }
});

loadInitialSettings();
