import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose safe IPC methods here
  example: () => console.log('Preload is working'),
});
