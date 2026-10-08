import React, { useEffect, useRef, useState } from 'react';
import type { DetectedTextItem, EditedTextOverlay } from '../types/pdf';
import { cssFontFamily, detectFontId, FONT_GROUPS, isValidFontId } from '../services/fontCatalog';
import { wrapLines } from '../utils/wrapText';
import { Check, X, Sparkles, Move } from 'lucide-react';

interface TextEditInlineProps {
  item: DetectedTextItem;
  pageIndex: number;
  onSave: (overlay: EditedTextOverlay) => void;
  onCancel: () => void;
  /** True when creating brand-new text (no cover patch, starts empty). */
  isNew?: boolean;
  /** Last-used formatting, applied as defaults when creating new text. */
  defaults?: { fontFamily?: string; fontSize?: number };
  /** Page width in PDF points — the box auto-fits up to the page edge. */
  pageWidthPt?: number;
  /**
   * Counter-rotation of the page (degrees CW) so the popup un-turns itself
   * and its controls stay upright on a rotated sheet. Defaults to 0.
   */
  rotation?: number;
  /**
   * Present only while editing an ALREADY SAVED box: starts a drag that
   * moves the box anywhere on the page. The editor popup sits above the box,
   * so this header grip is the reliable way to move it while editing.
   */
  onMoveStart?: (e: React.MouseEvent) => void;
}

