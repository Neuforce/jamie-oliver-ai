export function GlowEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg 
        className="absolute top-[142px] left-[-4px] w-[394px] h-[442px]" 
        fill="none" 
        viewBox="0 0 594 642"
      >
        <defs>
          {/* Filters */}
          <filter id="glow-filter-1" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur" stdDeviation="42" />
          </filter>
          <filter id="glow-filter-2" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur" stdDeviation="42" />
          </filter>
          <filter id="glow-filter-3" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur" stdDeviation="42" />
          </filter>

          {/* Gradients */}
          <radialGradient id="glow-gradient-1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(297 297) rotate(90) scale(197)">
            <stop offset="0.629808" stopColor="white" />
            <stop offset="0.740385" stopColor="#48C6B1" />
            <stop offset="1" stopColor="#F0FF17" />
          </radialGradient>
          <radialGradient id="glow-gradient-2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(338.5 386.5) rotate(90) scale(135.5)">
            <stop stopColor="#81EB67" />
            <stop offset="1" stopColor="white" />
          </radialGradient>
          <radialGradient id="glow-gradient-3" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(222.5 464.5) rotate(90) scale(77.5)">
            <stop stopColor="#F0FF17" />
            <stop offset="1" stopColor="white" />
          </radialGradient>
        </defs>

        {/* Ellipse 3 - Primary Glow */}
        <g filter="url(#glow-filter-1)">
          <circle 
            cx="297" 
            cy="297" 
            r="197" 
            fill="url(#glow-gradient-1)" 
            fillOpacity="0.3" 
          />
        </g>

        {/* Ellipse 4 - Secondary Glow */}
        <g filter="url(#glow-filter-2)">
          <circle 
            cx="338.5" 
            cy="386.5" 
            r="135.5" 
            fill="url(#glow-gradient-2)" 
            fillOpacity="0.3" 
          />
        </g>

        {/* Ellipse 5 - Accent Glow */}
        <g filter="url(#glow-filter-3)">
          <circle 
            cx="222.5" 
            cy="464.5" 
            r="77.5" 
            fill="url(#glow-gradient-3)" 
          />
        </g>
      </svg>
    </div>
  );
}
