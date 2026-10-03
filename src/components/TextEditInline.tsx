import React, { useState } from 'react';
import type { DetectedTextItem, EditedTextOverlay } from '../types/pdf';
import { cssFontFamily, detectFontId, FONT_GROUPS, isValidFontId } from '../services/fontCatalog';
import { Check, X, Sparkles } from 'lucide-react';

interface TextEditInlineProps {
  item: DetectedTextItem;
  pageIndex: number;
  onSave: (overlay: EditedTextOverlay) => void;
  onCancel: () => void;
  /** True when creating brand-new text (no cover patch, starts empty). */
  isNew?: boolean;
  /** Last-used formatting, applied as defaults when creating new text. */
  defaults?: { fontFamily?: string; fontSize?: number };
}

export const TextEditInline: React.FC<TextEditInlineProps> = ({
  item,
  pageIndex,
  onSave,
  onCancel,
  isNew,
  defaults,
}) => {
  const [text, setText] = useState(item.str);
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
  const [textColor, setTextColor] = useState(item.color ?? '#000000');
  const [isBold, setIsBold] = useState(false);

  const handleSave = () => {
    if (isNew && !text.trim()) {
      onCancel();
      return;
    }
    const overlay: EditedTextOverlay = {
      id: 'overlay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      pageIndex,
      pdfX: item.pdfX,
      pdfY: item.pdfY,
      pdfWidth: item.pdfWidth,
      pdfHeight: item.pdfHeight,
      text: text,
      fontSize: fontSize,
      fontFamily: fontFamily,
      color: textColor,
      isBold: isBold,
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
        left: Math.max(0, item.x - 4),
        top: Math.max(0, item.y - 48),
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-neutral-100 text-[11px] text-neutral-500">
        <div className="flex items-center gap-1 font-medium text-emerald-700">
          <Sparkles className="w-3 h-3" />
          <span>{isNew ? 'New text' : `Detected: ${item.originalFontName || 'Helvetica'} (${Math.round(item.fontSize)}pt)`}</span>
        </div>
        <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 mb-2 bg-neutral-50 p-1 rounded-md">
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

      <input
        type="text"
        value={text}
        autoFocus
        placeholder={isNew ? 'Type your text…' : ''}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:border-emerald-500 focus:outline-none text-neutral-800"
        style={{
          fontFamily: cssFontFamily(fontFamily),
          fontWeight: isBold ? 700 : 400,
          color: textColor,
        }}
      />

      <div className="flex items-center justify-end gap-1.5 mt-2">
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