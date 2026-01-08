import React from "react";
import { MicOff } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Provided by Vite figma plugin at build time
import imgImage10 from "figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Static asset resolved by Vite
import jamieAvatar from "../assets/9998d3c8aa18fde4e634353cc1af4c783bd57297.png";

function MenuButton() {
  return (
    <button
      type="button"
      className="absolute left-[11px] top-1/2 -translate-y-1/2 size-[32px] rounded-full bg-transparent border-none p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#46BEA8]/40"
      data-name="menu"
      aria-label="Open menu"
    >
    </button>
  );
}

function VoiceStatusPill() {
  return (
    <button
      type="button"
      aria-label="Microphone muted"
      className="flex items-center gap-2 rounded-full bg-white shadow-[0_15px_30px_rgba(0,0,0,0.08)] border border-[#F0F0F0] px-3 py-1.5 min-w-[120px]"
    >
      <span className="inline-flex items-center justify-center size-7 rounded-full bg-[#F5F5F5]">
        <MicOff className="size-4 text-[#F16666]" strokeWidth={2} />
      </span>
      <span className="inline-flex items-center justify-center size-7 rounded-full border border-white shadow-inner overflow-hidden">
        <img src={jamieAvatar} alt="Jamie Oliver" className="size-full object-cover" />
      </span>
    </button>
  );
}

export default function Nav() {
  return (
    <div className="bg-white relative rounded-bl-[16px] rounded-br-[16px] w-full h-full" data-name="Nav">
      <MenuButton />

      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-5">
          <div className="h-6 flex items-center justify-center">
            <img
              alt="Jamie Oliver"
              className="h-full w-auto object-contain"
              src={imgImage10}
            />
          </div>
        </div>
      </div>
    </div>
  );
}