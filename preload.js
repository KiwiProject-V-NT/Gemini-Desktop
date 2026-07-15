const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config Management
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Navigation commands (Renderer -> Main)
  goBack: (viewId) => ipcRenderer.send('webview-go-back', viewId),
  goForward: (viewId) => ipcRenderer.send('webview-go-forward', viewId),
  reloadView: (viewId) => ipcRenderer.send('webview-reload', viewId),

  // Window Controls (Renderer -> Main)
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  maximize: () => ipcRenderer.send('window-control', 'maximize'),
  close: () => ipcRenderer.send('window-control', 'close'),
  
  // Overlay Settings (Renderer -> Main)
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  setOverlayOpacity: (opacity) => ipcRenderer.send('set-overlay-opacity', opacity),
  toggleWindowLock: () => ipcRenderer.invoke('toggle-window-lock'),
  triggerScreenGlow: (service) => ipcRenderer.send('trigger-screen-glow', service),

  // Events (Main -> Renderer)
  onAlwaysOnTopChanged: (callback) => {
    const listener = (event, val) => callback(val);
    ipcRenderer.on('always-on-top-changed', listener);
    return () => ipcRenderer.removeListener('always-on-top-changed', listener);
  },
  onWindowLockChanged: (callback) => {
    const listener = (event, isLocked) => callback(isLocked);
    ipcRenderer.on('window-lock-changed', listener);
    return () => ipcRenderer.removeListener('window-lock-changed', listener);
  },
  onExecuteWebviewBack: (callback) => {
    const listener = (event, viewId) => callback(viewId);
    ipcRenderer.on('execute-webview-back', listener);
    return () => ipcRenderer.removeListener('execute-webview-back', listener);
  },
  onExecuteWebviewForward: (callback) => {
    const listener = (event, viewId) => callback(viewId);
    ipcRenderer.on('execute-webview-forward', listener);
    return () => ipcRenderer.removeListener('execute-webview-forward', listener);
  },
  onExecuteWebviewReload: (callback) => {
    const listener = (event, viewId) => callback(viewId);
    ipcRenderer.on('execute-webview-reload', listener);
    return () => ipcRenderer.removeListener('execute-webview-reload', listener);
  },

  // Logger
  log: (msg) => ipcRenderer.send('log', msg)
});
