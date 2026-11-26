/**
 * macOS 26 (Tahoe) Liquid Glass Presets, Mesh Palettes & Vector Glyphs
 */

export const GRADIENT_PRESETS = [
  {
    id: 'golden-gate-27',
    name: 'Golden Gate 27',
    category: 'macOS 27',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 150,
      stops: [
        { color: '#ff6b4a', pos: 0 },
        { color: '#f02e46', pos: 48 },
        { color: '#3b1548', pos: 100 },
      ],
    },
    glass: { sheen: 0.14, rimIntensity: 0.94, rimWidth: 3.5, innerGlow: 0.28 },
  },
  {
    id: 'apple-intel-27',
    name: 'Intelligence 27',
    category: 'macOS 27',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 135,
      stops: [
        { color: '#58b9ff', pos: 0 },
        { color: '#a855f7', pos: 38 },
        { color: '#ff5d8f', pos: 72 },
        { color: '#ff9a3c', pos: 100 },
      ],
    },
    glass: { sheen: 0.16, rimIntensity: 0.96, rimWidth: 3.5, innerGlow: 0.32 },
  },
  {
    id: 'bay-fog-27',
    name: 'Bay Fog 27',
    category: 'macOS 27',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 165,
      stops: [
        { color: '#eef6ff', pos: 0 },
        { color: '#9ec5eb', pos: 52 },
        { color: '#456b96', pos: 100 },
      ],
    },
    glass: { sheen: 0.16, rimIntensity: 0.94, rimWidth: 3.5, innerGlow: 0.3 },
  },
  {
    id: 'clear-dark-27',
    name: 'Clear Dark 27',
    category: 'macOS 27',
    appearance: 'clear-dark',
    background: {
      type: 'linear',
      angle: 145,
      stops: [
        { color: '#2b3242', pos: 0 },
        { color: '#10131c', pos: 100 },
      ],
    },
    glass: { sheen: 0.18, rimIntensity: 0.92, rimWidth: 3.5, innerGlow: 0.38 },
  },
  {
    id: 'tahoe-glass',
    name: 'Tahoe Crystal',
    category: 'Liquid Glass',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 145,
      stops: [
        { color: '#7ce8ff', pos: 0 },
        { color: '#2b7fff', pos: 48 },
        { color: '#152c9e', pos: 100 },
      ],
    },
    glass: { sheen: 0.34, rimIntensity: 0.88, rimWidth: 5, innerGlow: 0.42 },
  },
  {
    id: 'mail-sky',
    name: 'Mail Sky',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#39b6ff', pos: 0 },
        { color: '#1472ff', pos: 100 },
      ],
    },
    glass: { sheen: 0.26, rimIntensity: 0.78, rimWidth: 4.5, innerGlow: 0.32 },
  },
  {
    id: 'books-amber',
    name: 'Books Sunset',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#ffae2b', pos: 0 },
        { color: '#ff5d14', pos: 100 },
      ],
    },
    glass: { sheen: 0.28, rimIntensity: 0.78, rimWidth: 4.5, innerGlow: 0.32 },
  },
  {
    id: 'facetime-emerald',
    name: 'FaceTime Mint',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#5eff78', pos: 0 },
        { color: '#0dc43b', pos: 100 },
      ],
    },
    glass: { sheen: 0.28, rimIntensity: 0.76, rimWidth: 4.5, innerGlow: 0.3 },
  },
  {
    id: 'podcasts-violet',
    name: 'Podcasts Iris',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#d878ff', pos: 0 },
        { color: '#7a25d6', pos: 100 },
      ],
    },
    glass: { sheen: 0.3, rimIntensity: 0.82, rimWidth: 4.5, innerGlow: 0.35 },
  },
  {
    id: 'journal-twilight',
    name: 'Journal Dusk',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 155,
      stops: [
        { color: '#5c73f2', pos: 0 },
        { color: '#8b3dff', pos: 50 },
        { color: '#151736', pos: 100 },
      ],
    },
    glass: { sheen: 0.28, rimIntensity: 0.85, rimWidth: 5, innerGlow: 0.4 },
  },
  {
    id: 'preview-aura',
    name: 'Preview Prism',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 135,
      stops: [
        { color: '#7ef3ff', pos: 0 },
        { color: '#6ab4ff', pos: 35 },
        { color: '#ff89d6', pos: 70 },
        { color: '#586cff', pos: 100 },
      ],
    },
    glass: { sheen: 0.38, rimIntensity: 0.9, rimWidth: 5, innerGlow: 0.45 },
  },
  {
    id: 'music-crimson',
    name: 'Music Coral',
    category: 'Apple Apps',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 170,
      stops: [
        { color: '#ff5d78', pos: 0 },
        { color: '#fa233b', pos: 55 },
        { color: '#c40f2a', pos: 100 },
      ],
    },
    glass: { sheen: 0.3, rimIntensity: 0.8, rimWidth: 4.5, innerGlow: 0.35 },
  },
  {
    id: 'clear-frost',
    name: 'Clear Glass',
    category: 'Liquid Glass',
    appearance: 'clear',
    background: {
      type: 'linear',
      angle: 145,
      stops: [
        { color: '#ffffff', pos: 0 },
        { color: '#d8ecff', pos: 100 },
      ],
    },
    glass: { sheen: 0.52, rimIntensity: 0.96, rimWidth: 6, innerGlow: 0.58 },
  },
  {
    id: 'obsidian-pro',
    name: 'Obsidian Metal',
    category: 'Dark',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#3b3e47', pos: 0 },
        { color: '#1b1d22', pos: 55 },
        { color: '#0d0e11', pos: 100 },
      ],
    },
    glass: { sheen: 0.25, rimIntensity: 0.72, rimWidth: 4.5, innerGlow: 0.36 },
  },
  {
    id: 'shortcuts-neon',
    name: 'Shortcuts Pop',
    category: 'Vibrant',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 135,
      stops: [
        { color: '#ff5ca8', pos: 0 },
        { color: '#3b82f6', pos: 50 },
        { color: '#1c1642', pos: 100 },
      ],
    },
    glass: { sheen: 0.32, rimIntensity: 0.85, rimWidth: 5, innerGlow: 0.42 },
  },
  {
    id: 'siri-mercury',
    name: 'Mercury Pearl',
    category: 'Liquid Glass',
    appearance: 'default',
    background: {
      type: 'radial',
      angle: 145,
      stops: [
        { color: '#f8fafc', pos: 0 },
        { color: '#cbd5e1', pos: 55 },
        { color: '#64748b', pos: 100 },
      ],
    },
    glass: { sheen: 0.44, rimIntensity: 0.92, rimWidth: 5, innerGlow: 0.48 },
  },
  {
    id: 'paper-ceramic',
    name: 'Clean Ceramic',
    category: 'Light',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#ffffff', pos: 0 },
        { color: '#e9eef6', pos: 100 },
      ],
    },
    glass: { sheen: 0.35, rimIntensity: 0.95, rimWidth: 5, innerGlow: 0.3 },
  },
  {
    id: 'terminal-matrix',
    name: 'Terminal Carbon',
    category: 'Dark',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#272a30', pos: 0 },
        { color: '#0f1013', pos: 100 },
      ],
    },
    glass: { sheen: 0.22, rimIntensity: 0.68, rimWidth: 4.5, innerGlow: 0.32 },
  },
  {
    id: 'aurora-borealis',
    name: 'Tahoe Aurora',
    category: 'Vibrant',
    appearance: 'default',
    background: {
      type: 'mesh',
      angle: 140,
      stops: [
        { color: '#2bf2b5', pos: 0 },
        { color: '#38bdf8', pos: 45 },
        { color: '#6366f1', pos: 80 },
        { color: '#091124', pos: 100 },
      ],
    },
    glass: { sheen: 0.36, rimIntensity: 0.88, rimWidth: 5, innerGlow: 0.45 },
  },
  {
    id: 'rose-gold',
    name: 'Rose Quartz',
    category: 'Vibrant',
    appearance: 'default',
    background: {
      type: 'linear',
      angle: 145,
      stops: [
        { color: '#ffc2d1', pos: 0 },
        { color: '#ff6b9d', pos: 50 },
        { color: '#b5179e', pos: 100 },
      ],
    },
    glass: { sheen: 0.35, rimIntensity: 0.86, rimWidth: 5, innerGlow: 0.4 },
  },
];

