import { isWebView } from './isWebView';

function toAndroidChromeIntent(url: string): string | null {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(':', '') || 'https';
    return `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  } catch {
    return null;
  }
}

export function openExternalBrowser(url: string): void {
  if (typeof window === 'undefined') return;

  const targetUrl = String(url || '').trim();
  if (!targetUrl) return;

  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);

  // For Android WebView, try an intent URL first so the OS can launch Chrome.
  if (isAndroid && isWebView(ua)) {
    const intentUrl = toAndroidChromeIntent(targetUrl);
    if (intentUrl) {
      window.location.href = intentUrl;
      window.setTimeout(() => {
        window.location.href = targetUrl;
      }, 700);
      return;
    }
  }

  const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = targetUrl;
  }
}
