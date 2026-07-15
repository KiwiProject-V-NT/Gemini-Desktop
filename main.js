const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, desktopCapturer, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');

// Default config structure
const defaultConfig = {
  dnsMode: 'doh',
  alwaysOnTop: false,
  overlayOpacity: 0.9,
  window: {
    width: 1200,
    height: 800,
    isMaximized: false
  }
};

let config = { ...defaultConfig };

// Load configurations
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      config = { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    } else {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Failed to load configuration:', e);
  }
  return config;
}

// Save configurations
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save configuration:', e);
  }
}

let mainWindow = null;
let splashWindow = null;
let tray = null;
let isQuitting = false;
let isLocked = false; // click-through lock state for overlay mode

// Create Launch Splash Screen
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 450,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    skipTaskbar: true,
    icon: path.join(__dirname, 'src', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'src', 'splash.html'));
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// Spawns a temporary full-screen transparent window that draws a border glow wave
function triggerScreenGlow(colorScheme) {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.bounds;

    const glowWindow = new BrowserWindow({
      width: width,
      height: height,
      x: x,
      y: y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    glowWindow.setIgnoreMouseEvents(true);
    
    // Convert path to file URL correctly for Windows
    const glowPath = path.join(__dirname, 'src', 'screen-glow.html');
    glowWindow.loadURL(`file:///${glowPath.replace(/\\/g, '/')}?color=${colorScheme}`);

    // Auto-close glow overlay after 3.1 seconds (matches screen-glow animation cycle)
    setTimeout(() => {
      if (glowWindow && !glowWindow.isDestroyed()) {
        glowWindow.close();
      }
    }, 3100);
  } catch (err) {
    console.error('Failed to trigger screen glow animation:', err);
  }
}

// Proxy Server Variables
let proxyServer = null;
let proxyPort = 0;

// Base64 Gemini-like blue/purple glowing tray icon (32x32 PNG)
const trayIconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAACVklEQVRYw8WXzU4CMRSFv5mOhhATEnVh4sa4ceeGxMTEP7Ev4cr4EO5cGBM37lyYGBNxIQoSEgMhZnyOhZaWthSGlpYzeDqd3p5zb+9pWxH/vKyGz4d4B67V8nkeT2+hB0QEnD+Yw7o9H6h4fCegB0S0mN3r+2bPF9XmO546QOqF1vE67WPLfI33W9UBbH5Vl7m62ZzTtrrZfF3dAPkUeN6C5w3Gj9YnBcg9H+tG5xud96r4O/UBrH5ZgD2c/Zt9qgL44n2v94P+fG0A619NfK4+4V/WjWpADfKq/j+vX6sNYOOrZgG/K4951PmqALXqY32p5wG2f6M4B5wP4X/6l3n6X2vAKfG++pP56Pz7nQ90XmvAO+Ltr8oB3mueN5rniwFf77W+43mj9V0D3hPvq8b5C32g9cWArvdeR8v21yq/mB/Wf1U9r1n4n/tZqA+M059Vf3/Vf6zP/Sw4/7F+p/H7W/U1a/y6/W2195TzD/uzau9p88/6uD4Fzm/sz4rznf1N877UexJvF3O+sz8r7nfae/Kz+m6r93wP5FPe9/l5Yh4oP6d6p3+L9/3iPXvA/fF+3s1T+4C2j7QfF/c13hfv58V9TftB+9lyPqfvVQD3e27rV+oDqH3N5/T7tW0s/xGfn30q+4O6rT1c077y18d8rts80Vl5X/n44/7f5mP99nBN+4u3sW4n7x99D+6H7G/r+w1+xMeym1/gGz2W1fxn34N4P7PffV/Z/x8yB43zT94d+wz/rBvW58Yh+xn/+j5wP9vIu/3nEAAAAABJRU5ErkJggg==';

// Start Local Proxy using Node net/http/dns resolving through 111.88.96.50
function startProxyServer() {
  return new Promise((resolve, reject) => {
    if (proxyServer) {
      resolve(proxyPort);
      return;
    }

    const http = require('http');
    const net = require('net');
    const dns = require('dns');

    const dnsResolver = new dns.Resolver();
    // Use xbox-dns.ru DNS IPs
    dnsResolver.setServers(['111.88.96.50', '111.88.96.51']);

    function resolveHost(hostname) {
      return new Promise((res) => {
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          res('127.0.0.1');
          return;
        }

        // Try using xbox-dns
        dnsResolver.resolve4(hostname, (err, addresses) => {
          if (!err && addresses && addresses.length > 0) {
            res(addresses[0]);
          } else {
            // Fall back to local default DNS resolving
            dns.lookup(hostname, (err2, address) => {
              if (!err2 && address) {
                res(address);
              } else {
                res(hostname); // Raw fallback
              }
            });
          }
        });
      });
    }

    proxyServer = http.createServer((req, res) => {
      try {
        const urlObj = new URL(req.url);
        const hostname = urlObj.hostname;
        const port = urlObj.port || 80;

        resolveHost(hostname).then((ip) => {
          const options = {
            hostname: ip,
            port: port,
            path: urlObj.pathname + urlObj.search,
            method: req.method,
            headers: req.headers
          };

          const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          });

          proxyReq.on('error', () => {
            res.writeHead(502);
            res.end();
          });

          req.pipe(proxyReq);
        });
      } catch (e) {
        res.writeHead(400);
        res.end();
      }
    });

    proxyServer.on('connect', (req, clientSocket, head) => {
      const parts = req.url.split(':');
      const hostname = parts[0];
      const port = parseInt(parts[1] || '443');

      resolveHost(hostname).then((ip) => {
        const serverSocket = net.connect(port, ip, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          serverSocket.write(head);
          clientSocket.pipe(serverSocket);
          serverSocket.pipe(clientSocket);
        });

        serverSocket.on('error', () => {
          clientSocket.end();
        });
        clientSocket.on('error', () => {
          serverSocket.end();
        });
      }).catch(() => {
        clientSocket.end();
      });
    });

    proxyServer.listen(0, '127.0.0.1', () => {
      proxyPort = proxyServer.address().port;
      console.log(`Local Smart DNS Proxy running on port ${proxyPort}`);
      resolve(proxyPort);
    });

    proxyServer.on('error', (err) => {
      reject(err);
    });
  });
}

