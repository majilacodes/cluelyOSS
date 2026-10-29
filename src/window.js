const { app, BrowserWindow, screen, shell } = require('electron');
const path = require('path');

const WIDTH = 440;
const HEIGHT = 620;
const MARGIN = 24;

let win = null;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    minWidth: 360, // narrowest width where the header controls still fit
    minHeight: 280,
    x: workArea.x + workArea.width - WIDTH - MARGIN,
    y: workArea.y + MARGIN,
    frame: false,
    show: false,
    backgroundColor: '#161616',
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Excluded from screen shares, recordings and screenshots.
  win.setContentProtection(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pinOnTop();
  // Other apps (especially full-screen ones) can push the window down; keep reasserting.
  const timer = setInterval(pinOnTop, 3000);
  win.on('blur', pinOnTop);
  win.on('closed', () => {
    clearInterval(timer);
    win = null;
  });

  // Links in answers open in the default browser, never inside the overlay.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternal(url);
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', show);
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function pinOnTop() {
  if (win) win.setAlwaysOnTop(true, 'screen-saver');
}

function show() {
  if (!win) return;
  win.show();
  win.focus();
  // The app has no Dock icon, so it must take focus explicitly to accept typing.
  app.focus({ steal: true });
}

function hide() {
  if (win) win.hide();
}

function toggle() {
  if (win && win.isVisible()) hide();
  else show();
}

function send(channel, data) {
  if (win) win.webContents.send(channel, data);
}

function setOpacity(value) {
  if (win) win.setOpacity(value);
}

module.exports = { createWindow, show, hide, toggle, send, setOpacity };
