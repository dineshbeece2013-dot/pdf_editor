import React, { useRef, useState } from 'react';
import type { ToolType, ShapeKind, StampKind, ToolColorKey, ToolColors, TextFormat } from '../types/pdf';
import { FONT_GROUPS, cssFontFamily } from '../services/fontCatalog';
import {
  MousePointer,
  Type,
  Crop,
  Highlighter,
  PenTool,
  Download,
  Upload,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Pencil,
  PenLine,
  Eraser,
  ChevronDown,
  Circle,
  Square,
  Triangle,
  Sticker,
  Image as ImageIcon,
  Check,
  X,
  Star,
  Trash2,
  FileText,
  Palette,
  RotateCcw,
  RotateCw,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

export interface ToolbarProps {
  currentTool: ToolType;
  setTool: (tool: ToolType) => void;
  onExport: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadSample: () => void;
  onOpenSignatureModal: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCopy: () => void;
  onPaste: () => void;
  canCopy: boolean;
  canPaste: boolean;
  shapeKind: ShapeKind;
  setShapeKind: (k: ShapeKind) => void;
  shapeFillEnabled: boolean;
  setShapeFillEnabled: (v: boolean) => void;
  shapeFillColor: string;
  setShapeFillColor: (c: string) => void;
  shapeFillOpacity: number;
  setShapeFillOpacity: (v: number) => void;
  stampKind: StampKind;
  setStampKind: (k: StampKind) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAnnotations: () => void;
  toolColors: ToolColors;
  onSetToolColor: (key: ToolColorKey, color: string) => void;
  /** Extra rotation of the current page in degrees (0/90/180/270, CW). */
  pageRotation: number;
  /** Rotate the current page by ±90° (positive = clockwise). */
  onRotatePage: (delta: number) => void;
  /** Optional account/subscription control rendered at the top-right. */
  accountSlot?: React.ReactNode;
  /** Text format state for add-text and edit-text tools. */
  textFormat?: TextFormat;
  onTextFormatChange?: (format: Partial<TextFormat>) => void;
  /** Inline text editing state */
  editingOverlayId?: string | null;
  editingText?: string;
  onStartEditing?: (overlayId: string, initialText: string, seedFormat?: Partial<TextFormat>) => void;
  onUpdateText?: (text: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
}

type DropdownMenu = 'erase' | 'annotate' | 'shape' | 'color';

/** Preset swatches offered by the color palette (a custom picker sits below them). */
const COLOR_PALETTE: string[] = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#ffffff',
  '#dc2626', '#f97316', '#f59e0b', '#fde047', '#84cc16', '#22c55e', '#ec4899',
  '#059669', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#92400e',
];

/**
 * Top bar restructured for every screen size:
 *   Row 1 (h-14) — brand, Upload / Sample, primary Export action.
 *   Row 2 (h-12) — a single horizontally scrollable tool strip that never
 *                  wraps; on narrow screens it swipes instead of growing.
 *   Row 3        — text-formatting controls (font, size, B/I/U, alignment,
 *                  colour, opacity, Done/Cancel) on their own full-width row
 *                  whenever a text tool is active. The row wraps instead of
 *                  overflowing, so editing text can never push the toolbar
 *                  past the edge of the screen.
 * Dropdown menus render with `position: fixed` so the strip's overflow cannot
 * clip them.
 */
export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  setTool,
  onExport,
  onFileUpload,
  onLoadSample,
  onOpenSignatureModal,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCopy,
  onPaste,
  canCopy,
  canPaste,
  shapeKind,
  setShapeKind,
  shapeFillEnabled,
  setShapeFillEnabled,
  shapeFillColor,
  setShapeFillColor,
  shapeFillOpacity,
  setShapeFillOpacity,
  stampKind,
  setStampKind,
  onImageUpload,
  onClearAnnotations,
  toolColors,
  onSetToolColor,
  pageRotation,
  onRotatePage,
  accountSlot,
  textFormat,
  onTextFormatChange,
  editingOverlayId,
  editingText: _editingText,
  onStartEditing: _onStartEditing,
  onUpdateText: _onUpdateText,
  onCommit,
  onCancel,
}) => {
  const [openMenu, setOpenMenu] = useState<DropdownMenu | null>(null);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleToolClick = (tool: ToolType) => {
    setOpenMenu(null);
    if (tool === 'sign') onOpenSignatureModal();
    setTool(tool);
  };

  /** Open/close a dropdown, anchored under its trigger and clamped to the viewport. */
  const toggleMenu = (menu: DropdownMenu, width: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenu === menu) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
    });
    setOpenMenu(menu);
  };

  /** Pill styling: solid emerald for the active tool, quiet neutral otherwise. */
  const toolCls = (tool: ToolType) =>
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ' +
    (currentTool === tool
      ? 'bg-emerald-600 text-white shadow-sm'
      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100');

  const ghostCls =
    'p-2 rounded-lg text-neutral-600 hover:text-emerald-600 hover:bg-neutral-100 ' +
    'disabled:opacity-30 disabled:hover:text-neutral-600 disabled:hover:bg-transparent';

  const Divider = () => <span className="w-px h-5 bg-neutral-200 mx-1 shrink-0" />;

  /** Sub-component to keep the toolbar JSX tidy. `data-textformat` marks the
   *  region as "safe to click while editing" so the in-document editor does
   *  not commit when the user reaches for a formatting control. */
  const TextFormatControls = () => {
    if (!textFormat) return null;
    return (
      <div
        data-textformat=""
        className="border-t border-neutral-100 bg-neutral-50/70 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 sm:px-5 py-1.5"
      >
        {/* Font family */}
        <select
          value={textFormat.fontFamily}
          onChange={(e) => onTextFormatChange?.({ fontFamily: e.target.value })}
          className="text-[11px] font-medium bg-transparent border border-neutral-200 rounded px-1.5 py-0.5 outline-none focus:border-emerald-400 cursor-pointer max-w-[130px]"
          title="Font family"
          style={{ fontFamily: cssFontFamily(textFormat.fontFamily) }}
        >
          {FONT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fonts.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {/* Font size */}
        <select
          value={String(textFormat.fontSize)}
          onChange={(e) => onTextFormatChange?.({ fontSize: Number(e.target.value) })}
          className="text-[11px] font-medium bg-transparent border border-neutral-200 rounded px-1.5 py-0.5 outline-none focus:border-emerald-400 cursor-pointer"
          title="Font size"
        >
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="w-px h-4 bg-neutral-200 mx-0.5 shrink-0" />
        <button
          onClick={() => onTextFormatChange?.({ bold: !textFormat.bold })}
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${textFormat.bold ? 'bg-emerald-100 text-emerald-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
          title="Bold"
        >
          <Bold className="w-3 h-3" />
        </button>
        <button
          onClick={() => onTextFormatChange?.({ italic: !textFormat.italic })}
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${textFormat.italic ? 'bg-emerald-100 text-emerald-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
          title="Italic"
        >
          <Italic className="w-3 h-3" />
        </button>
        <button
          onClick={() => onTextFormatChange?.({ underline: !textFormat.underline })}
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${textFormat.underline ? 'bg-emerald-100 text-emerald-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
          title="Underline"
        >
          <Underline className="w-3 h-3" />
        </button>
        <div className="w-px h-4 bg-neutral-200 mx-0.5 shrink-0" />
        <button
          onClick={() => onTextFormatChange?.({ align: 'left' })}
          className={`p-0.5 rounded transition-colors ${textFormat.align === 'left' ? 'bg-emerald-200 text-emerald-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
          title="Align left"
        >
          <AlignLeft className="w-3 h-3" />
        </button>
        <button
          onClick={() => onTextFormatChange?.({ align: 'center' })}
          className={`p-0.5 rounded transition-colors ${textFormat.align === 'center' ? 'bg-emerald-200 text-emerald-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
          title="Align center"
        >
          <AlignCenter className="w-3 h-3" />
        </button>
        <button
          onClick={() => onTextFormatChange?.({ align: 'right' })}
          className={`p-0.5 rounded transition-colors ${textFormat.align === 'right' ? 'bg-emerald-200 text-emerald-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
          title="Align right"
        >
          <AlignRight className="w-3 h-3" />
        </button>
        <div className="w-px h-4 bg-neutral-200 mx-0.5 shrink-0" />
        {/* Text color */}
        <input
          type="color"
          value={textFormat.color}
          onChange={(e) => onTextFormatChange?.({ color: e.target.value })}
          className="w-5 h-5 rounded border border-neutral-200 cursor-pointer p-0"
          title="Text color"
        />
        {/* Opacity */}
        <span className="text-[10px] tabular-nums text-neutral-500 w-8 text-right">
          {Math.round(textFormat.opacity ?? 100)}%
        </span>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(textFormat.opacity ?? 100)}
          onChange={(e) => onTextFormatChange?.({ opacity: Number(e.target.value) })}
          className="w-14 accent-emerald-600 cursor-pointer"
          title="Opacity"
        />
        {/* Commit / Cancel controls when editing an inline overlay */}
        {editingOverlayId != null && (
          <>
            <div className="w-px h-4 bg-neutral-200 mx-0.5 shrink-0" />
            {onCommit && (
              <button
                onClick={onCommit}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                title="Finish editing (Ctrl+Enter)"
              >
                <Check className="w-3 h-3" />
                <span>Done</span>
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-1 rounded text-neutral-500 hover:bg-neutral-100"
                title="Discard changes (Esc)"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  /** The palette targets the active tool's color (falls back to pencil). */
  const colorTarget: ToolColorKey =
    currentTool === 'add-text' || currentTool === 'edit-text'
      ? 'text'
      : currentTool === 'highlight'
        ? 'highlight'
        : currentTool === 'ellipse'
          ? 'shape'
          : 'pencil';
  const colorLabel =
    colorTarget === 'text' ? 'Text' : colorTarget === 'highlight' ? 'Highlight' : colorTarget === 'shape' ? 'Shape' : 'Pencil';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-neutral-200 select-none">
      {openMenu && <div className="fixed inset-0 z-40" onMouseDown={() => setOpenMenu(null)} />}

      {/* Row 1 — brand · file actions · primary action */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 h-14">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
            <FileText className="w-4 h-4" />
          </div>
          <span className="hidden sm:block font-bold text-[15px] tracking-tight text-neutral-900">
            PDF <span className="text-emerald-600">Editor</span>
          </span>
        </div>

        <label
          className="ml-1 sm:ml-2 cursor-pointer flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-100 text-xs font-semibold"
          title="Upload a PDF"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Upload</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={onFileUpload} />
        </label>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageUpload} />

        <button
          onClick={onLoadSample}
          className="hidden md:flex items-center px-3 py-2 rounded-lg text-xs font-semibold text-neutral-500 hover:text-emerald-600 hover:bg-neutral-100"
        >
          Sample Invoice
        </button>

        <div className="ml-auto flex items-center gap-2">
          {accountSlot}
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Row 2 — one scrollable tool strip: never wraps, swipes on narrow screens */}
      <div
        className="border-t border-neutral-100 overflow-x-auto overflow-y-hidden no-scrollbar"
        onScroll={() => openMenu && setOpenMenu(null)}
      >
        <div className="flex items-center gap-1 w-max px-3 sm:px-5 h-12">
          {/* History */}
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" className={ghostCls}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className={ghostCls}>
            <Redo2 className="w-4 h-4" />
          </button>

          <Divider />

          {/* Clipboard */}
          <button onClick={onCopy} disabled={!canCopy} title="Copy selection (Ctrl+C)" className={ghostCls}>
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onPaste} disabled={!canPaste} title="Paste copied region (Ctrl+V)" className={ghostCls}>
            <ClipboardPaste className="w-4 h-4" />
          </button>

          <Divider />

          {/* Core tools — labels always visible; the strip scrolls if they don't fit */}
          <button onClick={() => handleToolClick('select')} className={toolCls('select')}>
            <MousePointer className="w-4 h-4" />
            <span>Select</span>
          </button>
          <button onClick={() => handleToolClick('crop')} title="Crop page" className={toolCls('crop')}>
            <Crop className="w-4 h-4" />
            <span>Crop</span>
          </button>
          <button
            onClick={() => handleToolClick('add-text')}
            title="Add new text to the page"
            className={toolCls('add-text')}
          >
            <Type className="w-4 h-4" />
            <span>Add Text</span>
          </button>
          <button
            onClick={() => handleToolClick('edit-text')}
            title="Click to edit typography (font auto-detected)"
            className={toolCls('edit-text')}
          >
            <PenLine className="w-4 h-4" />
            <span>Edit Text</span>
          </button>
          <button onClick={() => handleToolClick('highlight')} title="Highlight text" className={toolCls('highlight')}>
            <Highlighter className="w-4 h-4" />
            <span>Highlight</span>
          </button>
          <button onClick={() => handleToolClick('draw')} title="Pencil" className={toolCls('draw')}>
            <Pencil className="w-4 h-4" />
            <span>Pencil</span>
          </button>
          <button onClick={() => handleToolClick('sign')} title="Add your signature" className={toolCls('sign')}>
            <PenTool className="w-4 h-4" />
            <span>Sign</span>
          </button>

          <Divider />

          {/* Eraser dropdown */}
          <button
            onClick={(e) => toggleMenu('erase', 224, e)}
            title="Eraser — rub out text, images and annotations"
            className={toolCls('erase')}
          >
            <Eraser className="w-4 h-4" />
            <span>Eraser</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {/* Annotation stamps dropdown */}
          <button
            onClick={(e) => toggleMenu('annotate', 176, e)}
            title="Annotation stamps"
            className={toolCls('annotate')}
          >
            <Sticker className="w-4 h-4" />
            <span>Annotate</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          <button onClick={() => imageInputRef.current?.click()} title="Insert an image" className={toolCls('image')}>
            <ImageIcon className="w-4 h-4" />
            <span>Image</span>
          </button>

          {/* Shapes dropdown */}
          <button
            onClick={(e) => toggleMenu('shape', 224, e)}
            title="Shape tools"
            className={toolCls('ellipse')}
          >
            <Circle className="w-4 h-4" />
            <span>Shape</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          <Divider />

          {/* Color palette — picks the color for the active tool's new items */}
          <button
            onClick={(e) => toggleMenu('color', 240, e)}
            title={`${colorLabel} color — used for new ${colorLabel.toLowerCase()} items`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
          >
            <Palette className="w-4 h-4" />
            <span>Color</span>
            <span
              className="w-3.5 h-3.5 rounded-full border border-black/15"
              style={{ backgroundColor: toolColors[colorTarget] }}
            />
          </button>

          <Divider />

          {/* Page rotation — one 90° step per click, undoable like any edit.
              The angle badge only appears once the page has been turned. */}
          <button
            onClick={() => onRotatePage(-90)}
            title={`Rotate page counter-clockwise${pageRotation ? ` (currently ${pageRotation}°)` : ''}`}
            className={ghostCls}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRotatePage(90)}
            title={`Rotate page clockwise${pageRotation ? ` (currently ${pageRotation}°)` : ''}`}
            className={ghostCls}
          >
            <RotateCw className="w-4 h-4" />
            {pageRotation > 0 && (
              <span className="ml-0.5 text-[10px] font-semibold tabular-nums text-emerald-600">
                {pageRotation}°
              </span>
            )}
          </button>

          {/* Text formatting lives on its own row below the strip (row 3) so
              adding controls here can never widen the toolbar past the screen. */}
        </div>
      </div>

      {(currentTool === 'add-text' || currentTool === 'edit-text' || editingOverlayId != null) && (
        <TextFormatControls />
      )}

      {/* Dropdowns: position fixed so the scrolling strip can never clip them */}
      {openMenu === 'erase' && (
        <div
          className="fixed z-50 w-56 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 text-xs"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          <button
            onClick={() => {
              setTool('erase');
              setOpenMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 font-medium"
          >
            <Eraser className="w-4 h-4 text-neutral-500" /> Erase content & marks
          </button>
          <button
            onClick={() => {
              onClearAnnotations();
              setOpenMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 font-medium"
          >
            <Trash2 className="w-4 h-4 text-red-500" /> Clear all on this page
          </button>
        </div>
      )}

      {openMenu === 'annotate' && (
        <div
          className="fixed z-50 w-44 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 text-xs"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          {(
            [
              { k: 'check', label: 'Check mark', Icon: Check, color: '#16a34a' },
              { k: 'cross', label: 'Cross mark', Icon: X, color: '#dc2626' },
              { k: 'star', label: 'Star', Icon: Star, color: '#f59e0b' },
            ] as const
          ).map(({ k, label, Icon, color }) => (
            <button
              key={k}
              onClick={() => {
                setStampKind(k);
                setTool('annotate');
                setOpenMenu(null);
              }}
              className={
                'w-full text-left px-3 py-2 flex items-center gap-2 font-medium ' +
                (currentTool === 'annotate' && stampKind === k
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-neutral-700 hover:bg-neutral-50')
              }
            >
              <Icon className="w-4 h-4" style={{ color }} /> {label}
            </button>
          ))}
        </div>
      )}

      {openMenu === 'shape' && (
        <div
          className="fixed z-50 w-56 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 text-xs"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          {(
            [
              { k: 'ellipse', label: 'Ellipse', Icon: Circle },
              { k: 'rectangle', label: 'Rectangle', Icon: Square },
              { k: 'triangle', label: 'Triangle', Icon: Triangle },
            ] as const
          ).map(({ k, label, Icon }) => (
            <button
              key={k}
              onClick={() => {
                setShapeKind(k);
                setTool('ellipse');
                setOpenMenu(null);
              }}
              className={
                'w-full text-left px-3 py-2 flex items-center gap-2 font-medium ' +
                (currentTool === 'ellipse' && shapeKind === k
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-neutral-700 hover:bg-neutral-50')
              }
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
          <div className="my-1 border-t border-neutral-100" />
          <div className="px-3 py-2">
            <label className="flex items-center gap-2 font-medium text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={shapeFillEnabled}
                onChange={(e) => setShapeFillEnabled(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-600"
              />
              Fill shape
            </label>
            {shapeFillEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={shapeFillColor}
                  onChange={(e) => setShapeFillColor(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-7 h-7 p-0 border border-neutral-200 rounded cursor-pointer bg-white"
                  title="Shape fill color"
                />
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(shapeFillOpacity * 100)}
                  onChange={(e) => setShapeFillOpacity(Number(e.target.value) / 100)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 accent-emerald-600"
                  title={`Fill opacity ${Math.round(shapeFillOpacity * 100)}%`}
                />
                <span className="w-9 text-right tabular-nums text-neutral-500">
                  {Math.round(shapeFillOpacity * 100)}%
                </span>
              </div>
            )}
            <p className="mt-1.5 text-[10px] leading-snug text-neutral-400">
              Applies to new ellipses, rectangles and triangles.
            </p>
          </div>
        </div>
      )}

      {openMenu === 'color' && (
        <div
          className="fixed z-50 w-60 bg-white border border-neutral-200 rounded-xl shadow-lg p-2.5 text-xs"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          <div className="flex items-center justify-between px-0.5 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{colorLabel} color</span>
            <span className="text-[10px] font-medium text-neutral-400">{toolColors[colorTarget]}</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => {
                  onSetToolColor(colorTarget, c);
                  setOpenMenu(null);
                }}
                className={
                  'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ' +
                  (toolColors[colorTarget].toLowerCase() === c ? 'border-neutral-900' : 'border-black/10')
                }
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <label className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center gap-2 px-0.5 text-xs font-medium text-neutral-600 cursor-pointer hover:text-neutral-900">
            <input
              type="color"
              value={toolColors[colorTarget]}
              onChange={(e) => onSetToolColor(colorTarget, e.target.value)}
              className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
              title="Pick a custom color"
            />
            Custom color
          </label>
        </div>
      )}

    </header>
  );
};