// Apply DNS configuration based on current mode
function applyDnsConfig(mode) {
  if (mode === 'doh') {
    app.configureHostResolver({
      secureDnsMode: 'secure',
      secureDnsServerUris: ['https://xbox-dns.ru/dns-query']
    });
    session.defaultSession.setProxy({ proxyRules: '' });
    console.log('Applied Native DNS-over-HTTPS (https://xbox-dns.ru/dns-query)');
  } else if (mode === 'proxy') {
    app.configureHostResolver({
      secureDnsMode: 'off'
    });
    startProxyServer().then((port) => {
      session.defaultSession.setProxy({
        proxyRules: `http://127.0.0.1:${port}`
      });
      console.log(`Applied Local DNS Proxy (111.88.96.50) on port ${port}`);
    }).catch((err) => {
      console.error('Failed to apply local proxy DNS, falling back to system:', err);
      applyDnsConfig('system');
    });
  } else {
    // 'system'
    app.configureHostResolver({
      secureDnsMode: 'off'
    });
    session.defaultSession.setProxy({ proxyRules: '' });
    console.log('Applied System DNS (No bypass)');
  }
  
  if (tray) {
    updateTrayMenu();
  }
}

// Create Main Window
function createWindow() {
  loadConfig();

  // Apply default UserAgent globally to bypass Google Sign-In restrictions (Firefox UA bypasses secure browser blocks)
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
  app.userAgentFallback = customUserAgent;
  session.defaultSession.setUserAgent(customUserAgent);

  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    x: config.window.x,
    y: config.window.y,
    frame: false, // Frameless window for premium design
    show: false, // Hide window initially to let splash load
    backgroundColor: '#0a0a16', // Sleek space background color
    alwaysOnTop: config.alwaysOnTop,
    opacity: config.alwaysOnTop ? config.overlayOpacity : 1.0,
    icon: path.join(__dirname, 'src', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true // Required for embedding Gemini/Gmail
    }
  });

  if (config.window.isMaximized) {
    mainWindow.maximize();
  }

  // Load local HTML layout shell
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Once main window is parsed and ready, transition from splash screen
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      if (mainWindow) {
        mainWindow.show();
        // Trigger initial screen border wave in Gemini theme
        triggerScreenGlow('gemini');
      }
    }, 3000);
  });

  // Track window size and position persistence
  let saveBoundsTimeout;
  function saveWindowBounds() {
    clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const bounds = mainWindow.getBounds();
        config.window.width = bounds.width;
        config.window.height = bounds.height;
        config.window.x = bounds.x;
        config.window.y = bounds.y;
        config.window.isMaximized = mainWindow.isMaximized();
        saveConfig();
      }
    }, 1000);
  }

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // Close to tray behavior
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Apply DNS Config on session load
  applyDnsConfig(config.dnsMode);

  // Register Display Media Handler for Screen Sharing (Gemini "seeing the screen")
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      // Find the screen source first, default to first available
      const screenSource = sources.find(src => src.id.startsWith('screen:') || src.name.toLowerCase().includes('screen')) || sources[0];
      if (screenSource) {
        callback({ video: screenSource, audio: 'loopback' });
      } else {
        callback({});
      }
    }).catch((err) => {
      console.error('Error listing screen sharing sources:', err);
      callback({});
    });
  });

  // Auto-grant permissions (Mic, notifications, geolocation, screen share)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'geolocation', 'notifications', 'midiSysex', 'openExternal', 'fullscreen'];
    if (allowed.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, origin) => {
    const allowed = ['media', 'geolocation', 'notifications', 'midiSysex', 'openExternal', 'fullscreen'];
    return allowed.includes(permission);
  });
}

