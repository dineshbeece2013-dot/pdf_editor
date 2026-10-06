import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { getFontDef, type StandardFontFamily } from './fontCatalog';
import type { EditedTextOverlay, PageCropSetting, SignatureItem, HighlightArea, FreehandDrawing, ImageOverlay, ShapeOverlay, StampOverlay, EraseArea } from '../types/pdf';
import { wrapLines } from '../utils/wrapText';

export interface ExportPdfOptions {
  originalPdfBytes: Uint8Array;
  textOverlays: EditedTextOverlay[];
  cropSettings: Record<number, PageCropSetting>;
  signatures: SignatureItem[];
  imageOverlays: ImageOverlay[];
  shapes: ShapeOverlay[];
  stamps: StampOverlay[];
  highlights: HighlightArea[];
  drawings: FreehandDrawing[];
  /** Eraser white covers — drawn last so they mask everything beneath them. */
  eraseAreas: EraseArea[];
}

export function hexToRgb(hex: string) {
  const cleanHex = hex.replace('#', '');
  let r = 0;
  let g = 0;
  let b = 0;
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  }
  return rgb(r, g, b);
}

export async function exportModifiedPdf(options: ExportPdfOptions): Promise<Uint8Array> {
  const {
    originalPdfBytes,
    textOverlays,
    cropSettings,
    signatures,
    imageOverlays,
    shapes,
    stamps,
    highlights,
    drawings,
    eraseAreas,
  } = options;

  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // Text overlays resolve through the font catalog: standard fonts reuse the
  // embedded base-14 fonts above; other fonts fetch their TTF from
  // /public/fonts and embed it subsetted. Anything unavailable falls back to
  // the standard font of the same category.
  const embeddedFonts = new Map<string, PDFFont>();
  const standardFont = (family: StandardFontFamily, bold?: boolean) => {
    if (family === 'TimesRoman') return bold ? timesBold : timesFont;
    if (family === 'Courier') return bold ? courierBold : courierFont;
    return bold ? helveticaBold : helveticaFont;
  };

  const resolveOverlayFont = async (family: string, bold?: boolean): Promise<PDFFont> => {
    const def = getFontDef(family);
    const spec = def.export;
    if (spec.kind === 'standard') return standardFont(spec.family, bold);
    if (spec.kind === 'file') {
      const fileName = bold ? spec.bold : spec.regular;
      const cached = embeddedFonts.get(fileName);
      if (cached) return cached;
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'fonts/' + fileName);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const embedded = await pdfDoc.embedFont(bytes, { subset: true });
        embeddedFonts.set(fileName, embedded);
        return embedded;
      } catch {
        // Missing/unloadable font file -> category fallback below.
      }
    }
    const fallback =
      def.category === 'serif' ? 'TimesRoman' : def.category === 'mono' ? 'Courier' : 'Helvetica';
    return standardFont(fallback, bold);
  };

  const pages = pdfDoc.getPages();

  // 1. Page Cropping
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const crop = cropSettings[i];
    if (crop) {
      page.setCropBox(crop.x, crop.y, crop.width, crop.height);
      page.setMediaBox(crop.x, crop.y, crop.width, crop.height);
    }
  }

  // 2. Text Redactions & Overlays
  for (const overlay of textOverlays) {
    const page = pages[overlay.pageIndex];
    if (!page) continue;

    if (overlay.coverOriginal && overlay.coverRect) {
      const cover = overlay.coverRect;
      page.drawRectangle({
        x: cover.pdfX,
        y: cover.pdfY,
        width: cover.pdfWidth,
        height: cover.pdfHeight,
        color: cover.color ? hexToRgb(cover.color) : rgb(1, 1, 1),
        opacity: 1,
      });
    }

    if (overlay.text && overlay.text.trim().length > 0) {
      const font = await resolveOverlayFont(overlay.fontFamily, overlay.isBold);
      const color = hexToRgb(overlay.color || '#000000');
      const size = overlay.fontSize > 0 ? overlay.fontSize : 12;
      const lineHeight = size * 1.2;
      // Wrap with the same algorithm (and matching metrics) the on-screen
      // overlay uses, so exported line breaks match what the user saw.
      const lines = wrapLines(
        (t) => font.widthOfTextAtSize(t, size),
        overlay.text,
        Math.max(8, overlay.pdfWidth),
      );
      // Only as many lines as fit the box are drawn — mirrors the
      // overflow-hidden clipping on screen.
      const maxLines = Math.max(1, Math.floor(overlay.pdfHeight / lineHeight));
      const top = overlay.pdfY + overlay.pdfHeight;
      lines.slice(0, maxLines).forEach((line, i) => {
        if (!line) return;
        page.drawText(line, {
          x: overlay.pdfX,
          // First-line baseline sits ~0.92em below the box top (matches the
          // CSS half-leading + ascent of line-height 1.2 on screen).
          y: top - (0.92 + i * 1.2) * size,
          size: size,
          font: font,
          color: color,
          // 1 (100%) unless the user lowered the box's opacity slider.
          opacity: overlay.opacity ?? 1,
        });
      });
    }
  }

  // 3. Highlights
  for (const hl of highlights) {
    const page = pages[hl.pageIndex];
    if (!page) continue;
    page.drawRectangle({
      x: hl.pdfX,
      y: hl.pdfY,
      width: hl.pdfWidth,
      height: hl.pdfHeight,
      color: hexToRgb(hl.color || '#ffff00'),
      opacity: 0.35,
    });
  }

  // 4. Signatures
  for (const sig of signatures) {
    const page = pages[sig.pageIndex];
    if (!page) continue;
    try {
      const pngImage = await pdfDoc.embedPng(sig.dataUrl);
      page.drawImage(pngImage, {
        x: sig.pdfX,
        y: sig.pdfY,
        width: sig.pdfWidth,
        height: sig.pdfHeight,
      });
    } catch (e) {
      console.error('Failed to embed signature:', e);
    }
  }

  // 4b. Pasted region images (select → copy → paste)
  for (const img of imageOverlays) {
    const page = pages[img.pageIndex];
    if (!page) continue;
    try {
      const pngImage = await pdfDoc.embedPng(img.dataUrl);
      page.drawImage(pngImage, {
        x: img.pdfX,
        y: img.pdfY,
        width: img.pdfWidth,
        height: img.pdfHeight,
      });
    } catch (e) {
      console.error('Failed to embed pasted image:', e);
    }
  }

  // 4c. Shape annotations (ellipse / rectangle / triangle)
  for (const sh of shapes) {
    const page = pages[sh.pageIndex];
    if (!page) continue;
    const stroke = hexToRgb(sh.color || '#059669');
    const thickness = sh.strokeWidth || 2;
    const fill = sh.fillColor ? hexToRgb(sh.fillColor) : undefined;
    const fillOpacity = sh.fillColor ? (sh.fillOpacity ?? 0.35) : 0;
    if (sh.kind === 'ellipse') {
      page.drawEllipse({
        x: sh.pdfX + sh.pdfWidth / 2,
        y: sh.pdfY + sh.pdfHeight / 2,
        xScale: Math.max(sh.pdfWidth / 2, 0.5),
        yScale: Math.max(sh.pdfHeight / 2, 0.5),
        borderColor: stroke,
        borderWidth: thickness,
        ...(fill ? { color: fill, opacity: fillOpacity } : {}),
      });
    } else if (sh.kind === 'rectangle') {
      page.drawRectangle({
        x: sh.pdfX,
        y: sh.pdfY,
        width: sh.pdfWidth,
        height: sh.pdfHeight,
        borderColor: stroke,
        borderWidth: thickness,
        ...(fill ? { color: fill, opacity: fillOpacity } : {}),
      });
    } else if (sh.points.length === 2) {
      // Triangle: apex at the drag end (b), base on the opposite side — the
      // same orientation rule the on-screen renderer applies. PDF y grows
      // upward, so the screen test `by >= ay` (apex down) is `b.y <= a.y`.
      const [a, b] = sh.points;
      const { pdfX, pdfY, pdfWidth, pdfHeight } = sh;
      const right = pdfX + pdfWidth;
      const top = pdfY + pdfHeight;
      const midX = pdfX + pdfWidth / 2;
      const midY = pdfY + pdfHeight / 2;
      const dy = b.y - a.y;
      const vertices =
        Math.abs(b.x - a.x) >= Math.abs(dy)
          ? b.x >= a.x
            ? [{ x: pdfX, y: top }, { x: pdfX, y: pdfY }, { x: right, y: midY }]
            : [{ x: right, y: top }, { x: right, y: pdfY }, { x: pdfX, y: midY }]
          : dy <= 0 // dragged downward — apex on the bottom edge
            ? [{ x: pdfX, y: top }, { x: right, y: top }, { x: midX, y: pdfY }]
            : [{ x: pdfX, y: pdfY }, { x: right, y: pdfY }, { x: midX, y: top }];
      // drawSvgPath translates to (x, y) then flips Y because the SVG axis
      // points down. Passing origin (0, top) and vertices as (vx, top - vy)
      // maps PDF coordinates back exactly, keeping every y non-negative.
      const path =
        `M ${vertices[0].x} ${top - vertices[0].y}` +
        ` L ${vertices[1].x} ${top - vertices[1].y}` +
        ` L ${vertices[2].x} ${top - vertices[2].y} Z`;
      page.drawSvgPath(path, {
        x: 0,
        y: top,
        ...(fill ? { color: fill, opacity: fillOpacity } : {}),
        borderColor: stroke,
        borderWidth: thickness,
        borderOpacity: 1,
      });
    }
  }

  // 4d. Stamp annotations (check / cross / star)
  for (const st of stamps) {
    const page = pages[st.pageIndex];
    if (!page) continue;
    const col = hexToRgb(st.color || '#16a34a');
    const th = Math.max(1.5, Math.min(st.pdfWidth, st.pdfHeight) * 0.12);
    const { pdfX: x, pdfY: y, pdfWidth: w, pdfHeight: h } = st;
    if (st.kind === 'check') {
      page.drawLine({ start: { x: x + w * 0.15, y: y + h * 0.45 }, end: { x: x + w * 0.4, y: y + h * 0.2 }, thickness: th, color: col });
      page.drawLine({ start: { x: x + w * 0.4, y: y + h * 0.2 }, end: { x: x + w * 0.85, y: y + h * 0.75 }, thickness: th, color: col });
    } else if (st.kind === 'cross') {
      page.drawLine({ start: { x: x + w * 0.2, y: y + h * 0.8 }, end: { x: x + w * 0.8, y: y + h * 0.2 }, thickness: th, color: col });
      page.drawLine({ start: { x: x + w * 0.8, y: y + h * 0.8 }, end: { x: x + w * 0.2, y: y + h * 0.2 }, thickness: th, color: col });
    } else {
      // star: 10-point polyline, top point up
      const cx = x + w / 2;
      const cy = y + h / 2;
      const R = Math.min(w, h) / 2;
      const inner = R * 0.45;
      let prev: { x: number; y: number } | null = null;
      let first: { x: number; y: number } | null = null;
      for (let i = 0; i < 10; i++) {
        const ang = Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : inner;
        const p = { x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) };
        if (i === 0) first = p;
        if (prev) page.drawLine({ start: prev, end: p, thickness: th, color: col });
        prev = p;
      }
      if (prev && first) page.drawLine({ start: prev, end: first, thickness: th, color: col });
    }
  }

  // 5. Freehand Drawings
  for (const draw of drawings) {
    const page = pages[draw.pageIndex];
    if (!page || draw.points.length < 2) continue;
    const strokeColor = hexToRgb(draw.color || '#000000');
    for (let p = 0; p < draw.points.length - 1; p++) {
      page.drawLine({
        start: draw.points[p],
        end: draw.points[p + 1],
        thickness: draw.width || 2,
        color: strokeColor,
        opacity: draw.opacity || 1,
      });
    }
  }

  // 6. Eraser covers — LAST, so they mask text, images, highlights,
  // shapes… everything beneath them, exactly as the screen shows.
  for (const area of eraseAreas) {
    const page = pages[area.pageIndex];
    if (!page) continue;
    page.drawRectangle({
      x: area.pdfX,
      y: area.pdfY,
      width: area.pdfWidth,
      height: area.pdfHeight,
      color: rgb(1, 1, 1),
    });
  }

  return await pdfDoc.save();
}

