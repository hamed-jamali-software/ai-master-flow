const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { RULE, rewriteFlowResponse } = require('../page-hook.js');

function framedResponse(config, entries = null) {
  const frame = JSON.stringify(entries || [['wrb.fr', RULE.rpcId, JSON.stringify(config)]]);
  return `${Buffer.byteLength(frame)}\n${frame}`;
}

test('sets only the expected flag and repairs the frame length', () => {
  const config = Array(32).fill(null);
  config[2] = 'متن';
  const result = rewriteFlowResponse(framedResponse(config));
  const [length, frame] = result.body.split('\n');
  const rewritten = JSON.parse(JSON.parse(frame)[0][2]);
  assert.equal(result.previousValue, null);
  assert.deepEqual(rewritten.map((value, index) => value !== config[index] ? index : null).filter(value => value !== null), [30]);
  assert.equal(rewritten[30], true);
  assert.equal(Number(length), Buffer.byteLength(frame));
});

test('rejects a changed schema or more than one matching response', () => {
  assert.throws(() => rewriteFlowResponse(framedResponse(Array(12).fill(null))), /schema mismatch/);
  const config = Array(32).fill(null);
  const entry = ['wrb.fr', RULE.rpcId, JSON.stringify(config)];
  assert.throws(() => rewriteFlowResponse(framedResponse(config, [entry, entry])), /expected one config response/);
});

test('hooks only the targeted Flow XHR and preserves others', () => {
  class FakeXHR {
    constructor() { this.readyState = 0; this.raw = ''; }
    open(method, url) { this.method = method; this.url = url; }
    get responseText() { return this.raw; }
    get response() { return this.raw; }
  }
  const attributes = new Map();
  const document = {
    documentElement: { setAttribute(name, value) { attributes.set(name, value); } },
    addEventListener() {}
  };
  const context = {
    XMLHttpRequest: FakeXHR,
    document,
    window: {},
    location: { href: 'https://flow.google.com/', origin: 'https://flow.google.com' },
    URL,
    TextEncoder
  };
  const script = fs.readFileSync(path.join(__dirname, '..', 'page-hook.js'), 'utf8');
  vm.runInNewContext(script, context);

  const original = framedResponse(Array(32).fill(null));
  const target = new FakeXHR();
  target.open('POST', `${RULE.path}?rpcids=${RULE.rpcId}`);
  target.raw = original;
  target.readyState = 3;
  assert.equal(target.responseText, '');
  target.readyState = 4;
  assert.equal(JSON.parse(JSON.parse(target.responseText.split('\n')[1])[0][2])[30], true);
  assert.equal(JSON.parse(attributes.get('data-ai-master-status')).applied, 1);

  const other = new FakeXHR();
  other.open('POST', `${RULE.path}?rpcids=other`);
  other.raw = original;
  other.readyState = 4;
  assert.equal(other.responseText, original);
});

test('rewrites only the targeted Flow Fetch response and keeps response metadata', async () => {
  class FakeXHR {
    open() {}
    get responseText() { return ''; }
    get response() { return ''; }
  }
  const original = framedResponse(Array(32).fill(null));
  const attributes = new Map();
  const targetUrl = `https://flow.google.com${RULE.path}?rpcids=${RULE.rpcId}`;
  const window = {
    fetch: async input => {
      const response = new Response(original, {
        status: 200,
        headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(original)) }
      });
      Object.defineProperty(response, 'url', { value: String(input.url || input) });
      return response;
    }
  };
  const context = {
    XMLHttpRequest: FakeXHR,
    document: { documentElement: { setAttribute(name, value) { attributes.set(name, value); } } },
    window,
    location: { href: 'https://flow.google.com/' },
    URL,
    TextEncoder,
    Headers,
    Response
  };
  const script = fs.readFileSync(path.join(__dirname, '..', 'page-hook.js'), 'utf8');
  vm.runInNewContext(script, context);

  const changed = await window.fetch(targetUrl);
  assert.equal(changed.status, 200);
  assert.equal(changed.url, targetUrl);
  assert.equal(changed.clone().clone().url, targetUrl);
  assert.equal(changed.headers.get('content-type'), 'text/plain');
  assert.equal(changed.headers.has('content-length'), false);
  assert.equal(JSON.parse(JSON.parse((await changed.text()).split('\n')[1])[0][2])[30], true);
  const diagnostic = JSON.parse(attributes.get('data-ai-master-status'));
  assert.equal(diagnostic.applied, 1);
  assert.equal(diagnostic.lastTransport, 'fetch');

  const other = await window.fetch(`https://flow.google.com${RULE.path}?rpcids=other`);
  assert.equal(await other.text(), original);
});
