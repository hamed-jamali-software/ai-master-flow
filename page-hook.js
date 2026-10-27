(() => {
  'use strict';

  // These are the known values from the supplied extension. Update this object
  // if Flow changes its endpoint, RPC identifier, or response schema.
  const RULE = Object.freeze({
    origin: 'https://flow.google.com',
    path: '/_/AiSandboxAngularFrontend/data/batchexecute',
    rpcId: 'cPZSdc',
    frameTag: 'wrb.fr',
    flagIndex: 30,
    minLength: 32
  });
  const DIAGNOSTIC_ATTRIBUTE = 'data-ai-master-status';

  function rewriteFlowResponse(body, rule = RULE) {
    if (typeof body !== 'string') throw new TypeError('Response must be text');
    const lines = body.split('\n');
    let matches = 0;
    let previousValue;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (!lines[lineIndex].startsWith('[[')) continue;
      let frame;
      try {
        frame = JSON.parse(lines[lineIndex]);
      } catch {
        continue;
      }
      if (!Array.isArray(frame)) continue;

      let frameChanged = false;
      for (const entry of frame) {
        if (!Array.isArray(entry) || entry[0] !== rule.frameTag || entry[1] !== rule.rpcId) continue;
        const config = JSON.parse(entry[2]);
        if (!Array.isArray(config) || config.length < rule.minLength ||
            !(config[rule.flagIndex] === null || typeof config[rule.flagIndex] === 'boolean')) {
          throw new Error('schema mismatch');
        }
        previousValue = config[rule.flagIndex];
        config[rule.flagIndex] = true;
        entry[2] = JSON.stringify(config);
        matches++;
        frameChanged = true;
      }

      if (frameChanged) {
        const oldFrame = lines[lineIndex].replace(/\r$/, '');
        const statedLength = Number(lines[lineIndex - 1]);
        const measures = [
          value => new TextEncoder().encode(value).length,
          value => value.length
        ];
        const measure = measures.find(fn => [0, 1, 2].includes(statedLength - fn(oldFrame)));
        if (!measure) throw new Error('frame length mismatch');
        const newFrame = JSON.stringify(frame);
        lines[lineIndex - 1] = String(statedLength + measure(newFrame) - measure(oldFrame));
        lines[lineIndex] = newFrame;
      }
    }

    if (matches !== 1) throw new Error('expected one config response');
    return { body: lines.join('\n'), previousValue };
  }

  // Export the pure transformation for a local, browser-free verification.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RULE, rewriteFlowResponse };
    return;
  }

  if (window.__flowAccessInstalled) return;
  window.__flowAccessInstalled = true;
  const diagnostic = { state: 'armed', applied: 0 };
  const targets = new WeakMap();
  const rewritten = new WeakMap();

  function isTargetRequest(input) {
    try {
      const request = new URL(input?.url || input, location.href);
      return request.origin === RULE.origin &&
        request.pathname === RULE.path &&
        request.searchParams.get('rpcids') === RULE.rpcId;
    } catch { return false; }
  }

  function preserveResponseMetadata(target, source) {
    for (const property of ['url', 'redirected', 'type']) {
      Object.defineProperty(target, property, {
        configurable: true,
        get: () => source[property]
      });
    }
    const clone = target.clone.bind(target);
    Object.defineProperty(target, 'clone', {
      configurable: true,
      value: () => preserveResponseMetadata(clone(), source)
    });
    return target;
  }

  function publish(state, previousValue) {
    diagnostic.state = state;
    if (previousValue !== undefined) diagnostic.previousValue = previousValue;
    const write = () => document.documentElement?.setAttribute(
      DIAGNOSTIC_ATTRIBUTE, JSON.stringify(diagnostic)
    );
    if (document.documentElement) write();
    else document.addEventListener('DOMContentLoaded', write, { once: true });
  }

  const prototype = XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  prototype.open = function(method, url, ...rest) {
    targets.set(this, isTargetRequest(url));
    rewritten.delete(this);
    return Reflect.apply(originalOpen, this, [method, url, ...rest]);
  };

  for (const property of ['responseText', 'response']) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor?.get || !descriptor.configurable) continue;
    Object.defineProperty(prototype, property, {
      ...descriptor,
      get() {
        const value = Reflect.apply(descriptor.get, this, []);
        if (!targets.get(this) || typeof value !== 'string') return value;
        if (this.readyState === 3) return '';
        if (this.readyState !== 4) return value;
        if (!rewritten.has(this)) {
          try {
            const result = rewriteFlowResponse(value);
            rewritten.set(this, result.body);
            diagnostic.applied++;
            diagnostic.lastTransport = 'xhr';
            publish('applied', result.previousValue);
          } catch (error) {
            rewritten.set(this, value);
            publish(`schema mismatch: ${error.message}`);
          }
        }
        return rewritten.get(this);
      }
    });
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function(input, ...rest) {
      const pending = Reflect.apply(originalFetch, this, [input, ...rest]);
      if (!isTargetRequest(input)) return pending;
      return pending.then(async response => {
        if (!response.ok) return response;
        try {
          const result = rewriteFlowResponse(await response.clone().text());
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          const replacement = preserveResponseMetadata(new Response(result.body, {
            status: response.status,
            statusText: response.statusText,
            headers
          }), response);
          diagnostic.applied++;
          diagnostic.lastTransport = 'fetch';
          publish('applied', result.previousValue);
          return replacement;
        } catch (error) {
          publish(`schema mismatch: ${error.message}`);
          return response;
        }
      });
    };
  }
  publish('armed');
})();
