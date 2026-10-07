/**
 * Coordinate helpers for page rotation.
 *
 * The viewer turns the whole sheet (canvas + overlays) with ONE CSS rotation,
 * so everything inside keeps the unrotated page coordinate space and only
 * pointer maths has to undo the turn:
 *   - absolute points: rebase around the element's (rotation-invariant)
 *     bounding-box centre, then inverse-rotate into page-local pixels;
 *   - deltas (window-level drag listeners): just inverse-rotate them.
 *
 * All angles are clockwise degrees, normalised to 0 | 90 | 180 | 270.
 */

/** Normalise any angle to 0 | 90 | 180 | 270 (clockwise, CSS convention). */
export function normalizeRotation(deg: number): number {
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
}

/** Inverse-rotate a screen-space delta into page-local deltas. */
export function screenToPageDelta(dx: number, dy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x: dx, y: dy };
  const r = (-deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/**
 * Client (screen) point -> page-local pixels relative to the element's
 * UNROTATED top-left. `rect` is the element's bounding rect (axis-aligned
 * even when the element itself is turned), `pageW`/`pageH` its unrotated
 * size. Rotation happens around the element's centre, so the AABB centre is
 * the fixed point we rebase around.
 */
export function screenToPagePoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  pageW: number,
  pageH: number,
  deg: number,
): { x: number; y: number } {
  if (!deg) return { x: clientX - rect.left, y: clientY - rect.top };
  const d = screenToPageDelta(
    clientX - (rect.left + rect.width / 2),
    clientY - (rect.top + rect.height / 2),
    deg,
  );
  return { x: d.x + pageW / 2, y: d.y + pageH / 2 };
}
