// Runs only when the user opens the popup on Google's age-verification page.
// Keep this function self-contained so chrome.scripting can inject it on demand.
function detectAccountAgePage() {
  const visibleText = selector => [...document.querySelectorAll(selector)]
    .filter(node => node.getClientRects().length > 0)
    .map(node => (node.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase());
  const statuses = visibleText('h1, h2, h3, [role="heading"], [role="status"], [role="alert"]');
  const actions = visibleText('button, [role="button"]');

  if (statuses.some(value => /^(?:your age (?:is|has been) verified|age verified|سن شما (?:تأیید|تایید) شده(?: است)?)(?:$|[.!؟])/u.test(value))) {
    return 'verified';
  }
  if ([...statuses, ...actions].some(value => /(?:verify your age|verify age|(?:سن خود را|سنتان را) (?:تأیید|تایید) کنید|(?:تأیید|تایید) سن)/u.test(value))) {
    return 'needs-verification';
  }
  return 'unknown';
}

if (typeof module !== 'undefined' && module.exports) module.exports = { detectAccountAgePage };
