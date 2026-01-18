import React from 'react';
import { Recipe } from '../data/recipes';
import { ArrowLeft, Clock, Users, ChefHat, Lightbulb, Play, ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useEffect, useState } from 'react';
import { RecipeCard } from './RecipeCard';
import { toast } from './ui/sonner';
// @ts-ignore - Vite handles image imports
import jamieLogoImport from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

const jamieLogo = typeof jamieLogoImport === 'string' ? jamieLogoImport : (jamieLogoImport as any).src || jamieLogoImport;

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
  onCookWithJamie: () => void;
}

export function RecipeModal({ recipe, onClose, onCookWithJamie }: RecipeModalProps) {
  const [savedSession, setSavedSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('ingredients');

  useEffect(() => {
    if (recipe) {
      const session = localStorage.getItem(`cooking-session-${recipe.id}`);
      if (session) {
        try {
          const parsed = JSON.parse(session);
          const now = new Date().getTime();
          const sessionAge = now - parsed.timestamp;

          // Only show if less than 24 hours old
          if (sessionAge < 24 * 60 * 60 * 1000) {
            setSavedSession(parsed);
          } else {
            localStorage.removeItem(`cooking-session-${recipe.id}`);
            setSavedSession(null);
          }
        } catch (e) {
          setSavedSession(null);
        }
      } else {
        setSavedSession(null);
      }
    }
  }, [recipe]);

  if (!recipe) return null;

  const hasUtensils = recipe.utensils && recipe.utensils.length > 0;

  return (
    <div 
      className="fixed inset-0 z-50 bg-background"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Sticky Header */}
      <header
        style={{
          flexShrink: 0,
          backgroundColor: 'white',
          zIndex: 10,
          paddingTop: 'clamp(16px, calc(100vw * 24 / 390), 24px)',
          paddingBottom: '12px',
          paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)',
          paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)',
          boxSizing: 'border-box',
        }}
      >
        <div className="grid grid-cols-3 items-center gap-3" style={{ width: '100%', maxWidth: '600px', boxSizing: 'border-box', margin: '0 auto' }}>
          {/* Close Button */}
          <div className="flex items-center">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center"
              style={{ padding: 0, background: 'transparent' }}
            >
              <img
                src="/assets/Back.svg"
                alt="Back"
                style={{ width: '24px', height: '24px', display: 'block' }}
              />
            </button>
          </div>

          {/* Logo - Centered (consistent 24px height across all layouts) */}
          <div className="flex items-center justify-center">
            <img
              src={jamieLogo}
              alt="Jamie Oliver"
              className="h-6 w-auto object-contain"
              style={{ maxWidth: '165px' }}
            />
          </div>

          {/* Empty spacer for grid balance */}
          <div className="flex items-center justify-end" />
        </div>
      </header>

      {/* Scrollable Content */}
      <div 
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div className="w-full max-w-5xl mx-auto space-y-8" style={{ paddingBottom: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
          {/* Feed-style card */}
        <RecipeCard
          recipe={recipe}
          variant="modal"
          onClick={() => {}}
          showDifficultyPill
          showInProgress={!!savedSession}
        />

        {/* Cook with Jamie CTA */}
        <div className="flex items-center justify-center w-full" style={{ marginTop: '24px', paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', maxWidth: '600px', boxSizing: 'border-box', margin: '0 auto' }}>
            {savedSession ? (
              <div className="space-y-3">
                <Button
                  onClick={onCookWithJamie}
                  className="w-full justify-between text-white"
                  size="lg"
                  style={{
                    height: '50px',
                    padding: '9px 14px 9px 24px',
                    borderRadius: '24px',
                    backgroundColor: '#29514F',
                    transition: 'background-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1f423f')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#29514F')}
                >
                  <Play className="mr-2 size-5" />
                  Continue Cooking - Step {savedSession.currentStep + 1} of {recipe.instructions.length}
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '9px',
                    background: '#29514F',
                    }}
                  >
                    <ArrowRight className="size-4" />
                  </span>
                </Button>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-full rounded-full transition-all"
                    style={{
                      width: `${((savedSession.currentStep + 1) / recipe.instructions.length) * 100}%`
                    }}
                  />
                </div>
                <Button
                  onClick={() => {
                    localStorage.removeItem(`cooking-session-${recipe.id}`);
                    setSavedSession(null);
                    toast.success('Session cleared', {
                      description: 'You can start fresh now',
                    });
                  }}
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  size="sm"
                >
                  <RotateCcw className="mr-2 size-4" />
                  Start fresh (discard progress)
                </Button>
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  minHeight: '58px',
                  borderRadius: '24px',
                  background: 'rgba(232, 235, 237, 0.5)',
                  padding: '8px 0 0 0',
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'flex-end',
                  overflow: 'hidden',
                }}
              >
                <Button
                  onClick={onCookWithJamie}
                  className="w-full justify-between text-white"
                  size="lg"
                  style={{
                    height: '50px',
                    padding: '9px 14px 9px 32px',
                    borderRadius: '24px',
                    backgroundColor: '#3D6E6C',
                    transition: 'background-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1f423f')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3D6E6C')}
                >
                  <span
                    style={{
                      marginLeft: '32px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Cook with Jamie
                  </span>
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '9px',
                      background: '#29514F',
                    }}
                  >
                    <ArrowRight className="size-4" />
                  </span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
          style={{ marginTop: '32px' }}
        >
          <div className="flex items-center justify-center w-full" style={{ paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
            <div
              className="w-full shadow-[0_4px_10px_rgba(0,0,0,0.05)]"
              style={{
                width: '100%',
                maxWidth: '600px',
                boxSizing: 'border-box',
                background: '#F2F6F5',
                borderRadius: '24px',
                padding: 'clamp(2px, calc(100vw * 4 / 390), 4px)',
                minHeight: '49px',
                margin: '0 auto',
              }}
            >
            <TabsList className="w-full flex items-center gap-0 bg-transparent p-0">
              <TabsTrigger
                value="ingredients"
                className="flex-1 rounded-full font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 clamp(4px, calc(100vw * 12 / 390), 12px)',
                  flex: '1 0 0',
                  fontSize: 'clamp(11px, calc(100vw * 14 / 390), 14px)',
                  background: activeTab === 'ingredients' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'ingredients' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Ingredients
              </TabsTrigger>
              {hasUtensils && (
                <TabsTrigger
                  value="utensils"
                  className="flex-1 rounded-full font-semibold flex items-center justify-center"
                  style={{
                    height: '41px',
                    padding: '0 clamp(4px, calc(100vw * 12 / 390), 12px)',
                    flex: '1 0 0',
                    fontSize: 'clamp(11px, calc(100vw * 14 / 390), 14px)',
                    background: activeTab === 'utensils' ? '#3D6A6C' : 'transparent',
                    color: activeTab === 'utensils' ? '#FFFFFF' : '#3D6A6C',
                    transition: 'background-color 0.2s ease, color 0.2s ease',
                  }}
                >
                  Utensils
                </TabsTrigger>
              )}
              <TabsTrigger
                value="instructions"
                className="flex-1 rounded-full font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 clamp(4px, calc(100vw * 12 / 390), 12px)',
                  flex: '1 0 0',
                  fontSize: 'clamp(11px, calc(100vw * 14 / 390), 14px)',
                  background: activeTab === 'instructions' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'instructions' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Instructions
              </TabsTrigger>
              <TabsTrigger
                value="tips"
                className="flex-1 rounded-full font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 clamp(4px, calc(100vw * 12 / 390), 12px)',
                  flex: '1 0 0',
                  fontSize: 'clamp(11px, calc(100vw * 14 / 390), 14px)',
                  background: activeTab === 'tips' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'tips' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Jamie's Tips
              </TabsTrigger>
            </TabsList>
            </div>
          </div>

          <div className="flex items-center justify-center w-full" style={{ paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
            <div style={{ width: '100%', maxWidth: '600px', boxSizing: 'border-box', margin: '0 auto' }}>
              <TabsContent value="ingredients" className="mt-6">
                <div className="space-y-3">
                  {recipe.ingredients.map((ingredient, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                    >
                      <div
                        className="mt-1 size-2 rounded-full flex-shrink-0"
                        style={{ background: '#3D6A6C' }}
                      />
                      <span>{ingredient}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {hasUtensils && (
                <TabsContent value="utensils" className="mt-6">
                  <div className="space-y-3">
                    {recipe.utensils!.map((utensil, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div
                          className="mt-1 size-2 rounded-full flex-shrink-0"
                          style={{ background: '#3D6A6C' }}
                        />
                        <span>{utensil}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}

              <TabsContent value="instructions" className="mt-6">
                <div className="space-y-4">
                  {recipe.instructions.map((instruction, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 p-4 rounded-lg bg-muted/50"
                    >
                      <div
                        className="flex-shrink-0 flex items-center justify-center size-8 rounded-full"
                        style={{ background: '#3D6A6C', color: '#FFFFFF' }}
                      >
                        {index + 1}
                      </div>
                      <p className="pt-1">{instruction}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="tips" className="mt-6">
                <div className="space-y-4">
                  {recipe.tips.map((tip, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                    >
                      <Lightbulb className="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <p>{tip}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
        </div>
      </div>
    </div>
  );
}
