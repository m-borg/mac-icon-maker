import { HIG, traceAppleSquircle, drawHIGGrid } from './squircle.js?v=3';
import { GRADIENT_PRESETS, VECTOR_GLYPHS } from './presets.js?v=3';
import {
  generateICNSBlob,
  generateIconsetZipBlob,
  generatePNGBlob,
  downsampleCanvas,
  triggerDownload,
} from './exporters.js?v=3';

// In-memory store for non-serializable image assets keyed by assetId
const imageAssetStore = new Map();

let nextId = 1;
function uid(prefix = 'id') {
  return `${prefix}_${nextId++}_${Math.random().toString(36).slice(2, 6)}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function hexToRgb(hex) {
  const clean = (hex || '#ffffff').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Cached noise pattern for frosted grain
let cachedNoisePattern = null;
function getNoisePattern(ctx) {
  if (cachedNoisePattern) return cachedNoisePattern;
  const nc = document.createElement('canvas');
  nc.width = 128;
  nc.height = 128;
  const nctx = nc.getContext('2d');
  const imgData = nctx.createImageData(128, 128);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = Math.floor(Math.random() * 140);
  }
  nctx.putImageData(imgData, 0, 0);
  cachedNoisePattern = ctx.createPattern(nc, 'repeat');
  return cachedNoisePattern;
}

// Default application state
const initialPreset = GRADIENT_PRESETS[0];
let state = {
  iconName: 'AppIcon',
  appearance: 'default', // 'default' | 'dark' | 'clear' | 'tinted'
  tintColor: '#3b82f6',
  showGrid: false,
  showHandles: true,
  stageView: 'editor', // 'editor' | 'apps' | 'sizes'
  backdrop: 'tahoe',
  activePresetId: initialPreset.id,
  background: deepClone(initialPreset.background),
  glass: {
    ...deepClone(initialPreset.glass),
    noise: 0.04,
  },
  hig: {
    cornerRadius: HIG.CORNER_RADIUS,
    smoothing: 0.6,
    outerShadow: true,
  },
  layers: [
    {
      id: uid('layer'),
      type: 'symbol',
      name: 'AI Sparkle',
      isStarter: true,
      visible: true,
      glyphId: 'sparkle',
      color: '#ffffff',
      silverGlass: true,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      cornerRadius: 0,
      fitMode: 'glyph',
      shadow: { enabled: true, blur: 24, opacity: 0.35, offsetY: 12 },
      glassEffect: false,
    },
  ],
  selectedLayerId: null,
};
state.selectedLayerId = state.layers[0].id;

// Undo / Redo History
const history = [];
let historyIndex = -1;
let wheelHistoryTimer = null;

function pushHistory() {
  const cleanLayers = state.layers.map((l) => {
    const copy = { ...l };
    delete copy._cachedKey;
    delete copy._cachedCanvas;
    return copy;
  });
  const snap = JSON.stringify({
    appearance: state.appearance,
    tintColor: state.tintColor,
    activePresetId: state.activePresetId,
    background: state.background,
    glass: state.glass,
    hig: state.hig,
    layers: cleanLayers,
    selectedLayerId: state.selectedLayerId,
  });
  if (history[historyIndex] === snap) return;
  history.splice(historyIndex + 1);
  history.push(snap);
  if (history.length > 50) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function pushHistoryDebounced() {
  clearTimeout(wheelHistoryTimer);
  wheelHistoryTimer = setTimeout(() => pushHistory(), 280);
}

function restoreSnapshot(snapStr) {
  const data = JSON.parse(snapStr);
  state.appearance = data.appearance;
  state.tintColor = data.tintColor;
  state.activePresetId = data.activePresetId;
  state.background = data.background;
  state.glass = data.glass;
  state.hig = data.hig;
  state.layers = data.layers;
  state.selectedLayerId = data.selectedLayerId;
  syncAllUI();
  renderAll();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreSnapshot(history[historyIndex]);
  updateHistoryButtons();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreSnapshot(history[historyIndex]);
  updateHistoryButtons();
}

// Offscreen master 1024x1024 canvas for clean exports (without HIG grid/handles)
const masterExportCanvas = document.createElement('canvas');
masterExportCanvas.width = HIG.CANVAS_SIZE;
masterExportCanvas.height = HIG.CANVAS_SIZE;
const masterExportCtx = masterExportCanvas.getContext('2d');

// DOM References
const el = {
  mainCanvas: document.getElementById('mainCanvas'),
  overlayCanvas: document.getElementById('overlayCanvas'),
  brandMiniCanvas: document.getElementById('brandMiniCanvas'),
  dockUserCanvas: document.getElementById('dockUserCanvas'),
  finderIconCanvas: document.getElementById('finderIconCanvas'),
  canvasFrame: document.getElementById('canvasFrame'),
  iconNameInput: document.getElementById('iconNameInput'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  appearanceControl: document.getElementById('appearanceControl'),
  tintColorBar: document.getElementById('tintColorBar'),
  tintColorInput: document.getElementById('tintColorInput'),
  gridToggleBtn: document.getElementById('gridToggleBtn'),
  handlesToggleBtn: document.getElementById('handlesToggleBtn'),
  helpBtn: document.getElementById('helpBtn'),
  helpModal: document.getElementById('helpModal'),
  closeHelpBtn: document.getElementById('closeHelpBtn'),
  exportIcnsBtn: document.getElementById('exportIcnsBtn'),
  exportIconsetBtn: document.getElementById('exportIconsetBtn'),
  exportPngBtn: document.getElementById('exportPngBtn'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  globalDropOverlay: document.getElementById('globalDropOverlay'),
  addSymbolBtn: document.getElementById('addSymbolBtn'),
  addTextBtn: document.getElementById('addTextBtn'),
  layersList: document.getElementById('layersList'),
  layerCountBadge: document.getElementById('layerCountBadge'),
  layerControlsSection: document.getElementById('layerControlsSection'),
  centerLayerBtn: document.getElementById('centerLayerBtn'),
  resetLayerBtn: document.getElementById('resetLayerBtn'),
  fitGlyphBtn: document.getElementById('fitGlyphBtn'),
  fitFullBleedBtn: document.getElementById('fitFullBleedBtn'),
  imageToolsBox: document.getElementById('imageToolsBox'),
  autoTrimBtn: document.getElementById('autoTrimBtn'),
  extractPaletteBtn: document.getElementById('extractPaletteBtn'),
  removeBgToggle: document.getElementById('removeBgToggle'),
  removeBgColor: document.getElementById('removeBgColor'),
  removeBgToleranceRow: document.getElementById('removeBgToleranceRow'),
  removeBgTolerance: document.getElementById('removeBgTolerance'),
  removeBgTolVal: document.getElementById('removeBgTolVal'),
  symbolToolsBox: document.getElementById('symbolToolsBox'),
  glyphPickerGrid: document.getElementById('glyphPickerGrid'),
  symbolColorInput: document.getElementById('symbolColorInput'),
  symbolGradientToggle: document.getElementById('symbolGradientToggle'),
  textToolsBox: document.getElementById('textToolsBox'),
  textContentInput: document.getElementById('textContentInput'),
  textColorInput: document.getElementById('textColorInput'),
  textWeightSelect: document.getElementById('textWeightSelect'),
  layerScaleSlider: document.getElementById('layerScaleSlider'),
  layerScaleVal: document.getElementById('layerScaleVal'),
  layerRotSlider: document.getElementById('layerRotSlider'),
  layerRotVal: document.getElementById('layerRotVal'),
  layerOpacitySlider: document.getElementById('layerOpacitySlider'),
  layerOpacityVal: document.getElementById('layerOpacityVal'),
  layerRadiusSlider: document.getElementById('layerRadiusSlider'),
  layerRadiusVal: document.getElementById('layerRadiusVal'),
  flipXBtn: document.getElementById('flipXBtn'),
  flipYBtn: document.getElementById('flipYBtn'),
  layerShadowToggle: document.getElementById('layerShadowToggle'),
  layerShadowControls: document.getElementById('layerShadowControls'),
  layerShadowSlider: document.getElementById('layerShadowSlider'),
  layerShadowVal: document.getElementById('layerShadowVal'),
  layerGlassToggle: document.getElementById('layerGlassToggle'),
  stageViewControl: document.getElementById('stageViewControl'),
  backdropControl: document.getElementById('backdropControl'),
  editorView: document.getElementById('editorView'),
  appsView: document.getElementById('appsView'),
  sizesView: document.getElementById('sizesView'),
  appsGridContainer: document.getElementById('appsGridContainer'),
  sizesPreviewGrid: document.getElementById('sizesPreviewGrid'),
  finderAppTitle: document.getElementById('finderAppTitle'),
  finderAppName: document.getElementById('finderAppName'),
  presetsGrid: document.getElementById('presetsGrid'),
  randomPresetBtn: document.getElementById('randomPresetBtn'),
  reverseStopsBtn: document.getElementById('reverseStopsBtn'),
  bgTypeControl: document.getElementById('bgTypeControl'),
  bgAngleRow: document.getElementById('bgAngleRow'),
  bgAngleSlider: document.getElementById('bgAngleSlider'),
  bgAngleVal: document.getElementById('bgAngleVal'),
  stopsList: document.getElementById('stopsList'),
  addStopBtn: document.getElementById('addStopBtn'),
  resetGlassBtn: document.getElementById('resetGlassBtn'),
  rimIntensitySlider: document.getElementById('rimIntensitySlider'),
  rimIntensityVal: document.getElementById('rimIntensityVal'),
  rimWidthSlider: document.getElementById('rimWidthSlider'),
  rimWidthVal: document.getElementById('rimWidthVal'),
  glassSheenSlider: document.getElementById('glassSheenSlider'),
  glassSheenVal: document.getElementById('glassSheenVal'),
  innerGlowSlider: document.getElementById('innerGlowSlider'),
  innerGlowVal: document.getElementById('innerGlowVal'),
  bgNoiseSlider: document.getElementById('bgNoiseSlider'),
  bgNoiseVal: document.getElementById('bgNoiseVal'),
  resetHigBtn: document.getElementById('resetHigBtn'),
  cornerRadiusSlider: document.getElementById('cornerRadiusSlider'),
  cornerRadiusVal: document.getElementById('cornerRadiusVal'),
  smoothingSlider: document.getElementById('smoothingSlider'),
  smoothingVal: document.getElementById('smoothingVal'),
  outerShadowToggle: document.getElementById('outerShadowToggle'),
  toast: document.getElementById('toast'),
};

const mainCtx = el.mainCanvas.getContext('2d');
const overlayCtx = el.overlayCanvas.getContext('2d');

let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2600);
}

function getSelectedLayer() {
  return state.layers.find((l) => l.id === state.selectedLayerId) || null;
}

/**
 * Computes base unscaled bounding box (width, height) in 1024-space for any layer.
 */
function getLayerBaseDimensions(layer) {
  if (layer.type === 'image') {
    const asset = imageAssetStore.get(layer.assetId);
    if (!asset) return { w: 480, h: 480 };
    const iw = asset.canvas.width;
    const ih = asset.canvas.height;
    if (layer.fitMode === 'fullBleed') {
      const coverScale = Math.max(HIG.SQUIRCLE_SIZE / iw, HIG.SQUIRCLE_SIZE / ih);
      return { w: iw * coverScale, h: ih * coverScale };
    }
    const maxGlyph = 520;
    const containScale = Math.min(maxGlyph / iw, maxGlyph / ih);
    return { w: iw * containScale, h: ih * containScale };
  }
  if (layer.type === 'symbol') {
    return { w: 460, h: 460 };
  }
  return { w: 480, h: 480 };
}

/**
 * Generates or retrieves a chroma-keyed offscreen canvas for an image layer.
 */
function getProcessedImageCanvas(layer) {
  const asset = imageAssetStore.get(layer.assetId);
  if (!asset) return null;
  const srcCanvas = asset.canvas;
  if (!layer.removeBg || !layer.removeBg.enabled) {
    return srcCanvas;
  }

  const key = `${layer.removeBg.color}_${layer.removeBg.tolerance}`;
  if (layer._cachedKey === key && layer._cachedCanvas) {
    return layer._cachedCanvas;
  }

  const out = document.createElement('canvas');
  out.width = srcCanvas.width;
  out.height = srcCanvas.height;
  const octx = out.getContext('2d');
  octx.drawImage(srcCanvas, 0, 0);
  const imgData = octx.getImageData(0, 0, out.width, out.height);
  const d = imgData.data;
  const target = hexToRgb(layer.removeBg.color);
  const tol = layer.removeBg.tolerance;
  const feather = Math.max(8, tol * 0.35);

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - target.r;
    const dg = d[i + 1] - target.g;
    const db = d[i + 2] - target.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tol) {
      d[i + 3] = 0;
    } else if (dist < tol + feather) {
      const factor = (dist - tol) / feather;
      d[i + 3] = Math.round(d[i + 3] * factor);
    }
  }
  octx.putImageData(imgData, 0, 0);
  layer._cachedKey = key;
  layer._cachedCanvas = out;
  return out;
}

/**
 * Renders the complete macOS 26 icon onto targetCtx at targetSize x targetSize.
 */
function renderIcon(targetCtx, targetSize = HIG.CANVAS_SIZE, opts = {}) {
  const { includeGrid = false } = opts;
  const S = HIG.CANVAS_SIZE; // 1024
  const M = HIG.MARGIN; // 100
  const Q = HIG.SQUIRCLE_SIZE; // 824
  const C = S / 2; // 512
  const radius = state.hig.cornerRadius;
  const smoothing = state.hig.smoothing;

  targetCtx.save();
  targetCtx.clearRect(0, 0, targetSize, targetSize);
  const ratio = targetSize / S;
  targetCtx.scale(ratio, ratio);

  // 1. Apple HIG Outer Drop Shadow
  if (state.hig.outerShadow) {
    const shadowTemp = document.createElement('canvas');
    shadowTemp.width = S;
    shadowTemp.height = S;
    const stx = shadowTemp.getContext('2d');

    // Primary Apple HIG shadow: Y +12, Blur 28, #000 50%
    stx.save();
    stx.shadowColor = `rgba(0, 0, 0, ${HIG.SHADOW.opacity})`;
    stx.shadowOffsetX = 0;
    stx.shadowOffsetY = HIG.SHADOW.offsetY;
    stx.shadowBlur = HIG.SHADOW.blur;
    traceAppleSquircle(stx, M, M, Q, Q, radius, smoothing);
    stx.fillStyle = '#000000';
    stx.fill();
    stx.restore();

    // Secondary soft ambient shadow
    stx.save();
    stx.shadowColor = `rgba(0, 0, 0, ${HIG.SHADOW.ambientOpacity})`;
    stx.shadowOffsetX = 0;
    stx.shadowOffsetY = HIG.SHADOW.ambientOffsetY;
    stx.shadowBlur = HIG.SHADOW.ambientBlur;
    traceAppleSquircle(stx, M, M, Q, Q, radius, smoothing);
    stx.fillStyle = '#000000';
    stx.fill();
    stx.restore();

    // Knock out interior so Clear Glass mode stays truly translucent
    stx.save();
    stx.globalCompositeOperation = 'destination-out';
    traceAppleSquircle(stx, M, M, Q, Q, radius, smoothing);
    stx.fillStyle = '#000';
    stx.fill();
    stx.restore();

    targetCtx.drawImage(shadowTemp, 0, 0);
  }

  // 2. Clip to 824x824 Continuous Apple Squircle
  targetCtx.save();
  traceAppleSquircle(targetCtx, M, M, Q, Q, radius, smoothing);
  targetCtx.clip();

  // 3. Background Substrate & Appearance Mode
  renderBackground(targetCtx, M, M, Q, Q);

  // Frosted Noise / Grain
  if (state.glass.noise > 0.002) {
    targetCtx.save();
    targetCtx.globalAlpha = state.glass.noise;
    targetCtx.fillStyle = getNoisePattern(targetCtx);
    targetCtx.fillRect(M, M, Q, Q);
    targetCtx.restore();
  }

  // 4. Foreground Layers (bottom to top)
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    renderLayer(targetCtx, layer, C);
  }

  // 5. Liquid Glass Material Overlays
  renderLiquidGlassOverlays(targetCtx, M, M, Q, Q, radius, smoothing);

  targetCtx.restore(); // end squircle clip

  // Optional HIG Alignment Grid (UI preview only)
  if (includeGrid && state.showGrid) {
    drawHIGGrid(targetCtx, S, {
      smoothing,
      radiusRatio: radius / Q,
    });
  }

  targetCtx.restore();
}

function renderBackground(ctx, x, y, w, h) {
  const app = state.appearance;

  if (app === 'clear') {
    const grad = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    grad.addColorStop(0, 'rgba(248, 252, 255, 0.34)');
    grad.addColorStop(0.5, 'rgba(220, 236, 255, 0.16)');
    grad.addColorStop(1, 'rgba(185, 210, 248, 0.24)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (app === 'dark') {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#222631');
    grad.addColorStop(0.55, '#14171e');
    grad.addColorStop(1, '#0b0c10');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Subtle colored ambient aura inherited from primary stop
    const primary = state.background.stops[0]?.color || '#3b82f6';
    const rgb = hexToRgb(primary);
    const aura = ctx.createRadialGradient(x + w * 0.5, y + h * 0.28, 10, x + w * 0.5, y + h * 0.4, w * 0.65);
    aura.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (app === 'tinted') {
    const rgb = hexToRgb(state.tintColor);
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, `rgb(${Math.round(rgb.r * 0.16 + 22)}, ${Math.round(rgb.g * 0.16 + 24)}, ${Math.round(rgb.b * 0.16 + 30)})`);
    grad.addColorStop(1, '#0c0d12');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }

  // Default full-color background
  const bg = state.background;
  const stops = [...bg.stops].sort((a, b) => a.pos - b.pos);

  if (bg.type === 'solid') {
    ctx.fillStyle = stops[0]?.color || '#2563eb';
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (bg.type === 'radial') {
    const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.35, 12, x + w * 0.5, y + h * 0.5, w * 0.72);
    for (const s of stops) grad.addColorStop(s.pos / 100, s.color);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (bg.type === 'conic' && typeof ctx.createConicGradient === 'function') {
    const rad = ((bg.angle - 90) * Math.PI) / 180;
    const grad = ctx.createConicGradient(rad, x + w / 2, y + h / 2);
    for (const s of stops) grad.addColorStop(s.pos / 100, s.color);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }

  // Linear or Mesh base gradient
  const rad = ((bg.angle - 90) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = Math.abs(Math.cos(rad)) * (w / 2) + Math.abs(Math.sin(rad)) * (h / 2);
  const dx = Math.cos(rad) * len;
  const dy = Math.sin(rad) * len;
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const s of stops) grad.addColorStop(s.pos / 100, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // In Mesh mode, position soft radial color orbs derived from the user's editable stops
  // and rotated around the squircle center by bg.angle.
  if (bg.type === 'mesh') {
    const baseOffsets = [
      [-0.28, -0.28],
      [0.28, 0.26],
      [0.26, -0.26],
      [-0.26, 0.28],
      [0, -0.32],
      [0, 0.32],
    ];
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    stops.forEach((s, idx) => {
      const [bx, by] = baseOffsets[idx % baseOffsets.length];
      // Shift radial orb position slightly by stop.pos
      const shift = (s.pos / 100 - 0.5) * 0.25;
      const rx = (bx + shift) * cosA - by * sinA;
      const ry = (bx + shift) * sinA + by * cosA;
      const ox = x + (0.5 + rx) * w;
      const oy = y + (0.5 + ry) * h;
      const or = w * 0.72;
      const rgb = hexToRgb(s.color);
      const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
      rg.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.76)`);
      rg.addColorStop(0.55, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
      rg.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(x, y, w, h);
    });
  }
}

