import React, { useEffect } from 'react';
import { Mail, FileText, ShieldCheck, CreditCard, Clock, MessageSquare } from 'lucide-react';
import { LEGAL_LINKS } from '../components/LegalPage';
import {
  CONTACT_EMAIL,
  GOVERNING_LAW,
  OPERATOR_NAME,
  POLICY_REVISED,
  PRICING,
  RAZORPAY_NAME,
  SITE_URL,
} from '../seo/content';

export const ContactPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Contact — PDF Editor Pro';
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-700">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Contact us</h1>
        <p className="mt-3 text-base text-neutral-600">
          Questions, a bug to report, or a billing problem — get in touch and we will help.
        </p>

        <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Mail className="w-4 h-4 text-emerald-600" />
            Email
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-3 block text-lg font-semibold text-emerald-700 hover:underline break-all"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            Please include your account email address and, for a billing question, the Razorpay
            payment reference. We aim to reply within 2 working days.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold text-neutral-900">Quick answers</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: CreditCard, label: 'Billing or a charge you do not recognise' },
              { icon: ShieldCheck, label: 'Privacy or data question' },
              { icon: FileText, label: 'Refund request' },
              { icon: Clock, label: 'Subscription or plan enquiry' },
              { icon: MessageSquare, label: 'Bug report or feature request' },
              { icon: CreditCard, label: `Payment method (${RAZORPAY_NAME}) issue` },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-2 text-sm text-neutral-600">
                <Icon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold text-neutral-900">Plan pricing</h2>
          <ul className="space-y-2">
            {PRICING.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-neutral-600">
                  {p.name} — {p.description}
                </span>
                <span className="shrink-0 font-semibold text-neutral-900 tabular-nums">
                  <span aria-hidden="true">₹</span>
                  {p.price}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold text-neutral-900">Operator details</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-neutral-500">Operated by</dt>
              <dd className="font-semibold text-neutral-900">{OPERATOR_NAME}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Website</dt>
              <dd className="font-semibold text-neutral-900 break-all">{SITE_URL}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Governing law</dt>
              <dd className="font-semibold text-neutral-900">{GOVERNING_LAW}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Payments by</dt>
              <dd className="font-semibold text-neutral-900">{RAZORPAY_NAME}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-14 pt-8 border-t border-neutral-200">
          <p className="text-sm text-neutral-500">
            Questions about this page?{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-emerald-700 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <nav aria-label="Legal" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <button
                key={link.path}
                type="button"
                onClick={() => {
                  window.location.href = link.path;
                }}
                className="text-xs font-semibold text-neutral-500 hover:text-emerald-700 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>
          <p className="mt-6 text-xs text-neutral-400">
            &copy; {POLICY_REVISED.slice(0, 4)} {OPERATOR_NAME}
          </p>
        </footer>
      </div>
    </div>
  );
};
