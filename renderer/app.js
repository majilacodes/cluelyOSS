// `api` is the global bridge exposed by preload.js.
const $ = (id) => document.getElementById(id);

const scroll = $('scroll');
const thread = $('thread');
const input = $('input');

const DEFAULT_MESSAGE = 'Answer the question(s) in the screenshot(s).';

// Render model output as markdown, but show any raw HTML as text.
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
marked.use({ renderer: { html: (token) => escapeHtml(token.text ?? '') } });

let messages = []; // { role: 'user' | 'assistant', text, images? }
let pending = []; // screenshot data URLs to send with the next message
let current = null; // { id, el, text } for the answer being streamed
let nextId = 1;

// ---------- Rendering ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function thumbs(images, removable) {
  const row = el('div', 'thumbs');
  images.forEach((src, i) => {
    const wrap = el('div', 'thumb');
    const img = el('img');
    img.src = src;
    img.alt = `Screenshot ${i + 1}`;
    img.addEventListener('click', () => openViewer(src));
    wrap.appendChild(img);
    if (removable) {
      const remove = el('button', 'remove', '×');
      remove.type = 'button';
      remove.title = 'Remove';
      remove.addEventListener('click', () => {
        pending.splice(i, 1);
        renderTray();
      });
      wrap.appendChild(remove);
    }
    row.appendChild(wrap);
  });
  return row;
}

function renderTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  tray.hidden = pending.length === 0;
  if (pending.length) tray.appendChild(thumbs(pending, true));
  input.placeholder = pending.length
    ? 'What do you need? (Enter to send, empty = answer it)'
    : 'Ask anything (Enter to send)';
  updateEmpty();
}

function updateEmpty() {
  $('empty').hidden = messages.length > 0 || pending.length > 0;
}

function renderAnswer() {
  if (!current) return;
  current.el.classList.remove('pending');
  current.el.innerHTML = marked.parse(current.text);
  scroll.scrollTop = scroll.scrollHeight;
}

function showStatus(text) {
  $('status').textContent = text || '';
  $('status').hidden = !text;
}

// While an answer streams, the Send button becomes Stop.
function setBusy(busy) {
  $('sendBtn').textContent = busy ? 'Stop' : 'Send';
}

function stop() {
  if (current) api.cancel(current.id);
}

function newChat() {
  stop();
  messages = [];
  pending = [];
  current = null; // late chunks from an earlier request are ignored
  thread.innerHTML = '';
  setBusy(false);
  showStatus('');
  renderTray();
}

// ---------- Sending ----------

async function send() {
  const text = input.value.trim();
  if (current || (!text && !pending.length)) return;

  const images = pending;
  const userMessage = { role: 'user', text: text || DEFAULT_MESSAGE, images };
  messages.push(userMessage);
  pending = [];
  input.value = '';
  autoGrow();
  renderTray();
  showStatus('');

  const turn = el('div');
  if (thread.children.length) turn.appendChild(el('hr', 'divider'));
  if (images.length) turn.appendChild(thumbs(images, false));
  if (text) turn.appendChild(el('p', 'user', text));
  const answerEl = el('div', 'answer pending', 'Thinking…');
  turn.appendChild(answerEl);
  thread.appendChild(turn);
  scroll.scrollTop = scroll.scrollHeight;

  const request = { id: nextId++, el: answerEl, text: '' };
  current = request;
  setBusy(true);
  const result = await api.ask(request.id, messages);
  if (current !== request) return; // the chat was cleared meanwhile
  current = null;
  setBusy(false);

  if (result.error || (result.cancelled && !result.answer)) {
    // Failed, or stopped before any text: undo the turn and restore the input to retry as-is.
    messages.pop();
    turn.remove();
    pending = images.concat(pending);
    input.value = text;
    autoGrow();
    renderTray();
    showStatus(result.error || '');
  } else {
    // A stopped answer keeps its partial text so follow-ups still have context.
    messages.push({ role: 'assistant', text: result.answer });
    answerEl.classList.remove('pending');
    answerEl.innerHTML = marked.parse(result.answer);
    if (result.cancelled) answerEl.appendChild(el('p', 'stopped', 'Stopped'));
    scroll.scrollTop = scroll.scrollHeight;
  }
  input.focus();
}

