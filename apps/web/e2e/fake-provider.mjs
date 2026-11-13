// A stand-in for model providers during end-to-end tests, so they need no
// real model and no network. Speaks just enough of two protocols:
//   Ollama native:      /api/version, /api/tags, /api/show
//   OpenAI-compatible:  /v1/models (requires "Authorization: Bearer <FAKE_KEY>")
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_PROVIDER_PORT);
const key = process.env.FAKE_PROVIDER_KEY;

const MODELS = {
  'llama3.2:3b': ['completion', 'tools'],
  'phi:latest': ['completion'],
};

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
    if (path === '/v1/models') {
      return request.headers.authorization === `Bearer ${key}`
        ? send(response, 200, { data: [{ id: 'fake-chat-model' }] })
        : send(response, 401, { error: { message: 'invalid key' } });
    }
    return send(response, 404, { error: 'unknown path' });
  });
}).listen(port, '127.0.0.1');
