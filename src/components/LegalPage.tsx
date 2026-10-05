import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigate } from '../services/router';
import {
  CONTACT_EMAIL,
  OPERATOR_NAME,
  POLICY_REVISED,
  type PolicySection,
} from '../seo/content';

/** Every footer link, so the nav and the sitemap stay in step. */
export const LEGAL_LINKS = [
  { path: '/privacy', label: 'Privacy Policy' },
  { path: '/terms', label: 'Terms of Service' },
  { path: '/refund-policy', label: 'Refund Policy' },
  { path: '/contact', label: 'Contact' },
] as const;

export interface LegalPageProps {
  title: string;
  intro: string;
  sections: PolicySection[];
}

/**
 * Shared layout for the policy and contact pages.
 *
 * These pages are the trust surface of the site: a person deciding whether to
 * enter card details looks for exactly this material. They are plain, static
 * and server-rendered in index.html (see scripts/inject-seo.mjs) so a crawler
 * or a reader without JavaScript still sees the full text.
 */
export const LegalPage: React.FC<LegalPageProps> = ({ title, intro, sections }) => {
  useEffect(() => {
    document.title = `${title} — PDF Editor Pro`;
  }, [title]);

  return (
    <div className="min-h-screen bg-white text-neutral-700">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to the editor
        </button>

        <h1 className="mt-6 text-3xl font-bold text-neutral-900 tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-neutral-500">
          Last updated: <time dateTime={POLICY_REVISED}>{POLICY_REVISED}</time>
        </p>
        <p className="mt-6 text-base text-neutral-600">{intro}</p>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-neutral-900">{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-neutral-600">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-neutral-600">
                      <span aria-hidden="true" className="text-emerald-600 select-none">
                        &bull;
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
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
                onClick={() => navigate(link.path)}
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