let renderQueued = false;
api.onAnswerChunk(({ id, delta }) => {
  if (!current || current.id !== id) return;
  current.text += delta;
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderAnswer();
    });
  }
});

// ---------- Screenshots ----------

api.onScreenshot(({ mode, dataUrl }) => {
  if (mode === 'new') newChat();
  pending.push(dataUrl);
  renderTray();
  showStatus('');
  setTimeout(() => input.focus(), 50);
});

api.onCaptureError(({ error }) => showStatus(error));

function openViewer(src) {
  $('viewerImg').src = src;
  $('viewer').hidden = false;
}

$('viewer').addEventListener('click', () => { $('viewer').hidden = true; });

// ---------- Settings ----------

async function openSettings() {
  const s = await api.getSettings();
  $('keyInput').value = '';
  $('keyInput').placeholder = s.hasKey ? 'Saved (leave blank to keep)' : 'sk-...';
  $('modelInput').value = s.model;
  $('effortSelect').innerHTML = '';
  s.efforts.forEach((effort) => $('effortSelect').appendChild(new Option(effort, effort)));
  $('effortSelect').value = s.reasoningEffort;
  renderUsage(s.usage);
  $('settings').hidden = false;
  (s.hasKey ? $('modelInput') : $('keyInput')).focus();
}

function renderUsage(usage) {
  const n = (value) => value.toLocaleString();
  $('usageRequests').textContent = n(usage.requests);
  $('usageInput').textContent = n(usage.inputTokens);
  $('usageOutput').textContent = n(usage.outputTokens);
  $('usageReasoning').textContent = n(usage.reasoningTokens);
  $('usageSince').textContent = usage.since
    ? `Since ${new Date(usage.since).toLocaleString()}. Screenshots count as input tokens; stopped answers aren't counted.`
    : 'No answers yet.';
}

$('resetUsage').addEventListener('click', async () => {
  await api.resetUsage();
  renderUsage((await api.getSettings()).usage);
});

function closeSettings() {
  $('settings').hidden = true;
  input.focus();
}

$('saveSettings').addEventListener('click', async () => {
  await api.saveSettings({
    apiKey: $('keyInput').value,
    model: $('modelInput').value,
    reasoningEffort: $('effortSelect').value,
  });
  showStatus('');
  closeSettings();
});

// ---------- Wiring ----------

function autoGrow() {
  // Collapse first so scrollHeight is the content height; +2 for the border.
  input.style.height = '0px';
  input.style.height = `${Math.min(input.scrollHeight + 2, 140)}px`;
}

$('newBtn').addEventListener('click', () => {
  newChat();
  input.focus();
});
$('shotBtn').addEventListener('click', () => api.capture('add'));
$('settingsBtn').addEventListener('click', () => ($('settings').hidden ? openSettings() : closeSettings()));
$('cancelSettings').addEventListener('click', closeSettings);
$('hideBtn').addEventListener('click', () => api.hide());
$('quitBtn').addEventListener('click', () => api.quit());

// The button sends, or stops the answer in progress. Enter only ever sends.
$('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  if (current) stop();
  else send();
});
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!$('viewer').hidden) $('viewer').hidden = true;
  else if (!$('settings').hidden) closeSettings();
});

const opacity = $('opacity');
opacity.addEventListener('input', () => api.setOpacity(opacity.value / 100, false));
opacity.addEventListener('change', () => api.setOpacity(opacity.value / 100, true));

api.getSettings().then((s) => {
  opacity.value = Math.round(s.opacity * 100);
  if (!s.hasKey) openSettings();
});
autoGrow();
input.focus();