export const TextEditInline: React.FC<TextEditInlineProps> = ({
  item,
  pageIndex,
  onSave,
  onCancel,
  isNew,
  defaults,
  pageWidthPt,
  rotation = 0,
  onMoveStart,
}) => {
  const [text, setText] = useState(item.str);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // The textarea grows with its content so large text stays fully visible.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(64, ta.scrollHeight)}px`;
  }, [text]);

  const [fontSize, setFontSize] = useState(() =>
    isNew && defaults?.fontSize ? defaults.fontSize : Math.round(item.fontSize)
  );
  const [fontFamily, setFontFamily] = useState(() => {
    if (isNew && defaults?.fontFamily && isValidFontId(defaults.fontFamily)) {
      return defaults.fontFamily;
    }
    // Preselect the closest catalog match for the document's detected font
    // (e.g. raw "Calibri" or "ArialMT" select Calibri / Arial).
    return detectFontId(item.originalFontName || item.fontFamily);
  });
  const [textColor, setTextColor] = useState(item.editColor ?? item.color ?? '#000000');
  const [isBold, setIsBold] = useState(item.editIsBold ?? false);
  // Text opacity as a whole percent: 100 by default (fully opaque); the user
  // can lower it when they want the box to show the page through it.
  const [opacity, setOpacity] = useState(() =>
    Math.round(Math.min(100, Math.max(10, (item.editOpacity ?? 1) * 100))),
  );

  const handleSave = () => {
    if (isNew && !text.trim()) {
      onCancel();
      return;
    }

    // Sanitize the size (typed input can be empty or out of range).
    const size = Number.isFinite(fontSize) && fontSize > 0 ? Math.min(400, fontSize) : 12;

    // Auto-fit: wrap the text with real font metrics and size the box to its
    // content, so large / multi-line text is fully visible. The box keeps its
    // top edge (pdfY + pdfHeight is the anchor) and can be resized afterwards
    // by dragging the corner handle in the viewer.
    const pxPerPt = item.width > 0 && item.pdfWidth > 0 ? item.width / item.pdfWidth : 1;
    const fontSizePx = Math.max(4, size * pxPerPt);
    const availPt = Math.max(40, (pageWidthPt ?? item.pdfX + item.pdfWidth) - item.pdfX - 6);
    const availPx = availPt * pxPerPt;
    let maxLinePx = 0;
    let lineCount = 1;
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `${isBold ? '700 ' : ''}${fontSizePx}px ${cssFontFamily(fontFamily)}`;
      const lines = wrapLines((t) => ctx.measureText(t).width, text, availPx);
      lineCount = lines.length;
      for (const ln of lines) maxLinePx = Math.max(maxLinePx, ctx.measureText(ln).width);
    } else {
      // No canvas: rough fallback so the box still grows with the text.
      const paras = text.split('\n');
      lineCount = Math.max(1, paras.length);
      let longest = 0;
      for (const p of paras) longest = Math.max(longest, p.length);
      maxLinePx = longest * fontSizePx * 0.6;
    }

    // 0.6em of slack: canvas metrics can run a hair narrower than the
    // browser's final line layout (kerning / trailing spaces), and even a
    // couple of clipped pixels are visible — the margin keeps text inside.
    const slackPx = fontSizePx * 0.6;
    const lineHeightPt = size * 1.2;
    const boxWidth = Math.min(availPt, Math.max(24, (maxLinePx + slackPx) / pxPerPt));
    const boxHeight = Math.max(lineHeightPt, lineCount * lineHeightPt);
    const topPt = item.pdfY + item.pdfHeight;

    const overlay: EditedTextOverlay = {
      id: 'overlay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      pageIndex,
      pdfX: item.pdfX,
      pdfY: topPt - boxHeight,
      pdfWidth: boxWidth,
      pdfHeight: boxHeight,
      text: text,
      fontSize: size,
      fontFamily: fontFamily,
      color: textColor,
      isBold: isBold,
      opacity: opacity / 100,
      coverOriginal: !isNew,
      // New text gets no white cover patch — only edits mask the original.
      ...(isNew
        ? {}
        : {
            coverRect: {
              pdfX: item.pdfX - 1,
              pdfY: item.pdfY - 2,
              pdfWidth: Math.max(item.pdfWidth + 4, 20),
              pdfHeight: Math.max(item.pdfHeight + 4, 12),
              color: '#ffffff',
            },
          }),
    };

    onSave(overlay);
  };

  return (
    <div
      className="absolute z-30 bg-white rounded-lg shadow-2xl border border-emerald-400 p-2 min-w-[260px]"
      style={{
        // Keep the popup inside the page box: anchor beside the text box but
        // never past its right edge. `min()`/`max()` let the browser re-clamp
        // whenever the sheet's rendered width changes (narrow screens, zoom,
        // a rotated page); maxWidth backstops content that is wider than the
        // 260px nominal width.
        left: `max(0px, min(${Math.max(0, item.x - 4)}px, calc(100% - 282px)))`,
        maxWidth: `calc(100% - max(0px, min(${Math.max(0, item.x - 4)}px, calc(100% - 282px))) - 8px)`,
        top: Math.max(0, item.y - 48),
        // The page turns as a whole — un-turn the popup so its controls stay
        // upright and usable (rotating about its own centre keeps it anchored
        // beside the text box it belongs to).
        ...(rotation ? { transform: `rotate(${-rotation}deg)` } : null),
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between pb-1.5 mb-1.5 border-b border-neutral-100 text-[11px] text-neutral-500">
        <div className="flex items-center gap-1 font-medium text-emerald-700">
          <Sparkles className="w-3 h-3" />
          <span>{isNew ? 'New text' : `Detected: ${item.originalFontName || 'Helvetica'} (${Math.round(item.fontSize)}pt)`}</span>
        </div>
        <div className="flex items-center gap-1">
          {onMoveStart && (
            <button
              type="button"
              title="Drag to move the text box anywhere on the page"
              onMouseDown={(e) => {
                e.preventDefault();
                onMoveStart(e);
              }}
              className="cursor-move text-neutral-400 hover:text-emerald-600 px-1"
            >
              <Move className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2 bg-neutral-50 p-1 rounded-md">
        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          title="Font family"
          className="w-[140px] text-xs bg-white border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700 font-medium"
          style={{ fontFamily: cssFontFamily(fontFamily) }}
        >
          {FONT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fonts.map((font) => (
                <option key={font.id} value={font.id} style={{ fontFamily: font.css }}>
                  {font.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <input
          type="number"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-12 text-xs bg-white border border-neutral-200 rounded px-1.5 py-0.5 text-center font-medium"
          title="Font Size (pt)"
          min={6}
          max={96}
        />

        <button
          type="button"
          onClick={() => setIsBold(!isBold)}
          className={`px-2 py-0.5 text-xs font-bold rounded ${
            isBold ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          B
        </button>

        <input
          type="color"
          value={textColor}
          onChange={(e) => setTextColor(e.target.value)}
          className="w-6 h-6 border-0 p-0 rounded cursor-pointer bg-transparent"
          title="Text Color"
        />
      </div>

      {/* Opacity: 100% by default (solid), reducible when the user wants the
          page to show through the text box. */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span className="text-[11px] font-medium text-neutral-500 select-none">Opacity</span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="flex-1 accent-emerald-600"
          title={`Text opacity ${opacity}%`}
        />
        <span className="w-9 text-right tabular-nums text-[11px] text-neutral-500">{opacity}%</span>
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        autoFocus
        rows={3}
        placeholder={isNew ? 'Type your text… (multi-line is fine)' : ''}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full min-h-16 px-2 py-1 text-sm border border-neutral-300 rounded focus:border-emerald-500 focus:outline-none text-neutral-800 resize-y"
        style={{
          fontFamily: cssFontFamily(fontFamily),
          fontWeight: isBold ? 700 : 400,
          color: textColor,
        }}
      />

      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[10px] text-neutral-400 select-none mr-auto">
          Ctrl+Enter saves · Esc cancels
        </span>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm"
        >
          <Check className="w-3 h-3" />
          {isNew ? 'Add Text' : 'Update Text'}
        </button>
      </div>
    </div>
  );
};
