import React from "react";
import { MicOff, MessageCircle, Book } from "lucide-react";
import { motion } from "motion/react";
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

interface NavProps {
  onChatClick?: () => void;
  onRecipesClick?: () => void;
  onCloseClick?: () => void;
  showRecipesButton?: boolean;
}

export default function Nav({ onChatClick, onRecipesClick, onCloseClick, showRecipesButton = false }: NavProps) {
  return (
    <div
      className="bg-white relative rounded-bl-[16px] rounded-br-[16px] mx-auto"
      data-name="Nav"
      style={{
        width: '100%',
        maxWidth: '600px',
        paddingTop: '17px',
        paddingRight: '16px',
        paddingBottom: '17px',
        paddingLeft: '16px',
        boxSizing: 'border-box',
      }}
    >
      <MenuButton />

      {showRecipesButton ? (
        // Landing Page Layout: Logo centered, buttons below
        <div className="flex flex-col items-center justify-center w-full" style={{ gap: '10px' }}>
          {/* Logo - Centered */}
          <div className="flex items-center justify-center w-full">
            <div
              className="flex items-center justify-center"
              style={{
                height: 'clamp(20px, calc(100vw * 24 / 390), 24px)',
                maxWidth: '171.75px'
              }}
            >
              <img
                alt="Jamie Oliver"
                className="h-full w-auto object-contain"
                src={imgImage10}
                style={{ maxWidth: '100%' }}
              />
            </div>
          </div>

          {/* Buttons - Centered Below Logo */}
          <div className="flex items-center justify-center gap-2 w-full">
            {/* Recipes Button */}
            {onRecipesClick && (
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                onClick={onRecipesClick}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 flex-shrink-0 transition-colors hover:opacity-80"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  color: '#327179',
                }}
              >
                <img
                  src="/assets/Recipes.svg"
                  alt="Recipes"
                  style={{ width: '24px', height: '24px' }}
                />
                <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '16px' }}>Recipes</span>
              </motion.button>
            )}

            {/* Chat Button */}
            {onChatClick && (
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                onClick={onChatClick}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 flex-shrink-0 transition-colors hover:opacity-80"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  color: '#327179',
                }}
              >
                <MessageCircle style={{ width: '24px', height: '24px', color: '#327179' }} />
                <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '16px' }}>Chat</span>
              </motion.button>
            )}
          </div>
        </div>
      ) : (
        // Recipes View Layout: Close button left, Logo centered, Chat button top right
        <div className="flex items-center justify-between relative w-full" style={{ gap: '10px' }}>
          {/* Close Button - Top Left */}
          <div className="flex-shrink-0" style={{ width: '24px' }}>
            {onCloseClick && (
              <button
                onClick={onCloseClick}
                className="size-[24px] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              >
                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6L18 18" stroke="#327179" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Logo - Centered */}
          <div className="flex-1 flex items-center justify-center" style={{ minWidth: 0 }}>
            <div 
              className="flex items-center justify-center"
              style={{ 
                height: 'clamp(20px, calc(100vw * 24 / 390), 24px)',
                maxWidth: '171.75px',
                width: '100%'
              }}
            >
              <img
                alt="Jamie Oliver"
                className="h-full w-auto object-contain mx-auto"
                src={imgImage10}
                style={{ maxWidth: '100%' }}
              />
            </div>
          </div>

          {/* Chat Button - Top Right */}
          <div className="flex-shrink-0" style={{ width: '42.75px' }}>
            {onChatClick && (
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                onClick={onChatClick}
                className="inline-flex items-center justify-center w-full"
                style={{
                  width: '42.75px',
                  height: '42px',
                  borderRadius: '24px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                }}
              >
                <MessageCircle style={{ width: '18px', height: '18px', color: '#327179' }} />
              </motion.button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
