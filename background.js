const SCRIPT_ID = 'ai-master-page-hook';
const SCRIPT = {
  id: SCRIPT_ID,
  matches: ['https://flow.google.com/*'],
  js: ['page-hook.js'],
  runAt: 'document_start',
  world: 'MAIN',
  persistAcrossSessions: true
};

async function isEnabled() {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  return scripts.length > 0;
}

async function setEnabled(enabled) {
  const current = await isEnabled();
  if (current === enabled) return;
  if (enabled) {
    await chrome.scripting.registerContentScripts([SCRIPT]);
  } else {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    setEnabled(true).catch(error => console.error('AI Master setup failed:', error));
  }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'getEnabled') {
    isEnabled().then(enabled => respond({ ok: true, enabled }))
      .catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'setEnabled' && typeof message.enabled === 'boolean' && !sender.tab) {
    setEnabled(message.enabled).then(() => respond({ ok: true, enabled: message.enabled }))
      .catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
});