function renderLayer(ctx, layer, center) {
  const { w, h } = getLayerBaseDimensions(layer);
  const scale = Math.max(0.05, layer.scale ?? 1);
  // Render at actual scaled 1024-canvas pixel dimensions so scaled-up images/vectors/text never blur!
  const drawW = Math.max(4, w * scale);
  const drawH = Math.max(4, h * scale);

  const temp = document.createElement('canvas');
  const pad = 96;
  const tw = Math.ceil(drawW + pad * 2);
  const th = Math.ceil(drawH + pad * 2);
  temp.width = tw;
  temp.height = th;
  const tctx = temp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';

  // Optional per-layer corner clipping
  tctx.save();
  if (layer.cornerRadius > 0) {
    const rad = Math.min(drawW, drawH) * (layer.cornerRadius / 100);
    traceAppleSquircle(tctx, pad, pad, drawW, drawH, rad, 0.6);
    tctx.clip();
  }

  if (layer.type === 'image') {
    const imgCanvas = getProcessedImageCanvas(layer);
    if (imgCanvas) {
      tctx.drawImage(imgCanvas, pad, pad, drawW, drawH);
    }
  } else if (layer.type === 'symbol') {
    const glyph = VECTOR_GLYPHS.find((g) => g.id === layer.glyphId) || VECTOR_GLYPHS[0];
    tctx.save();
    tctx.translate(pad, pad);
    tctx.scale(drawW / 24, drawH / 24);
    if (layer.silverGlass) {
      const g = tctx.createLinearGradient(0, 0, 0, 24);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#eef4ff');
      g.addColorStop(1, '#c6d6ee');
      tctx.fillStyle = g;
    } else {
      tctx.fillStyle = layer.color || '#ffffff';
    }
    for (const d of glyph.paths) {
      tctx.fill(new Path2D(d));
    }
    tctx.restore();
  } else if (layer.type === 'text') {
    tctx.save();
    const content = layer.text || 'A';
    const baseFontSize = content.length <= 2 ? 360 : content.length <= 4 ? 250 : 150;
    const fontSize = Math.round(baseFontSize * scale);
    tctx.font = `${layer.fontWeight || '700'} ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Apple Color Emoji", sans-serif`;
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.fillStyle = layer.color || '#ffffff';
    tctx.fillText(content, pad + drawW / 2, pad + drawH / 2 + fontSize * 0.04);
    tctx.restore();
  }
  tctx.restore();

  // Apply Liquid Glass glyph bevel highlight if enabled
  if (layer.glassEffect) {
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    const glassGrad = tctx.createLinearGradient(0, pad, 0, pad + drawH);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
    glassGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
    glassGrad.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
    tctx.fillStyle = glassGrad;
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();
  }

  // Apply Tinted / Clear system appearance treatments to foreground
  if (state.appearance === 'tinted') {
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.fillStyle = state.tintColor;
    tctx.globalAlpha = 0.88;
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();
  } else if (state.appearance === 'clear') {
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    const cg = tctx.createLinearGradient(0, pad, 0, pad + drawH);
    cg.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    cg.addColorStop(1, 'rgba(215, 232, 255, 0.7)');
    tctx.fillStyle = cg;
    tctx.globalAlpha = 0.72;
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();
  }

  // Draw onto main canvas with transforms + optional 3D elevation shadow
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
  ctx.translate(center + (layer.x || 0), center + (layer.y || 0));
  ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
  ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);

  if (layer.shadow && layer.shadow.enabled && layer.shadow.blur > 0) {
    ctx.shadowColor = `rgba(0, 0, 0, ${layer.shadow.opacity ?? 0.35})`;
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(layer.shadow.blur * 0.45);
  }

  ctx.drawImage(temp, -tw / 2, -th / 2);
  ctx.restore();
}

