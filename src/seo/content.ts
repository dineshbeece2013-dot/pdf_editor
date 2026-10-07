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

export const SITE_NAME = 'PDF Editor Pro';

export const SITE_URL = 'https://digitalpdfeditor.com';

/**
 * Company and policy details shown across the legal pages.
 *
 * Kept in one place so the footer, the contact page and the structured data
 * can never quote a different email address or entity name.
 */

export const CONTACT_EMAIL = 'digitalpdfeditor@gmail.com';

/**
 * The individual or business operating the site.
 *
 * Replace this with your registered legal name if one exists — Google and
 * payment providers treat an untraceable operator as a risk signal, and a
 * named operator is the cheapest trust signal available.
 */
export const OPERATOR_NAME = 'PDF Editor Pro';

/** Shown as the governing law in the terms. */
export const GOVERNING_LAW = 'India';

/**
 * Last revised date for every policy page, ISO format.
 *
 * Policy pages must carry a date: an undated policy is unenforceable in
 * practice and looks careless to a reviewer.
 */
export const POLICY_REVISED = '2026-10-05';

/** How long an inactive session cookie survives, in days. */
export const SESSION_TTL_DAYS = 7;

export const RAZORPAY_NAME = 'Razorpay';


export const SITE_TITLE = 'Free Online PDF Editor — Edit, Sign & Annotate PDFs';

export const SITE_DESCRIPTION =
  'Edit PDFs free in your browser. Add text, images, shapes and signatures, highlight, redact, crop, rotate and annotate. No sign-up, no upload to a server, and one free edit every day.';

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
    title: 'Rotate pages',
    body: 'Turn any page 90° at a time — fix sideways scans and wrong orientations with one click.',
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
      'Yes. You get one free edit every day, with no account required. If you need unlimited edits, Pro is $1 a week or $3 a month.',
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
      'You can add, move, resize and delete text, images, shapes, drawings, highlights, stamps and signatures, and you can crop and rotate pages.',
  },
  {
    question: 'Can I edit a PDF on my phone?',
    answer:
      'Yes. The editor is built for touch as well as mouse, so the same tools work on a phone or tablet.',
  },
];

/** The two paid tiers, used for the SoftwareApplication structured data. */
export const PRICING = [
  { name: 'Pro Weekly', price: '1', currency: 'USD', description: 'Unlimited PDF editing for 7 days' },
  { name: 'Pro Monthly', price: '3', currency: 'USD', description: 'Unlimited PDF editing for 30 days' },
];

export interface PolicySection {
  heading: string;
  /** Plain-text paragraphs. Avoid inline HTML so escaping stays correct. */
  paragraphs: string[];
  bullets?: string[];
}

export const PRIVACY_POLICY: PolicySection[] = [
  {
    heading: 'Summary',
    paragraphs: [
      'PDF Editor Pro edits documents in your browser. The document you open is processed on your own device and is not uploaded to our servers.',
      'This policy explains what information we do collect, why we collect it, and what control you have over it.',
    ],
  },
  {
    heading: 'What we collect',
    paragraphs: ['We deliberately collect as little as possible. In practice that means:'],
    bullets: [
      'Account details — if you choose to create an account, we store your name, email address and a securely hashed password. We never see or store your plaintext password.',
      'Subscription records — which plan you bought, when, how much, and the payment reference from our payment processor.',
      'Usage counters — how many edits you have made, used to apply the free daily allowance.',
      'Technical logs — standard server request logs containing IP address, timestamp and requested URL, retained briefly for security and fault diagnosis.',
    ],
  },
  {
    heading: 'What we do not collect',
    paragraphs: [
      'We do not upload, store, read or transmit your PDF files. Editing happens locally in your browser, and the file you export is saved directly to your device.',
      'We do not collect payment card details. Card information is entered on the payment processor’s own secure page and never reaches our servers.',
    ],
  },
  {
    heading: 'How your data is used',
    paragraphs: ['We use the information above for these purposes:'],
    bullets: [
      'To operate your account and subscription.',
      'To process payments and provide receipts.',
      'To respond to support requests.',
      'To detect and prevent abuse of the service.',
    ],
  },
  {
    heading: 'Cookies',
    paragraphs: [
      'We set one cookie, a session cookie that keeps you signed in. It is marked HttpOnly so scripts cannot read it, Secure so it is only sent over HTTPS, and SameSite=Lax so it is not sent from other sites.',
      'We do not use advertising or cross-site tracking cookies.',
    ],
  },
  {
    heading: 'Payments',
    paragraphs: [
      'Payments are processed by Razorpay. Your card or bank details are entered on Razorpay’s secure payment page; we receive confirmation that a payment succeeded, along with the amount and a payment reference.',
    ],
  },
  {
    heading: 'Data retention',
    paragraphs: [
      'Account and subscription records are kept for as long as your account exists, and are deleted when you ask us to delete your account.',
      'Server logs are retained for a short period and then discarded.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: [
      'You can ask us at any time for a copy of the information we hold about you, or ask us to delete it. Contact us using the details on the Contact page and we will respond.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Passwords are hashed using a modern password hashing algorithm (Argon2id) and are never stored in readable form. Data in transit is encrypted with HTTPS.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If we change this policy we will update the date at the top of this page. Continuing to use the service after a change means you accept the updated policy.',
    ],
  },
];

