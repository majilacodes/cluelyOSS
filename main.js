const { app, globalShortcut, ipcMain, Menu } = require('electron');
const path = require('path');
const settings = require('./src/settings');
const { captureScreen } = require('./src/capture');
const { streamChat } = require('./src/openai');
const SYSTEM_PROMPT = require('./src/prompt');
const windows = require('./src/window');

// Pin the settings folder before renaming the app, so it doesn't move.
app.setPath('userData', path.join(app.getPath('appData'), 'cluelyOSS'));

// Disguise: appear as "Terminal" in Activity Monitor and the app switcher.
app.setName('Terminal');
process.title = 'Terminal';

// Only one copy runs; a second launch just reveals the existing window.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

app.on('second-instance', () => windows.show());

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  // Edit roles keep Cmd+C/V/A working in text fields; appMenu provides Cmd+Q.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));

  windows.createWindow();
  windows.setOpacity(settings.load().opacity);

  globalShortcut.register('CommandOrControl+Shift+S', () => captureInto('new'));
  globalShortcut.register('CommandOrControl+Shift+A', () => captureInto('add'));
  globalShortcut.register('CommandOrControl+Shift+V', () => windows.toggle());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

let capturing = false;

/**
 * Capture the screen and hand it to the window. mode 'new' starts a fresh
 * chat with the screenshot; 'add' attaches it to the current chat.
 */
async function captureInto(mode) {
  if (capturing) return;
  capturing = true;
  try {
    windows.hide();
    await new Promise((resolve) => setTimeout(resolve, 150)); // let the window disappear first
    windows.send('screenshot', { mode, dataUrl: await captureScreen() });
  } catch (error) {
    windows.send('capture-error', { error: error.message });
  } finally {
    capturing = false;
    windows.show();
  }
}

/** Convert the renderer's thread ({ role, text, images }) to Chat Completions messages. */
function toOpenAIMessages(thread) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...thread.map((m) => (m.role === 'assistant'
      ? { role: 'assistant', content: m.text }
      : {
        role: 'user',
        content: [
          { type: 'text', text: m.text },
          // 'high' detail so small on-screen text stays readable.
          ...(m.images || []).map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
        ],
      })),
  ];
}

ipcMain.handle('capture', (_event, mode) => captureInto(mode));
ipcMain.handle('hide', () => windows.hide());
ipcMain.handle('quit', () => app.quit());

ipcMain.handle('settings:get', () => {
  const { apiKey, model, reasoningEffort, opacity, usage } = settings.load();
  return { hasKey: Boolean(apiKey), model, reasoningEffort, opacity, usage, efforts: settings.EFFORTS };
});

ipcMain.handle('usage:reset', () => settings.resetUsage());

// Applied live while dragging; saved once the slider is released.
ipcMain.handle('opacity', (_event, value, persist) => {
  const opacity = Math.min(1, Math.max(0.3, Number(value) || 1));
  windows.setOpacity(opacity);
  if (persist) settings.save({ opacity });
});

ipcMain.handle('settings:save', (_event, patch) => {
  const update = {};
  // A blank key field means "keep the saved key".
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) update.apiKey = patch.apiKey.trim();
  if (typeof patch.model === 'string' && patch.model.trim()) update.model = patch.model.trim();
  if (settings.EFFORTS.includes(patch.reasoningEffort)) update.reasoningEffort = patch.reasoningEffort;
  settings.save(update);
});

const inFlight = new Map(); // request id -> AbortController

ipcMain.handle('ask', async (_event, id, thread) => {
  const { apiKey, model, reasoningEffort } = settings.load();
  if (!apiKey) return { error: 'Add your OpenAI API key in Settings.' };

  const controller = new AbortController();
  inFlight.set(id, controller);
  try {
    const { text, usage } = await streamChat({
      apiKey,
      model,
      reasoningEffort,
      messages: toOpenAIMessages(thread),
      onDelta: (delta) => windows.send('answer-chunk', { id, delta }),
      signal: controller.signal,
    });
    if (usage) settings.recordUsage(usage);
    return { answer: text };
  } catch (error) {
    if (controller.signal.aborted) return { cancelled: true, answer: error.partial || '' };
    return { error: error.message };
  } finally {
    inFlight.delete(id);
  }
});

ipcMain.handle('cancel', (_event, id) => {
  const controller = inFlight.get(id);
  if (controller) controller.abort();
});
