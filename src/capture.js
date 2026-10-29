const { app, desktopCapturer, screen, shell, systemPreferences } = require('electron');
const { execFileSync } = require('child_process');

// OpenAI scales images to fit 2048px anyway, so anything larger only slows the upload.
const MAX_SIDE = 2048;
const JPEG_QUALITY = 85;
const PRIVACY_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

/** Capture the display under the cursor as a JPEG data URL, at most MAX_SIDE px on its long side. */
async function captureScreen() {
  // Without permission macOS returns a wallpaper-only image instead of failing, so check first.
  // 'not-determined' falls through: the capture attempt below makes macOS show its prompt.
  if (['denied', 'restricted'].includes(systemPreferences.getMediaAccessStatus('screen'))) {
    throw permissionError();
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };

  // The first capture after launch sometimes comes back empty (seen on macOS 15); retry briefly.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (source && !source.thumbnail.isEmpty()) return toUploadDataUrl(source.thumbnail);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') throw permissionError();
  throw new Error('Screen capture came back empty. Please try again.');
}

/** Downscale a NativeImage to at most MAX_SIDE px and encode it as a JPEG data URL. */
function toUploadDataUrl(image) {
  const { width, height } = image.getSize();
  let scaled = image;
  if (Math.max(width, height) > MAX_SIDE) {
    scaled = width >= height
      ? image.resize({ width: MAX_SIDE, quality: 'best' })
      : image.resize({ height: MAX_SIDE, quality: 'best' });
  }
  return `data:image/jpeg;base64,${scaled.toJPEG(JPEG_QUALITY).toString('base64')}`;
}

/** Open the Screen Recording settings and explain which app needs the permission. */
function permissionError() {
  shell.openExternal(PRIVACY_PANE);
  const holder = permissionHolder();
  return new Error(
    `Screen recording is off for ${holder}. In System Settings > Privacy & Security > `
    + `Screen & System Audio Recording, turn on ${holder} (use + to add it if it isn't listed), `
    + `then quit and reopen ${holder}.`,
  );
}

/**
 * The app macOS checks for screen access: cluelyOSS itself when packaged, or the
 * terminal/editor that ran `npm start` (found by walking up the process tree).
 */
function permissionHolder() {
  if (app.isPackaged) return 'cluelyOSS';
  try {
    let pid = process.ppid;
    for (let i = 0; i < 20 && pid > 1; i += 1) {
      const out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8' }).trim();
      const [, ppid, command] = out.match(/^(\d+)\s+(.*)$/) || [];
      const bundle = (command || '').match(/([^/]+)\.app\//);
      if (bundle && bundle[1] !== 'Electron') return bundle[1];
      pid = Number(ppid);
    }
  } catch {
    // Fall back to a generic name below.
  }
  return 'the app you started cluelyOSS from';
}

module.exports = { captureScreen, toUploadDataUrl };
