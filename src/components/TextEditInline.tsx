import React, { useEffect, useRef } from 'react';
import type { DetectedTextItem, EditedTextOverlay, TextFormat } from '../types/pdf';
import { cssFontFamily, detectFontId, isValidFontId } from '../services/fontCatalog';
import { wrapLines } from '../utils/wrapText';
import { Move } from 'lucide-react';

export interface TextEditInlineProps {
  item: DetectedTextItem;
  pageIndex: number;
  onSave: (overlay: EditedTextOverlay) => void;
  onCancel: () => void;
  isNew?: boolean;
  defaults?: { fontFamily?: string; fontSize?: number };
  textFormat?: TextFormat;
  pageWidthPt?: number;
  /**
   * Fill painted behind the editable text so the original glyphs (or the
   * overlay's own rendering) never show through while typing. Defaults to
   * white; re-edits pass the overlay's cover colour so a tinted patch matches.
   */
  maskColor?: string;
  onUpdateText?: (text: string) => void;
  onMoveStart?: (e: React.MouseEvent) => void;
  /** The top toolbar's Done button finishes this edit from outside. */
  saveRef?: React.MutableRefObject<(() => void) | null>;
  /** The top toolbar's Cancel button discards this edit from outside. */
  cancelRef?: React.MutableRefObject<(() => void) | null>;
}

/**
 * In-document text editor.
 *
 * Deliberately NO floating card, popup or side panel: the editor sits exactly
 * on the text's own rectangle inside the page (it scrolls and rotates with the
 * document like real content) while formatting lives in the top toolbar.
 * Typing happens in a contenteditable div painted straight onto the sheet, so
 * what you see while typing is what the PDF will contain.
 *
 * Commit triggers: blur (any click on the page), Ctrl/Cmd+Enter, or the
 * toolbar's Done button. Escape discards the change.
 */
