function classifyAgePrompt(labels) {
  const text = labels.map(value => value.trim().replace(/\s+/g, ' ').toLowerCase());
  if (text.some(value => /^(?:age verified|your age (?:is|has been) verified|سن شما (?:تأیید|تایید) شده(?: است)?)(?:$|[.!؟])/u.test(value))) {
    return 'verified';
  }
  if (text.some(value => /(?:verify your age|verify age|age verification required|(?:سن خود را|سنتان را) (?:تأیید|تایید) کنید|(?:تأیید|تایید) سن)/u.test(value))) {
    return 'needs-verification';
  }
  return 'unknown';
}

function hasUnsupportedCountryPrompt(labels, pathname = '') {
  return /(?:^|\/)unsupported-country\/?$/i.test(pathname) ||
    labels.some(value => /flow is not available in your country yet\.?/i.test(value));
}

function classifyFlowRequests(entries) {
  const result = { configRequests: 0, targetRequests: 0, fetchTargets: 0, xhrTargets: 0 };
  for (const entry of entries) {
    let url;
    try { url = new URL(entry.name); } catch { continue; }
    if (url.origin !== 'https://flow.google.com' ||
        url.pathname !== '/_/AiSandboxAngularFrontend/data/batchexecute') continue;
    result.configRequests++;
    if (!url.searchParams.get('rpcids')?.split(',').includes('cPZSdc')) continue;
    result.targetRequests++;
    if (entry.initiatorType === 'fetch') result.fetchTargets++;
    if (entry.initiatorType === 'xmlhttprequest') result.xhrTargets++;
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyAgePrompt, hasUnsupportedCountryPrompt, classifyFlowRequests };
} else chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'getStatus') return;
  let diagnostic;
  try {
    diagnostic = JSON.parse(document.documentElement.getAttribute('data-ai-master-status'));
  } catch { /* The page hook has not reported yet. */ }

  const visibleLabels = [...document.querySelectorAll('h1, h2, h3, [role="heading"], button, [role="button"]')]
    .filter(node => node.getClientRects().length > 0)
    .map(node => node.textContent || '')
    .filter(Boolean);
  const ageState = classifyAgePrompt(visibleLabels);
  const unsupportedCountry = hasUnsupportedCountryPrompt(visibleLabels, location.pathname);
  const requests = classifyFlowRequests(performance.getEntriesByType('resource'));
  respond({
    state: typeof diagnostic?.state === 'string' ? diagnostic.state.slice(0, 100) : 'not-loaded',
    applied: Number.isInteger(diagnostic?.applied) ? diagnostic.applied : 0,
    ageState,
    unsupportedCountry,
    requests
  });
});
