import React, { useState, useRef, useEffect } from 'react';
import { Recipe } from '../data/recipes';
import { RecipeCard } from './RecipeCard';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RecipeCarouselProps {
  recipes: Recipe[];
  onRecipeClick: (recipe: Recipe) => void;
  singleSlide?: boolean; // Force single slide display (e.g., for chat)
}

export function RecipeCarousel({ recipes, onRecipeClick, singleSlide = false }: RecipeCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slidesToShow, setSlidesToShow] = useState(3);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (singleSlide) {
      setSlidesToShow(1);
      return;
    }

    const handleResize = () => {
      if (window.innerWidth < 640) {
        setSlidesToShow(1);
      } else if (window.innerWidth < 1024) {
        setSlidesToShow(2);
      } else {
        setSlidesToShow(3);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [singleSlide]);

  const maxIndex = Math.max(0, recipes.length - slidesToShow);

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
  };

  const visibleRecipes = recipes.slice(currentIndex, currentIndex + slidesToShow);

  return (
    <div className="relative">
      {/* Navigation Buttons */}
      {currentIndex > 0 && (
        <Button
          onClick={handlePrev}
          variant="outline"
          size="sm"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 rounded-full size-8 p-0 shadow-lg bg-background"
        >
          <ChevronLeft className="size-4" />
        </Button>
      )}

      {currentIndex < maxIndex && (
        <Button
          onClick={handleNext}
          variant="outline"
          size="sm"
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 rounded-full size-8 p-0 shadow-lg bg-background"
        >
          <ChevronRight className="size-4" />
        </Button>
      )}

      {/* Carousel Content */}
      <div className="overflow-hidden">
        {singleSlide ? (
          <div className="flex items-center justify-center">
            {visibleRecipes.map((recipe) => (
              <div key={recipe.id}>
                <RecipeCard
                  recipe={recipe}
                  onClick={() => onRecipeClick(recipe)}
                  variant="chat"
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${slidesToShow}, minmax(0, 1fr))`,
            }}
          >
            {visibleRecipes.map((recipe) => (
              <div key={recipe.id}>
                <RecipeCard
                  recipe={recipe}
                  onClick={() => onRecipeClick(recipe)}
                  variant="chat"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dots Indicator */}
      {recipes.length > slidesToShow && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setDirection(index > currentIndex ? 1 : -1);
                setCurrentIndex(index);
              }}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-6 bg-primary'
                  : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
