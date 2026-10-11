import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * Lightweight, dependency-free guided tour for first-time visitors.
 *
 * Each step points at an element carrying a matching `data-tour="<id>"`
 * attribute. The tour dims the rest of the page and shows a floating card near
 * the highlighted control. Steps without a `target` render the card centred
 * (used for the welcome / finish screens).
 *
 * It remembers completion in localStorage so it only auto-shows once. A
 * "Restart tour" entry point re-opens it on demand.
 */

interface TourStep {
  id: string;
  /** `data-tour` value to spotlight. Omit for a centred step. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PDF Editor 👋',
    body:
      'This quick tour shows you how to edit PDFs right in your browser. Nothing is uploaded — everything happens on your device. Skip anytime, and restart it later from the account menu.',
  },
  {
    id: 'upload',
    target: 'upload',
    title: 'Open a PDF',
    body:
      'Click Upload to open a PDF from your device. You can also load the built-in Sample Invoice to explore the tools with a ready-made document.',
  },
  {
    id: 'tools',
    target: 'tools',
    title: 'Your editing tools',
    body:
      'Everything lives in this toolbar: crop, add & edit text, highlight, pencil, signatures, eraser, annotation stamps, images and shapes. Swipe or scroll the strip if it overflows on a small screen.',
  },
  {
    id: 'add-text',
    target: 'add-text',
    title: 'Add or edit text',
    body:
      'Use Add Text to type new text anywhere, or Edit Text to click existing text and change it directly on the page. The formatting bar lets you change font, size, colour and alignment as you type.',
  },
  {
    id: 'canvas',
    target: 'canvas',
    title: 'Work on the document',
    body:
      'This is your canvas. Click anywhere to place text or stamps, drag to draw, highlight or crop. Undo / redo any change with Ctrl+Z and Ctrl+Shift+Z.',
  },
  {
    id: 'footer',
    target: 'footer',
    title: 'Pages & zoom',
    body:
      'Move between pages on the left and zoom in or out on the right. You can also zoom with Ctrl + mouse wheel and press Ctrl + 0 to reset.',
  },
  {
    id: 'export',
    target: 'export',
    title: 'Save your work',
    body:
      "When you're done, click Export to download the edited PDF with all your changes baked in. That's it — happy editing!",
  },
  {
    id: 'finish',
    title: "You're all set 🎉",
    body:
      'You know the basics now. Start by opening a PDF or loading the Sample Invoice, and try adding some text. Replay this tour anytime from the account menu.',
  },
];

const STORAGE_KEY = 'pdfpro.tour.completed';
const PAD = 8;

type Rect = { top: number; left: number; width: number; height: number };

function useTourTarget(target?: string): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [target]);

  useEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    const raf = requestAnimationFrame(measure);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      cancelAnimationFrame(raf);
    };
  }, [measure]);

  return rect;
}

export interface UserTourProps {
  /** When true the tour is visible (controlled by the caller). */
  open: boolean;
  /** Start from a specific step index (0 by default). */
  startIndex?: number;
  /** Called once the user finishes or dismisses, so the caller can persist it. */
  onComplete: () => void;
}

export const UserTour: React.FC<UserTourProps> = ({ open, startIndex = 0, onComplete }) => {
  const [index, setIndex] = useState(startIndex);
  const step = STEPS[index];
  const targetRect = useTourTarget(open ? step?.target : undefined);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  const goTo = useCallback(
    (next: number) => {
      if (next >= STEPS.length) {
        onComplete();
        return;
      }
      setIndex(next);
    },
    [onComplete],
  );

  const finish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Keyboard navigation: arrows / enter to advance, Esc to dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, goTo, finish]);

  if (!open || !step) return null;

  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  // Centre the card on the target when there is one, otherwise dead centre of
  // the viewport. Always clamp so it never runs off-screen.
  const placeCard = () => {
    if (!targetRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as React.CSSProperties;
    }
    const cardW = cardRef.current?.offsetWidth ?? 340;
    const cardH = cardRef.current?.offsetHeight ?? 180;
    let left = targetRect.left + targetRect.width / 2 - cardW / 2;
    left = Math.max(12, Math.min(window.innerWidth - cardW - 12, left));
    let top = targetRect.top + targetRect.height + PAD + 8;
    if (top + cardH > window.innerHeight - 12) {
      top = targetRect.top - cardH - PAD - 8;
    }
    if (top < 12) top = Math.max(12, (window.innerHeight - cardH) / 2);
    return { top: `${top}px`, left: `${left}px` } as React.CSSProperties;
  };

  const spotlightStyle: React.CSSProperties | undefined = targetRect
    ? {
        top: targetRect.top - PAD,
        left: targetRect.left - PAD,
        width: targetRect.width + PAD * 2,
        height: targetRect.height + PAD * 2,
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Dim the whole page, then punch a clear hole over the target. */}
      <div className="absolute inset-0">
        {!targetRect && <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-[2px]" />}
        {spotlightStyle && (
          <>
            <div
              className="absolute inset-0"
              style={{ boxShadow: '0 0 0 9999px rgba(15,23,42,0.6)' }}
            />
            <div
              className="absolute rounded-xl ring-2 ring-emerald-400 transition-all duration-200 pointer-events-none"
              style={spotlightStyle}
            />
          </>
        )}
      </div>

      {/* Step card */}
      <div
        ref={cardRef}
        className="absolute z-[201] w-[min(22rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-2xl border border-neutral-200 p-5"
        style={placeCard()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-neutral-900">{step.title}</h3>
          <button
            onClick={finish}
            aria-label="Close tour"
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1" aria-label="Progress">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-emerald-500' : 'w-1.5 bg-neutral-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={finish}
              className="px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-700 rounded-lg hover:bg-neutral-100"
            >
              Skip
            </button>
            {!isFirst && (
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => goTo(index + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Read whether the tour has already been completed for this browser. */
export function hasCompletedTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

/** Persist tour completion so it doesn't auto-show again. */
export function markTourCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export default UserTour;
