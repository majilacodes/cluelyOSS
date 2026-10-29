# cluelyOSS

A small always-on-top AI assistant for macOS. Ask a question, optionally with screenshots of your screen, and the answer streams in. Powered by OpenAI (GPT-5 mini by default).

## Run

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

On first launch, Settings opens so you can paste your OpenAI API key.

Screenshots need screen recording permission (System Settings > Privacy & Security > Screen & System Audio Recording). When you run `npm start`, macOS checks the app you launched it from (Terminal, Cursor, VS Code, etc.), so that app is the one to enable. A built `.app` gets its own entry. If permission is off, cluelyOSS names the app to enable and opens that settings page.

To build a `.dmg`: `npm run build` (output in `dist/`).

## Use

1. Type a question and press Enter, or
2. Press ⌘⇧S to start a new chat with a screenshot, add a message (or leave it empty to answer what is on screen), and press Enter.
3. Press ⌘⇧A (or the "+ Screenshot" button) to add more screenshots to the current chat, e.g. a question spanning two pages.
4. Follow-up messages keep the conversation and its screenshots. "New" starts over.

| Action | Shortcut |
|---|---|
| New chat with a screenshot | ⌘⇧S |
| Add a screenshot to this chat | ⌘⇧A |
| Show / hide window | ⌘⇧V |
| Send / new line | Enter / Shift+Enter |
| Quit (window focused) | ⌘Q |

⌘⇧S, ⌘⇧A and ⌘⇧V are global shortcuts, so they override those keys in other apps while cluelyOSS is running.

## Settings

The gear button sets the API key, model and reasoning effort (`minimal`, `low`, `medium`, `high`). They are stored in `~/Library/Application Support/cluelyOSS/settings.json` with owner-only permissions.

The answer style lives in [src/prompt.js](src/prompt.js).

## Behavior

1. The window is excluded from screen sharing and recordings.
2. It stays above other windows, including full-screen apps.
3. It has no Dock icon and shows up as "Terminal" in Activity Monitor.

## Project layout

| File | Purpose |
|---|---|
| `main.js` | App lifecycle, shortcuts, IPC |
| `preload.js` | Bridge between the window and the main process |
| `src/window.js` | The overlay window |
| `src/capture.js` | Screen capture |
| `src/openai.js` | Streaming OpenAI client |
| `src/settings.js` | Settings storage |
| `src/prompt.js` | System prompt |
| `renderer/` | Window UI (HTML, CSS, JS) |

## License

Apache License 2.0. Derived from [OpenCluely](https://github.com/TechyCSR/OpenCluely); see [NOTICE](NOTICE).
