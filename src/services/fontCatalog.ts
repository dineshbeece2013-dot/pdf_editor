/**
 * Font catalog — single source of truth for every selectable text font.
 *
 * Each entry renders two ways:
 *  - On screen: the `css` stack. Web fonts are local @font-face TTFs
 *    (public/fonts, declared in index.css); document fonts use the user's
 *    installed system fonts, so previews are exact.
 *  - In the exported PDF: the `export` spec. Google fonts embed their own
 *    TTF (subsetted). System fonts (Arial, Calibri, Georgia, ...) cannot be
 *    redistributed, so they export as a metric-compatible open clone
 *    (Carlito=Calibri, Gelasio=Georgia, Caladea=Cambria, DejaVu~=Verdana,
 *    Comic Neue~=Comic Sans) or as the matching PDF standard font.
 */

export type FontCategory = 'sans' | 'serif' | 'mono';
export type FontGroup = 'standard' | 'document' | 'google';
export type StandardFontFamily = 'Helvetica' | 'TimesRoman' | 'Courier';

export type FontExportSpec =
  /** PDF base-14 font — needs no font file. */
  | { kind: 'standard'; family: StandardFontFamily }
  /** Embed this TTF from /public/fonts (regular + bold). */
  | { kind: 'file'; regular: string; bold: string }
  /** Fall back to the category's standard font. */
  | { kind: 'category' };

export interface FontDef {
  id: string;
  label: string;
  /** CSS font-family stack used for on-screen rendering. */
  css: string;
  category: FontCategory;
  group: FontGroup;
  export: FontExportSpec;
  /**
   * Lowercase alphanumeric fragments matched against the raw PDF font name
   * (e.g. "ArialMT", "Calibri-Bold"). Longest fragment wins.
   */
  match?: string[];
}

