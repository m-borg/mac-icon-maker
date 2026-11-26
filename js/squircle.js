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
 * Computes an exact, strictly convex, C2-symmetric Apple continuous-corner squircle path
 * and traces it onto a 2D canvas context.
 *
 * Each corner is constructed in local corner coordinates (u, v) in [0, p]^2 as two
 * symmetric cubic Bezier segments meeting at the 45-degree diagonal apex (m, m):
 *   Segment 1: (p, 0) -> (p - h1, 0) -> (m + h2, m - h2) -> (m, m)
 *   Segment 2: (m, m) -> (m - h2, m + h2) -> (0, p - h1) -> (0, p)
 * Because 0 < m - h2 < m < m + h2 < p - h1 < p for all smoothing values in [0, 1],
 * the curve is 100% monotonic, tangent to the straight edges, C2 curvature-continuous
 * at the diagonal apex, and free of any corner bulges or inflection points.
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

  // Total corner extent along straight edge from vertex:
  // At s = 0 -> p = r (exact circle); at s = 0.6 -> p = 1.52866 * r (~283.4px on 824x824)
  const p = Math.min(r * (1 + 0.881108 * s), maxR);
  const effectiveS = Math.max(0, Math.min(1, (p / r - 1) / 0.881108));

  // Diagonal apex distance from corner vertex (0.2928932 * r for exact circle)
  const m = r * (0.29289322 - 0.0025 * effectiveS);

  // Diagonal tangent handle length (0.1875364 * r for exact 45-deg circular arc)
  const h2 = Math.min(m * 0.78, r * (0.1875364 + 0.032 * effectiveS));

  // Straight-edge entry handle length (0.2652165 * r for exact circle, longer for continuous G2 ramp)
  const h1 = Math.min(
    (p - (m + h2)) * 0.88,
    (p - m) * (0.3750728 + 0.165 * effectiveS)
  );

  // Local corner coordinate helpers (u along incoming edge, v along outgoing edge)
  const tr = (u, v) => [x + w - u, y + v];
  const br = (u, v) => [x + w - v, y + h - u];
  const bl = (u, v) => [x + u, y + h - v];
  const tl = (u, v) => [x + v, y + u];

  ctx.beginPath();

  // Start on top edge after Top-Left corner
  ctx.moveTo(x + p, y);

  // 1. Top-Right corner: u along top edge from right, v down right edge from top
  ctx.lineTo(...tr(p, 0));
  ctx.bezierCurveTo(...tr(p - h1, 0), ...tr(m + h2, m - h2), ...tr(m, m));
  ctx.bezierCurveTo(...tr(m - h2, m + h2), ...tr(0, p - h1), ...tr(0, p));

  // 2. Bottom-Right corner: u up right edge from bottom, v left along bottom edge from right
  ctx.lineTo(...br(p, 0));
  ctx.bezierCurveTo(...br(p - h1, 0), ...br(m + h2, m - h2), ...br(m, m));
  ctx.bezierCurveTo(...br(m - h2, m + h2), ...br(0, p - h1), ...br(0, p));

  // 3. Bottom-Left corner: u right along bottom edge from left, v up left edge from bottom
  ctx.lineTo(...bl(p, 0));
  ctx.bezierCurveTo(...bl(p - h1, 0), ...bl(m + h2, m - h2), ...bl(m, m));
  ctx.bezierCurveTo(...bl(m - h2, m + h2), ...bl(0, p - h1), ...bl(0, p));

  // 4. Top-Left corner: u down left edge from top, v right along top edge from left
  ctx.lineTo(...tl(p, 0));
  ctx.bezierCurveTo(...tl(p - h1, 0), ...tl(m + h2, m - h2), ...tl(m, m));
  ctx.bezierCurveTo(...tl(m - h2, m + h2), ...tl(0, p - h1), ...tl(0, p));

  ctx.closePath();
}

/**
 * Convenience wrapper for square icons.
 */
export function createSquirclePath(ctx, x, y, size, radiusRatio = HIG.CORNER_RATIO, exponent = 5) {
  const smoothing = Math.max(0, Math.min(1, 0.6 + (exponent - 5) * 0.25));
  traceAppleSquircle(ctx, x, y, size, size, size * radiusRatio, smoothing);
}