/**
 * Crisp SF-style vector glyphs rendered onto SVG paths (24x24 viewBox)
 * so users can design icons from scratch even without dropping an image.
 */
export const VECTOR_GLYPHS = [
  {
    id: 'sparkle',
    name: 'AI Sparkle',
    viewBox: '0 0 24 24',
    paths: [
      'M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z',
      'M19 3L19.9 5.1L22 6L19.9 6.9L19 9L18.1 6.9L16 6L18.1 5.1L19 3Z',
    ],
  },
  {
    id: 'rocket',
    name: 'Launch',
    viewBox: '0 0 24 24',
    paths: [
      'M13.5 3C16.8 3 19.8 4.4 21 6C20.2 9.2 18.2 12.6 15.2 15.6L14 16.8L14.5 20.3L11.3 18.2L9.5 16.4L7.6 14.5L5.8 12.7L3.7 9.5L7.2 10L8.4 8.8C11.4 5.8 13.5 3 13.5 3ZM15.5 7.5A1.5 1.5 0 1 0 15.5 10.5A1.5 1.5 0 1 0 15.5 7.5Z',
      'M6.2 16.2L4.2 19.8L7.8 17.8L6.2 16.2Z',
    ],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    viewBox: '0 0 24 24',
    paths: [
      'M4 5H20A2 2 0 0 1 22 7V17A2 2 0 0 1 20 19H4A2 2 0 0 1 2 17V7A2 2 0 0 1 4 5ZM6.7 9.3L5.3 10.7L8.6 14L5.3 17.3L6.7 18.7L11.4 14L6.7 9.3ZM12 16V18H18V16H12Z',
    ],
  },
  {
    id: 'camera',
    name: 'Lens',
    viewBox: '0 0 24 24',
    paths: [
      'M9 4L7.2 6H4A2 2 0 0 0 2 8V18A2 2 0 0 0 4 20H20A2 2 0 0 0 22 18V8A2 2 0 0 0 20 6H16.8L15 4H9ZM12 9A4 4 0 1 1 12 17A4 4 0 1 1 12 9Z',
    ],
  },
  {
    id: 'music',
    name: 'Note',
    viewBox: '0 0 24 24',
    paths: [
      'M19 3L9 5.5V15.55A3.5 3.5 0 1 0 11 18.7V9.4L17 7.9V13.55A3.5 3.5 0 1 0 19 16.7V3Z',
    ],
  },
  {
    id: 'bolt',
    name: 'Flash',
    viewBox: '0 0 24 24',
    paths: [
      'M13.5 2L4 14H11.5L10.5 22L20 10H12.5L13.5 2Z',
    ],
  },
  {
    id: 'compass',
    name: 'Explore',
    viewBox: '0 0 24 24',
    paths: [
      'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2ZM16.2 7.8L13.8 13.8L7.8 16.2L10.2 10.2L16.2 7.8ZM12 11A1 1 0 1 0 12 13A1 1 0 1 0 12 11Z',
    ],
  },
  {
    id: 'folder',
    name: 'Folder',
    viewBox: '0 0 24 24',
    paths: [
      'M3 5A2 2 0 0 1 5 3H9.2L11.2 5.5H19A2 2 0 0 1 21 7.5V18A2 2 0 0 1 19 20H5A2 2 0 0 1 3 18V5Z',
    ],
  },
  {
    id: 'layers',
    name: 'Layers',
    viewBox: '0 0 24 24',
    paths: [
      'M12 3L2 8.5L12 14L22 8.5L12 3ZM2 12.5L12 18L22 12.5L20 11.4L12 15.8L4 11.4L2 12.5ZM2 16.5L12 22L22 16.5L20 15.4L12 19.8L4 15.4L2 16.5Z',
    ],
  },
  {
    id: 'shield',
    name: 'Shield',
    viewBox: '0 0 24 24',
    paths: [
      'M12 2L4 5.5V11.2C4 16.4 7.4 21.1 12 22.5C16.6 21.1 20 16.4 20 11.2V5.5L12 2ZM10.8 15.8L7.5 12.5L8.9 11.1L10.8 13L15.1 8.7L16.5 10.1L10.8 15.8Z',
    ],
  },
  {
    id: 'heart',
    name: 'Heart',
    viewBox: '0 0 24 24',
    paths: [
      'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z',
    ],
  },
  {
    id: 'cloud',
    name: 'Cloud',
    viewBox: '0 0 24 24',
    paths: [
      'M6.5 19H18.5A4.5 4.5 0 0 0 19.2 10.05A6 6 0 0 0 7.6 8.3A4.5 4.5 0 0 0 6.5 19Z',
    ],
  },
  {
    id: 'sliders',
    name: 'Controls',
    viewBox: '0 0 24 24',
    paths: [
      'M4 7H14V5H4V7ZM18 7H20V5H18V7ZM16 4A2 2 0 1 0 16 8A2 2 0 1 0 16 4ZM4 13H6V11H4V13ZM10 13H20V11H10V13ZM8 10A2 2 0 1 0 8 14A2 2 0 1 0 8 10ZM4 19H14V17H4V19ZM18 19H20V17H18V19ZM16 16A2 2 0 1 0 16 20A2 2 0 1 0 16 16Z',
    ],
  },
  {
    id: 'cube',
    name: '3D Cube',
    viewBox: '0 0 24 24',
    paths: [
      'M12 2L3 7V17L12 22L21 17V7L12 2ZM12 4.3L18.4 7.8L12 11.4L5.6 7.8L12 4.3ZM5 9.6L11 13V19.6L5 16.2V9.6ZM13 19.6V13L19 9.6V16.2L13 19.6Z',
    ],
  },
  {
    id: 'bell',
    name: 'Alerts',
    viewBox: '0 0 24 24',
    paths: [
      'M12 2A2 2 0 0 0 10 4A7 7 0 0 0 5 10.7V16L3 18V19H21V18L19 16V10.7A7 7 0 0 0 14 4A2 2 0 0 0 12 2ZM10 20A2 2 0 0 0 14 20H10Z',
    ],
  },
  {
    id: 'wand',
    name: 'Magic',
    viewBox: '0 0 24 24',
    paths: [
      'M3.3 18.7L14.6 7.4L16.6 9.4L5.3 20.7L3.3 18.7ZM16 6L17.4 4.6L19.4 6.6L18 8L16 6ZM11 2L11.7 4.3L14 5L11.7 5.7L11 8L10.3 5.7L8 5L10.3 4.3L11 2ZM20 11L20.7 13.3L23 14L20.7 14.7L20 17L19.3 14.7L17 14L19.3 13.3L20 11Z',
    ],
  },
  {
    id: 'code',
    name: 'Code',
    viewBox: '0 0 24 24',
    paths: [
      'M8.3 16.7L3.6 12L8.3 7.3L6.9 5.9L0.8 12L6.9 18.1L8.3 16.7ZM15.7 16.7L20.4 12L15.7 7.3L17.1 5.9L23.2 12L17.1 18.1L15.7 16.7ZM13.6 5L9.4 19H11.5L15.7 5H13.6Z',
    ],
  },
  {
    id: 'globe',
    name: 'Web',
    viewBox: '0 0 24 24',
    paths: [
      'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2ZM12 4C13.7 4 15.2 6.2 15.7 9H8.3C8.8 6.2 10.3 4 12 4ZM4.3 10H6.3C6.1 10.6 6 11.3 6 12C6 12.7 6.1 13.4 6.3 14H4.3C4.1 13.4 4 12.7 4 12C4 11.3 4.1 10.6 4.3 10ZM8.3 15H15.7C15.2 17.8 13.7 20 12 20C10.3 20 8.8 17.8 8.3 15ZM17.7 14C17.9 13.4 18 12.7 18 12C18 11.3 17.9 10.6 17.7 10H19.7C19.9 10.6 20 11.3 20 12C20 12.7 19.9 13.4 19.7 14H17.7Z',
    ],
  },
  {
    id: 'bookmark',
    name: 'Bookmark',
    viewBox: '0 0 24 24',
    paths: [
      'M6 3A2 2 0 0 0 4 5V21L12 17.5L20 21V5A2 2 0 0 0 18 3H6Z',
    ],
  },
  {
    id: 'play',
    name: 'Media',
    viewBox: '0 0 24 24',
    paths: [
      'M7 4.5V19.5L19.5 12L7 4.5Z',
    ],
  },
];

export const TINT_ACCENTS = [
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Mint', color: '#10b981' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Coral', color: '#f43f5e' },
  { name: 'Purple', color: '#a855f7' },
  { name: 'Silver', color: '#cbd5e1' },
];
