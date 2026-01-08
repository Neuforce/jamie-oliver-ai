export interface AvatarWithGlowProps {
  src: string;
  alt: string;
  size?: number;
}

export function AvatarWithGlow({ 
  src, 
  alt, 
  size = 170 
}: AvatarWithGlowProps) {
  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Glow Ring */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          background: '#81EB67',
          filter: 'blur(20px)',
          opacity: 0.5,
          transform: 'scale(1.1)',
        }}
      />
      
      {/* Avatar Image */}
      <div 
        className="relative rounded-full overflow-hidden bg-[#81EB67]"
        style={{ 
          width: size * 0.9, 
          height: size * 0.9,
          padding: 4,
        }}
      >
        <img 
          src={src} 
          alt={alt}
          className="w-full h-full object-cover rounded-full"
        />
      </div>
    </div>
  );
}