// Prevent white flashes and force new windows/tabs to load inside the same webview
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    // Intercept target="_blank" links and window.open calls to force navigation in same view
    contents.setWindowOpenHandler((details) => {
      contents.loadURL(details.url);
      return { action: 'deny' };
    });
  }
});

// Build and update Tray Menu dynamically
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Gemini Desktop', enabled: false },
    { type: 'separator' },
    { 
      label: mainWindow && mainWindow.isVisible() ? 'Скрыть окно' : 'Показать окно', 
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      } 
    },
    { 
      label: 'Поверх всех окон', 
      type: 'checkbox', 
      checked: config.alwaysOnTop,
      click: () => {
        toggleAlwaysOnTop();
      } 
    },
    { type: 'separator' },
    { label: 'Обход ограничений (DNS):', enabled: false },
    { 
      label: 'Системный DNS (Без обхода)', 
      type: 'radio', 
      checked: config.dnsMode === 'system',
      click: () => {
        config.dnsMode = 'system';
        saveConfig();
        applyDnsConfig('system');
        notifyRendererConfig();
      }
    },
    { 
      label: 'Secure DNS - DoH (xbox-dns.ru)', 
      type: 'radio', 
      checked: config.dnsMode === 'doh',
      click: () => {
        config.dnsMode = 'doh';
        saveConfig();
        applyDnsConfig('doh');
        notifyRendererConfig();
      }
    },
    { 
      label: 'Локальный DNS Прокси (111.88.96.50)', 
      type: 'radio', 
      checked: config.dnsMode === 'proxy',
      click: () => {
        config.dnsMode = 'proxy';
        saveConfig();
        applyDnsConfig('proxy');
        notifyRendererConfig();
      }
    },
    { type: 'separator' },
    { 
      label: 'Выход', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Initialize Tray Icon
function createTray() {
  const iconPath = path.join(__dirname, 'src', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  tray.setToolTip('Gemini Desktop App');
  
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  updateTrayMenu();
}

// Toggle Always-on-Top / Overlay Mode
function toggleAlwaysOnTop() {
  if (!mainWindow) return false;

  config.alwaysOnTop = !config.alwaysOnTop;
  saveConfig();

  mainWindow.setAlwaysOnTop(config.alwaysOnTop);
  // Apply opacity when always-on-top is active to function as translucent overlay
  mainWindow.setOpacity(config.alwaysOnTop ? config.overlayOpacity : 1.0);
  
  // Reset window lock click-through if overlay mode is deactivated
  if (!config.alwaysOnTop && isLocked) {
    isLocked = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send('window-lock-changed', false);
  }
  
  updateTrayMenu();
  notifyRendererConfig();
  
  return config.alwaysOnTop;
}

// Send config updates to Renderer process
function notifyRendererConfig() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('always-on-top-changed', config.alwaysOnTop);
  }
}

