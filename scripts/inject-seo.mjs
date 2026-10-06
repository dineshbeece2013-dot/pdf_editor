/**
 * Writes the site's indexable content into the built site.
 *
 * Two jobs:
 *
 *  1. `index.html` — Vite ships a React shell whose `<div id="root">` is empty,
 *     so a crawler that does not run JavaScript sees a page with no text at
 *     all. This renders the content `src/components/SeoSections.tsx` renders
 *     and drops it into the shell.
 *
 *  2. The legal pages — /privacy, /terms, /refund-policy and /contact become
 *     real standalone .html files. They cannot be SPA routes alone: these pages
 *     are what make the site look legitimate to a reader and a crawler, and
 *     both need the text without executing JavaScript.
 *
 * Everything comes from `src/seo/content.ts`, the single source of truth.
 *
 * Runs after `vite build` (see the "build" script in package.json).
 */
import { readFile, writeFile, rm, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(root, 'dist', 'index.html');
const contentSource = join(root, 'src', 'seo', 'content.ts');

/** Escape text for use in HTML. */
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * JSON-LD describing the app and its paid tiers. This is what can make a price
 * and a rating appear under the search result, so the amounts must match the
 * server catalogue — they are read from the same source.
 */
function structuredData(site) {
  const graph = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${site.SITE_URL}/#website`,
      url: `${site.SITE_URL}/`,
      name: site.SITE_NAME,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': `${site.SITE_URL}/#app`,
      name: site.SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any (web browser)',
      url: `${site.SITE_URL}/`,
      description: site.SITE_DESCRIPTION,
      offers: site.PRICING.map((p) => ({
        '@type': 'Offer',
        name: p.name,
        price: p.price,
        priceCurrency: p.currency,
        description: p.description,
        availability: 'https://schema.org/InStock',
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${site.SITE_URL}/#org`,
      name: site.OPERATOR_NAME,
      url: `${site.SITE_URL}/`,
      email: site.CONTACT_EMAIL,
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: site.CONTACT_EMAIL,
          availableLanguage: ['en'],
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${site.SITE_URL}/#faq`,
      mainEntity: site.FAQ.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ];

  // `</script>` inside a JSON string would close the tag early.
  return JSON.stringify({ '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

/** The body markup, mirroring SeoSections.tsx. */
function body(site, legalNav) {
  const features = site.FEATURES.map(
    (f) => `        <div>
          <h3>${esc(f.title)}</h3>
          <p>${esc(f.body)}</p>
        </div>`,
  ).join('\n');

  const pricing = site.PRICING.map(
    (p) => `        <div>
          <h3>${esc(p.name)}</h3>
          <p><span aria-hidden="true">₹</span>${esc(p.price)}</p>
          <p>${esc(p.description)}</p>
        </div>`,
  ).join('\n');

  const faq = site.FAQ.map(
    (item) => `        <div>
          <h3>${esc(item.question)}</h3>
          <p>${esc(item.answer)}</p>
        </div>`,
  ).join('\n');

  return `    <div class="seo-prerender">
      <section>
        <h1>${esc(site.HERO_HEADING)}</h1>
        <p>${esc(site.HERO_SUBHEADING)}</p>
      </section>
      <section>
        <h2>What you can do</h2>
        <div>
${features}
        </div>
      </section>
      <section>
        <h2>Pricing</h2>
        <div>
${pricing}
        </div>
        <p>Every visitor gets one free edit a day, with no account needed.</p>
      </section>
      <section>
        <h2>Frequently asked questions</h2>
        <div>
${faq}
        </div>
      </section>
      <footer>
        <nav>
${legalNav}
        </nav>
        <p>&copy; ${esc(String(site.POLICY_REVISED).slice(0, 4))} ${esc(site.OPERATOR_NAME)}</p>
      </footer>
    </div>`;
}

/**
 * A flat list of links to the legal pages.
 *
 * Plain `<a href>` rather than buttons, so a crawler can follow them and so
 * they degrade to ordinary navigation if JavaScript never runs.
 */
function legalNav(site) {
  return [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms of Service' },
    { href: '/refund-policy', label: 'Refund Policy' },
    { href: '/contact', label: 'Contact' },
  ]
    .map((l) => `          <a href="${l.href}">${esc(l.label)}</a>`)
    .join('\n');
}

/** Operator details shown on the contact page. */
function contactSections(site) {
  const rows = [
    ['Operated by', site.OPERATOR_NAME],
    ['Website', site.SITE_URL],
    ['Governing law', site.GOVERNING_LAW],
    ['Payments by', site.RAZORPAY_NAME],
  ]
    .map(([k, v]) => `        <p><strong>${esc(k)}:</strong> ${esc(v)}</p>`)
    .join('\n');

  const pricing = site.PRICING.map(
    (p) => `          <li>${esc(p.name)} — ${esc(p.description)}: ₹${esc(p.price)}</li>`,
  ).join('\n');

  return `      <section>
        <h2>Email us</h2>
        <p><a href="mailto:${esc(site.CONTACT_EMAIL)}">${esc(site.CONTACT_EMAIL)}</a></p>
        <p>Include your account email address and, for a billing question, the Razorpay payment reference. We aim to reply within 2 working days.</p>
      </section>
      <section>
        <h2>Plan pricing</h2>
        <ul>
${pricing}
        </ul>
      </section>
      <section>
        <h2>Operator details</h2>
${rows}
      </section>`;
}

/** One page's worth of policy sections. */
function policySections(sections) {
  return sections
    .map(
      (s) => `      <section>
        <h2>${esc(s.heading)}</h2>
${s.paragraphs.map((p) => `        <p>${esc(p)}</p>`).join('\n')}
${
  s.bullets
    ? `        <ul>\n${s.bullets.map((b) => `          <li>${esc(b)}</li>`).join('\n')}\n        </ul>`
    : ''
}
      </section>`,
    )
    .join('\n');
}

/**
 * A complete standalone HTML document for a policy or contact page.
 *
 * Deliberately has no <script>: these pages must be readable as plain HTML,
 * both for a crawler and for anyone whose JavaScript fails. React still takes
 * over in the browser, because the same routes are wired in App.tsx.
 */
function legalPage(
  site,
  { path, title, description, main, nav },
  { styleTag, scriptTag },
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)} — ${esc(site.SITE_NAME)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(site.SITE_URL)}${esc(path)}" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon.png" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="robots" content="index, follow" />${styleTag}
  </head>
  <body class="bg-white">
    <div id="root">
      <main>
        <h1>${esc(title)}</h1>
        <p>Last updated: <time datetime="${esc(site.POLICY_REVISED)}">${esc(site.POLICY_REVISED)}</time></p>
        <p>${esc(description)}</p>
${main}
        <footer>
          <p>Questions? <a href="mailto:${esc(site.CONTACT_EMAIL)}">${esc(site.CONTACT_EMAIL)}</a></p>
          <nav>
${nav}
          </nav>
          <p>&copy; ${esc(String(site.POLICY_REVISED).slice(0, 4))} ${esc(site.OPERATOR_NAME)}</p>
        </footer>
      </main>
    </div>${scriptTag}
  </body>
</html>
`;
}

async function main() {
  let html;
  try {
    html = await readFile(distIndex, 'utf8');
  } catch {
    console.error('[seo] dist/index.html not found — run `vite build` first.');
    process.exit(1);
  }

  // Reuse the stylesheet Vite just emitted. Its filename is content-hashed, so
  // it is read from the shell rather than hardcoded — a stale name here would
  // leave the legal pages unstyled.
  const styleMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"/);
  const styleTag = styleMatch ? `\n    <link rel="stylesheet" href="${styleMatch[1]}" />` : '';
  const scriptMatch = html.match(/<script type="module"[^>]*src="([^"]+)"/);
  const scriptTag = scriptMatch
    ? `\n    <script type="module" crossorigin src="${scriptMatch[1]}"></script>`
    : '';

  // Load content.ts by building it with Vite — already a dependency, and the
  // same toolchain the app is compiled with — so this script reads the source
  // the React component does instead of a second, hand-maintained copy.
  const dir = await mkdtemp(join(tmpdir(), 'pdfpro-seo-'));
  const outfile = join(dir, 'content.mjs');
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir: dir,
      emptyOutDir: false,
      lib: { entry: contentSource, formats: ['es'], fileName: () => 'content.mjs' },
      minify: false,
    },
  });
  const site = await import(pathToFileURL(outfile).href);
  await rm(dir, { recursive: true, force: true });

  // Head tags. Each is replaced only if already present, so index.html stays
  // the source of truth for structure and this stays the source of truth for
  // the copy.
  const setMeta = (name, content) => {
    const re = new RegExp(`(<meta\\s+name="${name}"\\s+content=")[^"]*(")`, 'i');
    if (re.test(html)) html = html.replace(re, `$1${esc(content)}$2`);
  };

  setMeta('description', site.SITE_DESCRIPTION);
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(site.SITE_TITLE)}</title>`);

  // JSON-LD goes just before </head>.
  if (!html.includes('application/ld+json')) {
    html = html.replace(
      '</head>',
      `    <script type="application/ld+json">\n${structuredData(site)}\n    </script>\n  </head>`,
    );
  }

  // The pre-rendered content goes inside #root; React replaces it on mount.
  if (html.includes('<div id="root"></div>')) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">\n${body(site, legalNav(site))}\n    </div>`,
    );
  }

  await writeFile(distIndex, html, 'utf8');
  console.log('[seo] injected head tags, JSON-LD and pre-rendered content into dist/index.html');

  // ---- Static legal pages ------------------------------------------------
  // Written as real files so they are served (and indexed) even without
  // JavaScript. The same routes are also wired in App.tsx, so React takes over
  // in a real browser and the styling matches.
  const legalDir = join(root, 'dist', 'legal');
  await mkdir(legalDir, { recursive: true });

  const pages = [
    {
      path: '/privacy',
      title: 'Privacy Policy',
      description:
        'How PDF Editor Pro handles your data: what is collected, what is never uploaded, how payments work, and how to request deletion.',
      main: policySections(site.PRIVACY_POLICY),
    },
    {
      path: '/terms',
      title: 'Terms of Service',
      description:
        'The terms that apply when you use PDF Editor Pro, including acceptable use, subscriptions, and limitation of liability.',
      main: policySections(site.TERMS_OF_SERVICE),
    },
    {
      path: '/refund-policy',
      title: 'Refund Policy',
      description:
        'Paid plans are non-refundable because editing time is used as it passes. These are the cases where we do issue a refund.',
      main: policySections(site.REFUND_POLICY),
    },
    {
      path: '/contact',
      title: 'Contact',
      description: `Get in touch with ${site.SITE_NAME} by email at ${site.CONTACT_EMAIL}.`,
      main: contactSections(site),
    },
  ];

  const nav = legalNav(site);
  for (const page of pages) {
    const doc = legalPage(site, { ...page, nav }, { styleTag, scriptTag });
    await writeFile(join(legalDir, `${page.path.slice(1)}.html`), doc, 'utf8');
  }
  console.log(
    `[seo] wrote ${pages.length} static legal pages: ${pages.map((p) => p.path).join(', ')}`,
  );
}

main().catch((err) => {
  console.error('[seo] failed:', err);
  process.exit(1);
});
