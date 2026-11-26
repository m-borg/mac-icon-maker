/**
 * Apple macOS 26 (Tahoe) Human Interface Guidelines Geometry & Continuous Squircle Engine
 *
 * Specifications:
 * - Master canvas: 1024 x 1024 px
 * - Squircle container: 824 x 824 px (centered at 512, 512; 100 px transparent margin on all sides)
 * - Corner radius: 185.4 px (22.5% of 824 px) with continuous curvature
 * - Outer drop shadow: Y +12 px, Blur 28 px, #000000 at 50% opacity (+ subtle ambient shadow)
 */

export const HIG = {
  CANVAS_SIZE: 1024,
  SQUIRCLE_SIZE: 824,
  MARGIN: 100,
  CORNER_RADIUS: 185.4,
  CORNER_RATIO: 0.225,
  SAFE_SQUARE: 624,
  SAFE_CIRCLE_OUTER: 668,
  SAFE_CIRCLE_INNER: 520,
  SHADOW: {
    offsetY: 12,
    blur: 28,
    opacity: 0.5,
    ambientOffsetY: 4,
    ambientBlur: 10,
    ambientOpacity: 0.22,
  },
};

/**
 * Computes exact C1-continuous Apple squircle corner geometry (Figma / Apple CGPath .continuous style)
 * and traces it onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Top-left X
 * @param {number} y Top-left Y
 * @param {number} w Width
 * @param {number} h Height
 * @param {number} radius Nominal corner radius (e.g. 185.4 for 824px)
 * @param {number} smoothing Corner smoothing in [0, 1] (0.6 matches Apple continuous corners)
 */