function renderLiquidGlassOverlays(ctx, x, y, w, h, radius, smoothing) {
  const { sheen, rimIntensity, rimWidth, innerGlow } = state.glass;
  const tintedRgb = state.appearance === 'tinted' ? hexToRgb(state.tintColor) : { r: 255, g: 255, b: 255 };

  // 1. Curved Top Glass Lens Sheen
  if (sheen > 0.005) {
    ctx.save();
    const sheenGrad = ctx.createLinearGradient(x, y, x, y + h * 0.58);
    sheenGrad.addColorStop(0, `rgba(255, 255, 255, ${(sheen * 0.55).toFixed(3)})`);
    sheenGrad.addColorStop(0.4, `rgba(255, 255, 255, ${(sheen * 0.14).toFixed(3)})`);
    sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(x, y, w, h * 0.6);

    const domeGrad = ctx.createRadialGradient(x + w * 0.5, y - h * 0.18, w * 0.08, x + w * 0.5, y + h * 0.08, w * 0.65);
    domeGrad.addColorStop(0, `rgba(255, 255, 255, ${(sheen * 0.38).toFixed(3)})`);
    domeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = domeGrad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // 2. Inner Bevel Depth (follows the continuous squircle contour instead of flat horizontal bands!)
  if (innerGlow > 0.005) {
    ctx.save();
    traceAppleSquircle(ctx, x, y, w, h, radius, smoothing);
    const bevelGrad = ctx.createLinearGradient(x, y, x, y + h);
    bevelGrad.addColorStop(0, `rgba(255, 255, 255, ${(innerGlow * 0.52).toFixed(3)})`);
    bevelGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.04)');
    bevelGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.06)');
    bevelGrad.addColorStop(1, `rgba(0, 0, 0, ${(innerGlow * 0.44).toFixed(3)})`);
    ctx.strokeStyle = bevelGrad;
    ctx.lineWidth = 36;
    ctx.filter = 'blur(14px)';
    ctx.stroke();
    ctx.filter = 'none';
    ctx.restore();
  }

  // 3. Signature macOS 26 Directional Liquid Glass Specular Rim
  // Because ctx is already clipped to the exact outer 824x824 squircle, stroking the
  // outer squircle path with lineWidth = rimWidth * 2 clips the outer half and leaves
  // a mathematically uniform inner border of thickness `rimWidth` at any radius!
  if (rimIntensity > 0.005 && rimWidth > 0) {
    ctx.save();
    traceAppleSquircle(ctx, x, y, w, h, radius, smoothing);

    const rimGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    const bright = Math.min(1, rimIntensity);
    const mid = Math.min(1, rimIntensity * 0.18);
    const bounce = Math.min(1, rimIntensity * 0.44);
    rimGrad.addColorStop(0, `rgba(${tintedRgb.r}, ${tintedRgb.g}, ${tintedRgb.b}, ${bright.toFixed(3)})`);
    rimGrad.addColorStop(0.28, `rgba(${tintedRgb.r}, ${tintedRgb.g}, ${tintedRgb.b}, ${(bright * 0.48).toFixed(3)})`);
    rimGrad.addColorStop(0.55, `rgba(${tintedRgb.r}, ${tintedRgb.g}, ${tintedRgb.b}, ${mid.toFixed(3)})`);
    rimGrad.addColorStop(1, `rgba(${tintedRgb.r}, ${tintedRgb.g}, ${tintedRgb.b}, ${bounce.toFixed(3)})`);

    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = rimWidth * 2;
    ctx.stroke();
    ctx.restore();
  }
}

// Snap state for visual alignment guides
let activeSnapGuides = { x: false, y: false };
let hoveredHandleId = null;

/**
 * Computes the visual box and handle positions in layer-local coordinates,
 * clamping to the visible 1024x1024 canvas when an image is larger than the canvas
 * (e.g. tall/wide images in Fill Squircle mode) so all 8 handles stay on-screen and clickable.
 */
function getLayerBoxAndHandles(layer) {
  const S = HIG.CANVAS_SIZE;
  const { w, h } = getLayerBaseDimensions(layer);
  const rawW = w * (layer.scale ?? 1);
  const rawH = h * (layer.scale ?? 1);
  const cx = S / 2 + (layer.x || 0);
  const cy = S / 2 + (layer.y || 0);

  // Clamp half-extents so handles never disappear off the edges of the 1024x1024 canvas
  const pad = 34;
  const maxLeft = Math.max(40, cx - pad);
  const maxRight = Math.max(40, S - pad - cx);
  const maxTop = Math.max(76, cy - pad);
  const maxBottom = Math.max(40, S - pad - cy);

  const x1 = -Math.min(rawW / 2, maxLeft);
  const x2 = Math.min(rawW / 2, maxRight);
  const y1 = -Math.min(rawH / 2, maxTop);
  const y2 = Math.min(rawH / 2, maxBottom);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const rotY = y1 - 42;

  const handles = [
    { id: 'nw', x: x1, y: y1, cursor: 'nwse-resize', isCorner: true },
    { id: 'n', x: mx, y: y1, cursor: 'ns-resize', isCorner: false },
    { id: 'ne', x: x2, y: y1, cursor: 'nesw-resize', isCorner: true },
    { id: 'e', x: x2, y: my, cursor: 'ew-resize', isCorner: false },
    { id: 'se', x: x2, y: y2, cursor: 'nwse-resize', isCorner: true },
    { id: 's', x: mx, y: y2, cursor: 'ns-resize', isCorner: false },
    { id: 'sw', x: x1, y: y2, cursor: 'nesw-resize', isCorner: true },
    { id: 'w', x: x1, y: my, cursor: 'ew-resize', isCorner: false },
  ];

  return { cx, cy, x1, y1, x2, y2, mx, my, rotY, rawW, rawH, handles };
}

