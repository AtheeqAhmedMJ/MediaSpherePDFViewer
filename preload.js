const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openFile: () => ipcRenderer.invoke('open-file')
});
