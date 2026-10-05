/**
 * Writes the site's indexable content into the built `index.html`.
 *
 * Vite ships a React shell whose `<div id="root">` is empty, so a crawler that
 * does not run JavaScript sees a page with no text at all. This step renders
 * the same content `src/components/SeoSections.tsx` renders and drops it into
 * the shell, so both kinds of crawler read the same words.
 *
 * It also refreshes the <head> tags and adds JSON-LD. Everything comes from
 * `src/seo/content.ts`, which is the single source of truth.
 *
 * Runs after `vite build` (see the "build" script in package.json).
 */
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
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
function body(site) {
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
    </div>`;
}

async function main() {
  let html;
  try {
    html = await readFile(distIndex, 'utf8');
  } catch {
    console.error('[seo] dist/index.html not found — run `vite build` first.');
    process.exit(1);
  }

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
    html = html.replace('<div id="root"></div>', `<div id="root">\n${body(site)}\n    </div>`);
  }

  await writeFile(distIndex, html, 'utf8');
  console.log('[seo] injected head tags, JSON-LD and pre-rendered content into dist/index.html');
}

main().catch((err) => {
  console.error('[seo] failed:', err);
  process.exit(1);
});