function renderOverlay() {
  const S = HIG.CANVAS_SIZE;
  overlayCtx.clearRect(0, 0, S, S);

  if (state.showGrid) {
    drawHIGGrid(overlayCtx, S, {
      smoothing: state.hig.smoothing,
      radiusRatio: state.hig.cornerRadius / HIG.SQUIRCLE_SIZE,
    });
  }

  // Snap guides while dragging
  if (isDragging && (activeSnapGuides.x || activeSnapGuides.y)) {
    overlayCtx.save();
    overlayCtx.strokeStyle = '#ffcf40';
    overlayCtx.lineWidth = 2.5;
    overlayCtx.setLineDash([8, 6]);
    if (activeSnapGuides.x) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(S / 2, HIG.MARGIN);
      overlayCtx.lineTo(S / 2, S - HIG.MARGIN);
      overlayCtx.stroke();
    }
    if (activeSnapGuides.y) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(HIG.MARGIN, S / 2);
      overlayCtx.lineTo(S - HIG.MARGIN, S / 2);
      overlayCtx.stroke();
    }
    overlayCtx.restore();
  }

  // Active layer selection box & 8 resize handles + rotation knob
  // ALWAYS rendered whenever a visible layer is selected and state.showHandles is true.
  const layer = getSelectedLayer();
  if (!layer || !layer.visible || !state.showHandles) return;

  const box = getLayerBoxAndHandles(layer);
  const rot = ((layer.rotation || 0) * Math.PI) / 180;

  overlayCtx.save();
  overlayCtx.translate(box.cx, box.cy);
  overlayCtx.rotate(rot);

  // Bounding box outline (double-stroke for high contrast on both dark and white images)
  overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  overlayCtx.lineWidth = 5;
  overlayCtx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

  overlayCtx.strokeStyle = '#38a3ff';
  overlayCtx.lineWidth = 2.75;
  overlayCtx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

  // Rotation stem & knob
  overlayCtx.beginPath();
  overlayCtx.moveTo(box.mx, box.y1);
  overlayCtx.lineTo(box.mx, box.rotY);
  overlayCtx.stroke();

  const drawHandle = (hx, hy, r, isHovered, isRot = false) => {
    overlayCtx.save();
    overlayCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    overlayCtx.shadowBlur = 8;
    overlayCtx.shadowOffsetY = 2;

    if (isHovered) {
      overlayCtx.beginPath();
      overlayCtx.arc(hx, hy, r + 6, 0, Math.PI * 2);
      overlayCtx.fillStyle = 'rgba(56, 163, 255, 0.32)';
      overlayCtx.fill();
    }

    overlayCtx.beginPath();
    overlayCtx.arc(hx, hy, isHovered ? r + 2 : r, 0, Math.PI * 2);
    overlayCtx.fillStyle = isHovered ? '#ffcf40' : isRot ? '#7cc4ff' : '#ffffff';
    overlayCtx.fill();
    overlayCtx.lineWidth = 3.5;
    overlayCtx.strokeStyle = isHovered ? '#111827' : '#1472ff';
    overlayCtx.stroke();
    overlayCtx.restore();
  };

  for (const hPos of box.handles) {
    drawHandle(
      hPos.x,
      hPos.y,
      hPos.isCorner ? 13.5 : 10,
      hoveredHandleId === hPos.id,
      false
    );
  }
  drawHandle(box.mx, box.rotY, 13, hoveredHandleId === 'rotate', true);

  overlayCtx.restore();
}

function renderAll() {
  // 1. Clean master 1024x1024 export buffer
  renderIcon(masterExportCtx, HIG.CANVAS_SIZE, { includeGrid: false });

  // 2. Main interactive stage canvas
  mainCtx.clearRect(0, 0, HIG.CANVAS_SIZE, HIG.CANVAS_SIZE);
  mainCtx.drawImage(masterExportCanvas, 0, 0);

  // 3. Overlay (HIG grid + selection handles)
  renderOverlay();

  // 4. Brand badge & live Dock icon (downsampled cleanly)
  const dockScaled = downsampleCanvas(masterExportCanvas, 128);
  const dctx = el.dockUserCanvas.getContext('2d');
  dctx.clearRect(0, 0, 128, 128);
  dctx.drawImage(dockScaled, 0, 0);

  const bctx = el.brandMiniCanvas.getContext('2d');
  bctx.clearRect(0, 0, 48, 48);
  bctx.drawImage(downsampleCanvas(masterExportCanvas, 48), 0, 0);

  // 5. Update visible subviews if open
  if (state.stageView === 'apps') renderAppsGridPreview();
  if (state.stageView === 'sizes') renderSizesPreview();
}

function renderAppsGridPreview() {
  const container = el.appsGridContainer;
  container.innerHTML = '';

  const sampleApps = [
    { name: 'Notes', bg: 'linear-gradient(180deg, #ffe249 0%, #f59e0b 26%, #ffffff 26%)', glyph: '📝' },
    { name: 'Safari', bg: 'linear-gradient(180deg, #3ac3ff, #106bff)', glyph: '🧭' },
    { name: 'Mail', bg: 'linear-gradient(180deg, #39b6ff, #1472ff)', glyph: '✉️' },
    { name: 'Photos', bg: 'linear-gradient(135deg, #ffffff, #e2e8f0)', glyph: '🌸' },
    { name: state.iconName || 'AppIcon', isUser: true },
    { name: 'Podcasts', bg: 'linear-gradient(180deg, #d878ff, #7a25d6)', glyph: '🎙️' },
    { name: 'Books', bg: 'linear-gradient(180deg, #ffae2b, #ff5d14)', glyph: '📖' },
    { name: 'Music', bg: 'linear-gradient(180deg, #ff5d78, #c40f2a)', glyph: '♫' },
    { name: 'Journal', bg: 'linear-gradient(180deg, #3b4a9f, #14152e)', glyph: '🦋' },
    { name: 'Reminders', bg: 'linear-gradient(180deg, #ffffff, #e8eef6)', glyph: '☑️' },
  ];

  for (const app of sampleApps) {
    const cell = document.createElement('div');
    cell.className = `grid-app-cell ${app.isUser ? 'user-cell' : ''}`;
    if (app.isUser) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      c.style.width = '76px';
      c.style.height = '76px';
      c.getContext('2d').drawImage(downsampleCanvas(masterExportCanvas, 128), 0, 0);
      cell.appendChild(c);
    } else {
      const box = document.createElement('div');
      box.style.width = '64px';
      box.style.height = '64px';
      box.style.margin = '6px';
      box.style.borderRadius = '15px';
      box.style.background = app.bg;
      box.style.display = 'grid';
      box.style.placeItems = 'center';
      box.style.fontSize = '28px';
      box.style.boxShadow = '0 6px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.45)';
      box.textContent = app.glyph;
      cell.appendChild(box);
    }
    const label = document.createElement('span');
    label.textContent = app.name;
    cell.appendChild(label);
    container.appendChild(cell);
  }
}

function renderSizesPreview() {
  el.sizesPreviewGrid.innerHTML = '';
  const sizes = [256, 128, 64, 32, 16];
  for (const sz of sizes) {
    const item = document.createElement('div');
    item.className = 'size-item';
    const c = downsampleCanvas(masterExportCanvas, sz);
    const displaySize = Math.min(sz, 96);
    c.style.width = `${displaySize}px`;
    c.style.height = `${displaySize}px`;
    const lbl = document.createElement('span');
    lbl.textContent = `${sz}×${sz}`;
    item.appendChild(c);
    item.appendChild(lbl);
    el.sizesPreviewGrid.appendChild(item);
  }

  const fctx = el.finderIconCanvas.getContext('2d');
  fctx.clearRect(0, 0, 128, 128);
  fctx.drawImage(downsampleCanvas(masterExportCanvas, 128), 0, 0);
  const name = state.iconName || 'AppIcon';
  el.finderAppTitle.textContent = name;
  el.finderAppName.textContent = `${name}.app`;
}

// ==========================================
// UI Synchronization & Presets Rendering
// ==========================================

function renderPresetsGrid() {
  el.presetsGrid.innerHTML = '';
  for (const preset of GRADIENT_PRESETS) {
    const btn = document.createElement('button');
    btn.className = `preset-swatch ${state.activePresetId === preset.id ? 'active' : ''}`;
    btn.title = `${preset.name} (${preset.category})`;

    const stops = preset.background.stops.map((s) => `${s.color} ${s.pos}%`).join(', ');
    if (preset.appearance === 'clear') {
      btn.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.55), rgba(180,220,255,0.22))';
    } else if (preset.background.type === 'radial') {
      btn.style.background = `radial-gradient(circle at 50% 35%, ${stops})`;
    } else {
      btn.style.background = `linear-gradient(${preset.background.angle || 180}deg, ${stops})`;
    }

    btn.addEventListener('click', () => {
      state.activePresetId = preset.id;
      state.appearance = preset.appearance || 'default';
      state.background = deepClone(preset.background);
      state.glass = {
        ...state.glass,
        ...deepClone(preset.glass),
      };
      pushHistory();
      syncAllUI();
      renderAll();
      showToast(`Applied "${preset.name}"`);
    });
    el.presetsGrid.appendChild(btn);
  }
}

