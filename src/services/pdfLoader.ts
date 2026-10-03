import * as pdfjsLib from 'pdfjs-dist';
// pdf.js requires the worker to be the EXACT same version as the main library;
// a mismatched one (e.g. a pinned CDN URL left behind after an npm upgrade)
// breaks every document load. `?url` makes Vite bundle the worker straight from
// the installed pdfjs-dist package, so the two can never drift apart — and it
// works offline with no CDN dependency.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { cssFontFamily, detectFontId } from './fontCatalog';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export { pdfjsLib };

export interface TextGlyphItem {
  id: string;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  originalFontName: string;
  fontSize: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  color?: string;
  lineHeight?: number;
}

export function mapPdfFontToStandard(fontName: string): 'Helvetica' | 'TimesRoman' | 'Courier' {
  const lower = fontName.toLowerCase();
  if (lower.includes('times') || lower.includes('serif') || lower.includes('georgia') || lower.includes('cambria')) {
    return 'TimesRoman';
  }
  if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas')) {
    return 'Courier';
  }
  return 'Helvetica';
}

export function mapPdfFontToCss(fontName: string): string {
  // Delegates to the font catalog so raw PDF names and catalog ids both
  // resolve to the same on-screen stack.
  return cssFontFamily(detectFontId(fontName));
}
