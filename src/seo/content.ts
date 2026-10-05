/**
 * The single source of truth for this site's indexable content.
 *
 * The same data drives two things, and they must not disagree:
 *   1. `src/components/SeoSections.tsx`, which renders it in the live app.
 *   2. `scripts/inject-seo.mjs`, which writes the same markup into the built
 *      `index.html` so a crawler sees text without running JavaScript.
 *
 * Google reads both. If they ever differed the site would look like keyword
 * stuffing to a crawler that runs JS and like an empty shell to one that
 * doesn't, so both are generated from this file.
 */

export const SITE_URL = 'https://digitalpdfeditor.com';

export const SITE_NAME = 'PDF Editor Pro';

export const SITE_TITLE = 'Free Online PDF Editor — Edit, Sign & Annotate PDFs';

export const SITE_DESCRIPTION =
  'Edit PDFs free in your browser. Add text, images, shapes and signatures, highlight, redact, crop and annotate. No sign-up, no upload to a server, and one free edit every day.';

export const HERO_HEADING = 'Free Online PDF Editor';

export const HERO_SUBHEADING =
  'Edit, sign, annotate and redact PDFs directly in your browser — free, with no sign-up and no file ever leaving your device.';

export interface FeatureItem {
  title: string;
  body: string;
}

export const FEATURES: FeatureItem[] = [
  {
    title: 'Add text and images',
    body: 'Drop text anywhere on the page and place images or logos on top of your document.',
  },
  {
    title: 'Sign PDFs in your browser',
    body: 'Draw or type a signature once, then reuse it on as many pages as you need.',
  },
  {
    title: 'Highlight and annotate',
    body: 'Highlight passages, freehand-draw notes, and stamp approvals or dates onto a page.',
  },
  {
    title: 'Crop and redact',
    body: 'Crop a page to a region, or black out sensitive details permanently before you share it.',
  },
  {
    title: 'Shapes and stamps',
    body: 'Draw rectangles and circles, and stamp approved, rejected or confidential markers.',
  },
  {
    title: 'Undo and redo',
    body: 'Every change is reversible, so you can experiment and step back without losing work.',
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ: FaqItem[] = [
  {
    question: 'Is this PDF editor really free?',
    answer:
      'Yes. You get one free edit every day, with no account required. If you need unlimited edits, Pro is ₹19 for a day or ₹99 for a month.',
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'No. You can open a PDF and start editing as a guest straight away. An account is only needed if you want a subscription.',
  },
  {
    question: 'Are my files uploaded anywhere?',
    answer:
      'No. Editing happens entirely in your browser, and the file is never sent to a server. When you export, the result is saved straight to your own device.',
  },
  {
    question: 'What can I change in a PDF?',
    answer:
      'You can add, move, resize and delete text, images, shapes, drawings, highlights, stamps and signatures, and you can crop pages.',
  },
  {
    question: 'Can I edit a PDF on my phone?',
    answer:
      'Yes. The editor is built for touch as well as mouse, so the same tools work on a phone or tablet.',
  },
];

/** The two paid tiers, used for the SoftwareApplication structured data. */
export const PRICING = [
  { name: 'Pro Daily', price: '19', currency: 'INR', description: 'Unlimited PDF editing for 24 hours' },
  { name: 'Pro Monthly', price: '99', currency: 'INR', description: 'Unlimited PDF editing for 30 days' },
];
