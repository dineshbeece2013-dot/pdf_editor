import { GOOGLE_ADS_CONVERSION_ID, GOOGLE_ADS_CONVERSION_LABEL } from '../config';

/**
 * Google Ads conversion tracking.
 *
 * Used by the /thank-you page to tell Google Ads that a subscription was
 * actually purchased — the event is only fired after the SERVER confirms the
 * account is Pro (see ThankYouPage), so visiting the URL alone cannot inflate
 * the conversion count.
 *
 * Config lives in src/config.ts. Conversion IDs are not secrets: they ship in
 * every Google Ads tag snippet by design. Nothing here loads or sends anything
 * until both values are filled in.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** True when the conversion tag has been given its id + label. */
export function isGoogleAdsConfigured(): boolean {
  return Boolean(GOOGLE_ADS_CONVERSION_ID && GOOGLE_ADS_CONVERSION_LABEL);
}

/** Inject the gtag.js snippet once for the given Google Ads tag id. */
function loadGtag(id: string): void {
  if (document.querySelector(`script[data-gtag="${id}"]`)) return;

  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) {
    const gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id);
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.setAttribute('data-gtag', id);
  document.head.appendChild(script);
}

/**
 * Session-scoped guard: a user reloading /thank-you must not count as a new
 * conversion. Kept in sessionStorage so a second purchase in a later session
 * still reports.
 */
const FIRED_KEY = 'pdfpro.ads.subscriptionConversion';

function alreadyFired(): boolean {
  try {
    return Boolean(sessionStorage.getItem(FIRED_KEY));
  } catch {
    // Storage blocked (private mode etc.) — treat as not fired; Google's own
    // deduplication still applies on the server side.
    return false;
  }
}

function markFired(): void {
  try {
    sessionStorage.setItem(FIRED_KEY, String(Date.now()));
  } catch {
    /* see alreadyFired */
  }
}

/**
 * Fire the "subscription purchased" conversion event.
 * Returns true when an event was actually sent.
 */
export function fireSubscriptionConversion(): boolean {
  if (!isGoogleAdsConfigured()) return false;
  if (alreadyFired()) return false;

  loadGtag(GOOGLE_ADS_CONVERSION_ID);
  window.gtag?.('event', 'conversion', {
    send_to: `${GOOGLE_ADS_CONVERSION_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
  });
  markFired();
  return true;
}
