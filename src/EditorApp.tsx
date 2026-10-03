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
  ShapeKind,
  StampKind,
  ToolColorKey,
  ToolColors,
} from './types/pdf';
import { Toolbar } from './components/Toolbar';
import { PdfViewer } from './components/PdfViewer';
import { SignaturePadModal } from './components/SignaturePadModal';
import { createSamplePdf, exportModifiedPdf } from './services/pdfExporter';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

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
};

const HISTORY_LIMIT = 50;

export function EditorApp() {

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [currentTool, setTool] = useState<ToolType>('select');

  const [textOverlays, setTextOverlays] = useState<EditedTextOverlay[]>([]);
  const [cropSettings, setCropSettings] = useState<Record<number, PageCropSetting>>({});
  const [signatures, setSignatures] = useState<SignatureItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightArea[]>([]);
  const [drawings, setDrawings] = useState<FreehandDrawing[]>([]);
  const [imageOverlays, setImageOverlays] = useState<ImageOverlay[]>([]);
  const [shapes, setShapes] = useState<ShapeOverlay[]>([]);
  const [stamps, setStamps] = useState<StampOverlay[]>([]);

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

  // ----- Undo / redo -----------------------------------------------------
  // Snapshots are cheap: every setter above keeps state immutable, so each
  // history entry is just a handful of references, not deep copies.
  const docStateRef = useRef<DocState>(null as unknown as DocState);
  docStateRef.current = { textOverlays, cropSettings, signatures, highlights, drawings, imageOverlays, shapes, stamps };

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
    setPendingImage(null);
    setCurrentPage(0);
    clearHistory();
  };

  const handleAddTextOverlay = (overlay: EditedTextOverlay) => {
    if (!overlay.id) return;
    pushHistory();
    setTextOverlays((prev) => [...prev, overlay]);
  };

  const handleApplyCrop = (crop: PageCropSetting) => {
    pushHistory();
    setCropSettings((prev) => ({
      ...prev,
      [crop.pageIndex]: crop,
    }));
  };

  const handleResetCrop = (pageIndex: number) => {
    if (!cropSettings[pageIndex]) return;
    pushHistory();
    setCropSettings((prev) => {
      const copy = { ...prev };
      delete copy[pageIndex];
      return copy;
    });
  };

  const handleAddHighlight = (hl: HighlightArea) => {
    pushHistory();
    setHighlights((prev) => [...prev, hl]);
  };

  const handleAddDrawing = (draw: FreehandDrawing) => {
    pushHistory();
    setDrawings((prev) => [...prev, draw]);
  };

  const handleSaveSignature = (dataUrl: string) => {
    setActiveSigDataUrl(dataUrl);
    setTool('sign');
  };

  const handleAddSignature = (sig: SignatureItem) => {
    pushHistory();
    setSignatures((prev) => [...prev, sig]);
  };

  const handleAddImageOverlay = (img: ImageOverlay) => {
    pushHistory();
    setImageOverlays((prev) => [...prev, img]);
  };

  const handleAddShape = (sh: ShapeOverlay) => {
    pushHistory();
    setShapes((prev) => [...prev, sh]);
  };

  const handleAddStamp = (st: StampOverlay) => {
    pushHistory();
    setStamps((prev) => [...prev, st]);
  };

  const handleEraseItems = (ids: string[], isFirstOfStroke: boolean) => {
    if (ids.length === 0) return;
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

  const handleClearAnnotations = () => {
    pushHistory();
    const idx = currentPage;
    setDrawings((prev) => prev.filter((d) => d.pageIndex !== idx));
    setHighlights((prev) => prev.filter((h) => h.pageIndex !== idx));
    setShapes((prev) => prev.filter((s) => s.pageIndex !== idx));
    setStamps((prev) => prev.filter((s) => s.pageIndex !== idx));
    setSignatures((prev) => prev.filter((s) => s.pageIndex !== idx));
    setImageOverlays((prev) => prev.filter((img) => img.pageIndex !== idx));
    setTextOverlays((prev) => prev.filter((o) => o.pageIndex !== idx));
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-100 font-sans">
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
        stampKind={stampKind}
        setStampKind={setStampKind}
        onImageUpload={handleImageUpload}
        onClearAnnotations={handleClearAnnotations}
        toolColors={toolColors}
        onSetToolColor={handleSetToolColor}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <PdfViewer
          pdfBytes={pdfBytes}
          currentPage={currentPage}
          scale={scale}
          currentTool={currentTool}
          onTotalPagesLoaded={setTotalPages}
          textOverlays={textOverlays}
          onAddTextOverlay={handleAddTextOverlay}
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
          shapeKind={shapeKind}
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
            onClick={() => setScale(Math.max(0.6, scale - 0.2))}
            aria-label="Zoom out"
            className="p-1 text-neutral-600 hover:text-emerald-600"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale(1)}
            title="Reset zoom to 100%"
            className="px-1.5 font-semibold text-neutral-700 tabular-nums hover:text-emerald-600"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={() => setScale(Math.min(2.5, scale + 0.2))}
            aria-label="Zoom in"
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
    </div>
  );
}