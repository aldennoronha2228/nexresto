export function isWebView(userAgent?: string): boolean {
  const ua = String(userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase();
  if (!ua) return false;

  // Android WebView user agents usually include "wv" and/or "Version/x.y" with Android.
  const hasWvToken = /\bwv\b/.test(ua);
  const hasAndroidVersionToken = ua.includes('android') && ua.includes('version/');

  return hasWvToken || hasAndroidVersionToken;
}
