import {
  HIG,
  traceAppleSquircle,
  traceMacFolderBack,
  traceMacFolderPaper,
  traceMacFolderFront,
  drawHIGGrid,
} from './squircle.js?v=11';
import { GRADIENT_PRESETS, VECTOR_GLYPHS } from './presets.js?v=11';
import {
  generateICNSBlob,
  generateIconsetZipBlob,
  generatePNGBlob,
  downsampleCanvas,
  triggerDownload,
} from './exporters.js?v=11';

// Pasteboard is 3072x3072 (3x the 1024x1024 icon) with the icon centered at (1024, 1024),
// giving a full 1024px of open interactive space outside the icon on all 4 sides!
const PASTEBOARD_SIZE = 3072;
const PASTEBOARD_OFFSET = 1024;
let stageZoom = 1.0;

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
const initialPreset = GRADIENT_PRESETS.find((p) => p.id === 'golden-gate-27') || GRADIENT_PRESETS[0];
let state = {
  iconName: 'AppIcon',
  shapeMode: 'app', // 'app' | 'folder'
  folder: {
    badgeStyle: 'engraved', // 'engraved' | 'frosted' | 'normal'
    showPaper: true, // macOS 27 folders always show the crisp white document strip by default
  },
  appearance: 'default', // 'default' | 'dark' | 'clear' | 'clear-dark' | 'tinted'
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
    canvasTarget: 'squircle', // 'squircle' (824px + shadow) | 'fullcanvas' (1024px Xcode 27 unmasked)
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
    shapeMode: state.shapeMode,
    folder: state.folder,
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
  state.shapeMode = data.shapeMode || 'app';
  state.folder = data.folder || { badgeStyle: 'engraved', showPaper: false };
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
  pasteboardWrap: document.getElementById('pasteboardWrap'),
  canvasFrame: document.getElementById('canvasFrame'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  zoomResetBtn: document.getElementById('zoomResetBtn'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  iconNameInput: document.getElementById('iconNameInput'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  iconShapeModeControl: document.getElementById('iconShapeModeControl'),
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
  fitFullBleedLabel: document.getElementById('fitFullBleedLabel'),
  folderToolsBox: document.getElementById('folderToolsBox'),
  folderBadgeStyleControl: document.getElementById('folderBadgeStyleControl'),
  folderPaperToggle: document.getElementById('folderPaperToggle'),
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
  glass27Btn: document.getElementById('glass27Btn'),
  resetGlassBtn: document.getElementById('resetGlassBtn'),
  canvasTargetControl: document.getElementById('canvasTargetControl'),
  squircleGeometryControls: document.getElementById('squircleGeometryControls'),
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
 * Always fits inside a 620x620 box at scale=1 so all 4 corners are visible inside the canvas.
 */
function getLayerBaseDimensions(layer) {
  if (layer.type === 'image') {
    const asset = imageAssetStore.get(layer.assetId);
    if (!asset) return { w: 480, h: 480 };
    const iw = asset.canvas.width;
    const ih = asset.canvas.height;
    const maxGlyph = 600;
    const containScale = Math.min(maxGlyph / iw, maxGlyph / ih);
    return { w: iw * containScale, h: ih * containScale };
  }
  if (layer.type === 'symbol') {
    return { w: 460, h: 460 };
  }
  return { w: 480, h: 480 };
}

function getLayerScaledSize(layer) {
  const { w, h } = getLayerBaseDimensions(layer);
  const sx = layer.scaleX ?? layer.scale ?? 1;
  const sy = layer.scaleY ?? layer.scale ?? 1;
  return {
    baseW: w,
    baseH: h,
    scaleX: sx,
    scaleY: sy,
    sw: Math.max(16, w * sx),
    sh: Math.max(16, h * sy),
  };
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
 * Renders the complete macOS 26/27 App Squircle or Liquid Glass Folder onto targetCtx.
 */
function renderIcon(targetCtx, targetSize = HIG.CANVAS_SIZE, opts = {}) {
  if (state.shapeMode === 'folder') {
    renderFolderIcon(targetCtx, targetSize, opts);
    return;
  }

  const { includeGrid = false } = opts;
  const S = HIG.CANVAS_SIZE; // 1024
  const isFullCanvas = state.hig.canvasTarget === 'fullcanvas';
  const M = isFullCanvas ? 0 : HIG.MARGIN; // 0 for Xcode 27 full-bleed, 100 for macOS squircle
  const Q = isFullCanvas ? S : HIG.SQUIRCLE_SIZE; // 1024 or 824
  const C = S / 2; // 512
  const radius = isFullCanvas ? 0 : state.hig.cornerRadius;
  const smoothing = state.hig.smoothing;

  targetCtx.save();
  targetCtx.clearRect(0, 0, targetSize, targetSize);
  const ratio = targetSize / S;
  targetCtx.scale(ratio, ratio);

  // 1. Apple HIG Outer Drop Shadow (skipped in Xcode 27 unmasked full-bleed mode)
  if (!isFullCanvas && state.hig.outerShadow) {
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

/**
 * Renders an authentic macOS 27 (Golden Gate) Folder Icon matching Apple's native .icns geometry:
 * - Horizontal bounds: x = 42 .. 982 (width = 940px)
 * - Back panel & top-left S-curve tab: y = 134 .. 884 (tab top y=134, shoulder y=201, r=68px)
 * - White inner paper strip (on by default): x = 73 .. 951 (w=878px), y = 232 .. 340, r=42px, #ffffff
 * - Front pocket: x = 42 .. 982 (w=940px), y = 269 .. 888 (h=619px), top r=72px, bottom r=64px
 * - Soft top highlight lip (y=269..285) and exact 0.855x tonal debossed engraving for folder badges.
 */
function renderFolderIcon(targetCtx, targetSize = HIG.CANVAS_SIZE, opts = {}) {
  const S = HIG.CANVAS_SIZE; // 1024
  const C = S / 2; // 512

  targetCtx.save();
  targetCtx.clearRect(0, 0, targetSize, targetSize);
  const ratio = targetSize / S;
  targetCtx.scale(ratio, ratio);

  // 1. Apple macOS 27 Folder Outer Drop Shadow (Y +10, Blur 22, 38% opacity + subtle ambient)
  if (state.hig.outerShadow) {
    const shadowTemp = document.createElement('canvas');
    shadowTemp.width = S;
    shadowTemp.height = S;
    const stx = shadowTemp.getContext('2d');

    stx.save();
    stx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    stx.shadowOffsetX = 0;
    stx.shadowOffsetY = 10;
    stx.shadowBlur = 22;
    traceMacFolderBack(stx);
    stx.fillStyle = '#000';
    stx.fill();
    traceMacFolderFront(stx);
    stx.fill();
    stx.restore();

    stx.save();
    stx.shadowColor = 'rgba(0, 0, 0, 0.16)';
    stx.shadowOffsetX = 0;
    stx.shadowOffsetY = 2;
    stx.shadowBlur = 8;
    traceMacFolderBack(stx);
    stx.fillStyle = '#000';
    stx.fill();
    traceMacFolderFront(stx);
    stx.fill();
    stx.restore();

    // Knock out interior so Clear modes stay translucent
    stx.save();
    stx.globalCompositeOperation = 'destination-out';
    traceMacFolderBack(stx);
    stx.fill();
    traceMacFolderFront(stx);
    stx.fill();
    stx.restore();

    targetCtx.drawImage(shadowTemp, 0, 0);
  }

  // 2. Back Panel & Top-Left S-Curve Tab (x: 42..982, y: 134..884)
  targetCtx.save();
  traceMacFolderBack(targetCtx);
  targetCtx.clip();

  renderBackground(targetCtx, 42, 134, 940, 750);

  // Shade back panel ~14% deeper than front pocket (matching folder2.png: 92,191,236 -> 69,175,225)
  const backShade = targetCtx.createLinearGradient(42, 134, 42, 240);
  backShade.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
  backShade.addColorStop(0.15, 'rgba(0, 0, 0, 0.15)');
  backShade.addColorStop(1, 'rgba(0, 0, 0, 0.21)');
  targetCtx.fillStyle = backShade;
  targetCtx.fillRect(42, 134, 940, 750);

  // Soft 10px top highlight bevel along the tab top (y=134) and shoulder top (y=201)
  targetCtx.save();
  traceMacFolderBack(targetCtx);
  const tabBevel = targetCtx.createLinearGradient(0, 134, 0, 225);
  tabBevel.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  tabBevel.addColorStop(0.45, 'rgba(255, 255, 255, 0.32)');
  tabBevel.addColorStop(1, 'rgba(255, 255, 255, 0)');
  targetCtx.strokeStyle = tabBevel;
  targetCtx.lineWidth = 10;
  targetCtx.stroke();
  targetCtx.restore();

  targetCtx.restore();

  // 3. Crisp White Inner Paper Strip (x: 73..951, y: 232..352, R: 42px) — on by default in macOS 27
  if (state.folder?.showPaper !== false) {
    targetCtx.save();
    traceMacFolderBack(targetCtx);
    targetCtx.clip();

    targetCtx.save();
    targetCtx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    targetCtx.shadowBlur = 6;
    targetCtx.shadowOffsetY = -1;
    traceMacFolderPaper(targetCtx);
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fill();
    targetCtx.restore();

    targetCtx.restore();
  }

  // 4. Front Pocket (x: 42..982, y: 269..888, w: 940px, h: 619px)
  targetCtx.save();
  traceMacFolderFront(targetCtx);
  targetCtx.clip();

  renderBackground(targetCtx, 42, 269, 940, 619);

  if (state.glass.noise > 0.002) {
    targetCtx.save();
    targetCtx.globalAlpha = state.glass.noise * 0.5;
    targetCtx.fillStyle = getNoisePattern(targetCtx);
    targetCtx.fillRect(42, 269, 940, 619);
    targetCtx.restore();
  }

  // Exact macOS 27 Front Pocket Top Lip Highlight (y = 269..286 smooth 16px top bevel, no dark groove)
  targetCtx.save();
  const topLip = targetCtx.createLinearGradient(42, 269, 42, 287);
  topLip.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
  topLip.addColorStop(0.35, 'rgba(255, 255, 255, 0.18)');
  topLip.addColorStop(1, 'rgba(255, 255, 255, 0)');
  targetCtx.fillStyle = topLip;
  targetCtx.fillRect(42, 269, 940, 20);

  // Subtle bottom cushion shading (y = 865..888)
  const botLip = targetCtx.createLinearGradient(42, 864, 42, 888);
  botLip.addColorStop(0, 'rgba(0, 0, 0, 0)');
  botLip.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  targetCtx.fillStyle = botLip;
  targetCtx.fillRect(42, 864, 940, 24);
  targetCtx.restore();

  // Foreground Layers rendered on the Front Pocket
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    renderLayer(targetCtx, layer, C);
  }

  // Subtle edge rim on Front Pocket
  if (state.glass.rimIntensity > 0.01) {
    targetCtx.save();
    traceMacFolderFront(targetCtx);
    const pocketRim = targetCtx.createLinearGradient(42, 269, 42, 888);
    pocketRim.addColorStop(0, `rgba(255, 255, 255, ${(state.glass.rimIntensity * 0.55).toFixed(3)})`);
    pocketRim.addColorStop(0.15, `rgba(255, 255, 255, ${(state.glass.rimIntensity * 0.12).toFixed(3)})`);
    pocketRim.addColorStop(0.85, 'rgba(0, 0, 0, 0.04)');
    pocketRim.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    targetCtx.strokeStyle = pocketRim;
    targetCtx.lineWidth = Math.max(3, state.glass.rimWidth);
    targetCtx.stroke();
    targetCtx.restore();
  }

  targetCtx.restore(); // end front pocket clip
  targetCtx.restore();
}

function renderBackground(ctx, x, y, w, h) {
  const app = state.appearance;

  if (app === 'clear') {
    const grad = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    grad.addColorStop(0, 'rgba(248, 252, 255, 0.36)');
    grad.addColorStop(0.5, 'rgba(220, 236, 255, 0.16)');
    grad.addColorStop(1, 'rgba(185, 210, 248, 0.26)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (app === 'clear-dark') {
    const grad = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    grad.addColorStop(0, 'rgba(46, 54, 72, 0.52)');
    grad.addColorStop(0.5, 'rgba(22, 26, 36, 0.36)');
    grad.addColorStop(1, 'rgba(10, 12, 18, 0.55)');
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
  const { sw, sh, scaleY } = getLayerScaledSize(layer);
  const drawW = Math.max(4, sw);
  const drawH = Math.max(4, sh);
  const scale = Math.max(0.05, scaleY);

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

  // Apply macOS 27 Folder Badge style (Engraved Tonal Glass or Frosted Glass) when in Folder Mode
  const isFolderEngraved = state.shapeMode === 'folder' && state.folder?.badgeStyle === 'engraved';
  const isFolderFrosted = state.shapeMode === 'folder' && state.folder?.badgeStyle === 'frosted';

  if (isFolderEngraved) {
    // Exact macOS 27 debossed tonal engraving (measured from folder1.png: 14.5% darker than pocket
    // at every Y coordinate, with a soft 2px top inner shadow and 2px bottom white catch-light).
    // 1. Tonal 14.5% dark recessed fill (lets the exact pocket gradient show through at 0.855x brightness!)
    tctx.save();
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = 'rgba(0, 0, 0, 0.148)';
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();

    // 2. Top inner recess shadow (debossed top edge)
    const innerSh = document.createElement('canvas');
    innerSh.width = tw;
    innerSh.height = th;
    const istx = innerSh.getContext('2d');
    istx.drawImage(temp, 0, 0);
    istx.globalCompositeOperation = 'destination-out';
    istx.drawImage(temp, 0, 2.5);
    istx.globalCompositeOperation = 'source-in';
    istx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    istx.fillRect(0, 0, tw, th);

    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.drawImage(innerSh, 0, 0);
    tctx.restore();

    // 3. Bottom edge catch-light highlight
    const botRim = document.createElement('canvas');
    botRim.width = tw;
    botRim.height = th;
    const brtx = botRim.getContext('2d');
    brtx.drawImage(temp, 0, 0);
    brtx.globalCompositeOperation = 'destination-out';
    brtx.drawImage(temp, 0, -2.5);
    brtx.globalCompositeOperation = 'source-in';
    brtx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    brtx.fillRect(0, 0, tw, th);

    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.drawImage(botRim, 0, 0);
    tctx.restore();
  } else if (isFolderFrosted) {
    tctx.save();
    tctx.globalCompositeOperation = 'source-in';
    const frostGrad = tctx.createLinearGradient(0, pad, 0, pad + drawH);
    frostGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    frostGrad.addColorStop(1, 'rgba(225, 240, 255, 0.64)');
    tctx.fillStyle = frostGrad;
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();
  }

  // Apply macOS 27 Foreground Liquid Glass Rim & refraction highlight if enabled
  if (layer.glassEffect && !isFolderEngraved) {
    // 1. Subtle glass surface sheen across the glyph
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    const glassGrad = tctx.createLinearGradient(0, pad, 0, pad + drawH);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
    glassGrad.addColorStop(0.38, 'rgba(255, 255, 255, 0.04)');
    glassGrad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
    tctx.fillStyle = glassGrad;
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();

    // 2. Crisp macOS 27 directional top-left specular edge highlight around the layer's alpha silhouette
    const rimC = document.createElement('canvas');
    rimC.width = tw;
    rimC.height = th;
    const rctx = rimC.getContext('2d');
    rctx.drawImage(temp, 0, 0);
    rctx.globalCompositeOperation = 'destination-out';
    rctx.drawImage(temp, 3, 3.5);
    rctx.globalCompositeOperation = 'source-in';
    const rimFill = rctx.createLinearGradient(pad, pad, pad + drawW, pad + drawH);
    rimFill.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    rimFill.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)');
    rimFill.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
    rctx.fillStyle = rimFill;
    rctx.fillRect(0, 0, tw, th);

    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.drawImage(rimC, 0, 0);
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
  } else if (state.appearance === 'clear' || state.appearance === 'clear-dark') {
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    const cg = tctx.createLinearGradient(0, pad, 0, pad + drawH);
    cg.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
    cg.addColorStop(1, state.appearance === 'clear-dark' ? 'rgba(180, 210, 255, 0.55)' : 'rgba(215, 232, 255, 0.72)');
    tctx.fillStyle = cg;
    tctx.globalAlpha = 0.76;
    tctx.fillRect(0, 0, tw, th);
    tctx.restore();
  }

  // Draw onto main canvas with transforms + optional 3D elevation shadow
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
  ctx.translate(center + (layer.x || 0), center + (layer.y || 0));
  ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
  ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);

  if (layer.shadow && layer.shadow.enabled && layer.shadow.blur > 0 && !isFolderEngraved) {
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
let isTransformActive = true;

function getPhotoshopHandles(sw, sh) {
  return [
    { id: 'nw', sx: -1, sy: -1, x: -sw / 2, y: -sh / 2, cursor: 'nwse-resize' },
    { id: 'n', sx: 0, sy: -1, x: 0, y: -sh / 2, cursor: 'ns-resize' },
    { id: 'ne', sx: 1, sy: -1, x: sw / 2, y: -sh / 2, cursor: 'nesw-resize' },
    { id: 'e', sx: 1, sy: 0, x: sw / 2, y: 0, cursor: 'ew-resize' },
    { id: 'se', sx: 1, sy: 1, x: sw / 2, y: sh / 2, cursor: 'nwse-resize' },
    { id: 's', sx: 0, sy: 1, x: 0, y: sh / 2, cursor: 'ns-resize' },
    { id: 'sw', sx: -1, sy: 1, x: -sw / 2, y: sh / 2, cursor: 'nesw-resize' },
    { id: 'w', sx: -1, sy: 0, x: -sw / 2, y: 0, cursor: 'ew-resize' },
  ];
}

function renderOverlay() {
  const S = HIG.CANVAS_SIZE;
  overlayCtx.clearRect(0, 0, PASTEBOARD_SIZE, PASTEBOARD_SIZE);

  overlayCtx.save();
  // Translate so (0, 0)..(1024, 1024) maps to the center 1024x1024 icon frame,
  // while (-512..-1536) is the surrounding pasteboard!
  overlayCtx.translate(PASTEBOARD_OFFSET, PASTEBOARD_OFFSET);

  if (state.showGrid) {
    if (state.shapeMode === 'folder') {
      overlayCtx.save();
      traceMacFolderBack(overlayCtx);
      overlayCtx.strokeStyle = 'rgba(56, 217, 255, 0.55)';
      overlayCtx.lineWidth = 2.5;
      overlayCtx.stroke();
      traceMacFolderFront(overlayCtx, state.hig.smoothing);
      overlayCtx.strokeStyle = 'rgba(255, 115, 215, 0.65)';
      overlayCtx.lineWidth = 2.5;
      overlayCtx.stroke();
      overlayCtx.restore();
    } else {
      drawHIGGrid(overlayCtx, S, {
        smoothing: state.hig.smoothing,
        radiusRatio: state.hig.cornerRadius / HIG.SQUIRCLE_SIZE,
      });
    }
  }

  // Snap guides while dragging
  if (isDragging && (activeSnapGuides.x || activeSnapGuides.y)) {
    overlayCtx.save();
    overlayCtx.strokeStyle = '#ffcf40';
    overlayCtx.lineWidth = 2;
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

  // Photoshop-style Free Transform box: shown whenever a layer is selected (isTransformActive)
  const layer = getSelectedLayer();
  if (!layer || !layer.visible || !isTransformActive) {
    overlayCtx.restore();
    return;
  }

  const { sw, sh } = getLayerScaledSize(layer);
  const cx = S / 2 + (layer.x || 0);
  const cy = S / 2 + (layer.y || 0);
  const rot = ((layer.rotation || 0) * Math.PI) / 180;

  // Draw a subtle 24% opacity Photoshop/Figma "crop ghost" of the active image outside the icon/folder pocket
  if (layer.type === 'image') {
    const imgCanvas = getProcessedImageCanvas(layer);
    if (imgCanvas) {
      overlayCtx.save();
      overlayCtx.beginPath();
      overlayCtx.rect(-PASTEBOARD_OFFSET, -PASTEBOARD_OFFSET, PASTEBOARD_SIZE, PASTEBOARD_SIZE);
      if (state.shapeMode === 'folder') {
        traceMacFolderFront(overlayCtx, state.hig.smoothing);
      } else {
        traceAppleSquircle(
          overlayCtx,
          HIG.MARGIN,
          HIG.MARGIN,
          HIG.SQUIRCLE_SIZE,
          HIG.SQUIRCLE_SIZE,
          state.hig.cornerRadius,
          state.hig.smoothing
        );
      }
      overlayCtx.clip('evenodd');

      overlayCtx.globalAlpha = 0.24 * (layer.opacity ?? 1);
      overlayCtx.translate(cx, cy);
      overlayCtx.rotate(rot);
      overlayCtx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      overlayCtx.drawImage(imgCanvas, -sw / 2, -sh / 2, sw, sh);
      overlayCtx.restore();
    }
  }

  overlayCtx.save();
  overlayCtx.translate(cx, cy);
  overlayCtx.rotate(rot);

  // Subtle dark outer line + crisp Photoshop cyan-blue 2px transform frame
  overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  overlayCtx.lineWidth = 4;
  overlayCtx.strokeRect(-sw / 2, -sh / 2, sw, sh);

  overlayCtx.strokeStyle = '#18a0fb';
  overlayCtx.lineWidth = 2.25;
  overlayCtx.strokeRect(-sw / 2, -sh / 2, sw, sh);

  // Rotation stem & top handle
  overlayCtx.beginPath();
  overlayCtx.moveTo(0, -sh / 2);
  overlayCtx.lineTo(0, -sh / 2 - 36);
  overlayCtx.stroke();

  // Crisp Photoshop square anchor points
  const hs = 15;
  for (const h of getPhotoshopHandles(sw, sh)) {
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.strokeStyle = '#18a0fb';
    overlayCtx.lineWidth = 2.5;
    overlayCtx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    overlayCtx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
  }

  // Top rotation circle
  overlayCtx.beginPath();
  overlayCtx.arc(0, -sh / 2 - 38, 8.5, 0, Math.PI * 2);
  overlayCtx.fillStyle = '#ffffff';
  overlayCtx.fill();
  overlayCtx.lineWidth = 2.5;
  overlayCtx.strokeStyle = '#18a0fb';
  overlayCtx.stroke();

  overlayCtx.restore();
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

const SOLID_SWATCHES = [
  { name: 'Pure White', color: '#ffffff' },
  { name: 'Light Gray', color: '#e5e7eb' },
  { name: 'Dark Slate', color: '#1c1e26' },
  { name: 'Pure Black', color: '#000000' },
  { name: 'Apple Blue', color: '#007aff' },
  { name: 'Sky Cyan', color: '#00c7be' },
  { name: 'Apple Green', color: '#34c759' },
  { name: 'Warm Yellow', color: '#ffcc00' },
  { name: 'Apple Orange', color: '#ff9500' },
  { name: 'Apple Red', color: '#ff3b30' },
  { name: 'Apple Pink', color: '#ff2d55' },
  { name: 'Apple Purple', color: '#af52de' },
];

function renderStopsList() {
  el.stopsList.innerHTML = '';

  // Dedicated Solid Color UI when background type is 'solid'
  if (state.background.type === 'solid') {
    if (!state.background.stops.length) {
      state.background.stops = [{ color: '#1472ff', pos: 0 }];
    }
    const primaryStop = state.background.stops[0];

    const box = document.createElement('div');
    box.className = 'solid-color-box';

    const mainRow = document.createElement('div');
    mainRow.className = 'solid-main-row';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = primaryStop.color;

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'solid-hex-input';
    hexInput.value = primaryStop.color;
    hexInput.maxLength = 7;
    hexInput.spellcheck = false;

    const applySolidColor = (hex, commit = false) => {
      primaryStop.color = hex;
      colorInput.value = hex;
      hexInput.value = hex;
      state.activePresetId = null;
      for (const sb of box.querySelectorAll('.solid-swatch-btn')) {
        sb.classList.toggle('active', sb.dataset.color.toLowerCase() === hex.toLowerCase());
      }
      renderAll();
      if (commit) {
        pushHistory();
        renderPresetsGrid();
      }
    };

    colorInput.addEventListener('input', (e) => applySolidColor(e.target.value, false));
    colorInput.addEventListener('change', (e) => applySolidColor(e.target.value, true));

    hexInput.addEventListener('input', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = `#${val}`;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        primaryStop.color = val.toLowerCase();
        colorInput.value = primaryStop.color;
        state.activePresetId = null;
        renderAll();
      }
    });
    hexInput.addEventListener('change', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = `#${val}`;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        applySolidColor(val.toLowerCase(), true);
      } else {
        hexInput.value = primaryStop.color;
      }
    });

    mainRow.append(colorInput, hexInput);

    const swatchGrid = document.createElement('div');
    swatchGrid.className = 'solid-swatches-grid';
    for (const sw of SOLID_SWATCHES) {
      const btn = document.createElement('button');
      btn.className = `solid-swatch-btn ${sw.color.toLowerCase() === primaryStop.color.toLowerCase() ? 'active' : ''
        }`;
      btn.style.background = sw.color;
      btn.dataset.color = sw.color;
      btn.title = `${sw.name} (${sw.color})`;
      btn.addEventListener('click', () => applySolidColor(sw.color, true));
      swatchGrid.appendChild(btn);
    }

    // Toggle for pure flat color vs glass sheen overlay
    const flatRow = document.createElement('label');
    flatRow.className = 'switch-label';
    const flatCheck = document.createElement('input');
    flatCheck.type = 'checkbox';
    flatCheck.checked = state.glass.sheen <= 0.01 && state.glass.innerGlow <= 0.01;
    flatCheck.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.glass.sheen = 0;
        state.glass.innerGlow = 0;
      } else {
        state.glass.sheen = 0.26;
        state.glass.innerGlow = 0.32;
      }
      pushHistory();
      syncAllUI();
      renderAll();
    });
    const flatText = document.createElement('span');
    flatText.textContent = 'Pure Flat Color (No Glass Sheen)';
    flatRow.append(flatCheck, flatText);

    box.append(mainRow, swatchGrid, flatRow);
    el.stopsList.appendChild(box);
    return;
  }

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
      isTransformActive = true;
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
  // Shape mode (App Squircle vs Folder)
  const isFolder = state.shapeMode === 'folder';
  if (el.iconShapeModeControl) {
    for (const btn of el.iconShapeModeControl.querySelectorAll('.seg-btn')) {
      btn.classList.toggle('active', btn.dataset.shapemode === state.shapeMode);
    }
  }
  if (el.folderToolsBox) {
    el.folderToolsBox.classList.toggle('hidden', !isFolder);
  }
  if (el.fitFullBleedLabel) {
    el.fitFullBleedLabel.textContent = isFolder ? 'Fill Folder' : 'Fill Squircle';
  }
  if (el.folderBadgeStyleControl && state.folder) {
    for (const btn of el.folderBadgeStyleControl.querySelectorAll('.seg-btn')) {
      btn.classList.toggle('active', btn.dataset.badgestyle === state.folder.badgeStyle);
    }
  }
  if (el.folderPaperToggle && state.folder) {
    el.folderPaperToggle.checked = Boolean(state.folder.showPaper);
  }

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
  const isSolid = state.background.type === 'solid';
  for (const btn of el.bgTypeControl.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.bgtype === state.background.type);
  }
  const showAngle =
    state.background.type === 'linear' ||
    state.background.type === 'conic' ||
    state.background.type === 'mesh';
  el.bgAngleRow.classList.toggle('hidden', !showAngle);
  el.addStopBtn.classList.toggle('hidden', isSolid);
  el.reverseStopsBtn.classList.toggle('hidden', isSolid);
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

  // HIG sliders & Target mode
  const targetMode = state.hig.canvasTarget || 'squircle';
  if (el.canvasTargetControl) {
    for (const btn of el.canvasTargetControl.querySelectorAll('.seg-btn')) {
      btn.classList.toggle('active', btn.dataset.target === targetMode);
    }
  }
  if (el.squircleGeometryControls) {
    el.squircleGeometryControls.style.opacity = targetMode === 'fullcanvas' ? '0.42' : '1';
    el.squircleGeometryControls.style.pointerEvents = targetMode === 'fullcanvas' ? 'none' : 'auto';
  }
  if (el.glass27Btn && el.resetGlassBtn) {
    const is27 = state.glass.sheen <= 0.19 && state.glass.rimWidth <= 4.0;
    el.glass27Btn.classList.toggle('active', is27);
    el.resetGlassBtn.classList.toggle('active', !is27);
  }
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
      state.layers = state.layers.filter((l) => !l.isStarter);

      // Fit uploaded image cleanly inside the 824x824 squircle so all 4 corners are always visible on-canvas
      const isNearSquare = Math.abs(c.width - c.height) / Math.max(c.width, c.height) < 0.08;
      const initialScale = isOpaqueRect ? (isNearSquare ? 824 / 600 : 760 / 600) : 1;

      const newLayer = {
        id: uid('layer'),
        type: 'image',
        name: cleanName,
        visible: true,
        assetId,
        x: 0,
        y: state.shapeMode === 'folder' ? 60 : 0,
        scale: initialScale,
        scaleX: initialScale,
        scaleY: initialScale,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        cornerRadius: 0,
        fitMode: isOpaqueRect && isNearSquare ? 'fullBleed' : 'glyph',
        shadow: { enabled: !isOpaqueRect, blur: 24, opacity: 0.35, offsetY: 12 },
        glassEffect: false,
        removeBg: { enabled: false, color: cornerHex, tolerance: 28 },
      };

      // If dropping a full-color opaque image onto a folder, default badgeStyle to 'normal' (Full Color)
      if (state.shapeMode === 'folder' && isOpaqueRect) {
        state.folder.badgeStyle = 'normal';
      }

      state.layers.push(newLayer);
      state.selectedLayerId = newLayer.id;
      isTransformActive = true;
      pushHistory();
      syncAllUI();
      renderAll();
      showToast(`Added "${cleanName}" — drag corners to resize`);
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
// Photoshop-Style Free Transform (Select, Move, Corner/Edge Scale, Rotate)
// ==========================================

let isDragging = false;
let dragMode = null; // 'move' | 'scale' | 'rotate'
let dragStart = null;

function clientToCanvas1024(e) {
  const rect = el.overlayCanvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * PASTEBOARD_SIZE;
  const py = ((e.clientY - rect.top) / rect.height) * PASTEBOARD_SIZE;
  return {
    x: px - PASTEBOARD_OFFSET,
    y: py - PASTEBOARD_OFFSET,
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

function hitTestLayerHandles(pt, layer, includeHandles = true) {
  if (!layer || !layer.visible) return null;
  const { sw, sh } = getLayerScaledSize(layer);
  const { lx, ly } = pointToLayerLocal(pt, layer);

  if (includeHandles) {
    // 1. Top rotation handle
    if (Math.hypot(lx, ly - (-sh / 2 - 36)) < 30) {
      return { mode: 'rotate', cursor: 'crosshair' };
    }

    // 2. 8 Photoshop square handles (check 4 corners first, then 4 sides)
    const handles = getPhotoshopHandles(sw, sh);
    const ordered = [
      ...handles.filter((h) => h.sx !== 0 && h.sy !== 0),
      ...handles.filter((h) => h.sx === 0 || h.sy === 0),
    ];
    for (const h of ordered) {
      if (Math.max(Math.abs(lx - h.x), Math.abs(ly - h.y)) < 26) {
        return { mode: 'scale', handle: h, cursor: h.cursor };
      }
    }
  }

  // 3. Inside layer bounding box -> move
  if (Math.abs(lx) <= sw / 2 && Math.abs(ly) <= sh / 2) {
    return { mode: 'move', cursor: 'move' };
  }

  return null;
}

el.overlayCanvas.addEventListener('pointerdown', (e) => {
  const pt = clientToCanvas1024(e);
  let layer = getSelectedLayer();

  // 1. Check active layer (including transform handles if transform box is currently visible)
  let hit = layer ? hitTestLayerHandles(pt, layer, isTransformActive) : null;

  // 2. If missed active layer, check all visible layers top-to-bottom
  if (!hit) {
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const candidate = state.layers[i];
      if (!candidate.visible) continue;
      const candHit = hitTestLayerHandles(pt, candidate, false);
      if (candHit) {
        state.selectedLayerId = candidate.id;
        layer = candidate;
        hit = candHit;
        syncAllUI();
        break;
      }
    }
  }

  // 3. Clicked empty space outside all layers -> deselect transform box (just like Photoshop!)
  if (!hit) {
    if (isTransformActive) {
      isTransformActive = false;
      renderOverlay();
    }
    return;
  }

  // Activate transform box & start drag
  isTransformActive = true;
  layer.isStarter = false;
  isDragging = true;
  dragMode = hit.mode;
  el.overlayCanvas.setPointerCapture(e.pointerId);

  const { baseW, baseH, scaleX, scaleY, sw, sh } = getLayerScaledSize(layer);
  const cx0 = HIG.CANVAS_SIZE / 2 + (layer.x || 0);
  const cy0 = HIG.CANVAS_SIZE / 2 + (layer.y || 0);
  const rotRad = ((layer.rotation || 0) * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  // Opposite corner/edge anchor point in world space for Photoshop-accurate resizing
  const sx = hit.handle?.sx ?? 0;
  const sy = hit.handle?.sy ?? 0;
  const fixedLocalX = (-sx * sw) / 2;
  const fixedLocalY = (-sy * sh) / 2;
  const fixedWorldX = cx0 + fixedLocalX * cosR - fixedLocalY * sinR;
  const fixedWorldY = cy0 + fixedLocalX * sinR + fixedLocalY * cosR;

  dragStart = {
    px: pt.x,
    py: pt.y,
    lx: layer.x || 0,
    ly: layer.y || 0,
    cx0,
    cy0,
    baseW,
    baseH,
    scaleX0: scaleX,
    scaleY0: scaleY,
    sw0: sw,
    sh0: sh,
    sx,
    sy,
    fixedWorldX,
    fixedWorldY,
    rot0: layer.rotation || 0,
    rotRad,
    cosR,
    sinR,
    angle0: Math.atan2(pt.y - cy0, pt.x - cx0),
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
    const hit = hitTestLayerHandles(pt, layer, isTransformActive);
    el.overlayCanvas.style.cursor = hit ? hit.cursor : 'default';
    return;
  }

  if (dragMode === 'move') {
    let nx = dragStart.lx + (pt.x - dragStart.px);
    let ny = dragStart.ly + (pt.y - dragStart.py);
    const snapDist = 10;
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
    const {
      cx0, cy0, baseW, baseH, sw0, sh0, sx, sy,
      fixedWorldX, fixedWorldY, cosR, sinR,
    } = dragStart;

    const fromCenter = e.altKey;
    const freeAspect = e.shiftKey || sx === 0 || sy === 0;

    if (fromCenter) {
      // Alt/Option held: scale symmetrically around center (cx0, cy0)
      const dx = pt.x - cx0;
      const dy = pt.y - cy0;
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      let newW = sx !== 0 ? Math.max(24, Math.abs(localX) * 2) : sw0;
      let newH = sy !== 0 ? Math.max(24, Math.abs(localY) * 2) : sh0;

      if (!freeAspect) {
        const factor = Math.max(0.08, Math.min(4.0, (newW * sw0 + newH * sh0) / (sw0 * sw0 + sh0 * sh0)));
        newW = sw0 * factor;
        newH = sh0 * factor;
      }
      layer.scaleX = Math.max(0.08, Math.min(4.0, newW / baseW));
      layer.scaleY = Math.max(0.08, Math.min(4.0, newH / baseH));
      layer.scale = (layer.scaleX + layer.scaleY) / 2;
      layer.x = Math.round(cx0 - HIG.CANVAS_SIZE / 2);
      layer.y = Math.round(cy0 - HIG.CANVAS_SIZE / 2);
    } else {
      // Standard Photoshop behavior: anchor opposite corner/edge so dragged handle follows cursor 1:1
      const dx = pt.x - fixedWorldX;
      const dy = pt.y - fixedWorldY;
      const spanX = dx * cosR + dy * sinR;
      const spanY = -dx * sinR + dy * cosR;

      let newW = sx !== 0 ? Math.max(24, sx * spanX) : sw0;
      let newH = sy !== 0 ? Math.max(24, sy * spanY) : sh0;

      if (!freeAspect) {
        const factor = Math.max(0.08, Math.min(4.0, (newW * sw0 + newH * sh0) / (sw0 * sw0 + sh0 * sh0)));
        newW = sw0 * factor;
        newH = sh0 * factor;
      }

      layer.scaleX = Math.max(0.08, Math.min(4.0, newW / baseW));
      layer.scaleY = Math.max(0.08, Math.min(4.0, newH / baseH));
      layer.scale = (layer.scaleX + layer.scaleY) / 2;

      const offsetLocalX = (sx * (baseW * layer.scaleX)) / 2;
      const offsetLocalY = (sy * (baseH * layer.scaleY)) / 2;
      const newCx = fixedWorldX + offsetLocalX * cosR - offsetLocalY * sinR;
      const newCy = fixedWorldY + offsetLocalX * sinR + offsetLocalY * cosR;
      layer.x = Math.round(newCx - HIG.CANVAS_SIZE / 2);
      layer.y = Math.round(newCy - HIG.CANVAS_SIZE / 2);
    }
  } else if (dragMode === 'rotate') {
    const curAngle = Math.atan2(pt.y - dragStart.cy0, pt.x - dragStart.cx0);
    let deg = dragStart.rot0 + ((curAngle - dragStart.angle0) * 180) / Math.PI;
    if (e.shiftKey) {
      deg = Math.round(deg / 15) * 15;
    } else {
      const nearest45 = Math.round(deg / 45) * 45;
      if (Math.abs(deg - nearest45) < 4) deg = nearest45;
    }
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

function setStageZoom(nextZoom) {
  stageZoom = Math.max(0.45, Math.min(1.5, Math.round(nextZoom * 20) / 20));
  if (el.pasteboardWrap) {
    el.pasteboardWrap.style.setProperty('--stage-zoom', String(stageZoom));
  }
  if (el.zoomResetBtn) {
    el.zoomResetBtn.textContent = `${Math.round(stageZoom * 100)}%`;
  }
}

el.overlayCanvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      setStageZoom(stageZoom + (e.deltaY < 0 ? 0.1 : -0.1));
      return;
    }
    const layer = getSelectedLayer();
    if (!layer || !layer.visible) return;
    layer.isStarter = false;
    isTransformActive = true;
    if (e.shiftKey) {
      layer.rotation = Math.max(-180, Math.min(180, Math.round((layer.rotation || 0) + e.deltaY * 0.25)));
    } else {
      const factor = e.deltaY < 0 ? 1.04 : 0.96;
      const nextS = Math.max(0.1, Math.min(3.5, (layer.scale ?? 1) * factor));
      layer.scale = nextS;
      layer.scaleX = Math.max(0.1, Math.min(3.5, (layer.scaleX ?? layer.scale) * factor));
      layer.scaleY = Math.max(0.1, Math.min(3.5, (layer.scaleY ?? layer.scale) * factor));
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

  if (el.zoomOutBtn) el.zoomOutBtn.addEventListener('click', () => setStageZoom(stageZoom - 0.15));
  if (el.zoomResetBtn) el.zoomResetBtn.addEventListener('click', () => setStageZoom(1.0));
  if (el.zoomInBtn) el.zoomInBtn.addEventListener('click', () => setStageZoom(stageZoom + 0.15));

  // App vs Folder shape mode switcher
  if (el.iconShapeModeControl) {
    el.iconShapeModeControl.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      const nextMode = btn.dataset.shapemode;
      if (nextMode === state.shapeMode) return;
      state.shapeMode = nextMode;

      // Center active layer vertically on the folder front pocket (y = +60) or app center (y = 0)
      const activeLayer = getSelectedLayer();
      if (activeLayer) {
        if (nextMode === 'folder' && activeLayer.y === 0) {
          activeLayer.y = 60;
          if (activeLayer.fitMode !== 'fullBleed' && activeLayer.scale > 0.78) {
            activeLayer.scale = 0.72;
            activeLayer.scaleX = 0.72;
            activeLayer.scaleY = 0.72;
          }
        } else if (nextMode === 'app' && activeLayer.y === 60) {
          activeLayer.y = 0;
          if (activeLayer.scale === 0.72) {
            activeLayer.scale = 1;
            activeLayer.scaleX = 1;
            activeLayer.scaleY = 1;
          }
        }
        // If active layer is a full-color opaque image, use Full Color mode on folder; for symbols/text use Engraved
        if (nextMode === 'folder') {
          if (activeLayer.type === 'image') {
            const asset = imageAssetStore.get(activeLayer.assetId);
            const isOpaque = asset ? detectCornerInfo(asset.canvas).isOpaqueRect : false;
            state.folder.badgeStyle = isOpaque ? 'normal' : 'engraved';
          } else {
            state.folder.badgeStyle = 'engraved';
          }
        }
      }

      // If still on initial Golden Gate preset, switch to iconic macOS Folder Sky Blue when entering Folder mode
      if (nextMode === 'folder' && state.activePresetId === 'golden-gate-27') {
        const folderBlue = GRADIENT_PRESETS.find((p) => p.id === 'folder-sky-27');
        if (folderBlue) {
          state.activePresetId = folderBlue.id;
          state.background = deepClone(folderBlue.background);
          state.glass = { ...state.glass, ...deepClone(folderBlue.glass) };
        }
      }

      pushHistory();
      syncAllUI();
      renderAll();
      showToast(
        nextMode === 'folder'
          ? 'Switched to macOS 27 Liquid Glass Folder mode'
          : 'Switched to macOS App Squircle mode'
      );
    });
  }

  if (el.folderBadgeStyleControl) {
    el.folderBadgeStyleControl.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.folder.badgeStyle = btn.dataset.badgestyle;
      pushHistory();
      syncAllUI();
      renderAll();
    });
  }

  if (el.folderPaperToggle) {
    el.folderPaperToggle.addEventListener('change', (e) => {
      state.folder.showPaper = e.target.checked;
      pushHistory();
      renderAll();
    });
  }

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
    if (e.key === 'Escape' || e.key === 'Enter') {
      isTransformActive = false;
      renderOverlay();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
      e.preventDefault();
      isTransformActive = !isTransformActive;
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
    layer.y = state.shapeMode === 'folder' ? 60 : 0;
    pushHistory();
    renderAll();
    showToast('Centered layer');
  });

  el.resetLayerBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    const s = state.shapeMode === 'folder' ? 0.72 : 1;
    layer.x = 0;
    layer.y = state.shapeMode === 'folder' ? 60 : 0;
    layer.scale = s;
    layer.scaleX = s;
    layer.scaleY = s;
    layer.rotation = 0;
    layer.flipX = false;
    layer.flipY = false;
    layer.opacity = 1;
    layer.cornerRadius = 0;
    isTransformActive = true;
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.fitGlyphBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    const s = state.shapeMode === 'folder' ? 0.72 : 1;
    layer.fitMode = 'glyph';
    layer.x = 0;
    layer.y = state.shapeMode === 'folder' ? 60 : 0;
    layer.scale = s;
    layer.scaleX = s;
    layer.scaleY = s;
    layer.shadow = { ...layer.shadow, enabled: true };
    isTransformActive = true;
    pushHistory();
    syncActiveLayerInspector();
    renderAll();
  });

  el.fitFullBleedBtn.addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) return;
    const { w, h } = getLayerBaseDimensions(layer);
    const targetW = state.shapeMode === 'folder' ? 940 : HIG.SQUIRCLE_SIZE;
    const targetH = state.shapeMode === 'folder' ? 619 : HIG.SQUIRCLE_SIZE;
    const fillScale = Math.max(targetW / w, targetH / h);
    layer.fitMode = 'fullBleed';
    layer.x = 0;
    layer.y = state.shapeMode === 'folder' ? 66 : 0;
    layer.scale = fillScale;
    layer.scaleX = fillScale;
    layer.scaleY = fillScale;
    if (layer.type === 'image') {
      layer.shadow = { ...layer.shadow, enabled: false };
      if (state.shapeMode === 'folder') state.folder.badgeStyle = 'normal';
    }
    isTransformActive = true;
    pushHistory();
    syncAllUI();
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
    const s = Number(e.target.value) / 100;
    layer.scale = s;
    layer.scaleX = s;
    layer.scaleY = s;
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
    const prevType = state.background.type;
    state.background.type = btn.dataset.bgtype;
    state.activePresetId = null;

    if (state.background.type === 'solid') {
      // Ensure appearance is 'default' and turn off top gradient sheen so solid color is truly solid
      if (state.appearance !== 'default') state.appearance = 'default';
      state._savedGlassBeforeSolid = {
        sheen: state.glass.sheen,
        innerGlow: state.glass.innerGlow,
      };
      state.glass.sheen = 0;
      state.glass.innerGlow = 0;
    } else if (prevType === 'solid' && state._savedGlassBeforeSolid) {
      if (state.glass.sheen === 0 && state.glass.innerGlow === 0) {
        state.glass.sheen = state._savedGlassBeforeSolid.sheen ?? 0.3;
        state.glass.innerGlow = state._savedGlassBeforeSolid.innerGlow ?? 0.36;
      }
    }

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

  if (el.glass27Btn) {
    el.glass27Btn.addEventListener('click', () => {
      state.glass = { sheen: 0.14, rimIntensity: 0.94, rimWidth: 3.5, innerGlow: 0.28, noise: 0.03 };
      pushHistory();
      syncAllUI();
      renderAll();
      showToast('Applied macOS 27 Golden Gate crisp Liquid Glass profile');
    });
  }

  el.resetGlassBtn.addEventListener('click', () => {
    state.glass = { sheen: 0.34, rimIntensity: 0.88, rimWidth: 5, innerGlow: 0.42, noise: 0.04 };
    pushHistory();
    syncAllUI();
    renderAll();
    showToast('Applied macOS 26 Tahoe classic Liquid Glass profile');
  });

  if (el.canvasTargetControl) {
    el.canvasTargetControl.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.hig.canvasTarget = btn.dataset.target;
      pushHistory();
      syncAllUI();
      renderAll();
      showToast(
        state.hig.canvasTarget === 'fullcanvas'
          ? 'Xcode 27 Full-Bleed mode (unmasked 1024×1024 for Icon Composer)'
          : 'Finder Squircle mode (824×824 squircle + 100px shadow margin)'
      );
    });
  }

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
    state.hig = {
      canvasTarget: 'squircle',
      cornerRadius: HIG.CORNER_RADIUS,
      smoothing: 0.6,
      outerShadow: true,
    };
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
