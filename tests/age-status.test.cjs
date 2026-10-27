const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyAgePrompt, hasUnsupportedCountryPrompt, classifyFlowRequests } = require('../status.js');

test('marks only explicit Google age confirmation as verified', () => {
  assert.equal(classifyAgePrompt(['Your age has been verified.']), 'verified');
  assert.equal(classifyAgePrompt(['سن شما تأیید شده است.']), 'verified');
  assert.equal(classifyAgePrompt(['Welcome to Flow']), 'unknown');
});

test('detects explicit age-verification requests', () => {
  assert.equal(classifyAgePrompt(['Verify your age']), 'needs-verification');
  assert.equal(classifyAgePrompt(['سن خود را تأیید کنید']), 'needs-verification');
});

test('detects the country block without treating ordinary pages as blocked', () => {
  assert.equal(hasUnsupportedCountryPrompt(['Flow is not available in your country yet.']), true);
  assert.equal(hasUnsupportedCountryPrompt([], '/unsupported-country'), true);
  assert.equal(hasUnsupportedCountryPrompt(['Welcome to Flow'], '/'), false);
});

test('separates old Flow RPC requests by transport from other requests', () => {
  assert.deepEqual(classifyFlowRequests([
    { name: 'https://flow.google.com/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=cPZSdc', initiatorType: 'fetch' },
    { name: 'https://flow.google.com/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=other', initiatorType: 'xmlhttprequest' },
    { name: 'https://example.com/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=cPZSdc', initiatorType: 'fetch' }
  ]), { configRequests: 2, targetRequests: 1, fetchTargets: 1, xhrTargets: 0 });
});
