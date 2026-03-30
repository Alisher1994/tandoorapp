const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('talablarDesktop', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  restartAgent: () => ipcRenderer.invoke('agent:restart'),
  openDataDir: () => ipcRenderer.invoke('system:open-data-dir'),
  closeSettingsWindow: () => ipcRenderer.invoke('window:close-settings')
});
