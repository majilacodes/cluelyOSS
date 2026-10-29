const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const EMPTY_USAGE = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, since: null };
const DEFAULTS = { apiKey: '', model: 'gpt-5-mini', reasoningEffort: 'low', opacity: 1, usage: EMPTY_USAGE };
const EFFORTS = ['minimal', 'low', 'medium', 'high'];

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(patch) {
  const next = { ...load(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  // Owner-only permissions: the file holds the API key.
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

/** Add one answer's token counts (OpenAI's `usage` object) to the running totals. */
function recordUsage(usage) {
  const total = { ...EMPTY_USAGE, ...load().usage };
  save({
    usage: {
      requests: total.requests + 1,
      inputTokens: total.inputTokens + (usage.prompt_tokens || 0),
      outputTokens: total.outputTokens + (usage.completion_tokens || 0),
      reasoningTokens: total.reasoningTokens + (usage.completion_tokens_details?.reasoning_tokens || 0),
      since: total.since || new Date().toISOString(),
    },
  });
}

function resetUsage() {
  save({ usage: { ...EMPTY_USAGE, since: new Date().toISOString() } });
}

module.exports = { load, save, recordUsage, resetUsage, EFFORTS };
