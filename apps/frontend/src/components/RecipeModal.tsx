import React from 'react';
import { Recipe } from '../data/recipes';
import { ArrowLeft, Clock, Users, ChefHat, Lightbulb, Play, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useEffect, useState } from 'react';
import { RecipeCard } from './RecipeCard';
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

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Header actions */}
        <div className="flex items-center justify-between gap-3">
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

          <div className="flex-1 flex items-center justify-center">
            <img
              src={jamieLogo}
              alt="Jamie Oliver"
              style={{ height: '32px', width: 'auto', display: 'block' }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center"
              style={{
                padding: 0,
                background: '#FFFFFF',
                borderRadius: '999px',
                width: '48px',
                height: '48px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                border: '1px solid rgba(232,235,237,0.8)',
              }}
            >
              <img
                src="/assets/Recipes.svg"
                alt="Recipes"
                style={{ width: '24px', height: '24px', display: 'block' }}
              />
            </button>
            {savedSession && (
              <div className="px-4 py-2 rounded-full bg-green-500 text-white text-sm flex items-center gap-2 shadow-lg">
                <Clock className="size-4" />
                In progress
              </div>
            )}
          </div>
        </div>

        {/* Feed-style card */}
        <RecipeCard
          recipe={recipe}
          variant="modal"
          onClick={() => {}}
          showDifficultyPill
        />

        {/* Cook with Jamie CTA */}
        <div style={{ marginTop: '24px' }}>
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

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
          style={{ marginTop: '32px' }}
        >
          <div
            className="w-full max-w-[420px] mx-auto shadow-[0_4px_10px_rgba(0,0,0,0.05)]"
            style={{
              background: '#F2F6F5',
              borderRadius: '24px',
              padding: '4px',
              minHeight: '49px',
            }}
          >
            <TabsList className="w-full flex items-center gap-0 bg-transparent p-0">
              <TabsTrigger
                value="ingredients"
                className="flex-1 rounded-full text-sm font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 24px',
                  flex: '1 0 0',
                  background: activeTab === 'ingredients' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'ingredients' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Ingredients
              </TabsTrigger>
              <TabsTrigger
                value="utensils"
                className="flex-1 rounded-full text-sm font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 24px',
                  flex: '1 0 0',
                  background: activeTab === 'utensils' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'utensils' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Utensils
              </TabsTrigger>
              <TabsTrigger
                value="instructions"
                className="flex-1 rounded-full text-sm font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 24px',
                  flex: '1 0 0',
                  background: activeTab === 'instructions' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'instructions' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Instructions
              </TabsTrigger>
              <TabsTrigger
                value="tips"
                className="flex-1 rounded-full text-sm font-semibold flex items-center justify-center"
                style={{
                  height: '41px',
                  padding: '0 24px',
                  flex: '1 0 0',
                  background: activeTab === 'tips' ? '#3D6A6C' : 'transparent',
                  color: activeTab === 'tips' ? '#FFFFFF' : '#3D6A6C',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
              >
                Jamie's Tips
              </TabsTrigger>
            </TabsList>
          </div>

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

          <TabsContent value="utensils" className="mt-6">
            {recipe.utensils && recipe.utensils.length > 0 ? (
              <div className="space-y-3">
                {recipe.utensils.map((utensil, index) => (
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
            ) : (
              <p className="text-muted-foreground">No utensils listed.</p>
            )}
          </TabsContent>

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
        </Tabs>
      </div>
    </div>
  );
}
