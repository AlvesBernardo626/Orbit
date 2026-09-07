import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('orbit', {
  auth: (action: string, data?: unknown) => ipcRenderer.invoke('auth', action, data),
  capabilities: () => ipcRenderer.invoke('capture:capabilities'),
  sources: () => ipcRenderer.invoke('capture:sources'),
  selectSource: (id: string, audio: boolean) => ipcRenderer.invoke('capture:select', id, audio),
});
