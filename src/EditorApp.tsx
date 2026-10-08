import React, { useState, useEffect, useRef } from 'react';
import type {
  ToolType,
  EditedTextOverlay,
  PageCropSetting,
  SignatureItem,
  HighlightArea,
  FreehandDrawing,
  ImageOverlay,
  ShapeOverlay,
  StampOverlay,
  EraseArea,
  ShapeKind,
  StampKind,
  ToolColorKey,
  ToolColors,
} from './types/pdf';
import { Toolbar } from './components/Toolbar';
import { PdfViewer } from './components/PdfViewer';
import { SignaturePadModal } from './components/SignaturePadModal';
import { createSamplePdf, exportModifiedPdf } from './services/pdfExporter';
import { normalizeRotation } from './utils/pageCoords';
import { ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { AccountMenu } from './components/AccountMenu';
import { UpgradeModal } from './components/UpgradeModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SeoSections } from './components/SeoSections';
import { AdminDashboard } from './components/AdminDashboard';

/** The undoable document state: everything that changes the exported PDF. */
type DocState = {
  textOverlays: EditedTextOverlay[];
  cropSettings: Record<number, PageCropSetting>;
  signatures: SignatureItem[];
  highlights: HighlightArea[];
  drawings: FreehandDrawing[];
  imageOverlays: ImageOverlay[];
  shapes: ShapeOverlay[];
  stamps: StampOverlay[];
  eraseAreas: EraseArea[];
  /** Extra clockwise rotation per page in degrees (0/90/180/270). */
  pageRotations: Record<number, number>;
};

const HISTORY_LIMIT = 50;

export function EditorApp() {

  // ----- Subscription / access control -----------------------------------
  const { canEditResult, recordEdit, subscriptionStatus, user } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>(undefined);
  // Once a free user starts an edit we grant the whole session so a multi-step
  // change (draw, move, resize, delete) counts as a single daily "edit".
  const [editSessionGranted, setEditSessionGranted] = useState(false);

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Zoom: 1.2 = 120% default view. Fit modes keep the scale fitted to the
  // viewport (the viewer recomputes on resize / page / crop changes); any
  // manual zoom clears the fit mode. Phones open in fit-page mode so the
  // whole sheet is visible on the first paint (desktop keeps 120%).
  const [scale, setScale] = useState(1.2);
  const [fitMode, setFitMode] = useState<'page' | 'width' | null>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'page' : null,
  );
  const [zoomMenu, setZoomMenu] = useState(false);
  const clampZoom = (s: number) => Math.min(4, Math.max(0.25, s));
  const zoomBy = (factor: number) => {
    setFitMode(null);
    setScale((s) => clampZoom(s * factor));
  };
  const setManualScale = (s: number) => {
    setFitMode(null);
    setScale(clampZoom(s));
  };
  const [currentTool, setTool] = useState<ToolType>('select');

  const [textOverlays, setTextOverlays] = useState<EditedTextOverlay[]>([]);
  const [cropSettings, setCropSettings] = useState<Record<number, PageCropSetting>>({});
  const [signatures, setSignatures] = useState<SignatureItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightArea[]>([]);
  const [drawings, setDrawings] = useState<FreehandDrawing[]>([]);
  const [imageOverlays, setImageOverlays] = useState<ImageOverlay[]>([]);
  const [shapes, setShapes] = useState<ShapeOverlay[]>([]);
  const [stamps, setStamps] = useState<StampOverlay[]>([]);
  // White covers the eraser paints over the page's own text/images.
  const [eraseAreas, setEraseAreas] = useState<EraseArea[]>([]);
  // Extra clockwise rotation per page (degrees) — part of the undoable doc.
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});

  const [isSigModalOpen, setIsSigModalOpen] = useState(false);
  const [activeSigDataUrl, setActiveSigDataUrl] = useState<string | null>(null);

  // Copy/paste commands flow to PdfViewer as increment-only counters; these
  // booleans mirror the viewer's selection/clipboard for toolbar disabled states.
  const [copyRequest, setCopyRequest] = useState(0);
  const [pasteRequest, setPasteRequest] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [hasClipboard, setHasClipboard] = useState(false);

  // Shape/stamp tool selections + an image waiting to be placed on the page.
  const [shapeKind, setShapeKind] = useState<ShapeKind>('ellipse');
  const [stampKind, setStampKind] = useState<StampKind>('check');
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; w: number; h: number } | null>(null);

  // Closed-shape fill (ellipse / rectangle): whether new shapes get a
  // translucent fill, which color it uses, and how opaque it is.
  const [shapeFillEnabled, setShapeFillEnabled] = useState(false);
  const [shapeFillColor, setShapeFillColor] = useState('#fde047');
  const [shapeFillOpacity, setShapeFillOpacity] = useState(0.35);

  // Per-tool colors picked from the toolbar palette — applied when new text,
  // pencil strokes, highlights and shapes are created.
  const [toolColors, setToolColors] = useState<ToolColors>({
    text: '#000000',
    pencil: '#059669',
    highlight: '#fde047',
    shape: '#059669',
  });
  const handleSetToolColor = (key: ToolColorKey, color: string) => {
    setToolColors((prev) => ({ ...prev, [key]: color }));
  };

  // ----- Access control (subscription) -----------------------------------
  // Free accounts get one edit per day. Admins and active Pro subscribers are
  // always allowed. When the daily limit is exhausted we open the upgrade flow.
  const grantEditAccess = (): boolean => {
    if (editSessionGranted) return true;
    if (canEditResult.canEdit) {
      setEditSessionGranted(true);
      recordEdit();
      return true;
    }
    setUpgradeReason(subscriptionStatus.editLimitReason);
    setShowUpgrade(true);
    return false;
  };

  const openUpgrade = (reason?: string) => {
    setUpgradeReason(reason);
    setShowUpgrade(true);
  };

  // ----- Undo / redo -----------------------------------------------------
  // Snapshots are cheap: every setter above keeps state immutable, so each
  // history entry is just a handful of references, not deep copies.
  const docStateRef = useRef<DocState>(null as unknown as DocState);
  docStateRef.current = {
    textOverlays,
    cropSettings,
    signatures,
    highlights,
    drawings,
    imageOverlays,
    shapes,
    stamps,
    eraseAreas,
    pageRotations,
  };

  const [history, setHistory] = useState<{ undo: DocState[]; redo: DocState[] }>({
    undo: [],
    redo: [],
  });

  /** Snapshot the current document state before a mutation. */
  const pushHistory = () => {
    setHistory((h) => ({
      undo: [...h.undo, docStateRef.current].slice(-HISTORY_LIMIT),
      redo: [],
    }));
  };

  const clearHistory = () => setHistory({ undo: [], redo: [] });

  const restoreState = (state: DocState) => {
    setTextOverlays(state.textOverlays);
    setCropSettings(state.cropSettings);
    setSignatures(state.signatures);
    setHighlights(state.highlights);
    setDrawings(state.drawings);
    setImageOverlays(state.imageOverlays);
    setShapes(state.shapes);
    setStamps(state.stamps);
    setEraseAreas(state.eraseAreas);
    setPageRotations(state.pageRotations);
  };

  const handleUndo = () => {
    if (!history.undo.length) return;
    const prev = history.undo[history.undo.length - 1];
    restoreState(prev);
    setHistory({
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, docStateRef.current],
    });
  };

  const handleRedo = () => {
    if (!history.redo.length) return;
    const next = history.redo[history.redo.length - 1];
    restoreState(next);
    setHistory({
      undo: [...history.undo, docStateRef.current].slice(-HISTORY_LIMIT),
      redo: history.redo.slice(0, -1),
    });
  };

  /**
   * Rotate the current page by ±90° (clockwise for a positive delta). One
   * undo step per click, and rotating back to upright drops the entry so an
   * untouched page exports with no extra /Rotate at all.
   */
  const handleRotatePage = (delta: number) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setPageRotations((prev) => {
      const next = { ...prev };
      const value = normalizeRotation((next[currentPage] ?? 0) + delta);
      if (value === 0) delete next[currentPage];
      else next[currentPage] = value;
      return next;
    });
  };

  useEffect(() => {
    createSamplePdf().then((bytes) => {
      setPdfBytes(bytes);
    });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      setPdfBytes(new Uint8Array(arrayBuffer));
      setTextOverlays([]);
      setCropSettings({});
      setSignatures([]);
      setHighlights([]);
      setDrawings([]);
      setImageOverlays([]);
      setShapes([]);
      setStamps([]);
      setEraseAreas([]);
      setPageRotations({});
      setPendingImage(null);
      setCurrentPage(0);
      clearHistory();
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadSample = async () => {
    const bytes = await createSamplePdf();
    setPdfBytes(bytes);
    setTextOverlays([]);
    setCropSettings({});
    setSignatures([]);
    setHighlights([]);
    setDrawings([]);
    setImageOverlays([]);
    setShapes([]);
    setStamps([]);
    setEraseAreas([]);
    setPageRotations({});
    setPendingImage(null);
    setCurrentPage(0);
    clearHistory();
  };

  const handleAddTextOverlay = (overlay: EditedTextOverlay) => {
    if (!overlay.id) return;
    if (!grantEditAccess()) return;
    pushHistory();
    setTextOverlays((prev) => [...prev, overlay]);
  };

  // Live updates from the text-box corner-resize handle. History is pushed
  // once at drag start (pushFirst) so a whole resize undoes as a single step.
  const handleUpdateTextOverlay = (
    id: string,
    patch: Partial<EditedTextOverlay>,
    pushFirst?: boolean,
  ) => {
    if (!grantEditAccess()) return;
    if (pushFirst) pushHistory();
    setTextOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const handleApplyCrop = (crop: PageCropSetting) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setCropSettings((prev) => ({
      ...prev,
      [crop.pageIndex]: crop,
    }));
  };

  const handleResetCrop = (pageIndex: number) => {
    if (!cropSettings[pageIndex]) return;
    if (!grantEditAccess()) return;
    pushHistory();
    setCropSettings((prev) => {
      const copy = { ...prev };
      delete copy[pageIndex];
      return copy;
    });
  };

  const handleAddHighlight = (hl: HighlightArea) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setHighlights((prev) => [...prev, hl]);
  };

  const handleAddDrawing = (draw: FreehandDrawing) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setDrawings((prev) => [...prev, draw]);
  };

  const handleSaveSignature = (dataUrl: string) => {
    setActiveSigDataUrl(dataUrl);
    setTool('sign');
  };

  const handleAddSignature = (sig: SignatureItem) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setSignatures((prev) => [...prev, sig]);
  };

  const handleAddImageOverlay = (img: ImageOverlay) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setImageOverlays((prev) => [...prev, img]);
  };

  const handleAddShape = (sh: ShapeOverlay) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setShapes((prev) => [...prev, sh]);
  };

  const handleAddStamp = (st: StampOverlay) => {
    if (!grantEditAccess()) return;
    pushHistory();
    setStamps((prev) => [...prev, st]);
  };

  const handleEraseItems = (ids: string[], isFirstOfStroke: boolean) => {
    if (ids.length === 0) return;
    if (!grantEditAccess()) return;
    if (isFirstOfStroke) pushHistory();
    const idSet = new Set(ids);
    setDrawings((prev) => prev.filter((d) => !idSet.has(d.id)));
    setHighlights((prev) => prev.filter((h) => !idSet.has(h.id)));
    setShapes((prev) => prev.filter((s) => !idSet.has(s.id)));
    setStamps((prev) => prev.filter((s) => !idSet.has(s.id)));
    setSignatures((prev) => prev.filter((s) => !idSet.has(s.id)));
    setImageOverlays((prev) => prev.filter((img) => !idSet.has(img.id)));
    setTextOverlays((prev) => prev.filter((o) => !idSet.has(o.id)));
  };

  // A whole eraser stroke arrives as one batch: commit it as a single
  // history entry so one Ctrl+Z removes the whole stroke, not one stamp.
  const handleAddEraseAreas = (areas: EraseArea[]) => {
    if (areas.length === 0) return;
    if (!grantEditAccess()) return;
    pushHistory();
    setEraseAreas((prev) => [...prev, ...areas]);
  };

  const handleClearAnnotations = () => {
    if (!grantEditAccess()) return;
    pushHistory();
    const idx = currentPage;
    setDrawings((prev) => prev.filter((d) => d.pageIndex !== idx));
    setHighlights((prev) => prev.filter((h) => h.pageIndex !== idx));
    setShapes((prev) => prev.filter((s) => s.pageIndex !== idx));
    setStamps((prev) => prev.filter((s) => s.pageIndex !== idx));
    setSignatures((prev) => prev.filter((s) => s.pageIndex !== idx));
    setImageOverlays((prev) => prev.filter((img) => img.pageIndex !== idx));
    setTextOverlays((prev) => prev.filter((o) => o.pageIndex !== idx));
    setEraseAreas((prev) => prev.filter((a) => a.pageIndex !== idx));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        // Keep full pixel resolution for export; cap the on-page display size.
        const maxDim = 280;
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        setPendingImage({
          dataUrl: c.toDataURL('image/png'),
          w: Math.max(16, Math.round(img.width * ratio)),
          h: Math.max(16, Math.round(img.height * ratio)),
        });
        setTool('image');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleExport = async () => {
    if (!pdfBytes) return;
    try {
      const modifiedBytes = await exportModifiedPdf({
        originalPdfBytes: pdfBytes,
        textOverlays,
        cropSettings,
        signatures,
        imageOverlays,
        shapes,
        stamps,
        highlights,
        drawings,
        eraseAreas,
        pageRotations,
      });
      const blob = new Blob([modifiedBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'edited-document-' + Date.now() + '.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export PDF:', e);
      alert('Error exporting PDF document.');
    }
  };

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) — skipped while typing inside an input
  // so the native text-undo keeps working in the inline editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        setCopyRequest((c) => c + 1);
        return;
      }
      if (key === 'v') {
        e.preventDefault();
        setPasteRequest((p) => p + 1);
        return;
      }
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      // Zoom shortcuts: Ctrl/Cmd + '+'/'=' zoom in, '-' zoom out, '0' reset.
      if (key === '+' || key === '=') {
        e.preventDefault();
        zoomBy(1.2);
      } else if (key === '-') {
        e.preventDefault();
        zoomBy(1 / 1.2);
      } else if (key === '0') {
        e.preventDefault();
        setManualScale(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The console is admin-only. The account menu already hides the entry point
  // from everyone else; this second check makes sure a non-admin can never
  // reach the dashboard even if the flag were set some other way.
  if (showAdmin && user?.role === 'admin') {
    return <AdminDashboard onClose={() => setShowAdmin(false)} />;
  }

  return (
    <div className="flex flex-col min-h-screen w-screen bg-neutral-100 font-sans">
      {/*
        The editor is a fixed-height app surface. The SEO sections sit below it
        in normal document flow so the page still scrolls normally, and they are
        genuine content rather than hidden text — search engines penalise text
        that exists only to game rankings. See src/seo/content.ts.
      */}
      <div className="flex flex-col h-screen w-screen overflow-hidden">
      <Toolbar
        currentTool={currentTool}
        setTool={setTool}
        onExport={handleExport}
        onFileUpload={handleFileUpload}
        onLoadSample={handleLoadSample}
        onOpenSignatureModal={() => setIsSigModalOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.undo.length > 0}
        canRedo={history.redo.length > 0}
        onCopy={() => setCopyRequest((c) => c + 1)}
        onPaste={() => setPasteRequest((p) => p + 1)}
        canCopy={hasSelection}
        canPaste={hasClipboard}
        shapeKind={shapeKind}
        setShapeKind={setShapeKind}
        shapeFillEnabled={shapeFillEnabled}
        setShapeFillEnabled={setShapeFillEnabled}
        shapeFillColor={shapeFillColor}
        setShapeFillColor={setShapeFillColor}
        shapeFillOpacity={shapeFillOpacity}
        setShapeFillOpacity={setShapeFillOpacity}
        stampKind={stampKind}
        setStampKind={setStampKind}
        onImageUpload={handleImageUpload}
        onClearAnnotations={handleClearAnnotations}
        toolColors={toolColors}
        onSetToolColor={handleSetToolColor}
        pageRotation={pageRotations[currentPage] ?? 0}
        onRotatePage={handleRotatePage}
        accountSlot={
          <AccountMenu
            onOpenUpgrade={() => openUpgrade()}
            onOpenAdmin={() => setShowAdmin(true)}
            onChangePassword={() => setShowChangePassword(true)}
          />
        }
      />

      <div className="flex-1 flex overflow-hidden relative">
        <PdfViewer
          pdfBytes={pdfBytes}
          currentPage={currentPage}
          scale={scale}
          fitMode={fitMode}
          onScaleChange={setScale}
          onZoomBy={zoomBy}
          currentTool={currentTool}
          onTotalPagesLoaded={setTotalPages}
          textOverlays={textOverlays}
          onAddTextOverlay={handleAddTextOverlay}
          onUpdateTextOverlay={handleUpdateTextOverlay}
          cropSettings={cropSettings}
          onApplyCrop={handleApplyCrop}
          onResetCrop={handleResetCrop}
          onCancelCrop={() => setTool('select')}
          signatures={signatures}
          highlights={highlights}
          onAddHighlight={handleAddHighlight}
          drawings={drawings}
          onAddDrawing={handleAddDrawing}
          activeSignatureDataUrl={activeSigDataUrl}
          onClearActiveSignature={() => setActiveSigDataUrl(null)}
          onAddSignature={handleAddSignature}
          imageOverlays={imageOverlays}
          onAddImageOverlay={handleAddImageOverlay}
          onSelectionChange={setHasSelection}
          onClipboardChange={setHasClipboard}
          copyRequest={copyRequest}
          pasteRequest={pasteRequest}
          shapes={shapes}
          stamps={stamps}
          onAddShape={handleAddShape}
          onAddStamp={handleAddStamp}
          onEraseItems={handleEraseItems}
          eraseAreas={eraseAreas}
          onAddEraseAreas={handleAddEraseAreas}
          pageRotations={pageRotations}
          shapeKind={shapeKind}
          shapeFillEnabled={shapeFillEnabled}
          shapeFillColor={shapeFillColor}
          shapeFillOpacity={shapeFillOpacity}
          stampKind={stampKind}
          pendingImage={pendingImage}
          onClearPendingImage={() => setPendingImage(null)}
          toolColors={toolColors}
        />
      </div>

      {/* Bottom status bar — page navigation and zoom stay reachable on every
          screen size (they used to live in the header and disappear on
          small viewports). */}
      <footer className="shrink-0 h-10 border-t border-neutral-200 bg-white px-3 sm:px-5 flex items-center justify-between gap-3 select-none text-xs">
        <div className="shrink-0 flex items-center gap-0.5 bg-neutral-100 border border-neutral-200 rounded-lg p-0.5">
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            aria-label="Previous page"
            className="p-1 text-neutral-600 hover:text-emerald-600 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-1.5 font-semibold text-neutral-700 tabular-nums whitespace-nowrap">
            {currentPage + 1} / {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            aria-label="Next page"
            className="p-1 text-neutral-600 hover:text-emerald-600 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <span className="hidden md:block text-neutral-400 truncate">
          {currentTool.replace(/(-|^)([a-z])/g, (_m: string, _p: string, c: string) => c.toUpperCase())}
        </span>

        <div className="shrink-0 flex items-center gap-0.5 bg-neutral-100 border border-neutral-200 rounded-lg p-0.5">
          <button
            onClick={() => zoomBy(1 / 1.2)}
            aria-label="Zoom out"
            title="Zoom out (Ctrl+-)"
            className="p-1 text-neutral-600 hover:text-emerald-600"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setZoomMenu((v) => !v)}
              title="Zoom level — presets and fit modes"
              className="flex items-center gap-0.5 px-1.5 font-semibold text-neutral-700 tabular-nums hover:text-emerald-600"
            >
              {Math.round(scale * 100)}%
              <ChevronDown
                className={`w-3 h-3 transition-transform ${zoomMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {zoomMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onMouseDown={() => setZoomMenu(false)}
                />
                <div className="absolute bottom-full right-0 mb-1.5 z-50 w-32 py-1 bg-white border border-neutral-200 rounded-lg shadow-lg">
                  <button
                    onClick={() => {
                      setFitMode('page');
                      setZoomMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-emerald-50 hover:text-emerald-700 ${
                      fitMode === 'page'
                        ? 'text-emerald-600 font-semibold bg-emerald-50'
                        : 'text-neutral-700'
                    }`}
                  >
                    Fit page
                  </button>
                  <button
                    onClick={() => {
                      setFitMode('width');
                      setZoomMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-emerald-50 hover:text-emerald-700 ${
                      fitMode === 'width'
                        ? 'text-emerald-600 font-semibold bg-emerald-50'
                        : 'text-neutral-700'
                    }`}
                  >
                    Fit width
                  </button>
                  <div className="my-1 border-t border-neutral-100" />
                  {[50, 75, 100, 125, 150, 200, 250, 300].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        setManualScale(pct / 100);
                        setZoomMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1 hover:bg-emerald-50 hover:text-emerald-700 ${
                        !fitMode && Math.round(scale * 100) === pct
                          ? 'text-emerald-600 font-semibold bg-emerald-50'
                          : 'text-neutral-700'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => zoomBy(1.2)}
            aria-label="Zoom in"
            title="Zoom in (Ctrl++)"
            className="p-1 text-neutral-600 hover:text-emerald-600"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </footer>

      <SignaturePadModal
        isOpen={isSigModalOpen}
        onClose={() => setIsSigModalOpen(false)}
        onSave={handleSaveSignature}
      />

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason={upgradeReason}
      />

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
      </div>

      <SeoSections />
    </div>
  );
}