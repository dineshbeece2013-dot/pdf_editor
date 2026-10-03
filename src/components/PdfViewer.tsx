import React, { useEffect, useRef, useState } from 'react';
import { pdfjsLib, mapPdfFontToStandard, mapPdfFontToCss } from '../services/pdfLoader';
import type {
  ToolType,
  DetectedTextItem,
  EditedTextOverlay,
  PageCropSetting,
  SignatureItem,
  HighlightArea,
  FreehandDrawing,
  ImageOverlay,
  ShapeKind,
  ShapeOverlay,
  StampKind,
  StampOverlay,
  ToolColors,
} from '../types/pdf';
import { CropOverlay } from './CropOverlay';
import { TextEditInline } from './TextEditInline';

export interface PdfViewerProps {
  pdfBytes: Uint8Array | null;
  currentPage: number;
  scale: number;
  currentTool: ToolType;
  onTotalPagesLoaded: (total: number) => void;
  textOverlays: EditedTextOverlay[];
  onAddTextOverlay: (overlay: EditedTextOverlay) => void;
  cropSettings: Record<number, PageCropSetting>;
  onApplyCrop: (crop: PageCropSetting) => void;
  onResetCrop: (pageIndex: number) => void;
  onCancelCrop: () => void;
  signatures: SignatureItem[];
  onAddSignature: (sig: SignatureItem) => void;
  highlights: HighlightArea[];
  onAddHighlight: (hl: HighlightArea) => void;
  drawings: FreehandDrawing[];
  onAddDrawing: (draw: FreehandDrawing) => void;
  activeSignatureDataUrl: string | null;
  onClearActiveSignature: () => void;
  imageOverlays: ImageOverlay[];
  onAddImageOverlay: (img: ImageOverlay) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  onClipboardChange: (hasClipboard: boolean) => void;
  /** Increment-only command counters (toolbar / Ctrl+C / Ctrl+V). */
  copyRequest: number;
  pasteRequest: number;
  shapes: ShapeOverlay[];
  stamps: StampOverlay[];
  onAddShape: (sh: ShapeOverlay) => void;
  onAddStamp: (st: StampOverlay) => void;
  onEraseItems: (ids: string[], isFirstOfStroke: boolean) => void;
  shapeKind: ShapeKind;
  stampKind: StampKind;
  pendingImage: { dataUrl: string; w: number; h: number } | null;
  onClearPendingImage: () => void;
  toolColors: ToolColors;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfBytes,
  currentPage,
  scale,
  currentTool,
  onTotalPagesLoaded,
  textOverlays,
  onAddTextOverlay,
  cropSettings,
  onApplyCrop,
  onResetCrop,
  onCancelCrop,
  signatures,
  onAddSignature,
  highlights,
  onAddHighlight,
  drawings,
  onAddDrawing,
  activeSignatureDataUrl,
  onClearActiveSignature,
  imageOverlays,
  onAddImageOverlay,
  onSelectionChange,
  onClipboardChange,
  copyRequest,
  pasteRequest,
  shapes,
  stamps,
  onAddShape,
  onAddStamp,
  onEraseItems,
  shapeKind,
  stampKind,
  pendingImage,
  onClearPendingImage,
  toolColors,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [detectedTexts, setDetectedTexts] = useState<DetectedTextItem[]>([]);
  const [activeEditingItem, setActiveEditingItem] = useState<DetectedTextItem | null>(null);
  // Last-used text formatting, applied as defaults when adding new text.
  const textDefaultsRef = useRef<{ fontFamily?: string; fontSize?: number }>({});
  const [pageSize, setPageSize] = useState({
    width: 0,
    height: 0,
    fullWidth: 0,
    fullHeight: 0,
    pdfWidth: 0,
    pdfHeight: 0,
    offX: 0,
    offY: 0,
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [hlStart, setHlStart] = useState<{ x: number; y: number } | null>(null);
  const [hlBox, setHlBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Select-tool marquee + Paint-style region clipboard.
  // Clipboard stores the size in PDF points so it stays correct across zooms.
  const [selStart, setSelStart] = useState<{ x: number; y: number } | null>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [clipboard, setClipboard] = useState<{ dataUrl: string; pdfW: number; pdfH: number } | null>(null);
  const [pasteGhost, setPasteGhost] = useState<
    { dataUrl: string; pdfW: number; pdfH: number; x: number; y: number } | null
  >(null);

  // Shape drag + eraser stroke state.
  const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [shapeBox, setShapeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [erasing, setErasing] = useState(false);
  const [erasedInStroke, setErasedInStroke] = useState<string[]>([]);

  // Leaving a tool closes any open inline editor and aborts half-finished
  // drag operations so stale state can't leak across tools.
  useEffect(() => {
    setActiveEditingItem(null);
    setIsDrawing(false);
    setCurrentPath([]);
    setHlStart(null);
    setHlBox(null);
    setSelStart(null);
    setSelBox(null);
    setSelRect(null);
    setShapeStart(null);
    setShapeBox(null);
    setErasing(false);
    setErasedInStroke([]);
  }, [currentTool]);

  // The selection is in view coordinates: page/zoom/crop changes invalidate it.
  // (The clipboard survives — it stores zoom-independent PDF-point dimensions.)
  useEffect(() => {
    setSelRect(null);
    setSelStart(null);
    setSelBox(null);
    setShapeStart(null);
    setShapeBox(null);
  }, [currentPage, scale, cropSettings]);

  useEffect(() => {
    onSelectionChange(!!selRect);
  }, [selRect, onSelectionChange]);

  useEffect(() => {
    onClipboardChange(!!clipboard);
  }, [clipboard, onClipboardChange]);

  // Paste ghost is cancelled with Escape (the marquee is cancelled by clicks).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPasteGhost(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Copy: rasterize the committed selection straight out of the rendered page
  // canvas. The canvas shows the full page shifted by the crop offset, so the
  // source rect is (offX + sel) in canvas pixels (1 canvas px = 1 CSS px here).
  useEffect(() => {
    if (copyRequest <= 0) return;
    const sel = selRect;
    const canvas = canvasRef.current;
    if (!sel || !canvas || !pageSize.width) return;
    const sx = Math.max(0, offX + sel.x);
    const sy = Math.max(0, offY + sel.y);
    const sw = Math.max(1, Math.min(sel.w, canvas.width - sx));
    const sh = Math.max(1, Math.min(sel.h, canvas.height - sy));
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(sel.w));
    tmp.height = Math.max(1, Math.round(sel.h));
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    setClipboard({ dataUrl: tmp.toDataURL('image/png'), pdfW: sel.w * scaleX, pdfH: sel.h * scaleY });
  }, [copyRequest]);

  // Paste: arm a ghost of the clipboard that follows the cursor until clicked.
  useEffect(() => {
    if (pasteRequest <= 0) return;
    if (!clipboard || !pageSize.width) return;
    setSelStart(null);
    setSelBox(null);
    setPasteGhost({ ...clipboard, x: pageSize.width / 2, y: pageSize.height / 2 });
  }, [pasteRequest]);

  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;
    const loadDoc = async () => {
      try {
        // Self-hosted pdf.js support files (copied from node_modules/pdfjs-dist
        // into public/pdfjs — re-copy them after upgrading pdfjs-dist). Each
        // path must end with "/" because pdf.js appends file names directly.
        const support = `${import.meta.env.BASE_URL}pdfjs/`;
        const loadingTask = pdfjsLib.getDocument({
          data: pdfBytes.slice(),
          standardFontDataUrl: `${support}standard_fonts/`,
          cMapUrl: `${support}cmaps/`,
          cMapPacked: true,
          iccUrl: `${support}iccs/`,
          wasmUrl: `${support}wasm/`,
        });
        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          onTotalPagesLoaded(doc.numPages);
        }
      } catch (err) {
        console.error('Error loading PDF document:', err);
      }
    };
    loadDoc();
    return () => {
      isCancelled = true;
    };
  }, [pdfBytes]);

  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage + 1);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pdfW = page.view[2] - page.view[0];
        const pdfH = page.view[3] - page.view[1];

        // Paint-style WYSIWYG crop: the canvas always renders the FULL page,
        // but it is offset inside a viewport-sized, clipped container so only
        // the currently applied crop region stays visible.
        const crop = cropSettings[currentPage];
        const offX = crop ? crop.x * scale : 0;
        const offY = crop ? (pdfH - (crop.y + crop.height)) * scale : 0;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageSize({
          width: crop ? crop.width * scale : viewport.width,
          height: crop ? crop.height * scale : viewport.height,
          fullWidth: viewport.width,
          fullHeight: viewport.height,
          pdfWidth: pdfW,
          pdfHeight: pdfH,
          offX,
          offY,
        });

        await page.render({ canvasContext: ctx, viewport }).promise;

        const textContent = await page.getTextContent();
        if (isCancelled) return;

        const items: DetectedTextItem[] = [];
        for (let i = 0; i < textContent.items.length; i++) {
          const item = textContent.items[i] as any;
          if (!item.str || item.str.trim() === '') continue;

          const tx = item.transform[4];
          const ty = item.transform[5];
          const [viewX, viewY] = viewport.convertToViewportPoint(tx, ty);
          const itemWidth = (item.width || 0) * scale;
          const itemHeight = (item.height || Math.abs(item.transform[3]) || 12) * scale;

          items.push({
            id: 'txt-' + currentPage + '-' + i,
            str: item.str,
            x: viewX - offX,
            y: viewY - itemHeight - offY,
            width: Math.max(itemWidth, 10),
            height: Math.max(itemHeight, 14),
            fontFamily: mapPdfFontToStandard(item.fontName || ''),
            originalFontName: item.fontName || 'Helvetica',
            fontSize: Math.abs(item.transform[3]) || 12,
            pdfX: tx,
            pdfY: ty,
            pdfWidth: item.width || item.str.length * 7,
            pdfHeight: Math.abs(item.transform[3]) || 12,
          });
        }
        setDetectedTexts(items);
      } catch (err) {
        console.error('Error rendering page:', err);
      }
    };
    renderPage();
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, scale, cropSettings]);

  const fullW = pageSize.fullWidth || pageSize.width;
  const fullH = pageSize.fullHeight || pageSize.height;
  // px per PDF point (rendering) and PDF point per px (storing edits)
  const sX = fullW && pageSize.pdfWidth ? fullW / pageSize.pdfWidth : 1;
  const sY = fullH && pageSize.pdfHeight ? fullH / pageSize.pdfHeight : 1;
  const scaleX = pageSize.pdfWidth && fullW ? pageSize.pdfWidth / fullW : 1;
  const scaleY = pageSize.pdfHeight && fullH ? pageSize.pdfHeight / fullH : 1;
  const offX = pageSize.offX;
  const offY = pageSize.offY;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pageSize.width) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Paste ghost takes priority: a click stamps the copied region.
    if (pasteGhost) {
      const w = pasteGhost.pdfW * sX;
      const h = pasteGhost.pdfH * sY;
      const left = Math.max(0, Math.min(pageSize.width - w, x - w / 2));
      const top = Math.max(0, Math.min(pageSize.height - h, y - h / 2));
      onAddImageOverlay({
        id: 'img-' + Date.now(),
        pageIndex: currentPage,
        dataUrl: pasteGhost.dataUrl,
        pdfX: (offX + left) * scaleX,
        pdfY: pageSize.pdfHeight - (offY + top + h) * scaleY,
        pdfWidth: pasteGhost.pdfW,
        pdfHeight: pasteGhost.pdfH,
      });
      setPasteGhost(null);
      return;
    }

    if (currentTool === 'add-text') {
      // Reuse the inline text editor with a synthetic, empty target box.
      setActiveEditingItem({
        id: 'new-text-' + Date.now(),
        str: '',
        x,
        y,
        width: 170,
        height: 26,
        fontFamily: 'Helvetica',
        originalFontName: 'Helvetica',
        fontSize: 16,
        color: toolColors.text,
        pdfX: (offX + x) * scaleX,
        pdfY: pageSize.pdfHeight - (offY + y + 26) * scaleY,
        pdfWidth: 170 * scaleX,
        pdfHeight: 26 * scaleY,
      });
      return;
    }

    if (currentTool === 'image') {
      if (!pendingImage) return;
      const fit = Math.min(1, pageSize.width / pendingImage.w, pageSize.height / pendingImage.h);
      const w = pendingImage.w * fit;
      const h = pendingImage.h * fit;
      const left = Math.max(0, Math.min(pageSize.width - w, x - w / 2));
      const top = Math.max(0, Math.min(pageSize.height - h, y - h / 2));
      onAddImageOverlay({
        id: 'img-' + Date.now(),
        pageIndex: currentPage,
        dataUrl: pendingImage.dataUrl,
        pdfX: (offX + left) * scaleX,
        pdfY: pageSize.pdfHeight - (offY + top + h) * scaleY,
        pdfWidth: w * scaleX,
        pdfHeight: h * scaleY,
      });
      onClearPendingImage();
      return;
    }

    if (currentTool === 'annotate') {
      // 36 pt stamp centered on the click (view size tracks zoom: 36 * sX px).
      const box = 36 * sX;
      const left = Math.max(0, Math.min(pageSize.width - box, x - box / 2));
      const top = Math.max(0, Math.min(pageSize.height - box, y - box / 2));
      onAddStamp({
        id: 'stamp-' + Date.now(),
        pageIndex: currentPage,
        kind: stampKind,
        pdfX: (offX + left) * scaleX,
        pdfY: pageSize.pdfHeight - (offY + top + box) * scaleY,
        pdfWidth: box * scaleX,
        pdfHeight: box * scaleY,
        color: stampKind === 'check' ? '#16a34a' : stampKind === 'cross' ? '#dc2626' : '#f59e0b',
      });
      return;
    }

    if (currentTool === 'erase') {
      setErasing(true);
      setErasedInStroke([]);
      const hits = hitTestErase(x, y);
      if (hits.length > 0) {
        onEraseItems(hits, true);
        setErasedInStroke(hits);
      }
      return;
    }

    if (currentTool === 'ellipse') {
      setShapeStart({ x, y });
      setShapeBox({ x, y, w: 0, h: 0 });
      return;
    }

    if (currentTool === 'select') {
      // Fresh drag replaces any committed selection.
      setSelRect(null);
      setSelStart({ x, y });
      setSelBox({ x, y, w: 0, h: 0 });
      return;
    }

    if (currentTool === 'sign') {
      if (!activeSignatureDataUrl) return;
      const sigW = 140;
      const sigH = 48;
      const left = Math.max(0, Math.min(pageSize.width - sigW, x - sigW / 2));
      const top = Math.max(0, Math.min(pageSize.height - sigH, y - sigH / 2));
      onAddSignature({
        id: 'sig-' + Date.now(),
        pageIndex: currentPage,
        dataUrl: activeSignatureDataUrl,
        pdfX: (offX + left) * scaleX,
        pdfY: pageSize.pdfHeight - (offY + top + sigH) * scaleY,
        pdfWidth: sigW * scaleX,
        pdfHeight: sigH * scaleY,
      });
      onClearActiveSignature();
      return;
    }

    if (currentTool === 'draw') {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
      return;
    }

    if (currentTool === 'highlight') {
      setHlStart({ x, y });
      setHlBox({ x, y, w: 0, h: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pageSize.width) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (pasteGhost) {
      setPasteGhost((g) => (g ? { ...g, x, y } : g));
      return;
    }

    if (erasing && currentTool === 'erase') {
      const hits = hitTestErase(x, y).filter((id) => !erasedInStroke.includes(id));
      if (hits.length > 0) {
        onEraseItems(hits, erasedInStroke.length === 0);
        setErasedInStroke((prev) => [...prev, ...hits]);
      }
      return;
    }

    if (shapeStart && currentTool === 'ellipse') {
      const nx = Math.max(0, Math.min(pageSize.width, x));
      const ny = Math.max(0, Math.min(pageSize.height, y));
      setShapeBox({
        x: Math.min(shapeStart.x, nx),
        y: Math.min(shapeStart.y, ny),
        w: Math.abs(nx - shapeStart.x),
        h: Math.abs(ny - shapeStart.y),
      });
      return;
    }

    if (selStart && currentTool === 'select') {
      const nx = Math.max(0, Math.min(pageSize.width, x));
      const ny = Math.max(0, Math.min(pageSize.height, y));
      setSelBox({
        x: Math.min(selStart.x, nx),
        y: Math.min(selStart.y, ny),
        w: Math.abs(nx - selStart.x),
        h: Math.abs(ny - selStart.y),
      });
      return;
    }

    if (isDrawing && currentTool === 'draw') {
      setCurrentPath((prev) => [...prev, { x, y }]);
      return;
    }

    if (hlStart && currentTool === 'highlight') {
      setHlBox({
        x: Math.min(hlStart.x, x),
        y: Math.min(hlStart.y, y),
        w: Math.abs(x - hlStart.x),
        h: Math.abs(y - hlStart.y),
      });
    }
  };

  const handleMouseUp = () => {
    if (erasing) {
      setErasing(false);
      setErasedInStroke([]);
    }

    if (shapeStart && shapeBox && currentTool === 'ellipse') {
      if (shapeBox.w > 8 && shapeBox.h > 8) {
        // Preserve the drag direction — it defines an arrow's head direction.
        const startOnLeft = shapeStart.x - shapeBox.x < shapeBox.w / 2;
        const startOnTop = shapeStart.y - shapeBox.y < shapeBox.h / 2;
        const x0 = (offX + shapeBox.x) * scaleX;
        const x1 = (offX + shapeBox.x + shapeBox.w) * scaleX;
        const yTop = pageSize.pdfHeight - (offY + shapeBox.y) * scaleY;
        const yBot = pageSize.pdfHeight - (offY + shapeBox.y + shapeBox.h) * scaleY;
        onAddShape({
          id: 'shape-' + Date.now(),
          pageIndex: currentPage,
          kind: shapeKind,
          pdfX: x0,
          pdfY: yBot,
          pdfWidth: x1 - x0,
          pdfHeight: yTop - yBot,
          points: [
            { x: startOnLeft ? x0 : x1, y: startOnTop ? yTop : yBot },
            { x: startOnLeft ? x1 : x0, y: startOnTop ? yBot : yTop },
          ],
          color: toolColors.shape,
          strokeWidth: 2,
        });
      }
      setShapeStart(null);
      setShapeBox(null);
    }

    if (selStart && currentTool === 'select') {
      // Tiny drags count as plain clicks (deselect), like Paint.
      if (selBox && selBox.w > 8 && selBox.h > 8) setSelRect(selBox);
      else setSelRect(null);
      setSelStart(null);
      setSelBox(null);
    }

    if (isDrawing && currentTool === 'draw') {
      setIsDrawing(false);
      if (currentPath.length > 1) {
        const pdfPoints = currentPath.map((pt) => ({
          x: (offX + pt.x) * scaleX,
          y: pageSize.pdfHeight - (offY + pt.y) * scaleY,
        }));
        onAddDrawing({
          id: 'draw-' + Date.now(),
          pageIndex: currentPage,
          points: pdfPoints,
          color: toolColors.pencil,
          width: 2.5,
          opacity: 0.9,
        });
      }
      setCurrentPath([]);
      return;
    }

    if (hlStart && hlBox && currentTool === 'highlight') {
      if (hlBox.w > 6 && hlBox.h > 6) {
        onAddHighlight({
          id: 'hl-' + Date.now(),
          pageIndex: currentPage,
          pdfX: (offX + hlBox.x) * scaleX,
          pdfY: pageSize.pdfHeight - (offY + hlBox.y + hlBox.h) * scaleY,
          pdfWidth: hlBox.w * scaleX,
          pdfHeight: hlBox.h * scaleY,
          color: toolColors.highlight,
        });
      }
      setHlStart(null);
      setHlBox(null);
    }
  };

  const pageOverlays = textOverlays.filter((o) => o.pageIndex === currentPage);
  const pageHighlights = highlights.filter((h) => h.pageIndex === currentPage);
  const pageDrawings = drawings.filter((d) => d.pageIndex === currentPage);
  const pageSignatures = signatures.filter((s) => s.pageIndex === currentPage);
  const pageImages = imageOverlays.filter((img) => img.pageIndex === currentPage);
  const pageShapes = shapes.filter((s) => s.pageIndex === currentPage);
  const pageStamps = stamps.filter((s) => s.pageIndex === currentPage);
  // Live drag box takes precedence over the committed selection for display.
  const activeSel = selBox ?? selRect;
  const ghostW = pasteGhost ? pasteGhost.pdfW * sX : 0;
  const ghostH = pasteGhost ? pasteGhost.pdfH * sY : 0;

  const cursorStyle = pasteGhost || (currentTool === 'image' && pendingImage)
    ? 'copy'
    : currentTool === 'erase'
    ? 'cell'
    : currentTool === 'edit-text'
    ? 'text'
    : currentTool === 'draw' ||
      currentTool === 'highlight' ||
      currentTool === 'crop' ||
      currentTool === 'select' ||
      currentTool === 'add-text' ||
      currentTool === 'annotate' ||
      currentTool === 'ellipse'
    ? 'crosshair'
    : currentTool === 'sign' && activeSignatureDataUrl
    ? 'copy'
    : 'default';

  // Convert a PDF-space rect (origin bottom-left) to an on-screen CSS rect
  // relative to the visible, possibly cropped viewport.
  const pageTransform = (pdfX: number, pdfBottomY: number, pdfW: number, pdfH: number) => ({
    left: pdfX * sX - offX,
    top: fullH - (pdfBottomY + pdfH) * sY - offY,
    width: pdfW * sX,
    height: pdfH * sY,
  });

  // Eraser hit test: what annotation sits under the cursor in view coords?
  const hitTestErase = (x: number, y: number): string[] => {
    const hits: string[] = [];
    const R = 9; // eraser radius in px
    for (const d of pageDrawings) {
      for (const p of d.points) {
        const vx = p.x * sX - offX;
        const vy = fullH - p.y * sY - offY;
        if (Math.hypot(vx - x, vy - y) <= R + d.width) {
          hits.push(d.id);
          break;
        }
      }
    }
    const inBox = (b: { left: number; top: number; width: number; height: number }) =>
      x >= b.left - 3 && x <= b.left + b.width + 3 && y >= b.top - 3 && y <= b.top + b.height + 3;
    for (const hl of pageHighlights)
      if (inBox(pageTransform(hl.pdfX, hl.pdfY, hl.pdfWidth, hl.pdfHeight))) hits.push(hl.id);
    for (const sh of pageShapes)
      if (inBox(pageTransform(sh.pdfX, sh.pdfY, sh.pdfWidth, sh.pdfHeight))) hits.push(sh.id);
    for (const st of pageStamps)
      if (inBox(pageTransform(st.pdfX, st.pdfY, st.pdfWidth, st.pdfHeight))) hits.push(st.id);
    for (const sg of pageSignatures)
      if (inBox(pageTransform(sg.pdfX, sg.pdfY, sg.pdfWidth, sg.pdfHeight))) hits.push(sg.id);
    for (const im of pageImages)
      if (inBox(pageTransform(im.pdfX, im.pdfY, im.pdfWidth, im.pdfHeight))) hits.push(im.id);
    for (const ov of pageOverlays)
      if (inBox(pageTransform(ov.pdfX, ov.pdfY, ov.pdfWidth, ov.pdfHeight))) hits.push(ov.id);
    return hits;
  };

  return (
    <div className="flex-1 overflow-auto bg-neutral-200/70 p-4 sm:p-8 lg:p-12 flex justify-center items-start">
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="relative overflow-hidden bg-white shadow-2xl rounded-sm select-none"
        style={{
          width: pageSize.width || 'auto',
          height: pageSize.height || 'auto',
          cursor: cursorStyle,
        }}
      >
        <canvas
          ref={canvasRef}
          className="block pointer-events-none"
          style={{ marginLeft: -offX, marginTop: -offY }}
        />

        {pageHighlights.map((hl) => (
          <div
            key={hl.id}
            className="absolute pointer-events-none z-[5]"
            style={{
              ...pageTransform(hl.pdfX, hl.pdfY, hl.pdfWidth, hl.pdfHeight),
              backgroundColor: hl.color,
              opacity: 0.35,
              mixBlendMode: 'multiply',
            }}
          />
        ))}

        {pageDrawings.map((draw) => {
          const pts = draw.points
            .map((p) => `${p.x * sX - offX},${fullH - p.y * sY - offY}`)
            .join(' ');
          return (
            <svg
              key={draw.id}
              className="absolute top-0 left-0 pointer-events-none z-[5]"
              width={pageSize.width}
              height={pageSize.height}
            >
              <polyline
                fill="none"
                stroke={draw.color}
                strokeWidth={draw.width}
                strokeOpacity={draw.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
            </svg>
          );
        })}

        {pageShapes.map((sh) => {
          const box = pageTransform(sh.pdfX, sh.pdfY, sh.pdfWidth, sh.pdfHeight);
          const stroke = sh.color || '#059669';
          const sw = sh.strokeWidth || 2;
          if (sh.kind === 'ellipse') {
            return (
              <svg key={sh.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
                <ellipse
                  cx={box.left + box.width / 2}
                  cy={box.top + box.height / 2}
                  rx={Math.max(box.width / 2, 1)}
                  ry={Math.max(box.height / 2, 1)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={sw}
                />
              </svg>
            );
          }
          if (sh.kind === 'rectangle') {
            return (
              <svg key={sh.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
                <rect x={box.left} y={box.top} width={box.width} height={box.height} fill="none" stroke={stroke} strokeWidth={sw} />
              </svg>
            );
          }
          const a = sh.points[0];
          const b = sh.points[1];
          if (!a || !b) return null;
          const ax = a.x * sX - offX;
          const ay = fullH - a.y * sY - offY;
          const bx = b.x * sX - offX;
          const by = fullH - b.y * sY - offY;
          const ang = Math.atan2(by - ay, bx - ax);
          const head = Math.min(12, Math.hypot(bx - ax, by - ay) * 0.4);
          const h1 = { x: bx - head * Math.cos(ang - 0.45), y: by - head * Math.sin(ang - 0.45) };
          const h2 = { x: bx - head * Math.cos(ang + 0.45), y: by - head * Math.sin(ang + 0.45) };
          return (
            <svg key={sh.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
              <polyline
                points={`${h1.x},${h1.y} ${bx},${by} ${h2.x},${h2.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        })}

        {pageStamps.map((st) => {
          const b = pageTransform(st.pdfX, st.pdfY, st.pdfWidth, st.pdfHeight);
          const cx = b.left + b.width / 2;
          const cy = b.top + b.height / 2;
          const sw = Math.max(2, Math.min(b.width, b.height) * 0.12);
          if (st.kind === 'check') {
            return (
              <svg key={st.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
                <polyline
                  points={`${b.left + b.width * 0.15},${b.top + b.height * 0.55} ${b.left + b.width * 0.4},${b.top + b.height * 0.8} ${b.left + b.width * 0.85},${b.top + b.height * 0.25}`}
                  fill="none"
                  stroke={st.color}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          }
          if (st.kind === 'cross') {
            return (
              <svg key={st.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
                <line x1={b.left + b.width * 0.2} y1={b.top + b.height * 0.2} x2={b.left + b.width * 0.8} y2={b.top + b.height * 0.8} stroke={st.color} strokeWidth={sw} strokeLinecap="round" />
                <line x1={b.left + b.width * 0.8} y1={b.top + b.height * 0.2} x2={b.left + b.width * 0.2} y2={b.top + b.height * 0.8} stroke={st.color} strokeWidth={sw} strokeLinecap="round" />
              </svg>
            );
          }
          const starPts: string[] = [];
          const R = Math.min(b.width, b.height) / 2;
          const inner = R * 0.45;
          for (let i = 0; i < 10; i++) {
            const sa = -Math.PI / 2 + (i * Math.PI) / 5;
            const rad = i % 2 === 0 ? R : inner;
            starPts.push(`${cx + rad * Math.cos(sa)},${cy + rad * Math.sin(sa)}`);
          }
          return (
            <svg key={st.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
              <polygon points={starPts.join(' ')} fill={st.color} stroke={st.color} strokeWidth={1} strokeLinejoin="round" />
            </svg>
          );
        })}

        {pageSignatures.map((sig) => (
          <img
            key={sig.id}
            src={sig.dataUrl}
            className="absolute pointer-events-none z-10"
            style={pageTransform(sig.pdfX, sig.pdfY, sig.pdfWidth, sig.pdfHeight)}
            alt="signature"
          />
        ))}

        {pageImages.map((img) => (
          <img
            key={img.id}
            src={img.dataUrl}
            className="absolute pointer-events-none z-10"
            style={pageTransform(img.pdfX, img.pdfY, img.pdfWidth, img.pdfHeight)}
            alt="copied region"
          />
        ))}

        {pageOverlays.map((overlay) => {
          const boxStyle = overlay.coverRect
            ? pageTransform(overlay.coverRect.pdfX, overlay.coverRect.pdfY, overlay.coverRect.pdfWidth, overlay.coverRect.pdfHeight)
            : pageTransform(overlay.pdfX, overlay.pdfY, overlay.pdfWidth, overlay.pdfHeight);
          const bg = overlay.coverRect ? overlay.coverRect.color || '#ffffff' : 'transparent';
          return (
            <div
              key={overlay.id}
              className="absolute z-10 flex items-center pointer-events-none overflow-hidden"
              style={{ ...boxStyle, backgroundColor: bg }}
            >
              <span
                style={{
                  fontFamily: mapPdfFontToCss(overlay.fontFamily),
                  fontSize: `${overlay.fontSize * sX}px`,
                  color: overlay.color,
                  fontWeight: overlay.isBold ? 700 : 400,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {overlay.text}
              </span>
            </div>
          );
        })}

        {currentTool === 'edit-text' &&
          detectedTexts.map((item) => (
            <div
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                setActiveEditingItem(item);
              }}
              className="absolute z-10 border border-dashed border-emerald-400/50 hover:border-emerald-600 hover:bg-emerald-400/20 cursor-pointer rounded transition-all group"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
              }}
            >
              <div className="hidden group-hover:block absolute -top-5 left-0 bg-emerald-600 text-white text-[10px] px-1 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-20">
                Edit ({item.originalFontName})
              </div>
            </div>
          ))}

        {activeEditingItem && (
          <TextEditInline
            key={activeEditingItem.id}
            item={activeEditingItem}
            pageIndex={currentPage}
            isNew={activeEditingItem.id.startsWith('new-text-')}
            defaults={textDefaultsRef.current}
            onSave={(overlay) => {
              textDefaultsRef.current = { fontFamily: overlay.fontFamily, fontSize: overlay.fontSize };
              onAddTextOverlay(overlay);
              setActiveEditingItem(null);
            }}
            onCancel={() => setActiveEditingItem(null)}
          />
        )}

        {isDrawing && currentPath.length > 1 && (
          <svg
            className="absolute top-0 left-0 pointer-events-none z-20"
            width={pageSize.width}
            height={pageSize.height}
          >
            <polyline
              fill="none"
              stroke={toolColors.pencil}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={currentPath.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          </svg>
        )}

        {hlStart && hlBox && (
          <div
            className="absolute pointer-events-none z-20 border border-black/15"
            style={{
              left: hlBox.x,
              top: hlBox.y,
              width: hlBox.w,
              height: hlBox.h,
              backgroundColor: toolColors.highlight,
              opacity: 0.35,
              mixBlendMode: 'multiply',
            }}
          />
        )}

        {shapeStart && shapeBox && (
          <div
            className="absolute pointer-events-none z-20 border-2 border-dashed"
            style={{
              left: shapeBox.x,
              top: shapeBox.y,
              width: shapeBox.w,
              height: shapeBox.h,
              borderColor: toolColors.shape,
              backgroundColor: toolColors.shape + '1a',
            }}
          />
        )}

        {currentTool === 'select' && activeSel && (
          <div
            className="absolute z-20 border-2 border-dashed border-emerald-500 bg-emerald-400/10 pointer-events-none"
            style={{
              left: activeSel.x,
              top: activeSel.y,
              width: activeSel.w,
              height: activeSel.h,
            }}
          >
            <span
              className={`absolute left-0 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap ${
                activeSel.y < 24 ? 'top-full mt-1' : '-top-6'
              }`}
            >
              {Math.round(activeSel.w)} × {Math.round(activeSel.h)} px
            </span>
          </div>
        )}

        {pasteGhost && (
          <>
            <img
              src={pasteGhost.dataUrl}
              alt="pasted region preview"
              className="absolute z-30 pointer-events-none opacity-75 border border-emerald-500 shadow-lg"
              style={{
                left: pasteGhost.x - ghostW / 2,
                top: pasteGhost.y - ghostH / 2,
                width: ghostW,
                height: ghostH,
              }}
            />
            <div className="absolute top-2 left-1/2 -tranneutral-x-1/2 z-30 bg-neutral-900 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
              Click on the page to place the copied region · Esc to cancel
            </div>
          </>
        )}

        {currentTool === 'image' && pendingImage && (
          <div className="absolute top-2 left-1/2 -tranneutral-x-1/2 z-30 bg-neutral-900 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
            Click on the page to place your image
          </div>
        )}

        {currentTool === 'sign' && activeSignatureDataUrl && (
          <div className="absolute top-2 left-1/2 -tranneutral-x-1/2 z-30 bg-neutral-900 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
            Click on the page to place your signature
          </div>
        )}

        {currentTool === 'crop' && pageSize.width > 0 && (
          <CropOverlay
            pageWidth={pageSize.width}
            pageHeight={pageSize.height}
            hasCrop={!!cropSettings[currentPage]}
            onApplyRect={(rect) => {
              // View rect (origin top-left, px) -> absolute PDF rect (origin bottom-left).
              onApplyCrop({
                pageIndex: currentPage,
                x: (offX + rect.x) * scaleX,
                y: pageSize.pdfHeight - (offY + rect.y + rect.height) * scaleY,
                width: rect.width * scaleX,
                height: rect.height * scaleY,
              });
            }}
            onReset={() => onResetCrop(currentPage)}
            onCancel={onCancelCrop}
          />
        )}
      </div>
    </div>
  );
};