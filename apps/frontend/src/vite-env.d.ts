/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  // Add other env variables here as needed
}

// Support for figma:asset imports
declare module 'figma:asset/*.png' {
  const src: string;
  export default src;
}

declare module 'figma:asset/*.jpg' {
  const src: string;
  export default src;
}

declare module 'figma:asset/*.jpeg' {
  const src: string;
  export default src;
}

declare module 'figma:asset/*.webp' {
  const src: string;
  export default src;
}

// Support for direct PNG imports
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}
