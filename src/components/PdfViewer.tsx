import React, { useEffect, useRef, useState } from 'react';
import { pdfjsLib, mapPdfFontToStandard, mapPdfFontToCss } from '../services/pdfLoader';
import type {
  ToolType,
  DetectedTextItem,
  EditedTextOverlay,
  EraseArea,
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
import { normalizeRotation, screenToPageDelta, screenToPagePoint } from '../utils/pageCoords';

export interface PdfViewerProps {
  pdfBytes: Uint8Array | null;
  currentPage: number;
  scale: number;
  /** Fit mode from the app shell — while set, scale tracks the viewport. */
  fitMode: 'page' | 'width' | null;
  /** Raw setter used by the fit computation (does not clear fit mode). */
  onScaleChange: (s: number) => void;
  /** Manual zoom step (Ctrl+wheel) — clears fit mode upstream. */
  onZoomBy: (factor: number) => void;
  currentTool: ToolType;
  onTotalPagesLoaded: (total: number) => void;
  textOverlays: EditedTextOverlay[];
  onAddTextOverlay: (overlay: EditedTextOverlay) => void;
  onUpdateTextOverlay: (id: string, patch: Partial<EditedTextOverlay>, pushFirst?: boolean) => void;
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
  /** White covers painted by the eraser over the page's own content. */
  eraseAreas: EraseArea[];
  /** Committed in one call per stroke so a whole erase undoes as one step. */
  onAddEraseAreas: (areas: EraseArea[]) => void;
  /** Extra clockwise rotation per page in degrees (0/90/180/270). */
  pageRotations: Record<number, number>;
  shapeKind: ShapeKind;
  shapeFillEnabled: boolean;
  shapeFillColor: string;
  shapeFillOpacity: number;
  stampKind: StampKind;
  pendingImage: { dataUrl: string; w: number; h: number } | null;
  onClearPendingImage: () => void;
  toolColors: ToolColors;
}

/**
 * Eraser brush geometry, in VIEW pixels (it scales with zoom like every other
 * tool): one white cover stamp per ERASER_STEP of travel, each stamp a square
 * of ERASER_STAMP. Stamps merge visually into a continuous white band.
 */
const ERASER_STAMP = 16;
const ERASER_STEP = 6;

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfBytes,
  currentPage,
  scale,
  fitMode,
  onScaleChange,
  onZoomBy,
  currentTool,
  onTotalPagesLoaded,
  textOverlays,
  onAddTextOverlay,
  onUpdateTextOverlay,
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
  eraseAreas,
  onAddEraseAreas,
  pageRotations,
  shapeKind,
  shapeFillEnabled,
  shapeFillColor,
  shapeFillOpacity,
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
  // Live white-cover stamps for the current eraser stroke (view coords).
  // Committed as EraseAreas on mouseup — one history entry per stroke.
  const [eraseStamps, setEraseStamps] = useState<{ x: number; y: number }[]>([]);
  const lastEraseStampRef = useRef<{ x: number; y: number } | null>(null);

  // Text-overlay selection + corner-resize drag (edit-text tool).
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [overlayResize, setOverlayResize] = useState<{
    id: string;
    pdfX: number;
    top: number; // pdfY + pdfHeight — the box keeps its top edge while resizing
    w: number;
    h: number;
    cx: number;
    cy: number;
    min: number;
  } | null>(null);

  // Drag-to-move for a text box (edit-text tool). The drag is tracked in
  // client space with window listeners so it survives leaving the box, and
  // the open inline editor is moved along with the overlay — it saves from
  // these coordinates, so falling behind would snap the box back on save.
  const [overlayMove, setOverlayMove] = useState<{
    id: string; // overlay being moved
    itemId: string | null; // open editor item, synced while dragging
    cx: number; // client coords where the drag started
    cy: number;
    pdfX: number; // overlay position when the drag started
    pdfY: number;
    w: number; // overlay size in PDF points (for clamping to the page)
    h: number;
    started: boolean; // false until the pointer clears the click threshold
  } | null>(null);
  // Set when a drag ends over the box itself: the follow-up click must not
  // re-open the editor the user just dragged.
  const suppressOverlayClickRef = useRef(false);

  // Leaving a tool closes any open inline editor and aborts half-finished
  // drag operations so stale state can't leak across tools.
  useEffect(() => {
    setActiveEditingItem(null);
    setSelectedOverlayId(null);
    setOverlayResize(null);
    setOverlayMove(null);
    suppressOverlayClickRef.current = false;
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
    setEraseStamps([]);
    lastEraseStampRef.current = null;
  }, [currentTool]);

  // The selection is in view coordinates: page/zoom/crop changes invalidate it.
  // (The clipboard survives — it stores zoom-independent PDF-point dimensions.)
  useEffect(() => {
    setSelRect(null);
    setSelStart(null);
    setSelBox(null);
    setSelectedOverlayId(null);
    setOverlayResize(null);
    setOverlayMove(null);
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
      if (e.key === 'Escape') {
        setPasteGhost(null);
        setSelectedOverlayId(null);
        setOverlayResize(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Extra clockwise rotation of the CURRENT page. The sheet keeps its own
  // coordinate space; only the on-screen footprint turns — 90/270 swap the
  // width and height that the fit maths and the layout wrapper reserve.
  const rotation = normalizeRotation(pageRotations[currentPage] ?? 0);
  const rotationSwapped = rotation === 90 || rotation === 270;

  // Fit page / fit width: keep the scale fitted to the available viewport.
  // Window resize, page turns and crop changes all retrigger the fit; the
  // epsilon guard prevents a set-scale -> re-render -> recompute loop.
  useEffect(() => {
    if (!fitMode) return;
    const apply = () => {
      // A sizing wrapper sits between the page and the scroll box, so walk
      // up to the scroll container itself rather than taking the parent.
      const scroll = containerRef.current?.closest('.overflow-auto');
      if (!scroll || !pageSize.pdfWidth) return;
      const cs = getComputedStyle(scroll);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = scroll.clientWidth - padX - 8;
      const availH = scroll.clientHeight - padY - 8;
      if (availW <= 0 || availH <= 0) return;
      const crop = cropSettings[currentPage];
      const fitW = crop ? crop.width : pageSize.pdfWidth;
      const fitH = crop ? crop.height : pageSize.pdfHeight;
      // A 90°/270° page shows its height along the viewport's width axis.
      const swapped = rotation === 90 || rotation === 270;
      const onW = swapped ? fitH : fitW;
      const onH = swapped ? fitW : fitH;
      const next =
        fitMode === 'width'
          ? availW / onW
          : Math.min(availW / onW, availH / onH);
      const clamped = Math.min(4, Math.max(0.25, next));
      if (Math.abs(clamped - scale) > 0.004) onScaleChange(clamped);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [fitMode, pageSize, cropSettings, currentPage, scale, onScaleChange, rotation]);

  // Ctrl/Cmd + wheel zooms the page (plain wheel keeps scrolling). Registered
  // natively with passive: false so the browser's own page zoom is suppressed.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onZoomBy]);

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

  // Client point -> page-local pixels, undoing the CSS page rotation so every
  // tool below keeps working in the sheet's own coordinate space.
  const toPagePoint = (clientX: number, clientY: number, rect: DOMRect) =>
    screenToPagePoint(clientX, clientY, rect, pageSize.width, pageSize.height, rotation);

  // Text-box corner resize: window listeners keep the drag alive even when
  // the cursor leaves the page box. The box keeps its top-left corner, so
  // pdfY (bottom edge) is recomputed from the fixed top edge.
  useEffect(() => {
    if (!overlayResize) return;
    const onMove = (e: MouseEvent) => {
      // Screen deltas live in the rotated view — turn them back into page space.
      const d = screenToPageDelta(e.clientX - overlayResize.cx, e.clientY - overlayResize.cy, rotation);
      const dx = d.x * scaleX;
      const dy = d.y * scaleY;
      const maxW = Math.max(24, pageSize.pdfWidth - overlayResize.pdfX);
      const maxH = Math.max(overlayResize.min, overlayResize.top); // keep pdfY >= 0
      const w = Math.min(maxW, Math.max(24, overlayResize.w + dx));
      const h = Math.min(maxH, Math.max(overlayResize.min, overlayResize.h + dy));
      onUpdateTextOverlay(overlayResize.id, { pdfWidth: w, pdfHeight: h, pdfY: overlayResize.top - h });
    };
    const onUp = () => setOverlayResize(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [overlayResize, rotation, scaleX, scaleY, pageSize.pdfWidth, onUpdateTextOverlay]);

  // Text-box drag-to-move: same window-listener pattern as the resize handle.
  // pdfX/pdfY are clamped, so a box can be moved anywhere INSIDE the page but
  // never partially outside it. The open inline editor is updated in lockstep.
  useEffect(() => {
    if (!overlayMove) return;
    const onMove = (e: MouseEvent) => {
      // Screen deltas live in the rotated view — turn them back into page space.
      const { x: dx, y: dy } = screenToPageDelta(
        e.clientX - overlayMove.cx,
        e.clientY - overlayMove.cy,
        rotation,
      );
      if (!overlayMove.started) {
        // Below the threshold the gesture is still a click, not a drag.
        if (Math.hypot(dx, dy) < 3) return;
        setOverlayMove((m) => (m ? { ...m, started: true } : m));
        // Snapshot history once for the whole drag (same as resize).
        onUpdateTextOverlay(overlayMove.id, {}, true);
      }
      const maxW = Math.max(0, pageSize.pdfWidth - overlayMove.w);
      const maxH = Math.max(0, pageSize.pdfHeight - overlayMove.h);
      const pdfX = Math.min(maxW, Math.max(0, overlayMove.pdfX + dx * scaleX));
      const pdfY = Math.min(maxH, Math.max(0, overlayMove.pdfY - dy * scaleY));
      onUpdateTextOverlay(overlayMove.id, { pdfX, pdfY });
      if (overlayMove.itemId) {
        // The editor saves from item coordinates — keep its view and PDF
        // positions in step with the overlay or "Update Text" snaps it back.
        const vx = pdfX * sX - offX;
        const vy = fullH - (pdfY + overlayMove.h) * sY - offY;
        setActiveEditingItem((prev) =>
          prev && prev.id === overlayMove.itemId ? { ...prev, x: vx, y: vy, pdfX, pdfY } : prev,
        );
      }
    };
    const onUp = () => {
      setOverlayMove((m) => {
        if (m && m.started) suppressOverlayClickRef.current = true;
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [
    overlayMove,
    rotation,
    scaleX,
    scaleY,
    sX,
    sY,
    offX,
    offY,
    fullH,
    pageSize.pdfWidth,
    pageSize.pdfHeight,
    onUpdateTextOverlay,
  ]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pageSize.width) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = toPagePoint(e.clientX, e.clientY, rect);

    // Clicking empty page space deselects the text box (the box's own click
    // handler re-selects it afterwards).
    if (currentTool === 'edit-text') setSelectedOverlayId(null);

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
      lastEraseStampRef.current = null;
      setEraseStamps([]);
      // Paint the first white stamp immediately so even a click erases.
      stampErase(x, y);
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
    const { x, y } = toPagePoint(e.clientX, e.clientY, rect);

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
      // Keep painting the white cover along the stroke.
      stampErase(x, y);
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
      // Commit the stroke's white stamps as real, undoable EraseAreas —
      // one call so the whole stroke lands in history as a single step.
      if (eraseStamps.length > 0) {
        const half = ERASER_STAMP / 2;
        const areas: EraseArea[] = eraseStamps.map((s, i) => ({
          id: `erase-${Date.now()}-${i}`,
          pageIndex: currentPage,
          pdfX: (offX + s.x - half) * scaleX,
          pdfY: pageSize.pdfHeight - (offY + s.y + half) * scaleY,
          pdfWidth: ERASER_STAMP * scaleX,
          pdfHeight: ERASER_STAMP * scaleY,
        }));
        onAddEraseAreas(areas);
      }
      setEraseStamps([]);
      lastEraseStampRef.current = null;
    }

    if (shapeStart && shapeBox && currentTool === 'ellipse') {
      if (shapeBox.w > 8 && shapeBox.h > 8) {
        // Preserve the drag direction — it decides which way the triangle points.
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
          // Filled interior when fill is on. All three shapes (ellipse,
          // rectangle, triangle) are closed and accept a fill.
          fillColor: shapeFillEnabled ? shapeFillColor : undefined,
          fillOpacity: shapeFillEnabled ? shapeFillOpacity : undefined,
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
  const pageEraseAreas = eraseAreas.filter((a) => a.pageIndex === currentPage);
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
  // A detected text line already masked by an edited overlay must not offer
  // its own "Edit" hotspot again: clicking the rendered overlay re-opens the
  // editor, and leaving the original hotspot live would let a second edit
  // stack a duplicate overlay on top of the first.
  const isOriginalCovered = (item: DetectedTextItem) => {
    const cx = item.pdfX + item.pdfWidth / 2;
    const cy = item.pdfY + item.pdfHeight / 2;
    // Eraser masks count too: the text under one is gone, so its hotspot
    // must not offer to edit it.
    const cxView = (offX + item.x + item.width / 2) * scaleX;
    const cyView = pageSize.pdfHeight - (offY + item.y + item.height / 2) * scaleY;
    if (
      pageEraseAreas.some(
        (a) =>
          cxView >= a.pdfX &&
          cxView <= a.pdfX + a.pdfWidth &&
          cyView >= a.pdfY &&
          cyView <= a.pdfY + a.pdfHeight,
      )
    ) {
      return true;
    }
    return pageOverlays.some(
      (o) =>
        o.coverRect &&
        cx >= o.coverRect.pdfX &&
        cx <= o.coverRect.pdfX + o.coverRect.pdfWidth &&
        cy >= o.coverRect.pdfY &&
        cy <= o.coverRect.pdfY + o.coverRect.pdfHeight,
    );
  };

  /**
   * Paint one white eraser stamp at a view-space point. Stamps are skipped
   * where a committed mask already covers the spot, so re-rubbing an erased
   * area does not pile rectangles on top of each other, and spaced by
   * ERASER_STEP so a stroke stays a sane number of rectangles.
   */
  const stampErase = (x: number, y: number) => {
    const last = lastEraseStampRef.current;
    if (last && Math.hypot(x - last.x, y - last.y) < ERASER_STEP) return;
    lastEraseStampRef.current = { x, y };
    const half = ERASER_STAMP / 2;
    const pdfX = (offX + x - half) * scaleX;
    const pdfY = pageSize.pdfHeight - (offY + y + half) * scaleY;
    const pdfW = ERASER_STAMP * scaleX;
    const pdfH = ERASER_STAMP * scaleY;
    const covered = pageEraseAreas.some(
      (a) =>
        pdfX >= a.pdfX &&
        pdfX + pdfW <= a.pdfX + a.pdfWidth &&
        pdfY >= a.pdfY &&
        pdfY + pdfH <= a.pdfY + a.pdfHeight,
    );
    if (covered) return;
    setEraseStamps((prev) => [...prev, { x, y }]);
  };

  /**
   * Begin a drag-to-move for a text box. Started either from the box itself
   * or from the grip in the inline editor's header, which sits above the box
   * and would otherwise make the box unreachable while editing.
   */
  const beginOverlayMove = (e: React.MouseEvent, overlay: EditedTextOverlay, itemId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    suppressOverlayClickRef.current = false;
    setOverlayMove({
      id: overlay.id,
      itemId,
      cx: e.clientX,
      cy: e.clientY,
      pdfX: overlay.pdfX,
      pdfY: overlay.pdfY,
      w: overlay.pdfWidth,
      h: overlay.pdfHeight,
      started: false,
    });
  };

  // Overlay whose editor is currently open (`reedit-<overlayId>`), else null.
  const editingOverlayId =
    activeEditingItem && activeEditingItem.id.startsWith('reedit-')
      ? activeEditingItem.id.slice('reedit-'.length)
      : null;
  const editingOverlay = editingOverlayId
    ? textOverlays.find((o) => o.id === editingOverlayId) ?? null
    : null;



  return (
    <div className="flex-1 overflow-auto bg-neutral-200/70 p-4 sm:p-8 lg:p-12 flex items-start">
      {/*
        Sizing wrapper: the sheet below renders unrotated (canvas + every
        overlay share one coordinate space) and is turned with a single CSS
        rotation. Transforms don't affect layout, so this box reserves the
        ROTATED footprint — 90/270 swap width and height.
        Horizontal centring goes through `mx-auto` rather than the scroll
        box's `justify-content: center`: auto margins collapse to 0 when the
        sheet is WIDER than the screen, so the left half stays reachable by
        scrolling (justify-center would strand it in unreachable negative
        overflow — the default view on phones).
      */}
      <div
        className="relative mx-auto"
        style={{
          width: rotationSwapped ? pageSize.height || 'auto' : pageSize.width || 'auto',
          height: rotationSwapped ? pageSize.width || 'auto' : pageSize.height || 'auto',
        }}
      >
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
            ...(rotation
              ? {
                  position: 'absolute' as const,
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                }
              : null),
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
          const fill = sh.fillColor ?? 'none';
          const fillOpacity = sh.fillColor ? (sh.fillOpacity ?? 0.35) : 1;
          if (sh.kind === 'ellipse') {
            return (
              <svg key={sh.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
                <ellipse
                  cx={box.left + box.width / 2}
                  cy={box.top + box.height / 2}
                  rx={Math.max(box.width / 2, 1)}
                  ry={Math.max(box.height / 2, 1)}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeWidth={sw}
                />
              </svg>
            );
          }
          if (sh.kind === 'rectangle') {
            return (
              <svg key={sh.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
                <rect x={box.left} y={box.top} width={box.width} height={box.height} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={sw} />
              </svg>
            );
          }
          const a = sh.points[0];
          const b = sh.points[1];
          if (!a || !b) return null;
          // Triangle: the apex sits at the drag end (b), the base on the
          // opposite side — whichever axis dominates the drag decides whether
          // it points left / right / up / down.
          const ax = a.x * sX - offX;
          const ay = fullH - a.y * sY - offY;
          const bx = b.x * sX - offX;
          const by = fullH - b.y * sY - offY;
          const right = box.left + box.width;
          const bottom = box.top + box.height;
          const midX = box.left + box.width / 2;
          const midY = box.top + box.height / 2;
          const pts =
            Math.abs(bx - ax) >= Math.abs(by - ay)
              ? bx >= ax
                ? `${box.left},${box.top} ${box.left},${bottom} ${right},${midY}`
                : `${right},${box.top} ${right},${bottom} ${box.left},${midY}`
              : by >= ay
                ? `${box.left},${box.top} ${right},${box.top} ${midX},${bottom}`
                : `${box.left},${bottom} ${right},${bottom} ${midX},${box.top}`;
          return (
            <svg key={sh.id} className="absolute top-0 left-0 pointer-events-none z-[5]" width={pageSize.width} height={pageSize.height}>
              <polygon
                points={pts}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeWidth={sw}
                strokeLinejoin="round"
              />
            </svg>
          );
        })}

        {/* Eraser white cover: hides the page's own content (and anything
            drawn on it) exactly as the exported PDF will show it. */}
        {pageEraseAreas.map((a) => (
          <div
            key={a.id}
            className="absolute bg-white z-[25]"
            style={pageTransform(a.pdfX, a.pdfY, a.pdfWidth, a.pdfHeight)}
          />
        ))}
        {eraseStamps.map((s, i) => (
          <div
            key={`erase-live-${i}`}
            className="absolute bg-white border border-dashed border-neutral-300 z-[25]"
            style={{
              left: s.x - ERASER_STAMP / 2,
              top: s.y - ERASER_STAMP / 2,
              width: ERASER_STAMP,
              height: ERASER_STAMP,
            }}
          />
        ))}

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
          const box = pageTransform(overlay.pdfX, overlay.pdfY, overlay.pdfWidth, overlay.pdfHeight);
          const selected = selectedOverlayId === overlay.id;
          const interactive = currentTool === 'edit-text';
          return (
            <React.Fragment key={overlay.id}>
              {/* White patch masking the original text beneath an edit. */}
              {overlay.coverRect && (
                <div
                  className="absolute z-10 pointer-events-none"
                  style={{
                    ...pageTransform(
                      overlay.coverRect.pdfX,
                      overlay.coverRect.pdfY,
                      overlay.coverRect.pdfWidth,
                      overlay.coverRect.pdfHeight,
                    ),
                    backgroundColor: overlay.coverRect.color || '#ffffff',
                  }}
                />
              )}
              <div
                className={`absolute z-20 flex items-start rounded-sm ${
                  interactive ? 'cursor-pointer' : 'pointer-events-none'
                } ${selected ? 'ring-2 ring-emerald-500' : ''}`}
                style={box}
                title={interactive ? 'Click to edit · drag to move · drag the corner to resize' : undefined}
                onMouseDown={(e) => {
                  if (!interactive || !overlay.id) return;
                  // Stop the page-level handler from clearing the selection,
                  // then track the gesture as a potential move — the window
                  // listeners turn it into a drag once it clears 3px.
                  beginOverlayMove(
                    e,
                    overlay,
                    activeEditingItem && activeEditingItem.id === `reedit-${overlay.id}`
                      ? activeEditingItem.id
                      : null,
                  );
                }}
                onClick={(e) => {
                  if (!interactive) return;
                  e.stopPropagation();
                  // A gesture that became a drag already did its job — the
                  // follow-up click must not also open the editor.
                  if (suppressOverlayClickRef.current) {
                    suppressOverlayClickRef.current = false;
                    return;
                  }
                  // Select, then open the editor — every click on an overlay
                  // opens it, so text can be edited a second, third, … time.
                  setSelectedOverlayId(overlay.id);
                  setActiveEditingItem({
                    id: `reedit-${overlay.id}`,
                    str: overlay.text,
                    x: box.left,
                    y: box.top,
                    width: box.width,
                    height: Math.max(box.height, 20),
                    fontFamily: overlay.fontFamily,
                    originalFontName: overlay.fontFamily,
                    // Overlay fontSize is in PDF points — TextEditInline shows
                    // Math.round(item.fontSize), same as first-time edits.
                    fontSize: overlay.fontSize,
                    pdfX: overlay.pdfX,
                    pdfY: overlay.pdfY,
                    pdfWidth: overlay.pdfWidth,
                    pdfHeight: overlay.pdfHeight,
                    color: overlay.color,
                    // Formatting of the saved overlay seeds the re-edit editor
                    // (bold/color/opacity) so re-opening shows exactly what is
                    // drawn.
                    editIsBold: overlay.isBold,
                    editColor: overlay.color,
                    editOpacity: overlay.opacity,
                  });
                }}
              >
                <div className="w-full h-full overflow-hidden" style={{ lineHeight: 1.2, opacity: overlay.opacity ?? 1 }}>
                  <span
                    style={{
                      fontFamily: mapPdfFontToCss(overlay.fontFamily),
                      fontSize: `${overlay.fontSize * sX}px`,
                      color: overlay.color,
                      fontWeight: overlay.isBold ? 700 : 400,
                      lineHeight: 1.2,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {overlay.text}
                  </span>
                </div>
                {selected && (
                  <div
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-emerald-500 hover:bg-emerald-600 border-2 border-white rounded-sm shadow cursor-nwse-resize z-30"
                    title="Drag to resize the text box"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedOverlayId(overlay.id);
                      setOverlayResize({
                        id: overlay.id,
                        pdfX: overlay.pdfX,
                        top: overlay.pdfY + overlay.pdfHeight,
                        w: overlay.pdfWidth,
                        h: overlay.pdfHeight,
                        cx: e.clientX,
                        cy: e.clientY,
                        min: Math.max(8, overlay.fontSize),
                      });
                      onUpdateTextOverlay(overlay.id, {}, true);
                    }}
                  />
                )}
              </div>
            </React.Fragment>
          );
        })}

        {currentTool === 'edit-text' &&
          detectedTexts
            .filter((item) => !isOriginalCovered(item))
            .map((item) => (
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
                <div
                  className="hidden group-hover:block absolute -top-5 left-0 bg-emerald-600 text-white text-[10px] px-1 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-20"
                  style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
                >
                  Edit ({item.originalFontName})
                </div>
              </div>
            ))}

        {activeEditingItem && (
          <TextEditInline
            key={activeEditingItem.id}
            item={activeEditingItem}
            pageIndex={currentPage}
            pageWidthPt={pageSize.pdfWidth}
            rotation={rotation}
            isNew={activeEditingItem.id.startsWith('new-text-')}
            defaults={textDefaultsRef.current}
            onMoveStart={
              editingOverlay
                ? (e) => beginOverlayMove(e, editingOverlay, activeEditingItem.id)
                : undefined
            }
            onSave={(overlay) => {
              textDefaultsRef.current = { fontFamily: overlay.fontFamily, fontSize: overlay.fontSize };
              const id = activeEditingItem.id;
              // Re-editing an existing overlay (id `reedit-<overlayId>`) updates
              // it in place so the box can be edited over and over. Saving while
              // the editor is still open for the same text replaces the pending
              // state instead of stacking duplicates — resize/undo stay clean.
              if (id.startsWith('reedit-')) {
                onUpdateTextOverlay(
                  id.slice('reedit-'.length),
                  {
                    text: overlay.text,
                    fontSize: overlay.fontSize,
                    fontFamily: overlay.fontFamily,
                    color: overlay.color,
                    isBold: overlay.isBold,
                    opacity: overlay.opacity,
                    pdfX: overlay.pdfX,
                    pdfWidth: overlay.pdfWidth,
                    pdfHeight: overlay.pdfHeight,
                    pdfY: overlay.pdfY,
                  },
                  true,
                );
              } else {
                onAddTextOverlay(overlay);
              }
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
              backgroundColor: shapeFillEnabled
                ? shapeFillColor +
                  Math.round(Math.min(1, Math.max(0, shapeFillOpacity)) * 255)
                    .toString(16)
                    .padStart(2, '0')
                : 'transparent',
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
              style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
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
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-neutral-900 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap max-w-[calc(100%-1rem)] truncate"
              style={
                rotation ? { transform: `translateX(-50%) rotate(${-rotation}deg)` } : undefined
              }
            >
              Click on the page to place the copied region · Esc to cancel
            </div>
          </>
        )}

        {currentTool === 'image' && pendingImage && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-neutral-900 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap max-w-[calc(100%-1rem)] truncate"
            style={rotation ? { transform: `translateX(-50%) rotate(${-rotation}deg)` } : undefined}
          >
            Click on the page to place your image
          </div>
        )}

        {currentTool === 'sign' && activeSignatureDataUrl && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-neutral-900 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap max-w-[calc(100%-1rem)] truncate"
            style={rotation ? { transform: `translateX(-50%) rotate(${-rotation}deg)` } : undefined}
          >
            Click on the page to place your signature
          </div>
        )}

        {currentTool === 'crop' && pageSize.width > 0 && (
          <CropOverlay
            pageWidth={pageSize.width}
            pageHeight={pageSize.height}
            rotation={rotation}
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
    </div>
  );
};