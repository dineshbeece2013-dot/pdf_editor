import React, { useEffect, useRef, useState } from 'react';
import { Crop, Check, X, RotateCcw } from 'lucide-react';
import { screenToPageDelta, screenToPagePoint } from '../utils/pageCoords';

interface CropOverlayProps {
  pageWidth: number;
  pageHeight: number;
  /** Extra page rotation in degrees (0/90/180/270, clockwise). */
  rotation: number;
  hasCrop: boolean;
  /** Selection rect in view pixels, origin top-left of the visible page. */
  onApplyRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  onReset: () => void;
  onCancel: () => void;
}

type DragMode = 'draw' | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const MIN_SIZE = 24; // px, minimum selection size while resizing
const DRAW_THRESHOLD = 8; // px, smaller drags are treated as plain clicks

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// Paint-style selection handles: 4 corners + 4 edge grips, all kept inside
// the selection rectangle so the page's overflow clipping never cuts them.
const HANDLES: { mode: DragMode; cls: string; size: string }[] = [
  { mode: 'nw', cls: 'left-0 top-0 cursor-nwse-resize', size: 'w-2.5 h-2.5' },
  { mode: 'n', cls: 'left-1/2 top-0 -tranneutral-x-1/2 cursor-ns-resize', size: 'w-7 h-2' },
  { mode: 'ne', cls: 'right-0 top-0 cursor-nesw-resize', size: 'w-2.5 h-2.5' },
  { mode: 'e', cls: 'right-0 top-1/2 -tranneutral-y-1/2 cursor-ew-resize', size: 'w-2 h-7' },
  { mode: 'se', cls: 'right-0 bottom-0 cursor-nwse-resize', size: 'w-2.5 h-2.5' },
  { mode: 's', cls: 'left-1/2 bottom-0 -tranneutral-x-1/2 cursor-ns-resize', size: 'w-7 h-2' },
  { mode: 'sw', cls: 'left-0 bottom-0 cursor-nesw-resize', size: 'w-2.5 h-2.5' },
  { mode: 'w', cls: 'left-0 top-1/2 -tranneutral-y-1/2 cursor-ew-resize', size: 'w-2 h-7' },
];