export const FONTS: FontDef[] = [
  // --- PDF standard fonts (legacy ids kept so previously saved overlays round-trip) ---
  { id: 'Helvetica', label: 'Helvetica', css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', category: 'sans', group: 'standard', export: { kind: 'standard', family: 'Helvetica' }, match: ['helvetica', 'helv'] },
  { id: 'TimesRoman', label: 'Times Roman', css: '"Times New Roman", Times, Georgia, serif', category: 'serif', group: 'standard', export: { kind: 'standard', family: 'TimesRoman' }, match: ['times'] },
  { id: 'Courier', label: 'Courier', css: '"Courier New", Courier, monospace', category: 'mono', group: 'standard', export: { kind: 'standard', family: 'Courier' }, match: ['courier'] },

  // --- Common document / system fonts (exact on screen; clone or standard font on export) ---
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif', category: 'sans', group: 'document', export: { kind: 'standard', family: 'Helvetica' }, match: ['arial', 'liberationsans'] },
  { id: 'times-new-roman', label: 'Times New Roman', css: '"Times New Roman", Times, serif', category: 'serif', group: 'document', export: { kind: 'standard', family: 'TimesRoman' }, match: ['timesnewroman', 'liberationserif', 'tinos'] },
  { id: 'courier-new', label: 'Courier New', css: '"Courier New", Courier, monospace', category: 'mono', group: 'document', export: { kind: 'standard', family: 'Courier' }, match: ['couriernew', 'liberationmono'] },
  { id: 'calibri', label: 'Calibri', css: 'Calibri, Carlito, "Segoe UI", Candara, sans-serif', category: 'sans', group: 'document', export: { kind: 'file', regular: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf' }, match: ['calibri', 'carlito'] },
  { id: 'cambria', label: 'Cambria', css: 'Cambria, Caladea, Georgia, serif', category: 'serif', group: 'document', export: { kind: 'file', regular: 'Caladea-Regular.ttf', bold: 'Caladea-Bold.ttf' }, match: ['cambria', 'caladea'] },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, Gelasio, "Times New Roman", serif', category: 'serif', group: 'document', export: { kind: 'file', regular: 'Gelasio-Regular.ttf', bold: 'Gelasio-Bold.ttf' }, match: ['georgia', 'gelasio'] },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, "DejaVu Sans", Geneva, sans-serif', category: 'sans', group: 'document', export: { kind: 'file', regular: 'DejaVuSans-Regular.ttf', bold: 'DejaVuSans-Bold.ttf' }, match: ['verdana', 'dejavusans'] },
  { id: 'segoe-ui', label: 'Segoe UI', css: '"Segoe UI", system-ui, sans-serif', category: 'sans', group: 'document', export: { kind: 'file', regular: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf' }, match: ['segoeui', 'selawik'] },
  { id: 'garamond', label: 'Garamond', css: 'Garamond, "EB Garamond", Georgia, serif', category: 'serif', group: 'document', export: { kind: 'file', regular: 'EBGaramond-Regular.ttf', bold: 'EBGaramond-Bold.ttf' }, match: ['garamond'] },
  { id: 'tahoma', label: 'Tahoma', css: 'Tahoma, Verdana, sans-serif', category: 'sans', group: 'document', export: { kind: 'category' }, match: ['tahoma'] },
  { id: 'trebuchet', label: 'Trebuchet MS', css: '"Trebuchet MS", "Lucida Grande", Verdana, sans-serif', category: 'sans', group: 'document', export: { kind: 'category' }, match: ['trebuchet'] },
  { id: 'comic-sans-ms', label: 'Comic Sans MS', css: '"Comic Sans MS", "Comic Neue", cursive', category: 'sans', group: 'document', export: { kind: 'file', regular: 'ComicNeue-Regular.ttf', bold: 'ComicNeue-Bold.ttf' }, match: ['comicsans'] },

  // --- Google web fonts (local @font-face TTF; the same file is embedded into the PDF) ---
  { id: 'inter', label: 'Inter', css: 'Inter, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' }, match: ['inter'] },
  { id: 'roboto', label: 'Roboto', css: 'Roboto, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Roboto-Regular.ttf', bold: 'Roboto-Bold.ttf' }, match: ['roboto'] },
  { id: 'open-sans', label: 'Open Sans', css: '"Open Sans", system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'OpenSans-Regular.ttf', bold: 'OpenSans-Bold.ttf' }, match: ['opensans'] },
  { id: 'lato', label: 'Lato', css: 'Lato, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Lato-Regular.ttf', bold: 'Lato-Bold.ttf' }, match: ['lato'] },
  { id: 'montserrat', label: 'Montserrat', css: 'Montserrat, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf' }, match: ['montserrat'] },
  { id: 'poppins', label: 'Poppins', css: 'Poppins, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf' }, match: ['poppins'] },
  { id: 'nunito', label: 'Nunito', css: 'Nunito, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Nunito-Regular.ttf', bold: 'Nunito-Bold.ttf' }, match: ['nunito'] },
  { id: 'ubuntu', label: 'Ubuntu', css: 'Ubuntu, system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'Ubuntu-Regular.ttf', bold: 'Ubuntu-Bold.ttf' }, match: ['ubuntu'] },
  { id: 'source-sans-3', label: 'Source Sans 3', css: '"Source Sans 3", system-ui, sans-serif', category: 'sans', group: 'google', export: { kind: 'file', regular: 'SourceSans3-Regular.ttf', bold: 'SourceSans3-Bold.ttf' }, match: ['sourcesans'] },
  { id: 'merriweather', label: 'Merriweather', css: 'Merriweather, Georgia, serif', category: 'serif', group: 'google', export: { kind: 'file', regular: 'Merriweather-Regular.ttf', bold: 'Merriweather-Bold.ttf' }, match: ['merriweather'] },
  { id: 'playfair-display', label: 'Playfair Display', css: '"Playfair Display", Georgia, serif', category: 'serif', group: 'google', export: { kind: 'file', regular: 'PlayfairDisplay-Regular.ttf', bold: 'PlayfairDisplay-Bold.ttf' }, match: ['playfair'] },
  { id: 'libre-baskerville', label: 'Libre Baskerville', css: '"Libre Baskerville", Baskerville, Georgia, serif', category: 'serif', group: 'google', export: { kind: 'file', regular: 'LibreBaskerville-Regular.ttf', bold: 'LibreBaskerville-Bold.ttf' }, match: ['librebaskerville', 'baskerville'] },
  { id: 'eb-garamond', label: 'EB Garamond', css: '"EB Garamond", Garamond, Georgia, serif', category: 'serif', group: 'google', export: { kind: 'file', regular: 'EBGaramond-Regular.ttf', bold: 'EBGaramond-Bold.ttf' }, match: ['ebgaramond'] },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', css: '"JetBrains Mono", "Courier New", monospace', category: 'mono', group: 'google', export: { kind: 'file', regular: 'JetBrainsMono-Regular.ttf', bold: 'JetBrainsMono-Bold.ttf' }, match: ['jetbrains', 'jbmono'] },
  { id: 'comic-neue', label: 'Comic Neue', css: '"Comic Neue", "Comic Sans MS", cursive', category: 'sans', group: 'google', export: { kind: 'file', regular: 'ComicNeue-Regular.ttf', bold: 'ComicNeue-Bold.ttf' }, match: ['comicneue'] },
];


