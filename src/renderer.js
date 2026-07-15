// DOM Elements
const geminiView = document.getElementById('gemini-view');
const servicesView = document.getElementById('services-view');
const servicesHub = document.getElementById('services-hub');
const btnHome = document.getElementById('btn-home');
const lockOverlay = document.getElementById('lock-overlay');

const tabGemini = document.getElementById('tab-gemini');
const tabServices = document.getElementById('tab-services');

const btnToggleServices = document.getElementById('btn-toggle-services');
const btnPin = document.getElementById('btn-pin');
const btnSettings = document.getElementById('btn-settings');

const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

const settingsPanel = document.getElementById('settings-panel');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');

let activeTab = 'gemini'; // 'gemini' or 'services'
let currentActiveService = 'gemini';
let appConfig = {};

// Helper to get active webview
function getActiveWebview() {
  return activeTab === 'gemini' ? geminiView : servicesView;
}

// Navigation button states management has been removed as buttons were removed from footer

// Active Service border theme helper
function applyThemeClass(serviceName) {
  document.body.classList.remove('theme-gemini', 'theme-gmail', 'theme-search', 'theme-notebooklm', 'theme-youtube', 'theme-translate', 'theme-calendar');
  document.body.classList.add(`theme-${serviceName}`);
}

// Switch between Gemini and Services Hub tabs
function switchTab(tabName) {
  if (activeTab === tabName) return;

  activeTab = tabName;
  if (tabName === 'gemini') {
    tabGemini.classList.add('active');
    tabServices.classList.remove('active');
    geminiView.style.display = 'flex';
    servicesView.style.display = 'none';
    servicesHub.style.display = 'none';
    btnHome.style.display = 'flex'; // Home button is always visible on Gemini tab

    applyThemeClass('gemini');
    window.electronAPI.triggerScreenGlow('gemini');
    currentActiveService = 'gemini';
  } else {
    tabServices.classList.add('active');
    tabGemini.classList.remove('active');
    geminiView.style.display = 'none';

    // If a service page is currently loaded in the webview, restore it directly
    let currentUrl = '';
    try {
      currentUrl = servicesView.getURL();
    } catch (e) {}

    if (currentUrl && currentUrl !== 'about:blank' && currentUrl !== '') {
      servicesView.style.display = 'flex';
      servicesHub.style.display = 'none';
      btnHome.style.display = 'flex'; // Show home button to return to selection hub
      
      // Determine service name from URL to play matching wave glow
      const match = ['gmail', 'search', 'notebooklm', 'youtube', 'translate', 'calendar'].find(srv => currentUrl.includes(srv));
      if (match) {
        applyThemeClass(match);
        currentActiveService = match;
        window.electronAPI.triggerScreenGlow(match);
      } else {
        applyThemeClass('search');
        currentActiveService = 'search';
        window.electronAPI.triggerScreenGlow('search');
      }
    } else {
      // Show the Selection Hub Dashboard Grid
      servicesView.style.display = 'none';
      servicesHub.style.display = 'flex';
      btnHome.style.display = 'none'; // Hide home button if already on hub selection grid
      
      applyThemeClass('gemini'); // Neutral border glow for Hub
      window.electronAPI.triggerScreenGlow('search'); // Play a colorful default glow wave
      currentActiveService = 'hub';
    }
  }
}

// Sync UI settings with loaded configuration object
function syncConfigUI(config) {
  appConfig = config;

  // Set selected radio card for DNS
  const dnsRadio = document.querySelector(`input[name="dns-mode"][value="${config.dnsMode}"]`);
  if (dnsRadio) {
    dnsRadio.checked = true;
  }

  // Set pin active state
  if (config.alwaysOnTop) {
    btnPin.classList.add('active');
    document.body.classList.add('overlay-active');
  } else {
    btnPin.classList.remove('active');
    document.body.classList.remove('overlay-active');
  }

  // Set opacity slider value
  opacitySlider.value = config.overlayOpacity;
  opacityValue.textContent = `${Math.round(config.overlayOpacity * 100)}%`;
}

// Load settings from config at startup
async function initializeApp() {
  try {
    const config = await window.electronAPI.getConfig();
    syncConfigUI(config);
  } catch (e) {
    window.electronAPI.log(`Error initializing app configurations: ${e.message}`);
  }
}

// Event Listeners for Webview DOM readiness and navigation
const setupWebviewListeners = (view) => {
  view.addEventListener('dom-ready', () => {
    const url = view.getURL();
    // Target Google Account sign-in, Workspace setup, and Google Workspace domains (which are bright white)
    if (
      url.includes('accounts.google') || 
      url.includes('workspace.google') || 
      url.includes('google.com/accounts')
    ) {
      view.insertCSS(`
        html, body, #yDmH0d, .opti, .main {
          background-color: #080710 !important;
          color: #f3f3fb !important;
        }
        /* Containers, presentations, login boxes */
        main, div[role="presentation"], div[role="main"], .card, .content, .yBox, .fO9Jee {
          background-color: #0c0b19 !important;
          color: #f3f3fb !important;
          border-color: rgba(255,255,255,0.08) !important;
        }
        /* Input fields and inputs */
        input, select, textarea {
          background-color: #100f1e !important;
          color: #f3f3fb !important;
          border-color: rgba(255,255,255,0.12) !important;
        }
        /* Standard text, labels, and paragraph spans */
        span, h1, h2, h3, p, label, a, div:not([role="presentation"]):not([role="main"]) {
          color: #f3f3fb !important;
        }
        /* Standard Google buttons */
        button, [role="button"], .VfPpkd-LgbsSe {
          background-color: #1b1932 !important;
          color: #f3f3fb !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        /* SVG fills in icons */
        svg {
          fill: #f3f3fb !important;
        }
        /* Invert Google Logo colors to fit dark theme */
        img[src*="logo"], img[src*="google"] {
          filter: invert(1) hue-rotate(180deg) !important;
        }
      `);
    }
  });

  view.addEventListener('new-window', (e) => {
    window.electronAPI.log(`Webview requested new window: ${e.url}`);
  });
};