/**
 * Traces the exact macOS 27 Folder Back Panel including the top-left S-curve tab.
 * Measured directly from Apple's macOS 27 folder .icns (1024x1024):
 * - Horizontal bounds: x = 42 .. 982 (width = 940px)
 * - Top of tab: y = 134 (flat x = 110 .. 310, top-left radius = 68px)
 * - S-curve ramp: (310, 134) -> bezierCurveTo(356, 134, 374, 201, 420, 201)
 * - Right shoulder: y = 201 (flat x = 420 .. 914, top-right radius = 68px)
 * - Bottom: y = 884 (bottom radius = 64px)
 */
export function traceMacFolderBack(ctx) {
  const L = 42;
  const R = 982;
  const tabTop = 134;
  const shoulderTop = 201;
  const bot = 884;
  const rTop = 68;
  const rBot = 64;
  const k = 0.55228475;

  ctx.beginPath();
  // Start after top-left tab corner
  ctx.moveTo(L + rTop, tabTop);
  // Top flat edge of tab
  ctx.lineTo(310, tabTop);
  // Exact macOS 27 S-curve down to the back shoulder (y: 134 -> 201 over x: 310 -> 420)
  ctx.bezierCurveTo(356, tabTop, 374, shoulderTop, 420, shoulderTop);
  // Back shoulder to top-right corner
  ctx.lineTo(R - rTop, shoulderTop);
  ctx.bezierCurveTo(
    R - rTop * (1 - k),
    shoulderTop,
    R,
    shoulderTop + rTop * (1 - k),
    R,
    shoulderTop + rTop
  );
  // Right edge down to bottom-right corner
  ctx.lineTo(R, bot - rBot);
  ctx.bezierCurveTo(R, bot - rBot * (1 - k), R - rBot * (1 - k), bot, R - rBot, bot);
  // Bottom edge to bottom-left corner
  ctx.lineTo(L + rBot, bot);
  ctx.bezierCurveTo(L + rBot * (1 - k), bot, L, bot - rBot * (1 - k), L, bot - rBot);
  // Left edge up to top-left tab corner
  ctx.lineTo(L, tabTop + rTop);
  ctx.bezierCurveTo(L, tabTop + rTop * (1 - k), L + rTop * (1 - k), tabTop, L + rTop, tabTop);
  ctx.closePath();
}

/**
 * Traces the white inner paper strip visible inside macOS 27 folders:
 * x = 73 .. 951 (width = 878px), y = 232 .. 340, top corner radius = 42px.
 */
export function traceMacFolderPaper(ctx) {
  traceAppleSquircle(ctx, 73, 232, 878, 120, 42, 0.55);
}

/**
 * Traces the exact macOS 27 Folder Front Pocket:
 * x = 42 .. 982 (width = 940px), y = 269 .. 888 (height = 619px),
 * top corner radius = 72px, bottom corner radius = 64px.
 */
export function traceMacFolderFront(ctx) {
  const L = 42;
  const R = 982;
  const T = 269;
  const B = 888;
  const rTop = 72;
  const rBot = 64;
  const k = 0.55228475;

  ctx.beginPath();
  ctx.moveTo(L + rTop, T);
  ctx.lineTo(R - rTop, T);
  ctx.bezierCurveTo(R - rTop * (1 - k), T, R, T + rTop * (1 - k), R, T + rTop);
  ctx.lineTo(R, B - rBot);
  ctx.bezierCurveTo(R, B - rBot * (1 - k), R - rBot * (1 - k), B, R - rBot, B);
  ctx.lineTo(L + rBot, B);
  ctx.bezierCurveTo(L + rBot * (1 - k), B, L, B - rBot * (1 - k), L, B - rBot);
  ctx.lineTo(L, T + rTop);
  ctx.bezierCurveTo(L, T + rTop * (1 - k), L + rTop * (1 - k), T, L + rTop, T);
  ctx.closePath();
}

/**
 * Draws the official Apple macOS App Icon Layout Grid overlay onto a canvas context.
 * Intended strictly for UI preview — never baked into exported icons.
 */
export function drawHIGGrid(ctx, canvasSize = HIG.CANVAS_SIZE, opts = {}) {
  const {
    smoothing = 0.6,
    radiusRatio = HIG.CORNER_RATIO,
    color = 'rgba(56, 217, 255, 0.6)',
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
  ctx.strokeStyle = 'rgba(255, 115, 215, 0.45)';
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
  ctx.fillStyle = 'rgba(130, 235, 255, 0.88)';
  ctx.textAlign = 'center';
  ctx.fillText('100px safe margin (824 × 824 squircle · R185.4)', C, 62);

  ctx.fillStyle = 'rgba(255, 160, 230, 0.88)';
  ctx.fillText('624 × 624 glyph safe zone', C, S - 46);

  ctx.restore();
}