function renderGlyphPicker() {
  el.glyphPickerGrid.innerHTML = '';
  const layer = getSelectedLayer();
  for (const glyph of VECTOR_GLYPHS) {
    const btn = document.createElement('button');
    btn.className = `glyph-btn ${layer?.glyphId === glyph.id ? 'active' : ''}`;
    btn.title = glyph.name;
    btn.innerHTML = `<svg viewBox="${glyph.viewBox}" width="18" height="18" fill="currentColor">${glyph.paths
      .map((p) => `<path d="${p}"/>`)
      .join('')}</svg>`;
    btn.addEventListener('click', () => {
      const target = getSelectedLayer();
      if (!target || target.type !== 'symbol') return;
      target.glyphId = glyph.id;
      target.name = glyph.name;
      target.isStarter = false;
      pushHistory();
      syncLayersUI();
      renderGlyphPicker();
      renderAll();
    });
    el.glyphPickerGrid.appendChild(btn);
  }
}

function renderStopsList() {
  el.stopsList.innerHTML = '';
  state.background.stops.forEach((stop, idx) => {
    const row = document.createElement('div');
    row.className = 'stop-row';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = stop.color;
    colorInput.addEventListener('input', (e) => {
      stop.color = e.target.value;
      state.activePresetId = null;
      hexLabel.textContent = stop.color;
      renderAll();
    });
    colorInput.addEventListener('change', () => {
      pushHistory();
      renderPresetsGrid();
    });

    const hexLabel = document.createElement('span');
    hexLabel.className = 'stop-hex';
    hexLabel.textContent = stop.color;

    const posSlider = document.createElement('input');
    posSlider.type = 'range';
    posSlider.className = 'stop-pos';
    posSlider.min = 0;
    posSlider.max = 100;
    posSlider.value = stop.pos;
    posSlider.addEventListener('input', (e) => {
      stop.pos = Number(e.target.value);
      posLabel.textContent = `${stop.pos}%`;
      state.activePresetId = null;
      renderAll();
    });
    posSlider.addEventListener('change', () => pushHistory());

    const posLabel = document.createElement('span');
    posLabel.className = 'stop-pos-label';
    posLabel.textContent = `${stop.pos}%`;

    const delBtn = document.createElement('button');
    delBtn.className = 'stop-del';
    delBtn.title = 'Remove color stop';
    delBtn.textContent = '✕';
    delBtn.disabled = state.background.stops.length <= 2;
    delBtn.style.opacity = state.background.stops.length <= 2 ? '0.25' : '1';
    delBtn.addEventListener('click', () => {
      if (state.background.stops.length <= 2) return;
      state.background.stops.splice(idx, 1);
      pushHistory();
      renderStopsList();
      renderAll();
    });

    row.append(colorInput, hexLabel, posSlider, posLabel, delBtn);
    el.stopsList.appendChild(row);
  });
}

function deleteLayerById(layerId) {
  state.layers = state.layers.filter((l) => l.id !== layerId);
  if (state.selectedLayerId === layerId) {
    state.selectedLayerId = state.layers[state.layers.length - 1]?.id || null;
  }
  pushHistory();
  syncAllUI();
  renderAll();
}

function duplicateLayer(layer) {
  const copy = deepClone({
    ...layer,
    _cachedKey: undefined,
    _cachedCanvas: undefined,
  });
  copy.id = uid('layer');
  copy.name = `${layer.name} Copy`;
  copy.isStarter = false;
  copy.x = (layer.x || 0) + 24;
  copy.y = (layer.y || 0) + 24;
  state.layers.push(copy);
  state.selectedLayerId = copy.id;
  state.showHandles = true;
  pushHistory();
  syncAllUI();
  renderAll();
  showToast(`Duplicated "${layer.name}"`);
}

function syncLayersUI() {
  el.layersList.innerHTML = '';
  el.layerCountBadge.textContent = String(state.layers.length);

  // Render top-most layer first
  const reversed = [...state.layers].reverse();
  for (const layer of reversed) {
    const li = document.createElement('li');
    li.className = `layer-item ${layer.id === state.selectedLayerId ? 'active' : ''}`;

    const thumb = document.createElement('div');
    thumb.className = 'layer-thumb';
    if (layer.type === 'image') {
      const asset = imageAssetStore.get(layer.assetId);
      if (asset?.thumbUrl) {
        const img = document.createElement('img');
        img.src = asset.thumbUrl;
        thumb.appendChild(img);
      } else {
        thumb.textContent = '🖼';
      }
    } else if (layer.type === 'symbol') {
      const glyph = VECTOR_GLYPHS.find((g) => g.id === layer.glyphId) || VECTOR_GLYPHS[0];
      thumb.innerHTML = `<svg viewBox="${glyph.viewBox}" width="14" height="14" fill="currentColor">${glyph.paths
        .map((p) => `<path d="${p}"/>`)
        .join('')}</svg>`;
    } else {
      thumb.textContent = (layer.text || 'T').slice(0, 2);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = layer.name;

    const actions = document.createElement('div');
    actions.className = 'layer-actions';

    const visBtn = document.createElement('button');
    visBtn.className = `layer-mini-btn ${layer.visible ? '' : 'muted'}`;
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.textContent = layer.visible ? '👁' : '◌';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      pushHistory();
      syncLayersUI();
      renderAll();
    });

    const idx = state.layers.findIndex((l) => l.id === layer.id);

    const upBtn = document.createElement('button');
    upBtn.className = `layer-mini-btn ${idx >= state.layers.length - 1 ? 'muted' : ''}`;
    upBtn.title = 'Bring layer forward';
    upBtn.textContent = '↑';
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < state.layers.length - 1) {
        [state.layers[idx], state.layers[idx + 1]] = [state.layers[idx + 1], state.layers[idx]];
        pushHistory();
        syncLayersUI();
        renderAll();
      }
    });

    const downBtn = document.createElement('button');
    downBtn.className = `layer-mini-btn ${idx <= 0 ? 'muted' : ''}`;
    downBtn.title = 'Send layer backward';
    downBtn.textContent = '↓';
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) {
        [state.layers[idx], state.layers[idx - 1]] = [state.layers[idx - 1], state.layers[idx]];
        pushHistory();
        syncLayersUI();
        renderAll();
      }
    });

    const dupBtn = document.createElement('button');
    dupBtn.className = 'layer-mini-btn';
    dupBtn.title = 'Duplicate layer';
    dupBtn.textContent = '⧉';
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateLayer(layer);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'layer-mini-btn';
    delBtn.title = 'Delete layer (⌫)';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLayerById(layer.id);
    });

    actions.append(visBtn, upBtn, downBtn, dupBtn, delBtn);
    li.append(thumb, nameSpan, actions);
    li.addEventListener('click', () => {
      state.selectedLayerId = layer.id;
      state.showHandles = true;
      syncAllUI();
      renderOverlay();
    });
    el.layersList.appendChild(li);
  }

  syncActiveLayerInspector();
}

function syncActiveLayerInspector() {
  const layer = getSelectedLayer();
  if (!layer) {
    el.layerControlsSection.style.opacity = '0.4';
    el.layerControlsSection.style.pointerEvents = 'none';
    return;
  }
  el.layerControlsSection.style.opacity = '1';
  el.layerControlsSection.style.pointerEvents = 'auto';

  el.fitGlyphBtn.classList.toggle('active', layer.fitMode === 'glyph');
  el.fitFullBleedBtn.classList.toggle('active', layer.fitMode === 'fullBleed');

  el.imageToolsBox.classList.toggle('hidden', layer.type !== 'image');
  el.symbolToolsBox.classList.toggle('hidden', layer.type !== 'symbol');
  el.textToolsBox.classList.toggle('hidden', layer.type !== 'text');

  if (layer.type === 'image') {
    const rbg = layer.removeBg || { enabled: false, color: '#ffffff', tolerance: 28 };
    el.removeBgToggle.checked = rbg.enabled;
    el.removeBgColor.value = rbg.color;
    el.removeBgTolerance.value = rbg.tolerance;
    el.removeBgTolVal.textContent = String(rbg.tolerance);
    el.removeBgToleranceRow.classList.toggle('hidden', !rbg.enabled);
  } else if (layer.type === 'symbol') {
    el.symbolColorInput.value = layer.color || '#ffffff';
    el.symbolGradientToggle.checked = Boolean(layer.silverGlass);
    renderGlyphPicker();
  } else if (layer.type === 'text') {
    el.textContentInput.value = layer.text || 'A';
    el.textColorInput.value = layer.color || '#ffffff';
    el.textWeightSelect.value = layer.fontWeight || '700';
  }

  const scalePct = Math.round((layer.scale ?? 1) * 100);
  el.layerScaleSlider.value = scalePct;
  el.layerScaleVal.textContent = `${scalePct}%`;

  const rot = Math.round(layer.rotation ?? 0);
  el.layerRotSlider.value = rot;
  el.layerRotVal.textContent = `${rot}°`;

  const opPct = Math.round((layer.opacity ?? 1) * 100);
  el.layerOpacitySlider.value = opPct;
  el.layerOpacityVal.textContent = `${opPct}%`;

  const clipPct = Math.round(layer.cornerRadius ?? 0);
  el.layerRadiusSlider.value = clipPct;
  el.layerRadiusVal.textContent = `${clipPct}%`;

  const shEnabled = Boolean(layer.shadow?.enabled);
  el.layerShadowToggle.checked = shEnabled;
  el.layerShadowControls.classList.toggle('hidden', !shEnabled);
  const shBlur = Math.round(layer.shadow?.blur ?? 24);
  el.layerShadowSlider.value = shBlur;
  el.layerShadowVal.textContent = `${shBlur}px`;

  el.layerGlassToggle.checked = Boolean(layer.glassEffect);
}

