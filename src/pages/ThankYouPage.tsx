import React, { useEffect } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../services/router';
import { fireSubscriptionConversion } from '../services/googleAds';
import { formatExpiryDate } from '../services/subscription';
import { CONTACT_EMAIL, OPERATOR_NAME, POLICY_REVISED } from '../seo/content';

/**
 * Subscription confirmation — the stable URL Google Ads uses as the
 * conversion destination:
 *
 *     https://digitalpdfeditor.com/thank-you
 *
 * Every completed Razorpay checkout redirects here (see UpgradeModal). The
 * page does not trust the redirect: it asks the server whether this account
 * is actually Pro, and only then fires the Google Ads conversion event. A
 * visitor who simply opens the URL sees the same honest state with no
 * tracking attached.
 *
 * Marked noindex: it is a private, per-account confirmation screen with
 * nothing for search engines.
 */
export const ThankYouPage: React.FC = () => {
  const { user, loading, subscriptionStatus } = useAuth();

  useEffect(() => {
    document.title = 'Subscription Confirmed — PDF Editor Pro';

    // Keep this page out of search results.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    return () => {
      if (created) meta?.remove();
    };
  }, []);

  // Fire the conversion once the server has confirmed an active Pro plan.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!subscriptionStatus.isPro) return;
    fireSubscriptionConversion();
  }, [loading, user, subscriptionStatus.isPro]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-700">
      <div className="mx-auto max-w-lg px-4 sm:px-6 py-10 sm:py-16">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to the editor
        </button>

        <div className="mt-8 bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8">
          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 text-neutral-400 mx-auto animate-spin" />
              <p className="mt-3 text-sm text-neutral-500">Confirming your subscription…</p>
            </div>
          ) : subscriptionStatus.isPro && user ? (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="mt-4 text-2xl font-bold text-neutral-900 tracking-tight">
                  You&apos;re subscribed!
                </h1>
                <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
                  Thank you for upgrading, {user.name.split(' ')[0]}. Your Pro plan is active and
                  every PDF tool is unlocked — no limits, no watermarks.
                </p>
              </div>

              <dl className="mt-6 divide-y divide-neutral-100 border-t border-neutral-100">
                <div className="flex items-center justify-between py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Plan</dt>
                  <dd className="text-sm font-semibold text-neutral-800">
                    {subscriptionStatus.planName ?? 'Pro'}
                  </dd>
                </div>
                {subscriptionStatus.expiresAt && (
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      {subscriptionStatus.daysRemaining !== null && subscriptionStatus.daysRemaining > 0
                        ? 'Renews / expires on'
                        : 'Expired on'}
                    </dt>
                    <dd className="text-sm font-semibold text-neutral-800">
                      {formatExpiryDate(subscriptionStatus.expiresAt)}
                      {subscriptionStatus.daysRemaining !== null && subscriptionStatus.daysRemaining > 0 && (
                        <span className="ml-2 text-xs font-medium text-emerald-700">
                          {subscriptionStatus.daysRemaining}{' '}
                          {subscriptionStatus.daysRemaining === 1 ? 'day' : 'days'} left
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Account
                  </dt>
                  <dd className="text-sm font-semibold text-neutral-800">{user.email}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-6 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
              >
                <CalendarClock className="w-4 h-4" />
                Start editing your PDFs
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-neutral-400" />
                </div>
                <h1 className="mt-4 text-2xl font-bold text-neutral-900 tracking-tight">
                  {user ? 'No active subscription found' : 'Sign in to confirm'}
                </h1>
                <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
                  {user
                    ? 'This account does not have an active Pro plan. If you just paid, make sure you are signed in with the email you used at checkout.'
                    : 'We could not find an active subscription for this browser. Sign in with the email you used at checkout to see your plan here.'}
                </p>
              </div>

              {!user && (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="mt-6 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm"
                >
                  Sign in / Sign up
                </button>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400 leading-relaxed">
          Questions about your payment? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-emerald-700 hover:underline">
            {CONTACT_EMAIL}
          </a>{' '}
          — see our{' '}
          <button
            type="button"
            onClick={() => navigate('/refund-policy')}
            className="font-semibold text-emerald-700 hover:underline"
          >
            refund policy
          </button>
          .
        </p>

        <p className="mt-4 text-center text-xs text-neutral-300">
          &copy; {POLICY_REVISED.slice(0, 4)} {OPERATOR_NAME}
        </p>
      </div>
    </div>
  );
};

export default ThankYouPage;
