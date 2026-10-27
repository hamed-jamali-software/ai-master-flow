const test = require('node:test');
const assert = require('node:assert/strict');
const { detectAccountAgePage } = require('../age-page.js');

function classify(statusText = [], actionText = []) {
  const originalDocument = global.document;
  const makeNode = textContent => ({ textContent, getClientRects: () => [1] });
  global.document = {
    querySelectorAll(selector) {
      return selector.startsWith('h1') ? statusText.map(makeNode) : actionText.map(makeNode);
    }
  };
  try { return detectAccountAgePage(); }
  finally { global.document = originalDocument; }
}

test('account page requires an explicit confirmation before showing verified', () => {
  assert.equal(classify(['Your age has been verified.']), 'verified');
  assert.equal(classify(['سن شما تأیید شده است.']), 'verified');
  assert.equal(classify(['Age verification'], ['Continue']), 'unknown');
  assert.equal(classify(['If your age has been verified, continue']), 'unknown');
});

test('account page recognizes a verification action', () => {
  assert.equal(classify(['Age verification'], ['Verify your age']), 'needs-verification');
});