export const TextEditInline: React.FC<TextEditInlineProps> = ({
  item,
  pageIndex,
  onSave,
  onCancel,
  isNew = false,
  defaults,
  textFormat,
  pageWidthPt,
  maskColor,
  onUpdateText,
  onMoveStart,
  saveRef,
  cancelRef,
}) => {
  const textRef = useRef<HTMLDivElement | null>(null);
  /** Latched the moment the session finishes so blur + page click + Done can
   *  never commit (or cancel) twice. */
  const settledRef = useRef(false);

  const fontSize = textFormat?.fontSize ?? (
    isNew && defaults?.fontSize ? defaults.fontSize : Math.round(item.fontSize || 16)
  );

  const fontFamily = textFormat?.fontFamily ?? (
    isNew && defaults?.fontFamily && isValidFontId(defaults.fontFamily)
      ? defaults.fontFamily
      : detectFontId(item.originalFontName || item.fontFamily)
  );

  const textColor = textFormat?.color ?? item.editColor ?? item.color ?? '#000000';
  const isBold = textFormat?.bold ?? item.editIsBold ?? false;
  const isItalic = textFormat?.italic ?? item.editIsItalic ?? false;
  const isUnderline = textFormat?.underline ?? item.editIsUnderline ?? false;
  const align = textFormat?.align ?? item.editAlign ?? 'left';
  const opacity = textFormat?.opacity != null
    ? textFormat.opacity
    : Math.round(Math.min(100, Math.max(10, (item.editOpacity ?? 1) * 100)));

  // Screen pixels per PDF point for THIS box (same formula as the save path),
  // so the on-screen caret size matches the exported glyph size 1:1.
  const pxPerPt = item.width > 0 && item.pdfWidth > 0 ? item.width / item.pdfWidth : 1;
  const sizePt = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 12;
  const fontSizePx = Math.max(4, sizePt * pxPerPt);

  /** Contenteditable text (kept uncontrolled so React never moves the caret). */
  const readText = () => (textRef.current?.innerText ?? '').replace(/\u00a0/g, ' ');

  const handleSave = () => {
    if (settledRef.current) return;
    const text = readText();
    if (isNew && !text.trim()) {
      settledRef.current = true;
      onCancel();
      return;
    }

    const size = Math.min(400, sizePt);
    const fontSizePxSave = Math.max(4, size * pxPerPt);
    /** Screen px → PDF points. */
    const scale = pxPerPt > 0 ? 1 / pxPerPt : 1;
    const availPt = Math.max(40, (pageWidthPt ?? item.pdfX + item.pdfWidth) - item.pdfX - 6);
    const availPx = availPt * pxPerPt;
    let maxLinePx = 0;
    let lineCount = 1;
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `${isBold ? '700 ' : ''}${isItalic ? 'italic ' : ''}${fontSizePxSave}px ${cssFontFamily(fontFamily)}`;
      const lines = wrapLines((t) => ctx.measureText(t).width, text, availPx);
      lineCount = lines.length;
      for (const ln of lines) maxLinePx = Math.max(maxLinePx, ctx.measureText(ln).width);
    } else {
      const paras = text.split('\n');
      lineCount = Math.max(1, paras.length);
      let longest = 0;
      for (const p of paras) longest = Math.max(longest, p.length * fontSizePxSave * 0.55);
      maxLinePx = longest;
    }

    // 0.6em of slack: canvas metrics can run a hair narrower than the
    // browser's final line layout (kerning / trailing spaces), and a couple of
    // clipped pixels are visible — the margin keeps text inside the box.
    const slackPx = fontSizePxSave * 0.6;
    const finalW = Math.min(availPx, Math.max(24, maxLinePx + slackPx));
    const lineH = fontSizePxSave * 1.2;
    const boxH = Math.max(lineH, lineCount * lineH) + 2;

    // Re-editing an existing overlay keeps the cover patch it already has;
    // only a first-time edit of detected original text creates one, and new
    // text never masks anything.
    const isReedit = item.id.startsWith('reedit-');

    settledRef.current = true;
    onSave({
      id: 'overlay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      pageIndex,
      text,
      fontSize: size,
      fontFamily,
      color: textColor,
      isBold,
      isItalic,
      isUnderline,
      align,
      opacity: opacity / 100,
      pdfX: item.pdfX,
      pdfY: item.pdfY + item.pdfHeight - boxH * scale,
      pdfWidth: finalW * scale,
      pdfHeight: boxH * scale,
      coverOriginal: !isNew && !isReedit,
      ...(isNew || isReedit
        ? {}
        : {
            coverRect: {
              pdfX: item.pdfX - 1,
              pdfY: item.pdfY - 2,
              pdfWidth: Math.max(item.pdfWidth + 4, 20),
              pdfHeight: Math.max(item.pdfHeight + 4, 12),
              color: maskColor || '#ffffff',
            },
          }),
    });
  };

  const handleCancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  // Seed the editable region once (uncontrolled afterwards) and put the caret
  // at the end so typing continues the text naturally.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const initial = item.str || '';
    el.textContent = initial;
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(!initial);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // Selection helpers are best-effort; typing works without them.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose commit/cancel to the top toolbar for the editor's lifetime, and
  // clear them on unmount so a stale editor can never be driven.
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    if (cancelRef) cancelRef.current = handleCancel;
    return () => {
      if (saveRef) saveRef.current = null;
      if (cancelRef) cancelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Focus moving into the toolbar's formatting controls keeps the editor
    // open (changes restyle it live); a click anywhere else commits.
    const next = e.relatedTarget as HTMLElement | null;
    if (next && typeof next.closest === 'function' && next.closest('[data-textformat]')) return;
    handleSave();
  };

  return (
    <div
      className="absolute z-30 group/edit cursor-text"
      style={{
        left: Math.max(0, item.x - 2),
        top: Math.max(0, item.y - 2),
        width: Math.max(48, item.width + 4),
        minHeight: item.height + 4,
        padding: 2,
        background: maskColor || '#ffffff',
        boxShadow: '0 0 0 1px rgba(5, 150, 105, 0.6)',
      }}
      // Clicks inside the text must not reach the page/overlay handlers
      // underneath (they would deselect or commit the edit mid-typing).
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {onMoveStart && (
        <button
          type="button"
          onMouseDown={onMoveStart}
          title="Drag to move this text"
          className="absolute -top-3 -right-3 z-30 p-1 bg-white border border-emerald-400 text-emerald-600 rounded shadow-sm opacity-0 group-hover/edit:opacity-100 cursor-move hover:bg-emerald-50"
        >
          <Move className="w-3 h-3" />
        </button>
      )}

      <div
        ref={textRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={() => onUpdateText?.(readText())}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
          }
        }}
        className="outline-none before:text-neutral-400 before:text-[13px] empty:before:content-[Type_your_text...]"
        style={{
          fontFamily: cssFontFamily(fontFamily),
          fontSize: `${fontSizePx}px`,
          fontWeight: isBold ? 700 : 400,
          fontStyle: isItalic ? 'italic' : 'normal',
          textDecoration: isUnderline ? 'underline' : 'none',
          textAlign: align,
          color: textColor,
          opacity: opacity / 100,
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          minHeight: `${Math.max(16, item.height)}px`,
        }}
      />
    </div>
  );
};
