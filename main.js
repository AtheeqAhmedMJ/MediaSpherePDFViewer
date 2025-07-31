const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), 
      contextIsolation: true,                      
      nodeIntegration: false,                      
      enableRemoteModule: false                    
    },
    backgroundColor: '#121212'
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle file reading
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    return data.toString('base64');
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

// Check if file exists
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths.map(filePath => ({
        path: filePath,
        name: path.basename(filePath)
      }));
    }
    return [];
  } catch (error) {
    console.error('Error opening file dialog:', error);
    return [];
  }
});

// Load PDF library from persistent storage
ipcMain.handle('get-pdf-library', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const libraryPath = path.join(userDataPath, 'pdf-library.json');
    
    try {
      const data = await fs.promises.readFile(libraryPath, 'utf8');
      const library = JSON.parse(data);
      
      // Filter out files that no longer exist
      const validatedLibrary = [];
      for (const item of library) {
        try {
          await fs.promises.access(item.path, fs.constants.F_OK);
          validatedLibrary.push(item);
        } catch {
          // File no longer exists, skip it
        }
      }
      
      return validatedLibrary;
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        return [];
      }
      throw err;
    }
  } catch (error) {
    console.error('Error loading PDF library:', error);
    return [];
  }
});

// Save PDF library to persistent storage
ipcMain.handle('save-pdf-library', async (event, library) => {
  try {
    const userDataPath = app.getPath('userData');
    const libraryPath = path.join(userDataPath, 'pdf-library.json');
    await fs.promises.writeFile(libraryPath, JSON.stringify(library));
    return true;
  } catch (error) {
    console.error('Error saving PDF library:', error);
    return false;
  }
});

// Bookmarks persistence
ipcMain.handle('get-bookmarks', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const bookmarksPath = path.join(userDataPath, 'bookmarks.json');
    console.log('[IPC] get-bookmarks called, path:', bookmarksPath);
    try {
      const data = await fs.promises.readFile(bookmarksPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[IPC] bookmarks.json does not exist, returning empty object');
        return {};
      }
      console.error('[IPC] Error reading bookmarks.json:', err);
      throw err;
    }
  } catch (error) {
    console.error('[IPC] Error loading bookmarks:', error);
    return {};
  }
});
ipcMain.handle('save-bookmarks', async (event, bookmarks) => {
  try {
    const userDataPath = app.getPath('userData');
    const bookmarksPath = path.join(userDataPath, 'bookmarks.json');
    console.log('[IPC] save-bookmarks called, path:', bookmarksPath, 'data:', bookmarks);
    await fs.promises.writeFile(bookmarksPath, JSON.stringify(bookmarks));
    return true;
  } catch (error) {
    console.error('[IPC] Error saving bookmarks:', error);
    return false;
  }
});