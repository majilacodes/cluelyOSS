const https = require('https');

const URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 120000;

/**
 * Stream a Chat Completions request. Calls onDelta(text) for each chunk and
 * resolves with { text, usage }, where usage is OpenAI's token count (or null).
 * Aborting `signal` rejects with an error whose `partial` holds the text so far.
 */
function streamChat({ apiKey, model, reasoningEffort, messages, onDelta, signal }) {
  const body = JSON.stringify({
    model,
    messages,
    reasoning_effort: reasoningEffort,
    stream: true,
    stream_options: { include_usage: true }, // adds a final chunk with token counts
  });

  return new Promise((resolve, reject) => {
    let text = '';
    let usage = null;
    const fail = (error) => {
      error.partial = text;
      reject(error);
    };

    const req = https.request(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: TIMEOUT_MS,
      signal,
    }, (res) => {
      res.setEncoding('utf8');

      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => { errorBody += chunk; });
        res.on('end', () => reject(new Error(describeError(res.statusCode, errorBody))));
        return;
      }

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any partial line for the next chunk
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload);
            if (event.usage) usage = event.usage;
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              text += delta;
              onDelta(delta);
            }
          } catch {
            // Ignore malformed lines; the stream continues.
          }
        }
      });
      res.on('end', () => (text ? resolve({ text, usage }) : reject(new Error('The model returned an empty answer.'))));
      res.on('error', fail);
    });

    req.on('timeout', () => req.destroy(new Error('Request timed out.')));
    req.on('error', fail);
    req.end(body);
  });
}

function describeError(status, body) {
  if (status === 401) return 'Invalid API key. Check it in Settings.';
  let message = body;
  try {
    message = JSON.parse(body).error?.message || body;
  } catch {
    // Not JSON; use the raw body.
  }
  return `OpenAI error ${status}: ${message}`;
}

module.exports = { streamChat };
