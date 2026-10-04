export type ToolType = 
  | 'select' 
  | 'edit-text' 
  | 'add-text' 
  | 'crop' 
  | 'highlight' 
  | 'draw' 
  | 'sign' 
  | 'redact' 
  | 'erase'
  | 'annotate'
  | 'image'
  | 'ellipse';

export interface DetectedTextItem {
  id: string;
  str: string;
  x: number; // canvas coordinates (pixels)
  y: number; // canvas coordinates (pixels)
  width: number;
  height: number;
  fontFamily: string;
  originalFontName: string;
  fontSize: number; // in pixels
  pdfX: number; // PDF point coordinates
  pdfY: number; // PDF point coordinates
  pdfWidth: number;
  pdfHeight: number;
  color?: string;
  isEdited?: boolean;
  newText?: string;
  isDeleted?: boolean;
  /** Set when re-editing a saved overlay: its formatting seeds the editor. */
  editOverlayId?: string;
  editIsBold?: boolean;
  editColor?: string;
}

export interface EditedTextOverlay {
  id: string;
  pageIndex: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  text: string;
  fontSize: number;
  fontFamily: string; // fontCatalog id; legacy ids 'Helvetica'|'TimesRoman'|'Courier' remain valid
  color: string;
  isBold?: boolean;
  isItalic?: boolean;
  coverOriginal?: boolean; // whether to draw a background patch to mask original
  coverRect?: {
    pdfX: number;
    pdfY: number;
    pdfWidth: number;
    pdfHeight: number;
    color?: string;
  };
}

export interface FreehandDrawing {
  id: string;
  pageIndex: number;
  points: { x: number; y: number }[]; // canvas coords normalized or relative
  color: string;
  width: number;
  opacity: number;
}

export interface HighlightArea {
  id: string;
  pageIndex: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  color: string;
}

export interface CropRect {
  x: number; // percentage (0 to 100) or PDF pt
  y: number;
  width: number;
  height: number;
}

export interface PageCropSetting {
  pageIndex: number;
  x: number; // from left
  y: number; // from bottom
  width: number;
  height: number;
}

export interface SignatureItem {
  id: string;
  pageIndex: number;
  dataUrl: string;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
}

/** An image region copied from the page (select → copy → paste) and stamped back in. */
export interface ImageOverlay {
  id: string;
  pageIndex: number;
  dataUrl: string;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
}

export type ShapeKind = 'ellipse' | 'rectangle' | 'arrow';
export type StampKind = 'check' | 'cross' | 'star';

/** Vector shape annotation drawn by drag (ellipse / rectangle / arrow). */
export interface ShapeOverlay {
  id: string;
  pageIndex: number;
  kind: ShapeKind;
  /** Bounding box in PDF points (origin bottom-left). */
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  /** Endpoints in PDF points: [drag start, drag end] — defines arrow direction. */
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  /** Fill color for closed shapes (ellipse / rectangle). Omitted = transparent. */
  fillColor?: string;
  /** Fill opacity 0–1 (defaults to 0.35 when fillColor is set). */
  fillOpacity?: number;
}

/** Click-placed stamp annotation (check / cross / star). */
export interface StampOverlay {
  id: string;
  pageIndex: number;
  kind: StampKind;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  color: string;
}

/** Which color the toolbar palette currently controls. */
export type ToolColorKey = 'text' | 'pencil' | 'highlight' | 'shape';
/** Per-tool color choices picked from the toolbar palette. */
export type ToolColors = Record<ToolColorKey, string>;


