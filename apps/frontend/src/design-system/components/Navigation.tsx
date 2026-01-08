import { Menu } from 'lucide-react';

export interface NavigationProps {
  onMenuClick?: () => void;
  logoSrc?: string;
}

export function Navigation({ onMenuClick, logoSrc }: NavigationProps) {
  return (
    <div className="relative bg-white h-14 w-full rounded-bl-2xl rounded-br-2xl">
      {/* Menu Button */}
      <button
        onClick={onMenuClick}
        className="absolute left-[11px] top-4 p-0 bg-transparent border-none cursor-pointer"
        aria-label="Open menu"
      >
        <Menu className="size-6 text-[#327179]" strokeWidth={1.5} />
      </button>

      {/* Logo */}
      {logoSrc && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 h-6 flex items-center justify-center">
          <img 
            src={logoSrc} 
            alt="Jamie Oliver" 
            className="h-full w-auto object-contain"
          />
        </div>
      )}
    </div>
  );
}
