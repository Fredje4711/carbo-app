// Temporary laptop testing can be removed by setting this to false.
const LOCAL_TEST_ENABLED = true;

export function devicePlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent) || platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export function scannerAllowed({ hostname, search = '', standalone = false, device }) {
  const localTest = LOCAL_TEST_ENABLED && ['localhost', '127.0.0.1'].includes(hostname) && new URLSearchParams(search).get('test') === '1';
  return localTest || standalone && ['ios', 'android'].includes(device);
}
