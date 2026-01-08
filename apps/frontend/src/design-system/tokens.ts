// Design System Tokens - Jamie Oliver Recipe App

export const colors = {
  // Primary Brand Colors
  primary: {
    DEFAULT: '#46BEA8',
    light: '#81EB67',
    dark: '#327179',
    glow: '#48C6B1',
  },
  
  // Secondary Colors
  secondary: {
    yellow: '#F0FF17',
    orange: '#F0B100',
  },
  
  // Status Colors
  status: {
    success: '#81EB67',
    warning: '#F0B100',
    error: '#EF4444',
    info: '#46BEA8',
  },
  
  // Difficulty Badges
  difficulty: {
    easy: '#81EB67',
    medium: '#F0B100',
    hard: '#EF4444',
  },
  
  // Cuisine Badges
  cuisine: {
    background: 'rgba(3, 2, 19, 0.9)',
    text: '#FFFFFF',
  },
  
  // Neutrals
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#5D5D5D',
    700: '#404040',
    800: '#262626',
    900: '#0A0A0A',
    950: '#030213',
  },
  
  // Overlays
  overlay: {
    light: 'rgba(0, 0, 0, 0.2)',
    medium: 'rgba(0, 0, 0, 0.5)',
    dark: 'rgba(0, 0, 0, 0.7)',
  },
  
  // Backgrounds
  background: {
    primary: '#FFFFFF',
    secondary: '#F5F5F5',
    card: '#FFFFFF',
  },
} as const;

export const typography = {
  fonts: {
    display: "'Work Sans', sans-serif",
    body: "'Inter', sans-serif",
    system: "'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  
  sizes: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
  },
  
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
} as const;

export const borderRadius = {
  none: '0',
  sm: '3px',
  md: '8px',
  lg: '16px',
  xl: '25px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  glow: '0 0 40px rgba(70, 190, 168, 0.3)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
} as const;