export const CropOverlay: React.FC<CropOverlayProps> = ({
  pageWidth,
  pageHeight,
  rotation,
  hasCrop,
  onApplyRect,
  onReset,
  onCancel,
}) => {

  const [box, setBox] = useState({ x: 0, y: 0, w: pageWidth, h: pageHeight });
  const dragRef = useRef<{
    mode: DragMode;
    sx: number;
    sy: number;
    ax: number;
    ay: number;
    start: typeof box;
  } | null>(null);

  // The selection always covers the whole visible page whenever that page
  // changes (initial mount, after applying/clearing a crop, zoom, page turn).
  useEffect(() => {
    setBox({ x: 0, y: 0, w: pageWidth, h: pageHeight });
  }, [pageWidth, pageHeight]);

  const startDrag = (e: React.MouseEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    // This overlay lives INSIDE the rotated page, so the drag anchor must be
    // inverse-rotated (rebased around the page centre) — motion deltas are
    // turned back into page space in onMove below. Only 'draw' uses the anchor.
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = screenToPagePoint(e.clientX, e.clientY, rect, pageWidth, pageHeight, rotation);
    dragRef.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      ax: anchor.x,
      ay: anchor.y,
      start: { ...box },
    };

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = screenToPageDelta(ev.clientX - d.sx, ev.clientY - d.sy, rotation);
      const dx = delta.x;
      const dy = delta.y;

      if (d.mode === 'draw') {
        // Marquee drag from the anchor point, like Paint's selection tool.
        const curX = clamp(d.ax + dx, 0, pageWidth);
        const curY = clamp(d.ay + dy, 0, pageHeight);
        setBox({
          x: Math.min(d.ax, curX),
          y: Math.min(d.ay, curY),
          w: Math.abs(curX - d.ax),
          h: Math.abs(curY - d.ay),
        });
        return;
      }

      let { x, y, w, h } = d.start;

      if (d.mode === 'move') {
        x = clamp(x + dx, 0, pageWidth - w);
        y = clamp(y + dy, 0, pageHeight - h);
      } else {
        if (d.mode.includes('w')) {
          const nx = clamp(x + dx, 0, x + w - MIN_SIZE);
          w += x - nx;
          x = nx;
        }
        if (d.mode.includes('e')) {
          w = clamp(w + dx, MIN_SIZE, pageWidth - x);
        }
        if (d.mode.includes('n')) {
          const ny = clamp(y + dy, 0, y + h - MIN_SIZE);
          h += y - ny;
          y = ny;
        }
        if (d.mode.includes('s')) {
          h = clamp(h + dy, MIN_SIZE, pageHeight - y);
        }
      }
      setBox({ x, y, w, h });
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // A tiny drag (e.g. a plain click on the dimmed backdrop) is not a new
      // selection — restore the previous one, like Paint keeps its marquee.
      if (d && d.mode === 'draw') {
        setBox((cur) => (cur.w < DRAW_THRESHOLD || cur.h < DRAW_THRESHOLD ? d.start : cur));
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const apply = () => {
    if (box.w < MIN_SIZE || box.h < MIN_SIZE) return;
    onApplyRect({ x: box.x, y: box.y, width: box.w, height: box.h });
    onCancel(); // Paint-style: leave crop mode once the crop is confirmed
  };

  const clearSelection = () => {
    setBox({ x: 0, y: 0, w: pageWidth, h: pageHeight });
    onReset();
  };

  // Enter = confirm crop, Esc = cancel — same shortcuts as Paint.
  // Rebound every render so the handlers always see fresh state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div
      className="absolute inset-0 z-20 cursor-crosshair"
      onMouseDown={(e) => startDrag(e, 'draw')}
    >
      {/* Live hint, like Paint's status-bar guidance */}
      <div
        className="absolute top-2 left-1/2 -tranneutral-x-1/2 z-30 bg-neutral-900/80 text-white text-[10px] px-3 py-1 rounded-full pointer-events-none select-none whitespace-nowrap"
        style={rotation ? { transform: `translateX(-50%) rotate(${-rotation}deg)` } : undefined}
      >
        Drag to select · drag handles to resize · Enter to crop · Esc to cancel
      </div>

      {/* Selection marquee: everything outside is dimmed by the box shadow */}
      <div
        className="absolute border-2 border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        onMouseDown={(e) => startDrag(e, 'move')}
      >
        {/* Paint-style live W × H readout */}
        <div
          className="absolute top-1 left-1 z-10 bg-neutral-900/90 text-white text-[10px] font-medium px-2 py-0.5 rounded shadow flex items-center gap-1.5 select-none whitespace-nowrap pointer-events-none"
          style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
        >
          <Crop className="w-3 h-3 text-emerald-300" />
          <span>
            {Math.round(box.w)} × {Math.round(box.h)} px
          </span>
        </div>

        {HANDLES.map((h) => (
          <div
            key={h.mode}
            onMouseDown={(e) => startDrag(e, h.mode)}
            className={`absolute bg-white border-2 border-emerald-500 rounded-[2px] hover:border-emerald-700 ${h.cls} ${h.size}`}
          />
        ))}
      </div>

      {/* Floating Paint-style confirm bar: ✓ Crop / ✗ Cancel / ↺ Clear */}
      <div
        className="absolute bottom-4 left-1/2 -tranneutral-x-1/2 z-30 bg-white/95 backdrop-blur-md px-2 py-1.5 rounded-xl shadow-lg border border-neutral-200 flex items-center gap-1.5 cursor-pointer"
        onMouseDown={(e) => e.stopPropagation()}
        style={rotation ? { transform: `translateX(-50%) rotate(${-rotation}deg)` } : undefined}
      >
        <button
          onClick={apply}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          Crop
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        {hasCrop && (
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
};