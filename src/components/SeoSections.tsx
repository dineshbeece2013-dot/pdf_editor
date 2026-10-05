import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
import { navigate } from '../services/router';
import { LEGAL_LINKS } from './LegalPage';
import {
  CONTACT_EMAIL,
  FAQ,
  FEATURES,
  HERO_HEADING,
  HERO_SUBHEADING,
  OPERATOR_NAME,
  POLICY_REVISED,
  PRICING,
  SITE_TITLE,
} from '../seo/content';

/**
 * The site's indexable content, rendered inside the app.
 *
 * This mirrors the markup written into `index.html` at build time by
 * `scripts/inject-seo.mjs` — both read `src/seo/content.ts`, so the text a
 * crawler sees without JavaScript matches the text it sees with it.
 *
 * It is real, visible content rather than hidden text: search engines penalise
 * text that is present only to manipulate rankings, and this doubles as a
 * genuine explanation of what the tool does.
 */
export const SeoSections: React.FC = () => {
  // Keep the document title in step with the static <title>, so the tab and the
  // search result agree for anyone who lands here after client-side navigation.
  useEffect(() => {
    document.title = SITE_TITLE;
  }, []);

  return (
    <div className="bg-white text-neutral-700">
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
          {HERO_HEADING}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-neutral-600 max-w-3xl">{HERO_SUBHEADING}</p>
      </section>

      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="text-2xl font-bold text-neutral-900">What you can do</h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="font-semibold text-neutral-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-neutral-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
        <h2 className="text-2xl font-bold text-neutral-900">Pricing</h2>
        <div className="mt-8 grid sm:grid-cols-2 gap-6">
          {PRICING.map((p) => (
            <div key={p.name} className="rounded-xl border border-neutral-200 bg-white p-6">
              <h3 className="font-semibold text-neutral-900">{p.name}</h3>
              <p className="mt-2 text-2xl font-bold text-neutral-900 tabular-nums">
                <span aria-hidden="true">₹</span>
                {p.price}
              </p>
              <p className="mt-1 text-sm text-neutral-600">{p.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-neutral-600">
          Every visitor gets one free edit a day, with no account needed.
        </p>
      </section>

      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="text-2xl font-bold text-neutral-900">Frequently asked questions</h2>
          <div className="mt-8 space-y-8">
            {FAQ.map((item) => (
              <div key={item.question}>
                <h3 className="font-semibold text-neutral-900">{item.question}</h3>
                <p className="mt-2 text-sm text-neutral-600">{item.answer}</p>
              </div>
            ))}
          </div>
          <ul className="mt-10 grid sm:grid-cols-2 gap-2">
            {FEATURES.slice(0, 4).map((f) => (
              <li key={f.title} className="flex items-center gap-2 text-sm text-neutral-600">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                {f.title}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        The legal links live here rather than in a floating bar: a site that
        takes payment and stores email addresses is expected to publish how it
        handles data and how to reach a human, and crawlers follow links in the
        page body.
      */}
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
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
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-xs font-semibold text-neutral-500 hover:text-emerald-700 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </nav>
          <p className="mt-4 text-xs text-neutral-400">
            &copy; {POLICY_REVISED.slice(0, 4)} {OPERATOR_NAME}
          </p>
        </div>
      </footer>
    </div>
  );
};