export const TERMS_OF_SERVICE: PolicySection[] = [
  {
    heading: 'Acceptance of these terms',
    paragraphs: [
      'By using PDF Editor Pro you agree to these terms. If you do not agree, please do not use the service.',
    ],
  },
  {
    heading: 'The service',
    paragraphs: [
      'PDF Editor Pro is a browser-based tool for viewing and editing PDF documents. The free tier includes a limited number of edits per day. Paid plans are described on the upgrade screen, along with their price and duration.',
      'Prices are shown in Indian rupees (INR) and are charged by Razorpay. A plan grants unlimited editing for the period stated at the time of purchase.',
    ],
  },
  {
    heading: 'Accounts',
    paragraphs: [
      'You may use the editor without an account. An account is only required if you want a subscription or to use administrative features.',
      'You are responsible for keeping your account credentials confidential and for all activity that happens under your account.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: ['You agree not to use the service to:'],
    bullets: [
      'Break the law, or infringe anyone’s rights.',
      'Edit documents you do not have the right to edit, or process content you do not have the right to process.',
      'Attempt to disrupt the service, probe it for vulnerabilities without permission, or access accounts that are not yours.',
      'Circumvent free-tier limits or the payment flow.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You keep all rights to the documents you edit. Because your files are processed on your own device, we do not receive, claim or licence any rights to them.',
      'You are responsible for having the necessary rights to the documents you use, and for complying with any laws that apply to them.',
    ],
  },
  {
    heading: 'Subscriptions, cancellation and refunds',
    paragraphs: [
      'Paid plans are billed in advance and provide unlimited editing for the stated duration. They renew only if you choose to purchase them again; there is no automatic renewal.',
      'Because a paid plan grants editing time that has already been used, plans are generally non-refundable. See the Refund Policy for the exceptions where we do refund.',
    ],
  },
  {
    heading: 'Availability and changes',
    paragraphs: [
      'We aim to keep the service available but do not guarantee uninterrupted access. Features and prices may change; we will give reasonable notice before a change affects a plan you have already paid for.',
    ],
  },
  {
    heading: 'Limitation of liability',
    paragraphs: [
      'To the fullest extent permitted by law, we are not liable for indirect or consequential loss arising from your use of the service, including loss of data or lost profits.',
      'You are responsible for keeping your own backups of important documents. We do not store your files and cannot recover them for you.',
    ],
  },
  {
    heading: 'Governing law',
    paragraphs: [
      'These terms are governed by the laws of India, and the courts of India have exclusive jurisdiction over any dispute arising from them.',
    ],
  },
];

export const REFUND_POLICY: PolicySection[] = [
  {
    heading: 'Free tier',
    paragraphs: ['The free tier costs nothing, so there is nothing to refund.'],
  },
  {
    heading: 'Paid plans are non-refundable',
    paragraphs: [
      'Paid plans provide a fixed block of editing time that begins the moment you purchase. Once some or all of that time has been used, we cannot take the time back, so we do not refund it.',
      'This also means we do not offer pro-rata refunds for unused time on a plan you chose to buy.',
    ],
  },
  {
    heading: 'We will refund in these cases',
    paragraphs: ['We will issue a full refund in the following situations:'],
    bullets: [
      'You were charged but the payment was never completed on our side, so you did not receive the plan you paid for.',
      'The service was unavailable or materially broken for a continuous period and you tell us while your plan is still active.',
      'You were charged twice for the same purchase.',
      'A charge appears that you did not authorise. Tell us and we will investigate and refund it.',
    ],
  },
  {
    heading: 'How to request a refund',
    paragraphs: [
      'Contact us with the email address on your account and the date of payment, plus any Razorpay payment reference you have. We aim to respond within 7 days.',
      'Approved refunds are returned to the original payment method. Your bank or card issuer determines how long it then takes to appear on your statement.',
    ],
  },
];