function syncAllUI() {
  // Appearance
  for (const btn of el.appearanceControl.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.appearance === state.appearance);
  }
  el.tintColorBar.classList.toggle('hidden', state.appearance !== 'tinted');
  el.tintColorInput.value = state.tintColor;

  // Grid & Handles buttons
  el.gridToggleBtn.classList.toggle('active', state.showGrid);
  if (el.handlesToggleBtn) {
    el.handlesToggleBtn.classList.toggle('active', state.showHandles);
  }

  // Background
  for (const btn of el.bgTypeControl.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.bgtype === state.background.type);
  }
  const showAngle = state.background.type === 'linear' || state.background.type === 'conic' || state.background.type === 'mesh';
  el.bgAngleRow.classList.toggle('hidden', !showAngle);
  el.bgAngleSlider.value = state.background.angle ?? 145;
  el.bgAngleVal.textContent = `${state.background.angle ?? 145}°`;

  // Glass sliders
  el.rimIntensitySlider.value = Math.round(state.glass.rimIntensity * 100);
  el.rimIntensityVal.textContent = `${Math.round(state.glass.rimIntensity * 100)}%`;
  el.rimWidthSlider.value = state.glass.rimWidth;
  el.rimWidthVal.textContent = `${Number(state.glass.rimWidth).toFixed(1)}px`;
  el.glassSheenSlider.value = Math.round(state.glass.sheen * 100);
  el.glassSheenVal.textContent = `${Math.round(state.glass.sheen * 100)}%`;
  el.innerGlowSlider.value = Math.round(state.glass.innerGlow * 100);
  el.innerGlowVal.textContent = `${Math.round(state.glass.innerGlow * 100)}%`;
  el.bgNoiseSlider.value = Math.round(state.glass.noise * 100);
  el.bgNoiseVal.textContent = `${Math.round(state.glass.noise * 100)}%`;

  // HIG sliders
  el.cornerRadiusSlider.value = state.hig.cornerRadius;
  el.cornerRadiusVal.textContent = `${Number(state.hig.cornerRadius).toFixed(1)}px`;
  el.smoothingSlider.value = Math.round(state.hig.smoothing * 100);
  el.smoothingVal.textContent = `${Math.round(state.hig.smoothing * 100)}%`;
  el.outerShadowToggle.checked = state.hig.outerShadow;

  renderPresetsGrid();
  renderStopsList();
  syncLayersUI();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  el.undoBtn.disabled = historyIndex <= 0;
  el.redoBtn.disabled = historyIndex >= history.length - 1;
}

// ==========================================
// Image Import, Smart Trim, Palette Extract
// ==========================================

function detectCornerInfo(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (w < 4 || h < 4) return { isOpaqueRect: false, cornerHex: '#ffffff' };
  const tl = ctx.getImageData(2, 2, 1, 1).data;
  const tr = ctx.getImageData(w - 3, 2, 1, 1).data;
  const bl = ctx.getImageData(2, h - 3, 1, 1).data;
  const br = ctx.getImageData(w - 3, h - 3, 1, 1).data;
  const isOpaqueRect = [tl[3], tr[3], bl[3], br[3]].every((a) => a > 235);
  const cornerHex = tl[3] > 60 ? rgbToHex(tl[0], tl[1], tl[2]) : '#ffffff';
  return { isOpaqueRect, cornerHex };
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
      c.width = Math.max(1, Math.round((img.naturalWidth || 512) * scale));
      c.height = Math.max(1, Math.round((img.naturalHeight || 512) * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);

      const assetId = uid('img');
      const thumbC = downsampleCanvas(c, 64);
      imageAssetStore.set(assetId, { canvas: c, thumbUrl: thumbC.toDataURL('image/png') });

      const { isOpaqueRect, cornerHex } = detectCornerInfo(c);
      const cleanName = file.name.replace(/\.[^.]+$/, '') || 'Dropped Image';

      // Remove untouched default starter symbol when user drops their first image
      // (even if they already clicked presets or sliders!)
      state.layers = state.layers.filter((l) => !l.isStarter);

      const newLayer = {
        id: uid('layer'),
        type: 'image',
        name: cleanName,
        visible: true,
        assetId,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        cornerRadius: 0,
        fitMode: isOpaqueRect ? 'fullBleed' : 'glyph',
        shadow: { enabled: !isOpaqueRect, blur: 24, opacity: 0.35, offsetY: 12 },
        glassEffect: false,
        removeBg: { enabled: false, color: cornerHex, tolerance: 28 },
      };

      state.layers.push(newLayer);
      state.selectedLayerId = newLayer.id;
      state.showHandles = true;
      pushHistory();
      syncAllUI();
      renderAll();
      showToast(
        isOpaqueRect
          ? `Added "${cleanName}" in Fill Squircle mode`
          : `Added "${cleanName}" as Floating Glyph`
      );
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function autoTrimSelectedImage() {
  const layer = getSelectedLayer();
  if (!layer || layer.type !== 'image') return;
  const asset = imageAssetStore.get(layer.assetId);
  if (!asset) return;

  const src = getProcessedImageCanvas(layer);
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    showToast('Image appears fully transparent');
    return;
  }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const trimmed = document.createElement('canvas');
  trimmed.width = cw;
  trimmed.height = ch;
  trimmed.getContext('2d').drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);

  const newAssetId = uid('img');
  imageAssetStore.set(newAssetId, {
    canvas: trimmed,
    thumbUrl: downsampleCanvas(trimmed, 64).toDataURL('image/png'),
  });
  layer.assetId = newAssetId;
  if (layer.removeBg) layer.removeBg.enabled = false;
  layer._cachedKey = null;
  layer._cachedCanvas = null;
  layer.x = 0;
  layer.y = 0;
  pushHistory();
  syncLayersUI();
  renderAll();
  showToast('Trimmed transparent padding & centered');
}

function extractGradientFromSelectedImage() {
  const layer = getSelectedLayer();
  if (!layer || layer.type !== 'image') return;
  const asset = imageAssetStore.get(layer.assetId);
  if (!asset) return;

  const thumb = downsampleCanvas(asset.canvas, 48);
  const d = thumb.getContext('2d').getImageData(0, 0, 48, 48).data;
  const buckets = new Map();

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 120) continue;
    const r = Math.round(d[i] / 28) * 28;
    const g = Math.round(d[i + 1] / 28) * 28;
    const b = Math.round(d[i + 2] / 28) * 28;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const weight = 1 + sat / 30;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + weight);
  }

  const sorted = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k.split(',').map(Number));

  if (sorted.length === 0) {
    showToast('No opaque colors found to extract');
    return;
  }

  const picked = [sorted[0]];
  for (const cand of sorted) {
    const farEnough = picked.every(
      (p) => Math.hypot(p[0] - cand[0], p[1] - cand[1], p[2] - cand[2]) > 65
    );
    if (farEnough) {
      picked.push(cand);
      if (picked.length === 3) break;
    }
  }

  if (picked.length === 1) {
    const [r, g, b] = picked[0];
    picked.push([Math.max(0, r - 45), Math.max(0, g - 45), Math.max(0, b - 45)]);
  }

  state.appearance = 'default';
  state.activePresetId = null;
  state.background.type = 'linear';
  state.background.angle = 155;
  state.background.stops = picked.map((rgb, i) => ({
    color: rgbToHex(rgb[0], rgb[1], rgb[2]),
    pos: Math.round((i / (picked.length - 1)) * 100),
  }));

  pushHistory();
  syncAllUI();
  renderAll();
  showToast('Matched background gradient to artwork');
}

// ==========================================
// On-Canvas Direct Manipulation (Drag, Scale, Rotate, Snap)
// ==========================================

let isDragging = false;
let dragMode = null; // 'move' | 'scale' | 'rotate'
let dragStart = { px: 0, py: 0, lx: 0, ly: 0, scale: 1, rot: 0, dist: 1, angle: 0 };

function clientToCanvas1024(e) {
  const rect = el.overlayCanvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * HIG.CANVAS_SIZE,
    y: ((e.clientY - rect.top) / rect.height) * HIG.CANVAS_SIZE,
  };
}

function pointToLayerLocal(pt, layer) {
  const S = HIG.CANVAS_SIZE;
  const cx = S / 2 + (layer.x || 0);
  const cy = S / 2 + (layer.y || 0);
  const rot = (-(layer.rotation || 0) * Math.PI) / 180;
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  return {
    lx: dx * Math.cos(rot) - dy * Math.sin(rot),
    ly: dx * Math.sin(rot) + dy * Math.cos(rot),
  };
}

function hitTestLayerHandles(pt, layer) {
  if (!layer || !layer.visible) return null;
  const box = getLayerBoxAndHandles(layer);
  const { lx, ly } = pointToLayerLocal(pt, layer);

  // 1. Check top rotation handle (generous 46px hit radius in 1024-space)
  if (state.showHandles && Math.hypot(lx - box.mx, ly - box.rotY) < 46) {
    return { mode: 'rotate', handle: 'rotate', cursor: 'crosshair' };
  }

  // 2. Check 8 resize handles (4 corners + 4 midpoints) — check corners first!
  if (state.showHandles) {
    const ordered = [
      ...box.handles.filter((h) => h.isCorner),
      ...box.handles.filter((h) => !h.isCorner),
    ];
    for (const hPos of ordered) {
      if (Math.hypot(lx - hPos.x, ly - hPos.y) < 46) {
        return { mode: 'scale', handle: hPos.id, cursor: hPos.cursor };
      }
    }
  }

  // 3. Check inside layer bounding box
  if (lx >= box.x1 - 20 && lx <= box.x2 + 20 && ly >= box.y1 - 20 && ly <= box.y2 + 20) {
    return { mode: 'move', handle: 'move', cursor: 'grab' };
  }

  return null;
}

