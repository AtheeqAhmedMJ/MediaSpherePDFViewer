const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getPdfLibrary: () => ipcRenderer.invoke('get-pdf-library'),
  savePdfLibrary: (library) => ipcRenderer.invoke('save-pdf-library', library),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  saveBookmarks: (bookmarks) => ipcRenderer.invoke('save-bookmarks', bookmarks)
});