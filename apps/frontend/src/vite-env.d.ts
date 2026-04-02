/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_AUDIO_CAPTURE_ENGINE?: 'auto' | 'worklet' | 'legacy';
  readonly VITE_VOICE_BARGE_IN_ENABLED?: string;
  readonly VITE_SUPERTAB_CLIENT_ID?: string;
  readonly VITE_SUPERTAB_PAYWALL_EXPERIENCE_ID?: string;
  readonly VITE_SUPERTAB_PURCHASE_BUTTON_EXPERIENCE_ID?: string;
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
