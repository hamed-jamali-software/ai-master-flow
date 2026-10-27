const FLOW_URL = 'https://flow.google.com/';
const AGE_VERIFICATION_URL = 'https://myaccount.google.com/age-verification';
const COUNTRY_ASSOCIATION_URL = 'https://policies.google.com/country-association-form';
const toggle = document.getElementById('toggle');
const status = document.getElementById('status');
const statusText = document.getElementById('status-text');
const diagnosticText = document.getElementById('diagnostic');
const reloadButton = document.getElementById('reload');
const errorText = document.getElementById('error');
const ageStatus = document.getElementById('age-status');
const ageIcon = document.getElementById('age-icon');
const ageButton = document.getElementById('verify-age');
const countryButton = document.getElementById('check-country');
let activeTab;

function showStatus(text, tone = 'idle') {
  statusText.textContent = text;
  status.dataset.tone = tone;
}

function showEnabled(enabled) {
  toggle.setAttribute('aria-checked', String(enabled));
}

function showAgeStatus(state, isFlowTab, isAccountAgePage = false) {
  if (state === 'verified') {
    ageIcon.textContent = '✓';
    ageIcon.dataset.state = 'verified';
    ageStatus.textContent = 'تأیید شده';
    ageButton.hidden = true;
  } else if (state === 'needs-verification') {
    ageIcon.textContent = '!';
    ageIcon.dataset.state = 'needs-verification';
    ageStatus.textContent = 'Google برای این حساب تأیید سن می‌خواهد.';
    ageButton.textContent = 'تأیید سن در Google ↗';
    ageButton.hidden = false;
  } else {
    ageIcon.textContent = '?';
    ageIcon.dataset.state = 'unknown';
    ageStatus.textContent = isAccountAgePage ? 'وضعیت از این صفحه قابل تشخیص نیست؛ راهنمای Google را دنبال کنید.' : isFlowTab ? 'وضعیت تأیید سن از این صفحه مشخص نیست.' : 'برای بررسی، تب Flow یا صفحهٔ تأیید سن Google را باز کنید.';
    ageButton.textContent = 'بررسی سن در Google ↗';
    ageButton.hidden = isAccountAgePage;
  }
}

async function readAgeFromAccountPage(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: detectAccountAgePage
  });
  return injection?.result || 'unknown';
}

async function initialize() {
  const result = await chrome.runtime.sendMessage({ type: 'getEnabled' });
  if (!result?.ok) throw new Error(result?.error || 'وضعیت افزونه خوانده نشد.');
  const enabled = result.enabled;
  showEnabled(enabled);

  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isFlowTab = activeTab?.url?.startsWith(FLOW_URL);
  const isAccountAgePage = activeTab?.url?.startsWith(AGE_VERIFICATION_URL);
  reloadButton.hidden = !isFlowTab;
  let tabStatus;
  if (isFlowTab) {
    try { tabStatus = await chrome.tabs.sendMessage(activeTab.id, { type: 'getStatus' }); }
    catch { /* No Flow content script in this tab yet. */ }
  }
  if (isFlowTab) {
    diagnosticText.hidden = false;
    if (tabStatus) {
      const requests = tabStatus.requests || {};
      diagnosticText.textContent = `جزئیات: درخواست تنظیمات ${requests.configRequests ?? '?'}، شناسهٔ قبلی ${requests.targetRequests ?? '?'} (XHR: ${requests.xhrTargets ?? '?'}، Fetch: ${requests.fetchTargets ?? '?'}), اصلاح‌شده ${tabStatus.applied}، وضعیت ${tabStatus.state}.`;
    } else {
      diagnosticText.textContent = 'جزئیات فنی این تب خوانده نشد؛ افزونه و تب Flow را دوباره بارگذاری کنید.';
    }
  }
  let ageState = tabStatus?.ageState;
  if (isAccountAgePage) {
    try { ageState = await readAgeFromAccountPage(activeTab.id); }
    catch { ageState = 'unknown'; }
  }
  showAgeStatus(ageState, isFlowTab, isAccountAgePage);
  const unsupportedCountry = isFlowTab && (tabStatus?.unsupportedCountry ||
    /(?:^|\/)unsupported-country\/?$/i.test(new URL(activeTab.url).pathname));
  countryButton.hidden = !unsupportedCountry;

  if (unsupportedCountry) {
    const localResult = !tabStatus
      ? 'Google دسترسی منطقه‌ای را رد کرده است؛ وضعیت فنی افزونه از این تب خوانده نشد.'
      : tabStatus.applied > 0
      ? `افزونه ${tabStatus.applied} پاسخ را اصلاح کرده، اما Google همچنان دسترسی منطقه‌ای را رد می‌کند.`
      : tabStatus.state?.startsWith('schema mismatch')
        ? 'قالب پاسخ Flow تغییر کرده و Google دسترسی منطقه‌ای را هم رد می‌کند.'
        : 'Google دسترسی منطقه‌ای را رد کرده است؛ اصلاح پاسخ محلی ثبت نشده است.';
    showStatus(localResult, 'bad');
  }
  else if (!enabled) showStatus('ابزار خاموش است.', 'idle');
  else if (!isFlowTab) showStatus('ابزار روشن است؛ برای بررسی نتیجه، تب Flow را باز کنید.', 'idle');
  else if (tabStatus?.state?.startsWith('schema mismatch')) showStatus('قالب پاسخ Flow تغییر کرده است؛ قانون باید به‌روز شود.', 'bad');
  else if (tabStatus?.applied > 0) showStatus(`پاسخ محلی ${tabStatus.applied} بار اصلاح شد؛ دسترسی حساب باید جداگانه در Google تأیید شود.`, 'warn');
  else if (tabStatus?.state === 'armed') showStatus('آماده است و منتظر پاسخ تنظیمات Flow است.', 'idle');
  else showStatus('برای فعال‌شدن، این تب را دوباره بارگذاری کنید.', 'warn');
  toggle.disabled = false;
}

toggle.addEventListener('click', async () => {
  const next = toggle.getAttribute('aria-checked') !== 'true';
  toggle.disabled = true;
  errorText.textContent = '';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'setEnabled', enabled: next });
    if (!result?.ok) throw new Error(result?.error || 'تغییر وضعیت ذخیره نشد.');
    showEnabled(next);
    showStatus(next ? 'روشن شد؛ تب‌های باز Flow را دوباره بارگذاری کنید.' : 'خاموش شد؛ تب‌های باز Flow را دوباره بارگذاری کنید.', next ? 'good' : 'idle');
  } catch (error) {
    errorText.textContent = error.message;
  } finally {
    toggle.disabled = false;
  }
});

document.getElementById('open').addEventListener('click', () => chrome.tabs.create({ url: FLOW_URL }));
ageButton.addEventListener('click', () => chrome.tabs.create({ url: AGE_VERIFICATION_URL }));
countryButton.addEventListener('click', () => chrome.tabs.create({ url: COUNTRY_ASSOCIATION_URL }));
reloadButton.addEventListener('click', async () => {
  try {
    const tab = await chrome.tabs.get(activeTab.id);
    if (!tab.url?.startsWith(FLOW_URL)) throw new Error('ابتدا تب Flow را انتخاب کنید.');
    await chrome.tabs.reload(tab.id);
    window.close();
  } catch (error) {
    errorText.textContent = error.message;
  }
});

initialize().catch(error => {
  errorText.textContent = error.message;
  showStatus('وضعیت افزونه در دسترس نیست.', 'bad');
});