el.overlayCanvas.addEventListener('pointerdown', (e) => {
  const pt = clientToCanvas1024(e);
  let layer = getSelectedLayer();
  let hit = layer ? hitTestLayerHandles(pt, layer) : null;

  // If pointer missed the selected layer's handles & box, check other visible layers top-to-bottom
  if (!hit) {
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const candidate = state.layers[i];
      if (!candidate.visible) continue;
      const candHit = hitTestLayerHandles(pt, candidate);
      if (candHit) {
        state.selectedLayerId = candidate.id;
        state.showHandles = true;
        layer = candidate;
        hit = candHit;
        syncAllUI();
        break;
      }
    }
  }

  // If clicked outside the layer box, never hide the handles — just default to moving the active layer!
  if (!hit) {
    if (layer && layer.visible) {
      state.showHandles = true;
      hit = { mode: 'move', handle: 'move', cursor: 'grab' };
      syncAllUI();
    } else {
      return;
    }
  }

  state.showHandles = true;
  layer.isStarter = false;
  isDragging = true;
  dragMode = hit.mode;
  hoveredHandleId = hit.handle;
  el.overlayCanvas.setPointerCapture(e.pointerId);

  const cx = HIG.CANVAS_SIZE / 2 + (layer.x || 0);
  const cy = HIG.CANVAS_SIZE / 2 + (layer.y || 0);

  dragStart = {
    px: pt.x,
    py: pt.y,
    lx: layer.x || 0,
    ly: layer.y || 0,
    scale: layer.scale ?? 1,
    rot: layer.rotation || 0,
    dist: Math.max(24, Math.hypot(pt.x - cx, pt.y - cy)),
    angle: Math.atan2(pt.y - cy, pt.x - cx),
  };
  renderOverlay();
});

el.overlayCanvas.addEventListener('pointermove', (e) => {
  const layer = getSelectedLayer();
  if (!layer || !layer.visible) {
    el.overlayCanvas.style.cursor = 'default';
    return;
  }
  const pt = clientToCanvas1024(e);

  if (!isDragging) {
    const hit = hitTestLayerHandles(pt, layer);
    const nextHover = hit?.handle || null;
    el.overlayCanvas.style.cursor = hit ? hit.cursor : 'grab';
    if (nextHover !== hoveredHandleId) {
      hoveredHandleId = nextHover;
      renderOverlay();
    }
    return;
  }

  const cx = HIG.CANVAS_SIZE / 2 + dragStart.lx;
  const cy = HIG.CANVAS_SIZE / 2 + dragStart.ly;

  if (dragMode === 'move') {
    let nx = dragStart.lx + (pt.x - dragStart.px);
    let ny = dragStart.ly + (pt.y - dragStart.py);
    const snapDist = 12;
    activeSnapGuides = { x: false, y: false };
    if (Math.abs(nx) < snapDist) {
      nx = 0;
      activeSnapGuides.x = true;
    }
    if (Math.abs(ny) < snapDist) {
      ny = 0;
      activeSnapGuides.y = true;
    }
    layer.x = Math.round(nx);
    layer.y = Math.round(ny);
  } else if (dragMode === 'scale') {
    const newDist = Math.max(16, Math.hypot(pt.x - cx, pt.y - cy));
    layer.scale = Math.max(0.1, Math.min(3.0, dragStart.scale * (newDist / dragStart.dist)));
  } else if (dragMode === 'rotate') {
    const curAngle = Math.atan2(pt.y - cy, pt.x - cx);
    let deg = dragStart.rot + ((curAngle - dragStart.angle) * 180) / Math.PI;
    const nearest45 = Math.round(deg / 45) * 45;
    if (Math.abs(deg - nearest45) < 4) deg = nearest45;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    layer.rotation = Math.round(deg);
  }

  syncActiveLayerInspector();
  renderAll();
});

function endCanvasDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  activeSnapGuides = { x: false, y: false };
  try {
    if (e && e.pointerId != null) el.overlayCanvas.releasePointerCapture(e.pointerId);
  } catch (_) { }
  pushHistory();
  renderOverlay();
}

el.overlayCanvas.addEventListener('pointerup', endCanvasDrag);
el.overlayCanvas.addEventListener('pointercancel', endCanvasDrag);
el.overlayCanvas.addEventListener('pointerleave', () => {
  if (!isDragging && hoveredHandleId !== null) {
    hoveredHandleId = null;
    renderOverlay();
  }
});

el.overlayCanvas.addEventListener(
  'wheel',
  (e) => {
    const layer = getSelectedLayer();
    if (!layer || !layer.visible) return;
    e.preventDefault();
    layer.isStarter = false;
    if (e.shiftKey) {
      layer.rotation = Math.max(-180, Math.min(180, Math.round((layer.rotation || 0) + e.deltaY * 0.25)));
    } else {
      const factor = e.deltaY < 0 ? 1.04 : 0.96;
      layer.scale = Math.max(0.1, Math.min(3.0, (layer.scale ?? 1) * factor));
    }
    syncActiveLayerInspector();
    renderAll();
    pushHistoryDebounced();
  },
  { passive: false }
);

// ==========================================
// Event Listeners & Wiring
// ==========================================

