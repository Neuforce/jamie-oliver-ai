import React, { useState } from 'react';
import { Recipe } from '../data/recipes';
import { Clock, Users, ChefHat, Heart, Bookmark, MessageCircle, Share2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';

interface RecipeFeedCardProps {
  recipe: Recipe;
  onClick: () => void;
}

// Helper function to generate additional images for the recipe
const getRecipeImages = (recipe: Recipe) => {
  // Generic images that represent cooking steps/ingredients
  const supplementaryImages = [
    "https://images.unsplash.com/photo-1665088127661-83aeff6104c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMGluZ3JlZGllbnRzJTIwdmVnZXRhYmxlc3xlbnwxfHx8fDE3NjU1MTM4Mzh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1740727665746-cfe80ababc23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb29raW5nJTIwcHJlcGFyYXRpb24lMjBraXRjaGVufGVufDF8fHx8MTc2NTUyNzI0Mnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1730596628352-08a13f00f5cb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZXJicyUyMHNwaWNlcyUyMGNvb2tpbmd8ZW58MXx8fHwxNzY1NDczMDY1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1696805566858-fe4a670d5df3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb29kJTIwcGxhdGluZyUyMHByZXNlbnRhdGlvbnxlbnwxfHx8fDE3NjU1NTc3MDZ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
  ];

  // Use recipe ID to consistently pick 2-3 additional images
  const imageCount = (recipe.id % 2) + 2; // 2 or 3 images
  const startIndex = recipe.id % supplementaryImages.length;
  const additionalImages: string[] = [];
  
  for (let i = 0; i < imageCount; i++) {
    additionalImages.push(supplementaryImages[(startIndex + i) % supplementaryImages.length]);
  }

  return [recipe.image, ...additionalImages];
};

export function RecipeFeedCard({ recipe, onClick }: RecipeFeedCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = getRecipeImages(recipe);
  const totalImages = images.length;

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % totalImages);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + totalImages) % totalImages);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card shadow-sm border border-border overflow-hidden mb-6 max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Avatar className="size-10 border-2 border-orange-500">
          <AvatarImage 
            src="https://images.unsplash.com/photo-1759521296047-89338c8e083d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYW1pZSUyMG9saXZlciUyMGNoZWYlMjBwb3J0cmFpdHxlbnwxfHx8fDE3NjU1NTY4MjF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" 
            alt="Jamie Oliver"
          />
          <AvatarFallback>JO</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm">Jamie Oliver</p>
            <div className="size-1 rounded-full bg-muted-foreground" />
            <span className="text-sm text-muted-foreground">{recipe.time}</span>
          </div>
          <p className="text-xs text-muted-foreground">{recipe.category} Cuisine</p>
        </div>
        <Button variant="ghost" size="sm">
          <Bookmark className="size-5" />
        </Button>
      </div>

      {/* Image */}
      <div 
        className="relative aspect-square overflow-hidden group"
      >
        <img
          src={images[currentImageIndex]}
          alt={recipe.title}
          className="w-full h-full object-cover transition-all duration-300"
        />
        
        {/* Navigation Arrows */}
        {totalImages > 1 && (
          <>
            {currentImageIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ‹
              </button>
            )}
            {currentImageIndex < totalImages - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ›
              </button>
            )}
          </>
        )}

        {/* Image Indicators */}
        {totalImages > 1 && (
          <div className="absolute top-3 left-3 flex gap-1">
            {images.map((_, index) => (
              <div
                key={index}
                className={`h-0.5 rounded-full transition-all ${
                  index === currentImageIndex 
                    ? 'bg-white w-8' 
                    : 'bg-white/50 w-8'
                }`}
              />
            ))}
          </div>
        )}

        {/* Difficulty Badge */}
        <div className="absolute top-3 right-3">
          <span className={`px-3 py-1.5 rounded-full text-sm backdrop-blur-md shadow-lg ${
            recipe.difficulty === 'Easy' ? 'bg-green-500/90 text-white' :
            recipe.difficulty === 'Medium' ? 'bg-yellow-500/90 text-white' :
            'bg-red-500/90 text-white'
          }`}>
            {recipe.difficulty}
          </span>
        </div>

        {/* Clickable overlay */}
        <div 
          className="absolute inset-0 cursor-pointer"
          onClick={onClick}
        />
      </div>

      {/* Actions */}
      <div className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2">
            <Heart className="size-6" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <MessageCircle className="size-6" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <Share2 className="size-6" />
          </Button>
          <div className="flex-1" />
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2"
            onClick={onClick}
          >
            <ChefHat className="size-5 text-orange-500" />
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{recipe.servings} servings</span>
          </div>
          
          <h3 
            className="cursor-pointer hover:text-primary transition-colors"
            onClick={onClick}
          >
            {recipe.title}
          </h3>
          
          <p className="text-sm text-muted-foreground line-clamp-2">
            {recipe.description}
          </p>

          <button 
            onClick={onClick}
            className="text-sm text-primary hover:underline"
          >
            View full recipe
          </button>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-xs text-muted-foreground">#{recipe.category.toLowerCase().replace(/\s+/g, '')}</span>
            <span className="text-xs text-muted-foreground">#{recipe.difficulty.toLowerCase()}</span>
            <span className="text-xs text-muted-foreground">#jamieoliver</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}