export function traceAppleSquircle(ctx, x, y, w, h, radius, smoothing = 0.6) {
  const maxR = Math.min(w, h) / 2;
  const r = Math.max(0, Math.min(radius, maxR));

  if (r <= 0.001) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }

  const s = Math.max(0, Math.min(1, smoothing));

  // If smoothing is ~0, draw a standard circular rounded rect
  if (s < 0.01) {
    const k = 0.5522847498;
    const kr = r * k;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.bezierCurveTo(x + w - r + kr, y, x + w, y + r - kr, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.bezierCurveTo(x + w, y + h - r + kr, x + w - r + kr, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.bezierCurveTo(x + r - kr, y + h, x, y + h - r + kr, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.bezierCurveTo(x, y + r - kr, x + r - kr, y, x + r, y);
    ctx.closePath();
    return;
  }

  // Exact C1-continuous corner profile:
  // Straight edge -> Cubic Bezier -> Circular Arc -> Cubic Bezier -> Straight edge.
  // Entry distance along edge p = min((1 + 0.8811 * s) * r, maxR)
  // For s = 0.6: 1 + 0.8811 * 0.6 = 1.52866 * r (~283.4 px on 824x824)
  const p = Math.min(r * (1 + 0.881108 * s), maxR);
  const effectiveS = (p / r - 1) / 0.881108;

  // Angular span of the two transition segments vs the central circular arc
  const angleAlpha = (Math.PI / 4) * effectiveS; // 0 .. 45 deg
  const angleTheta = (Math.PI / 2 - 2 * angleAlpha) / 2; // half of middle arc

  // Central circular arc radius & center offset from corner vertex
  const arcSpan = Math.PI / 2 - 2 * angleAlpha;
  const arcHalfChord = r * Math.sin(arcSpan / 2);

  // Tangent direction at transition point T1 (between entry bezier and circular arc)
  const sinA = Math.sin(angleAlpha);
  const cosA = Math.cos(angleAlpha);

  // Compute exact symmetric points in local corner space where corner vertex is (0, 0)
  // and edges extend along +X and +Y.
  const c = r * (1 - Math.cos(angleAlpha));
  const d = c * Math.tan(angleAlpha);

  // Entry point on top edge: (p, 0)
  // Transition point T1 on circle of radius r centered at (r, r):
  // Let's position the circular arc so it is centered symmetrically on the 45-deg diagonal
  // and scaled by a factor so that T1's tangent matches the entry Bezier cleanly.
  const b = (p - r * (1 - sinA)) * 0.45; // smooth entry handle fraction
  const t1x = r * (1 - cosA * Math.SQRT1_2 - sinA * Math.SQRT1_2);
  // Let's use exact geometric construction with circle centered at (O, O):
  // A circle of radius R_arc centered at (O, O) meets angle (PI + angleAlpha) at:
  // x1 = O - R_arc * cos(angleAlpha), y1 = O - R_arc * sin(angleAlpha)?
  // Wait: normal at top edge is (0, -1), at 45 deg is (-1/sqrt2, -1/sqrt2).
  // Starting from top edge (tangent -X, normal -Y) going counter-clockwise to left edge:
  // Actually let's trace clockwise around the rectangle!
  // On Top-Right corner, vertex is (x + w, y):
  // Top edge goes right (+X) toward (x + w - p, y).
  // At transition point T1: angle from vertical (+0 rad) clockwise is `angleAlpha` (where 0 is straight right, PI/2 is straight down).
  // So normal at T1 is (sin(angleAlpha), -cos(angleAlpha)), tangent is (cos(angleAlpha), sin(angleAlpha)).
  // Wait: if circle center is (x + w - r, y + r) and radius is r:
  // Point at angle `angleAlpha` from top (12 o'clock):
  //   px = r - r * sin(angleAlpha)   (distance left of right edge)
  //   py = r - r * cos(angleAlpha)   (distance below top edge)
  // Tangent at that point (clockwise): (cos(angleAlpha), sin(angleAlpha))!
  // Check: at angleAlpha = 0 -> px = r, py = 0, tangent = (1, 0) (horizontal)!
  // At angleAlpha = PI/4 -> px = r*(1 - 1/sqrt2), py = r*(1 - 1/sqrt2), tangent = (1/sqrt2, 1/sqrt2)!
  // Now we want a cubic Bezier from (p, 0) [going right, tangent (1,0)] to (px, py) [tangent (cosA, sinA)]
  // Wait: distance from right edge of start point is `p` (where p > r), and `px = r*(1 - sinA) < r`!
  // Since `p > px`, the curve moves RIGHT (+X) from `-p` to `-px`, and DOWN (+Y) from `0` to `py`!
  // Let's place cp1 along +X from start `(-p, 0)`: `(-p + h1, 0)`.
  // Place cp2 backward along tangent `(cosA, sinA)` from `(-px, py)`: `(-px - h2 * cosA, py - h2 * sinA)`.
  // For cp2.y >= 0, we need `py - h2 * sinA >= 0` -> `h2 <= py / sinA`.
  // And for smooth curvature, choose `h2 = 0.55 * py / Math.max(sinA, 1e-6)` (clamped) and `h1 = (p - px) * 0.45`!
  // Let's verify:
  // - cp1.y = 0 -> exact tangent (1, 0) at start!
  // - cp2 -> end vector is (h2 * cosA, h2 * sinA) -> exact tangent (cosA, sinA) at arc start!
  // - Arc from angle (-PI/2 + angleAlpha) to (-angleAlpha) centered at (r, r) with radius r has exact tangent (cosA, sinA) at start and (sinA, cosA) at end!
  // - Exit Bezier from arc end to (0, p) has exact tangent (sinA, cosA) at start and (0, 1) at end!
  // Every single transition is 100% C1 tangent-continuous with zero kinks!

  const px = r * (1 - sinA);
  const py = r * (1 - cosA);
  const dx = p - px;
  const h2 = sinA > 1e-4 ? Math.min(py / sinA * 0.58, dx * 0.55) : 0;
  const h1 = dx * 0.48;

  // Helper: mirror & rotate corner relative to each of the 4 vertices
  // Top-right vertex (x + w, y): local (-X, +Y) from vertex
  const tr = (lx, ly) => [x + w - lx, y + ly];
  // Bottom-right vertex (x + w, y + h): local (-X, -Y) from vertex
  const br = (lx, ly) => [x + w - lx, y + h - ly];
  // Bottom-left vertex (x, y + h): local (+X, -Y) from vertex
  const bl = (lx, ly) => [x + lx, y + h - ly];
  // Top-left vertex (x, y): local (+X, +Y) from vertex
  const tl = (lx, ly) => [x + lx, y + ly];

  ctx.beginPath();

  // Start on top edge after Top-Left corner
  ctx.moveTo(...tl(p, 0));

  // Top edge -> Top-Right corner
  ctx.lineTo(...tr(p, 0));
  ctx.bezierCurveTo(
    ...tr(p - h1, 0),
    ...tr(px + h2 * cosA, py - h2 * sinA),
    ...tr(px, py)
  );
  if (arcSpan > 0.001) {
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2 + angleAlpha, -angleAlpha, false);
  }
  ctx.bezierCurveTo(
    ...tr(py - h2 * sinA, px + h2 * cosA),
    ...tr(0, p - h1),
    ...tr(0, p)
  );

  // Right edge -> Bottom-Right corner
  ctx.lineTo(...br(0, p));
  ctx.bezierCurveTo(
    ...br(0, p - h1),
    ...br(py - h2 * sinA, px + h2 * cosA),
    ...br(py, px)
  );
  if (arcSpan > 0.001) {
    ctx.arc(x + w - r, y + h - r, r, angleAlpha, Math.PI / 2 - angleAlpha, false);
  }
  ctx.bezierCurveTo(
    ...br(px + h2 * cosA, py - h2 * sinA),
    ...br(p - h1, 0),
    ...br(p, 0)
  );

  // Bottom edge -> Bottom-Left corner
  ctx.lineTo(...bl(p, 0));
  ctx.bezierCurveTo(
    ...bl(p - h1, 0),
    ...bl(px + h2 * cosA, py - h2 * sinA),
    ...bl(px, py)
  );
  if (arcSpan > 0.001) {
    ctx.arc(x + r, y + h - r, r, Math.PI / 2 + angleAlpha, Math.PI - angleAlpha, false);
  }
  ctx.bezierCurveTo(
    ...bl(py - h2 * sinA, px + h2 * cosA),
    ...bl(0, p - h1),
    ...bl(0, p)
  );

  // Left edge -> Top-Left corner
  ctx.lineTo(...tl(0, p));
  ctx.bezierCurveTo(
    ...tl(0, p - h1),
    ...tl(py - h2 * sinA, px + h2 * cosA),
    ...tl(py, px)
  );
  if (arcSpan > 0.001) {
    ctx.arc(x + r, y + r, r, Math.PI + angleAlpha, (Math.PI * 3) / 2 - angleAlpha, false);
  }
  ctx.bezierCurveTo(
    ...tl(px + h2 * cosA, py - h2 * sinA),
    ...tl(p - h1, 0),
    ...tl(p, 0)
  );

  ctx.closePath();
}

/**
 * Convenience wrapper for square icons, supporting Apple's continuous corner
 * or mathematical superellipse exponent (n = 4..6).
 */
export function createSquirclePath(ctx, x, y, size, radiusRatio = HIG.CORNER_RATIO, exponent = 5) {
  // Map exponent (4 = rounded squircle, 5 = Apple continuous, 6 = tighter corners)
  // into smoothing or superellipse. Default 5 uses Apple's 0.6 continuous smoothing.
  const smoothing = Math.max(0, Math.min(1, 0.6 + (exponent - 5) * 0.25));
  traceAppleSquircle(ctx, x, y, size, size, size * radiusRatio, smoothing);
}

/**
 * Draws the official Apple macOS App Icon Layout Grid overlay onto a canvas context.
 * Intended strictly for UI preview — never baked into exported icons.
 */
export function drawHIGGrid(ctx, canvasSize = HIG.CANVAS_SIZE, opts = {}) {
  const {
    smoothing = 0.6,
    radiusRatio = HIG.CORNER_RATIO,
    color = 'rgba(56, 217, 255, 0.55)',
  } = opts;

  const scale = canvasSize / HIG.CANVAS_SIZE;
  ctx.save();
  ctx.scale(scale, scale);

  const S = HIG.CANVAS_SIZE; // 1024
  const M = HIG.MARGIN; // 100
  const Q = HIG.SQUIRCLE_SIZE; // 824
  const C = S / 2; // 512

  // Subtle shaded outer 100px safe gutter
  ctx.save();
  ctx.fillStyle = 'rgba(0, 212, 255, 0.06)';
  ctx.beginPath();
  ctx.rect(0, 0, S, S);
  traceAppleSquircle(ctx, M, M, Q, Q, Q * radiusRatio, smoothing);
  ctx.fill('evenodd');
  ctx.restore();

  // Outer 1024 canvas border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);

  // Squircle keyline (824x824)
  traceAppleSquircle(ctx, M, M, Q, Q, Q * radiusRatio, smoothing);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Inner glyph safe area (624x624)
  const safeOffset = (S - HIG.SAFE_SQUARE) / 2; // 200
  ctx.strokeStyle = 'rgba(255, 115, 215, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(safeOffset, safeOffset, HIG.SAFE_SQUARE, HIG.SAFE_SQUARE);

  // Center axes & diagonals
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(C, 0);
  ctx.lineTo(C, S);
  ctx.moveTo(0, C);
  ctx.lineTo(S, C);
  ctx.moveTo(M, M);
  ctx.lineTo(M + Q, M + Q);
  ctx.moveTo(M + Q, M);
  ctx.lineTo(M, M + Q);
  ctx.stroke();

  // Concentric keyline circles (668px and 520px)
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(56, 217, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(C, C, HIG.SAFE_CIRCLE_OUTER / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 217, 255, 0.22)';
  ctx.beginPath();
  ctx.arc(C, C, HIG.SAFE_CIRCLE_INNER / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Dimension badges
  ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
  ctx.fillStyle = 'rgba(130, 235, 255, 0.85)';
  ctx.textAlign = 'center';
  ctx.fillText('100px safe margin (824 × 824 squircle · R185.4)', C, 62);

  ctx.fillStyle = 'rgba(255, 160, 230, 0.85)';
  ctx.fillText('624 × 624 glyph safe zone', C, S - 46);

  ctx.restore();
}