function bindEvents() {
  el.iconNameInput.addEventListener('input', (e) => {
    state.iconName = e.target.value.trim() || 'AppIcon';
    document.querySelector('.dock-item-user').dataset.label = state.iconName;
    if (state.stageView === 'apps') renderAppsGridPreview();
    if (state.stageView === 'sizes') renderSizesPreview();
  });

  el.undoBtn.addEventListener('click', undo);
  el.redoBtn.addEventListener('click', redo);

  // Appearance switcher
  el.appearanceControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.appearance = btn.dataset.appearance;
    pushHistory();
    syncAllUI();
    renderAll();
  });

  el.tintColorInput.addEventListener('input', (e) => {
    state.tintColor = e.target.value;
    renderAll();
  });
  el.tintColorInput.addEventListener('change', () => pushHistory());

  // Grid, Handles & Help
  el.gridToggleBtn.addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    syncAllUI();
    renderOverlay();
  });

  if (el.handlesToggleBtn) {
    el.handlesToggleBtn.addEventListener('click', () => {
      state.showHandles = !state.showHandles;
      syncAllUI();
      renderOverlay();
    });
  }

  el.helpBtn.addEventListener('click', () => el.helpModal.classList.remove('hidden'));
  el.closeHelpBtn.addEventListener('click', () => el.helpModal.classList.add('hidden'));
  el.helpModal.addEventListener('click', (e) => {
    if (e.target === el.helpModal) el.helpModal.classList.add('hidden');
  });

  // Exports
  el.exportIcnsBtn.addEventListener('click', async () => {
    showToast('Building macOS .icns bundle…');
    renderIcon(masterExportCtx, HIG.CANVAS_SIZE, { includeGrid: false });
    const blob = await generateICNSBlob(masterExportCanvas);
    triggerDownload(blob, `${state.iconName || 'AppIcon'}.icns`);
    showToast(`Downloaded ${state.iconName || 'AppIcon'}.icns`);
  });

  el.exportIconsetBtn.addEventListener('click', async () => {
    showToast('Packing 10-size .iconset.zip…');
    renderIcon(masterExportCtx, HIG.CANVAS_SIZE, { includeGrid: false });
    const blob = await generateIconsetZipBlob(masterExportCanvas, state.iconName);
    triggerDownload(blob, `${state.iconName || 'AppIcon'}.iconset.zip`);
    showToast(`Downloaded ${state.iconName || 'AppIcon'}.iconset.zip`);
  });

  el.exportPngBtn.addEventListener('click', async () => {
    renderIcon(masterExportCtx, HIG.CANVAS_SIZE, { includeGrid: false });
    const blob = await generatePNGBlob(masterExportCanvas, 1024);
    triggerDownload(blob, `${state.iconName || 'AppIcon'}-1024.png`);
    showToast('Downloaded 1024×1024 PNG');
  });

  // File Drop & Clipboard Paste
  el.dropZone.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', (e) => {
    for (const f of e.target.files) loadImageFile(f);
    e.target.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      dragDepth++;
      el.globalDropOverlay.classList.remove('hidden');
    }
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) el.globalDropOverlay.classList.add('hidden');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.globalDropOverlay.classList.add('hidden');
    for (const f of e.dataTransfer?.files || []) loadImageFile(f);
  });

  window.addEventListener('paste', (e) => {
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) {
        loadImageFile(item.getAsFile());
      }
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.key.toLowerCase() === 'g') {
      state.showGrid = !state.showGrid;
      syncAllUI();
      renderOverlay();
      return;
    }
    if (e.key.toLowerCase() === 'h') {
      state.showHandles = !state.showHandles;
      syncAllUI();
      renderOverlay();
      return;
    }
    const layer = getSelectedLayer();
    if (!layer) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteLayerById(layer.id);
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); layer.x -= step; renderAll(); pushHistoryDebounced(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); layer.x += step; renderAll(); pushHistoryDebounced(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); layer.y -= step; renderAll(); pushHistoryDebounced(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); layer.y += step; renderAll(); pushHistoryDebounced(); }
  });

  // Quick Add Symbol / Text
  el.addSymbolBtn.addEventListener('click', () => {
    const g = VECTOR_GLYPHS[Math.floor(Math.random() * VECTOR_GLYPHS.length)];
    const layer = {
      id: uid('layer'),
      type: 'symbol',
      name: g.name,
      visible: true,
      glyphId: g.id,
      color: '#ffffff',
      silverGlass: true,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      cornerRadius: 0,
      fitMode: 'glyph',
      shadow: { enabled: true, blur: 24, opacity: 0.35, offsetY: 12 },
      glassEffect: false,
    };
    state.layers.push(layer);
    state.selectedLayerId = layer.id;
    state.showHandles = true;
    pushHistory();
    syncAllUI();
    renderAll();
  });

  el.addTextBtn.addEventListener('click', () => {
    const layer = {
      id: uid('layer'),
      type: 'text',
      name: 'Monogram',
      visible: true,
      text: 'A',
      color: '#ffffff',
      fontWeight: '700',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      cornerRadius: 0,
      fitMode: 'glyph',
      shadow: { enabled: true, blur: 22, opacity: 0.35, offsetY: 10 },
      glassEffect: false,
    };
    state.layers.push(layer);
    state.selectedLayerId = layer.id;
    state.showHandles = true;
    pushHistory();
    syncAllUI();
    renderAll();
  });

  // Layer Controls
  el.centerLayerBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.x = 0;
    layer.y = 0;
    pushHistory();
    renderAll();
    showToast('Centered layer');
  });

  el.resetLayerBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.x = 0;
    layer.y = 0;
    layer.scale = 1;
    layer.rotation = 0;
    layer.flipX = false;
    layer.flipY = false;
    layer.opacity = 1;
    layer.cornerRadius = 0;
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.fitGlyphBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.fitMode = 'glyph';
    layer.x = 0;
    layer.y = 0;
    layer.scale = 1;
    layer.shadow = { ...layer.shadow, enabled: true };
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.fitFullBleedBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.fitMode = 'fullBleed';
    layer.x = 0;
    layer.y = 0;
    layer.scale = 1;
    if (layer.type === 'image') layer.shadow = { ...layer.shadow, enabled: false };
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.autoTrimBtn.addEventListener('click', autoTrimSelectedImage);
  el.extractPaletteBtn.addEventListener('click', extractGradientFromSelectedImage);

  el.removeBgToggle.addEventListener('change', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.removeBg = layer.removeBg || { enabled: false, color: '#ffffff', tolerance: 28 };
    layer.removeBg.enabled = e.target.checked;
    layer._cachedKey = null;
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.removeBgColor.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer?.removeBg) return;
    layer.removeBg.color = e.target.value;
    layer._cachedKey = null;
    renderAll();
  });
  el.removeBgColor.addEventListener('change', pushHistory);

  el.removeBgTolerance.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer?.removeBg) return;
    layer.removeBg.tolerance = Number(e.target.value);
    el.removeBgTolVal.textContent = e.target.value;
    layer._cachedKey = null;
    renderAll();
  });
  el.removeBgTolerance.addEventListener('change', pushHistory);

  el.symbolColorInput.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.color = e.target.value;
    layer.silverGlass = false;
    layer.isStarter = false;
    el.symbolGradientToggle.checked = false;
    renderAll();
  });
  el.symbolColorInput.addEventListener('change', pushHistory);

  el.symbolGradientToggle.addEventListener('change', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.silverGlass = e.target.checked;
    layer.isStarter = false;
    pushHistory();
    renderAll();
  });

  el.textContentInput.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.text = e.target.value;
    layer.name = e.target.value || 'Text';
    syncLayersUI();
    renderAll();
  });
  el.textContentInput.addEventListener('change', pushHistory);

  el.textColorInput.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.color = e.target.value;
    renderAll();
  });
  el.textColorInput.addEventListener('change', pushHistory);

  el.textWeightSelect.addEventListener('change', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.fontWeight = e.target.value;
    pushHistory();
    renderAll();
  });

  // Transform sliders
  el.layerScaleSlider.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.scale = Number(e.target.value) / 100;
    layer.isStarter = false;
    el.layerScaleVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.layerScaleSlider.addEventListener('change', pushHistory);

  el.layerRotSlider.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.rotation = Number(e.target.value);
    layer.isStarter = false;
    el.layerRotVal.textContent = `${e.target.value}°`;
    renderAll();
  });
  el.layerRotSlider.addEventListener('change', pushHistory);

  el.layerOpacitySlider.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.opacity = Number(e.target.value) / 100;
    layer.isStarter = false;
    el.layerOpacityVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.layerOpacitySlider.addEventListener('change', pushHistory);

  el.layerRadiusSlider.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.cornerRadius = Number(e.target.value);
    layer.isStarter = false;
    el.layerRadiusVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.layerRadiusSlider.addEventListener('change', pushHistory);

  el.flipXBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.flipX = !layer.flipX;
    layer.isStarter = false;
    pushHistory();
    renderAll();
  });

  el.flipYBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.flipY = !layer.flipY;
    layer.isStarter = false;
    pushHistory();
    renderAll();
  });

  el.layerShadowToggle.addEventListener('change', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.shadow = layer.shadow || { enabled: true, blur: 24, opacity: 0.35 };
    layer.shadow.enabled = e.target.checked;
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.layerShadowSlider.addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (!layer?.shadow) return;
    layer.shadow.blur = Number(e.target.value);
    el.layerShadowVal.textContent = `${e.target.value}px`;
    renderAll();
  });
  el.layerShadowSlider.addEventListener('change', pushHistory);

  el.layerGlassToggle.addEventListener('change', (e) => {
    const layer = getSelectedLayer();
    if (!layer) return;
    layer.glassEffect = e.target.checked;
    pushHistory();
    renderAll();
  });

  // Stage view & backdrop switchers
  el.stageViewControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.stageView = btn.dataset.view;
    for (const b of el.stageViewControl.querySelectorAll('.seg-btn')) {
      b.classList.toggle('active', b === btn);
    }
    el.editorView.classList.toggle('active', state.stageView === 'editor');
    el.appsView.classList.toggle('active', state.stageView === 'apps');
    el.sizesView.classList.toggle('active', state.stageView === 'sizes');
    if (state.stageView === 'apps') renderAppsGridPreview();
    if (state.stageView === 'sizes') renderSizesPreview();
  });

  el.backdropControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.dot-pill');
    if (!btn) return;
    state.backdrop = btn.dataset.backdrop;
    for (const b of el.backdropControl.querySelectorAll('.dot-pill')) {
      b.classList.toggle('active', b === btn);
    }
    el.canvasFrame.className = `canvas-frame backdrop-${state.backdrop}`;
  });

  // Right Inspector: Presets, Background, Glass, HIG
  el.randomPresetBtn.addEventListener('click', () => {
    const p = GRADIENT_PRESETS[Math.floor(Math.random() * GRADIENT_PRESETS.length)];
    state.activePresetId = p.id;
    state.appearance = p.appearance || 'default';
    state.background = deepClone(p.background);
    state.glass = { ...state.glass, ...deepClone(p.glass) };
    pushHistory();
    syncAllUI();
    renderAll();
    showToast(`Preset: ${p.name}`);
  });

  el.reverseStopsBtn.addEventListener('click', () => {
    const colors = state.background.stops.map((s) => s.color).reverse();
    state.background.stops.forEach((s, i) => (s.color = colors[i]));
    pushHistory();
    renderStopsList();
    renderAll();
  });

  el.bgTypeControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.background.type = btn.dataset.bgtype;
    state.activePresetId = null;
    pushHistory();
    syncAllUI();
    renderAll();
  });

  el.bgAngleSlider.addEventListener('input', (e) => {
    state.background.angle = Number(e.target.value);
    el.bgAngleVal.textContent = `${e.target.value}°`;
    renderAll();
  });
  el.bgAngleSlider.addEventListener('change', pushHistory);

  el.addStopBtn.addEventListener('click', () => {
    if (state.background.stops.length >= 6) {
      showToast('Maximum 6 gradient stops');
      return;
    }
    const last = state.background.stops[state.background.stops.length - 1];
    state.background.stops.push({ color: last?.color || '#7c3aed', pos: 100 });
    pushHistory();
    renderStopsList();
    renderAll();
  });

  el.resetGlassBtn.addEventListener('click', () => {
    state.glass = { sheen: 0.34, rimIntensity: 0.88, rimWidth: 5, innerGlow: 0.42, noise: 0.04 };
    pushHistory();
    syncAllUI();
    renderAll();
  });

  el.rimIntensitySlider.addEventListener('input', (e) => {
    state.glass.rimIntensity = Number(e.target.value) / 100;
    el.rimIntensityVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.rimIntensitySlider.addEventListener('change', pushHistory);

  el.rimWidthSlider.addEventListener('input', (e) => {
    state.glass.rimWidth = Number(e.target.value);
    el.rimWidthVal.textContent = `${Number(e.target.value).toFixed(1)}px`;
    renderAll();
  });
  el.rimWidthSlider.addEventListener('change', pushHistory);

  el.glassSheenSlider.addEventListener('input', (e) => {
    state.glass.sheen = Number(e.target.value) / 100;
    el.glassSheenVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.glassSheenSlider.addEventListener('change', pushHistory);

  el.innerGlowSlider.addEventListener('input', (e) => {
    state.glass.innerGlow = Number(e.target.value) / 100;
    el.innerGlowVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.innerGlowSlider.addEventListener('change', pushHistory);

  el.bgNoiseSlider.addEventListener('input', (e) => {
    state.glass.noise = Number(e.target.value) / 100;
    el.bgNoiseVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.bgNoiseSlider.addEventListener('change', pushHistory);

  el.resetHigBtn.addEventListener('click', () => {
    state.hig = { cornerRadius: HIG.CORNER_RADIUS, smoothing: 0.6, outerShadow: true };
    pushHistory();
    syncAllUI();
    renderAll();
    showToast('Restored Apple HIG 824×824 (R185.4) spec');
  });

  el.cornerRadiusSlider.addEventListener('input', (e) => {
    state.hig.cornerRadius = Number(e.target.value);
    el.cornerRadiusVal.textContent = `${Number(e.target.value).toFixed(1)}px`;
    renderAll();
  });
  el.cornerRadiusSlider.addEventListener('change', pushHistory);

  el.smoothingSlider.addEventListener('input', (e) => {
    state.hig.smoothing = Number(e.target.value) / 100;
    el.smoothingVal.textContent = `${e.target.value}%`;
    renderAll();
  });
  el.smoothingSlider.addEventListener('change', pushHistory);

  el.outerShadowToggle.addEventListener('change', (e) => {
    state.hig.outerShadow = e.target.checked;
    pushHistory();
    renderAll();
  });
}

// Boot
bindEvents();
pushHistory();
syncAllUI();
renderAll();
