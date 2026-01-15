import React, { useEffect, useState } from 'react';
import { Recipe } from '../data/recipes';
import { Clock, Users, ChefHat } from 'lucide-react';
import { motion } from 'motion/react';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
  variant?: 'grid' | 'feed' | 'cooking' | 'modal';
  showDifficultyPill?: boolean;
  showInProgress?: boolean;
}

export function RecipeCard({ recipe, onClick, variant = 'grid', showDifficultyPill = false, showInProgress = false }: RecipeCardProps) {
  const [hasSession, setHasSession] = useState(false);
  const [sessionProgress, setSessionProgress] = useState(0);
  const badgeStyle: React.CSSProperties = {
    height: '27px',
    padding: '6px 12px',
    alignItems: 'flex-start',
    borderRadius: '33554400px',
    background: '#3D6E6C',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.10)',
  };

  useEffect(() => {
    const checkSession = () => {
      // Check if recipe is completed - if so, don't show as in progress
      const completedRecipe = localStorage.getItem(`completed-recipe-${recipe.id}`);
      if (completedRecipe) {
        setHasSession(false);
        return;
      }

      const session = localStorage.getItem(`cooking-session-${recipe.id}`);
      if (session) {
        try {
          const parsed = JSON.parse(session);
          const now = new Date().getTime();
          const sessionAge = now - parsed.timestamp;

          if (sessionAge < 24 * 60 * 60 * 1000) {
            setHasSession(true);
            setSessionProgress(((parsed.currentStep + 1) / recipe.instructions.length) * 100);
          } else {
            setHasSession(false);
            localStorage.removeItem(`cooking-session-${recipe.id}`);
          }
        } catch (e) {
          setHasSession(false);
        }
      } else {
        setHasSession(false);
      }
    };

    checkSession();
  }, [recipe.id, recipe.instructions.length]); // Only run on mount

  // Cooking variant: hero card used inside cooking mode
  if (variant === 'cooking') {
    return (
      <>
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer"
          onClick={onClick}
        >
          <div
            className="overflow-hidden border border-[#E4E7EC] bg-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]"
            style={{ borderRadius: '32px' }}
          >
            <div className="relative aspect-[196/245] overflow-hidden">
              <img
                src={recipe.image}
                alt={recipe.title}
                className="h-full w-full object-cover"
              />
              <span
                className="absolute left-3 top-3 inline-flex items-center text-white text-xs font-semibold"
                style={badgeStyle}
              >
                {recipe.category.toUpperCase()}
              </span>
            </div>
          </div>
        </motion.div>
        <div
          className="px-6 py-5 space-y-4"
          style={{ marginTop: '24px' }}
        >
          <h3
            style={{
              color: '#2C5F5D',
              fontFamily: 'Poppins, sans-serif',
              fontSize: '26px',
              fontWeight: 700,
              letterSpacing: '0.087px',
              lineHeight: '24px',
              textTransform: 'uppercase',
            }}
          >
            {recipe.title}
          </h3>
        </div>
      </>
    );
  }

  // Grid variant: compact with cropped image
  if (variant === 'grid') {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="cursor-pointer"
        onClick={onClick}
      >
        <div
          className="relative overflow-hidden bg-white h-full shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_-1px_rgba(0,0,0,0.10)]"
          style={{ borderRadius: '24px' }}
        >
          {/* Edge-to-edge Image Container for Grid - Matching Figma Mock */}
          <div className="relative aspect-[196/245] overflow-hidden">
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover transition-opacity duration-300 hover:opacity-95"
            />

            {/* Gradient Overlay - matching Figma design */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 via-50% to-transparent" />

            {/* Badges at top */}
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 z-10">
              {/* Category/Session Badge on left */}
              {hasSession ? (
                <span
                  className="inline-flex items-center gap-1.5 text-white text-xs font-semibold"
                  style={badgeStyle}
                >
                  <Clock className="size-3" />
                  In Progress
                </span>
              ) : (
                <span
                  className="inline-flex items-center text-white text-xs font-semibold"
                  style={badgeStyle}
                >
                  {recipe.category.toUpperCase()}
                </span>
              )}
            </div>

            {/* Content at bottom - matching Figma */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-1.5 z-10">
              {/* Title */}
              <h3
                className="text-white"
                style={{
                  textTransform: 'uppercase',
                  fontFamily: 'Poppins, sans-serif',
                  fontSize: '14px',
                  fontWeight: 600,
                  lineHeight: '20px',
                  letterSpacing: '0.2px',
                  paddingLeft: '16px',
                  paddingBottom: '16px',
                }}
              >
                {recipe.title}
              </h3>

              {/* Meta Info */}


              {/* Progress Bar */}
              {hasSession && (
                <div className="mt-1 w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#81EB67] h-full rounded-full transition-all"
                    style={{ width: `${sessionProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Modal variant: image rounded, text and meta separated, no outer card container
  if (variant === 'modal') {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="cursor-pointer"
        onClick={onClick}
        style={{
          width: 'clamp(320px, 92vw, 640px)',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div className="relative overflow-hidden" style={{ borderRadius: '24px' }}>
          <img
            src={recipe.image}
            alt={recipe.title}
            className="h-full w-full object-cover"
            style={{ display: 'block' }}
          />
          <span
            className="absolute left-3 top-3 inline-flex items-center text-white text-xs font-semibold"
            style={{
              height: '27px',
              padding: '6px 12px',
              alignItems: 'flex-start',
              borderRadius: '33554400px',
              background: '#3D6E6C',
              boxShadow:
                '0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.10)',
              letterSpacing: '0.2em',
            }}
          >
            {recipe.category.toUpperCase()}
          </span>
          {showInProgress && (
            <div
              className="absolute inline-flex items-center gap-1.5 text-white text-xs font-semibold"
              style={{
                right: '12px',
                top: '12px',
                height: '27px',
                padding: '6px 12px',
                alignItems: 'flex-start',
                borderRadius: '33554400px',
                background: '#10B981',
                boxShadow:
                  '0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.10)',
              }}
            >
              <Clock className="size-3" />
              In progress
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3
              style={{
                color: '#2C5F5D',
                fontFamily: 'Poppins, sans-serif',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '0.087px',
                lineHeight: '28px',
                textTransform: 'uppercase',
              }}
            >
              {recipe.title}
            </h3>
            <p
              style={{
                margin: 0,
                color: '#234252',
                fontFamily: 'Poppins, sans-serif',
                fontSize: '14px',
                lineHeight: '22px',
                letterSpacing: '-0.15px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                opacity: 1,
              }}
            >
              {recipe.description}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingLeft: '24px',
              paddingRight: '24px',
              fontFamily: 'Poppins, sans-serif',
              fontSize: '14px',
              lineHeight: '20px',
              letterSpacing: '0.087px',
              color: '#717182',
              opacity: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock className="size-4 text-[#3D6E6C]" />
              <span>{recipe.time}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users className="size-4 text-[#3D6E6C]" />
              <span>{recipe.servings}</span>
            </div>
            {showDifficultyPill ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 12px',
                  borderRadius: '33554400px',
                  background: '#F2F5F6',
                  color: '#2C5F5D',
                  fontFamily: 'Inter',
                  fontSize: '12px',
                  fontStyle: 'normal',
                  fontWeight: 600,
                  lineHeight: '16px',
                  letterSpacing: '0.3px',
                  textTransform: 'uppercase',
                }}
              >
                {recipe.difficulty}
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ChefHat className="size-4 text-[#3D6E6C]" />
                <span>{recipe.difficulty}</span>
              </div>
            )}
          </div>
        </div>

        <hr
          style={{
            marginTop: '24px',
            marginBottom: '24px',
            border: 'none',
            height: '1px',
            background: '#E6EAE9',
          }}
        />
      </motion.div>
    );
  }

  // Feed variant: editorial card
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer"
      onClick={onClick}
      style={{
        width: 'clamp(320px, 92vw, 640px)',
        margin: '0 auto',
      }}
    >
      <div
        className="overflow-hidden border border-[#E4E7EC] bg-white"
        style={{
          borderRadius: '24px',
          boxShadow:
            '0 1px 3px 0 rgba(0, 0, 0, 0.10), 0 1px 2px -1px rgba(0, 0, 0, 0.10)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '360px',
          height: 'min(78vw, 420px)',
        }}
      >
        {/* Image */}
        <div
          className="relative aspect-[196/245] overflow-hidden"
          style={{
            flex: '0 0 75%',
            minHeight: 0,
          }}
        >
          <img
            src={recipe.image}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
          <span
            className="absolute left-3 top-3 inline-flex items-center text-white text-xs font-semibold"
            style={{ ...badgeStyle, letterSpacing: '0.2em' }}
          >
            {recipe.category.toUpperCase()}
          </span>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#FFFFFF',
            position: 'relative',
            zIndex: 1,
            flex: '0 0 25%',
            minHeight: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3
              style={{
                color: '#2C5F5D',
                fontFamily: 'Poppins, sans-serif',
                fontSize: '18px',
                fontWeight: 600,
                letterSpacing: '0.087px',
                lineHeight: '20px',
                textTransform: 'uppercase',
                opacity: 1,
              }}
            >
              {recipe.title}
            </h3>
            <p
              style={{
                margin: 0,
                color: '#234252',
                fontFamily: 'Poppins, sans-serif',
                fontSize: '14px',
                lineHeight: '22.75px',
                letterSpacing: '-0.15px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                opacity: 1,
              }}
            >
              {recipe.description}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              marginTop: 'auto',
              fontFamily: 'Poppins, sans-serif',
              fontSize: '14px',
              lineHeight: '20px',
              letterSpacing: '0.087px',
              color: '#717182',
              opacity: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock className="size-4 text-[#3D6E6C]" />
              <span>{recipe.time}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users className="size-4 text-[#3D6E6C]" />
              <span>{recipe.servings}</span>
            </div>
            {showDifficultyPill ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 12px',
                  borderRadius: '33554400px',
                  background: '#F2F5F6',
                  color: '#2C5F5D',
                  fontFamily: 'Inter',
                  fontSize: '12px',
                  fontStyle: 'normal',
                  fontWeight: 600,
                  lineHeight: '16px',
                  letterSpacing: '0.3px',
                  textTransform: 'uppercase',
                }}
              >
                {recipe.difficulty}
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ChefHat className="size-4 text-[#3D6E6C]" />
                <span>{recipe.difficulty}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
