const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startTask: (fileData) => ipcRenderer.send('start-automation', fileData),
    startBatchTask: (filesArray) => ipcRenderer.send('start-batch-automation', filesArray),
    startReset: () => ipcRenderer.send('start-reset'),
    toggleView: (show) => ipcRenderer.send('toggle-view', show),
    refreshGallery: () => ipcRenderer.send('refresh-gallery'),
    openFileLocation: (filePath) => ipcRenderer.send('open-file-location', filePath),
    onGalleryData: (callback) => ipcRenderer.on('gallery-data', (_event, data) => callback(data)),
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, message) => callback(message)),
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (_event, data) => callback(data)),

    // 🚀 Live Online Auto-Update Bridges
    checkForUpdate: (isManual = false) => ipcRenderer.send('check-for-update', isManual),
    startLiveUpdate: () => ipcRenderer.send('start-live-update'),
    onAppVersion: (callback) => ipcRenderer.on('app-version', (_event, version) => callback(version)),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status))
});