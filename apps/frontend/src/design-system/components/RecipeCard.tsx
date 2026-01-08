import { Clock, Users } from 'lucide-react';
import { Badge } from './Badge';

export interface RecipeCardProps {
  image: string;
  title: string;
  cuisine: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  time: string;
  servings: number;
  onClick?: () => void;
}

export function RecipeCard({
  image,
  title,
  cuisine,
  difficulty,
  time,
  servings,
  onClick,
}: RecipeCardProps) {
  const difficultyVariant = difficulty.toLowerCase() as 'easy' | 'medium' | 'hard';

  return (
    <div 
      className="relative w-[196px] h-[245px] overflow-hidden cursor-pointer group"
      onClick={onClick}
    >
      {/* Recipe Image */}
      <img 
        src={image} 
        alt={title}
        className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 via-50% to-transparent" />
      
      {/* Badges */}
      <div className="absolute top-2.5 left-2 right-2 flex items-start justify-between gap-2 z-10">
        <Badge variant="cuisine">{cuisine}</Badge>
        <Badge variant={difficultyVariant}>{difficulty}</Badge>
      </div>
      
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col gap-1.5 z-10">
        {/* Title */}
        <h3 className="text-sm leading-5 text-white font-['Inter',sans-serif] line-clamp-2 tracking-[-0.15px]">
          {title}
        </h3>
        
        {/* Meta Info */}
        <div className="flex items-center gap-3">
          {/* Time */}
          <div className="flex items-center gap-1">
            <Clock className="size-3 text-white/90" strokeWidth={1.5} />
            <span className="text-xs leading-4 text-white/90 font-['Inter',sans-serif]">
              {time}
            </span>
          </div>
          
          {/* Servings */}
          <div className="flex items-center gap-1">
            <Users className="size-3 text-white/90" strokeWidth={1.5} />
            <span className="text-xs leading-4 text-white/90 font-['Inter',sans-serif]">
              {servings}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