// Toggle overlay click-through lock state
function toggleWindowLock() {
  if (!mainWindow) return;
  if (!config.alwaysOnTop) return; // Only lock when pinned in overlay mode

  isLocked = !isLocked;
  mainWindow.setIgnoreMouseEvents(isLocked, { forward: isLocked });
  mainWindow.webContents.send('window-lock-changed', isLocked);
}

// Electron lifecycle hooks
app.whenReady().then(() => {
  createSplash(); // Show splash screen at start
  createWindow(); // Pre-load main window (hidden)
  createTray();

  // Global hotkey to lock/unlock mouse clicks in overlay mode
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    toggleWindowLock();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplash();
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC communication handlers
ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('toggle-always-on-top', () => {
  return toggleAlwaysOnTop();
});

ipcMain.handle('save-config', (event, updatedConfig) => {
  config = { ...config, ...updatedConfig };
  saveConfig();
  
  // Re-apply DNS config if changed
  applyDnsConfig(config.dnsMode);
  
  // Apply always-on-top state
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(config.alwaysOnTop);
    mainWindow.setOpacity(config.alwaysOnTop ? config.overlayOpacity : 1.0);
  }
  
  updateTrayMenu();
  notifyRendererConfig();
  
  return config;
});

ipcMain.handle('toggle-window-lock', () => {
  toggleWindowLock();
  return isLocked;
});

ipcMain.on('trigger-screen-glow', (event, service) => {
  triggerScreenGlow(service);
});

// Window Control actions
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  
  if (action === 'minimize') {
    mainWindow.minimize();
  } else if (action === 'maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  } else if (action === 'close') {
    mainWindow.hide(); // Minimize to tray
  }
});

// Opacity slider handler from settings panel
ipcMain.on('set-overlay-opacity', (event, opacity) => {
  config.overlayOpacity = parseFloat(opacity);
  saveConfig();
  if (mainWindow && config.alwaysOnTop) {
    mainWindow.setOpacity(config.overlayOpacity);
  }
});

// Navigation command handlers for webviews
ipcMain.on('webview-go-back', (event, viewId) => {
  if (mainWindow) {
    mainWindow.webContents.send('execute-webview-back', viewId);
  }
});

ipcMain.on('webview-go-forward', (event, viewId) => {
  if (mainWindow) {
    mainWindow.webContents.send('execute-webview-forward', viewId);
  }
});

ipcMain.on('webview-reload', (event, viewId) => {
  if (mainWindow) {
    mainWindow.webContents.send('execute-webview-reload', viewId);
  }
});

// Main process logger
ipcMain.on('log', (event, msg) => {
  console.log(`[Renderer Log] ${msg}`);
});