setupWebviewListeners(geminiView);
setupWebviewListeners(servicesView);

// Tab clicks
tabGemini.addEventListener('click', () => switchTab('gemini'));
tabServices.addEventListener('click', () => switchTab('services'));

// Unified Home Button trigger
btnHome.addEventListener('click', () => {
  if (activeTab === 'gemini') {
    geminiView.src = 'https://gemini.google.com';
    window.electronAPI.triggerScreenGlow('gemini');
  } else {
    // Return to Services Selection Hub grid
    servicesView.src = 'about:blank';
    servicesView.style.display = 'none';
    servicesHub.style.display = 'flex';
    btnHome.style.display = 'none'; // Hide home button if already on grid
    applyThemeClass('gemini');
    currentActiveService = 'hub';
    window.electronAPI.triggerScreenGlow('search');
  }
});

// Bind Google Services Hub selection cards click events
document.querySelectorAll('.hub-card').forEach(card => {
  card.addEventListener('click', () => {
    const service = card.getAttribute('data-service');
    const url = card.getAttribute('data-url');

    servicesView.src = url;
    servicesHub.style.display = 'none';
    servicesView.style.display = 'flex';
    btnHome.style.display = 'flex'; // Show home button to return to hub selector

    applyThemeClass(service);
    currentActiveService = service;
    window.electronAPI.triggerScreenGlow(service);
  });
});

// Toggle bottom bar services visibility
btnToggleServices.addEventListener('click', () => {
  document.body.classList.toggle('services-hidden');
});

// Window controls click events
btnMinimize.addEventListener('click', () => window.electronAPI.minimize());
btnMaximize.addEventListener('click', () => window.electronAPI.maximize());
btnClose.addEventListener('click', () => window.electronAPI.close());

// Always on Top (Pin/Overlay) click event
btnPin.addEventListener('click', async () => {
  const isPinned = await window.electronAPI.toggleAlwaysOnTop();
  if (isPinned) {
    btnPin.classList.add('active');
    document.body.classList.add('overlay-active');
  } else {
    btnPin.classList.remove('active');
    document.body.classList.remove('overlay-active');
  }
});

// Settings button triggers panel opening
btnSettings.addEventListener('click', () => {
  settingsPanel.classList.add('open');
});

// Close settings panel button
btnCloseSettings.addEventListener('click', () => {
  settingsPanel.classList.remove('open');
});

// Opacity slider live updates
opacitySlider.addEventListener('input', (e) => {
  const opacityVal = parseFloat(e.target.value);
  opacityValue.textContent = `${Math.round(opacityVal * 100)}%`;
  // Communicate opacity change to main process in real-time
  window.electronAPI.setOverlayOpacity(opacityVal);
});

// Save settings button inside panel
btnSaveSettings.addEventListener('click', async () => {
  const selectedDns = document.querySelector('input[name="dns-mode"]:checked').value;
  const selectedOpacity = parseFloat(opacitySlider.value);

  const updatedConfig = {
    dnsMode: selectedDns,
    overlayOpacity: selectedOpacity
  };

  try {
    const finalConfig = await window.electronAPI.saveConfig(updatedConfig);
    syncConfigUI(finalConfig);
    settingsPanel.classList.remove('open');
  } catch (e) {
    window.electronAPI.log(`Failed to save settings: ${e.message}`);
  }
});

// Listeners from Main process for tray and global actions
window.electronAPI.onAlwaysOnTopChanged((alwaysOnTop) => {
  if (alwaysOnTop) {
    btnPin.classList.add('active');
    document.body.classList.add('overlay-active');
  } else {
    btnPin.classList.remove('active');
    document.body.classList.remove('overlay-active');
  }
  appConfig.alwaysOnTop = alwaysOnTop;
});

// Listens to global lock hotkey Ctrl+Shift+L click-through state changes
window.electronAPI.onWindowLockChanged((isLocked) => {
  if (isLocked) {
    lockOverlay.style.display = 'flex';
    document.body.classList.add('window-locked');
  } else {
    lockOverlay.style.display = 'none';
    document.body.classList.remove('window-locked');
  }
});

window.electronAPI.onExecuteWebviewBack(() => {
  const activeView = getActiveWebview();
  if (activeView && activeView.canGoBack()) {
    activeView.goBack();
  }
});

window.electronAPI.onExecuteWebviewForward(() => {
  const activeView = getActiveWebview();
  if (activeView && activeView.canGoForward()) {
    activeView.goForward();
  }
});

window.electronAPI.onExecuteWebviewReload(() => {
  const activeView = getActiveWebview();
  if (activeView) {
    activeView.reload();
  }
});

// Initialize on load
initializeApp();