/** Fallback definition used for unknown ids. */
const DEFAULT_FONT = FONTS[0];

export function getFontDef(id: string): FontDef {
  return FONTS.find((font) => font.id === id) ?? DEFAULT_FONT;
}

export function isValidFontId(id: string): boolean {
  return FONTS.some((font) => font.id === id);
}

/** CSS font-family stack for a catalog id (unknown ids resolve to the default). */
export function cssFontFamily(id: string): string {
  return getFontDef(id).css;
}

/** Lowercase + strip non-alphanumerics so "ArialMT" matches "arial". */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const SERIF_RE =
  /times|serif|georgia|cambria|garamond|palatino|constantia|charter|baskerville|didot|bodoni|caslon|bookman|lora|crimson|spectral/;
const MONO_RE = /courier|mono|consolas|menlo|monaco|inconsolata|hack|cascadia|ocr/;

/**
 * Map a PDF's raw font name (or a catalog id) to the best catalog id.
 * Longest matching fragment wins, so "TimesNewRomanPSMT" -> times-new-roman
 * beats the generic "times" rule. Unknown fonts fall back by category.
 */
export function detectFontId(fontName?: string | null): string {
  const raw = (fontName ?? '').trim();
  if (!raw) return DEFAULT_FONT.id;

  const normalized = normalize(raw);
  let bestId: string | null = null;
  let bestLen = 0;
  for (const font of FONTS) {
    for (const fragment of font.match ?? []) {
      const normalizedFragment = normalize(fragment);
      if (normalizedFragment.length > bestLen && normalized.includes(normalizedFragment)) {
        bestLen = normalizedFragment.length;
        bestId = font.id;
      }
    }
  }
  if (bestId) return bestId;

  const lower = raw.toLowerCase();
  if (MONO_RE.test(lower)) return 'Courier';
  // "SansSerif"-style names must not be caught by the serif rule.
  if (SERIF_RE.test(lower) && !lower.includes('sans')) return 'TimesRoman';
  return 'Helvetica';
}

export interface FontGroupEntry {
  label: string;
  fonts: FontDef[];
}

/** Groups rendered as <optgroup>s in the text editor's font dropdown. */
export const FONT_GROUPS: FontGroupEntry[] = [
  { label: 'Document fonts', fonts: FONTS.filter((font) => font.group === 'document') },
  { label: 'PDF standard fonts', fonts: FONTS.filter((font) => font.group === 'standard') },
  { label: 'Google fonts', fonts: FONTS.filter((font) => font.group === 'google') },
];

