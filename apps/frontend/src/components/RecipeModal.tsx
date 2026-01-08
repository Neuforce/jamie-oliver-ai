import { Recipe } from '../data/recipes';
import { ArrowLeft, Clock, Users, ChefHat, Lightbulb, Play } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useEffect, useState } from 'react';

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
  onCookWithJamie: () => void;
}

export function RecipeModal({ recipe, onClose, onCookWithJamie }: RecipeModalProps) {
  const [savedSession, setSavedSession] = useState<any>(null);

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
      {/* Header Image - Full Width */}
      <div className="relative h-[50vh] min-h-[300px] overflow-hidden">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-full object-cover"
        />
        
        {/* Back Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors"
        >
          <ArrowLeft className="size-6 text-white" />
        </button>

        {/* In Progress Badge */}
        {savedSession && (
          <div className="absolute top-4 right-4 px-4 py-2 rounded-full bg-green-500 text-white text-sm flex items-center gap-2 shadow-lg animate-pulse">
            <Clock className="size-4" />
            In Progress
          </div>
        )}
      </div>

      {/* Recipe Info */}
      <div className="p-6 border-b border-border">
        <h2 className="mb-3">{recipe.title}</h2>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-1">
            <Clock className="size-4" />
            <span>{recipe.time}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="size-4" />
            <span>{recipe.servings} servings</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-muted">
            {recipe.difficulty}
          </div>
          <div className="px-3 py-1 rounded-full bg-muted">
            {recipe.category}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pb-12">
        <p className="text-muted-foreground mb-6">{recipe.description}</p>

        {/* Cook with Jamie Button */}
        <div className="mb-6">
          {savedSession ? (
            <div className="space-y-3">
              <Button 
                onClick={onCookWithJamie}
                className="w-full bg-green-500 hover:bg-green-600"
                size="lg"
              >
                <Play className="mr-2 size-5" />
                Continue Cooking - Step {savedSession.currentStep + 1} of {recipe.instructions.length}
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
            <Button 
              onClick={onCookWithJamie}
              className="w-full"
              size="lg"
            >
              <ChefHat className="mr-2 size-5" />
              Cook with Jamie
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="ingredients" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="tips">Jamie's Tips</TabsTrigger>
          </TabsList>

          <TabsContent value="ingredients" className="mt-6">
            <div className="space-y-3">
              {recipe.ingredients.map((ingredient, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="mt-1 size-2 rounded-full bg-primary flex-shrink-0" />
                  <span>{ingredient}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="instructions" className="mt-6">
            <div className="space-y-4">
              {recipe.instructions.map((instruction, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 rounded-lg bg-muted/50"
                >
                  <div className="flex-shrink-0 flex items-center justify-center size-8 rounded-full bg-primary text-primary-foreground">
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