export async function createSamplePdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 in points
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawRectangle({
    x: 40,
    y: 770,
    width: 515,
    height: 42,
    color: rgb(0.93, 0.95, 1.0),
  });

  page.drawText('INVOICE & SERVICE AGREEMENT', {
    x: 55,
    y: 785,
    size: 16,
    font: boldFont,
    color: rgb(0.12, 0.23, 0.54),
  });

  page.drawText('Document ID: #INV-2026-9042', {
    x: 360,
    y: 785,
    size: 11,
    font: font,
    color: rgb(0.4, 0.45, 0.55),
  });

  page.drawText('Prepared For:', {
    x: 55,
    y: 725,
    size: 13,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('Acme Global Enterprises Inc.', {
    x: 55,
    y: 705,
    size: 12,
    font: font,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText('100 Silicon Boulevard, Suite 400', {
    x: 55,
    y: 685,
    size: 11,
    font: font,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawRectangle({
    x: 55,
    y: 625,
    width: 485,
    height: 25,
    color: rgb(0.2, 0.25, 0.35),
  });

  page.drawText('Description', { x: 65, y: 632, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText('Qty', { x: 290, y: 632, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText('Rate', { x: 360, y: 632, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText('Total Amount', { x: 440, y: 632, size: 10, font: boldFont, color: rgb(1, 1, 1) });

  page.drawText('Enterprise Cloud Architecture & Security Audit', { x: 65, y: 600, size: 11, font: font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('1', { x: 295, y: 600, size: 11, font: font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('$4,500.00', { x: 360, y: 600, size: 11, font: font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('$4,500.00', { x: 445, y: 600, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('AI Automated Pipeline Deployment', { x: 65, y: 570, size: 11, font: font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('2', { x: 295, y: 570, size: 11, font: font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('$2,250.00', { x: 360, y: 570, size: 11, font: font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('$4,500.00', { x: 445, y: 570, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawLine({
    start: { x: 55, y: 550 },
    end: { x: 540, y: 550 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  page.drawText('Grand Total Due: $9,000.00 USD', {
    x: 330,
    y: 520,
    size: 14,
    font: boldFont,
    color: rgb(0.15, 0.45, 0.85),
  });

  page.drawText('Terms & Conditions:', {
    x: 55,
    y: 460,
    size: 12,
    font: timesFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText('Payment is due within thirty days. All services rendered are guaranteed for one full year.', {
    x: 55,
    y: 440,
    size: 10,
    font: timesFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawText('Click with "Edit Text" tool to modify any text with matching typography!', {
    x: 55,
    y: 400,
    size: 11,
    font: boldFont,
    color: rgb(0.8, 0.2, 0.2),
  });

  return await pdfDoc.save();
}
