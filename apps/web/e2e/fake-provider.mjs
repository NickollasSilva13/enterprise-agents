// A stand-in for model providers during end-to-end tests, so they need no
// real model and no network. Speaks just enough of two protocols:
//   Ollama native:      /api/version, /api/tags, /api/show, /api/chat (streaming, tool calls)
//   OpenAI-compatible:  /v1/models (requires "Authorization: Bearer <FAKE_KEY>")
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_PROVIDER_PORT);
const key = process.env.FAKE_PROVIDER_KEY;

const MODELS = {
  'llama3.2:3b': ['completion', 'tools'],
  'phi:latest': ['completion'],
};

const SLOW_INTERVAL_MS = 150;
const SLOW_WORDS = 200;

/** What the "model" answers, decided by a keyword in the last user message. */
function answerFor(prompt) {
  if (prompt.includes('perigo')) {
    return [
      '**seguro**\n\n',
      '<script>window.__hacked = true</script>\n\n',
      '<img src="http://127.0.0.1:9/pixel.png" onerror="window.__hacked = true">\n\n',
      '![rastreador](http://127.0.0.1:9/pixel.png)',
    ];
  }
  return ['Eco: ', prompt.slice(0, 40), ' (fim)'];
}

/** Ollama's streaming chat: one JSON object per line, the last with `done`. */
function chat(request, response, body) {
  const prompt = body.messages?.findLast((message) => message.role === 'user')?.content ?? '';
  response.writeHead(200, { 'content-type': 'application/x-ndjson' });
  const line = (chunk) => response.write(`${JSON.stringify(chunk)}\n`);
  const finish = () => {
    line({ done: true, done_reason: 'stop', prompt_eval_count: 11, eval_count: 7 });
    response.end();
  };

  // Tool use, when the agent was given the tool (the app only offers what it may use):
  //   "anote"               asks to write the message into nota.txt;
  //   'delegue a "<agente>"'  asks to hand "Bom dia" to that agent
  //                           ('delegue devagar a "<agente>"': a slow task);
  // and once a tool result comes back, the answer repeats it.
  const last = body.messages?.at(-1);
  const offered = new Set((body.tools ?? []).map((tool) => tool.function?.name));
  const callTool = (name, args) => {
    line({ message: { content: '', tool_calls: [{ function: { name, arguments: args } }] } });
    finish();
  };
  if (last?.role === 'tool') {
    // The first line is the label the app puts on every tool result.
    const result = String(last.content).split('\n').slice(1).join(' ');
    line({ message: { content: `Ferramenta respondeu: ${result.slice(0, 120)}` } });
    return finish();
  }
  if (prompt.includes('anote') && offered.has('write_file')) {
    return callTool('write_file', { path: 'nota.txt', content: prompt });
  }
  const delegation = /delegue (?:devagar )?a "([^"]+)"/.exec(prompt);
  if (delegation && offered.has('delegate_to_agent')) {
    // With "devagar" the delegated task is itself a slow one, so a test can
    // watch the delegation while it lasts.
    const task = prompt.includes('devagar') ? 'responda devagar' : 'Bom dia';
    return callTool('delegate_to_agent', { agent: delegation[1], task });
  }

  // "devagar" keeps the answer coming for a long time, so a test can watch
  // it grow, reload the page and interrupt it.
  if (prompt.includes('devagar')) {
    let sent = 0;
    const timer = setInterval(() => {
      sent += 1;
      line({ message: { content: `palavra${sent} ` } });
      if (sent >= SLOW_WORDS) {
        clearInterval(timer);
        finish();
      }
    }, SLOW_INTERVAL_MS);
    response.on('close', () => clearInterval(timer));
    return;
  }

  for (const content of answerFor(prompt)) line({ message: { content } });
  finish();
}

const send = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

createServer((request, response) => {
  let text = '';
  request.on('data', (chunk) => (text += chunk));
  request.on('end', () => {
    const path = request.url ?? '/';
    if (path === '/api/version') return send(response, 200, { version: '0.0.0-fake' });
    if (path === '/api/tags') {
      return send(response, 200, { models: Object.keys(MODELS).map((name) => ({ name })) });
    }
    if (path === '/api/show') {
      const capabilities = MODELS[JSON.parse(text).model];
      return capabilities
        ? send(response, 200, { capabilities })
        : send(response, 404, { error: 'not found' });
    }
    if (path === '/api/chat') return chat(request, response, JSON.parse(text));
    if (path === '/v1/models') {
      return request.headers.authorization === `Bearer ${key}`
        ? send(response, 200, { data: [{ id: 'fake-chat-model' }] })
        : send(response, 401, { error: { message: 'invalid key' } });
    }
    return send(response, 404, { error: 'unknown path' });
  });
}).listen(port, '127.0.0.1');
