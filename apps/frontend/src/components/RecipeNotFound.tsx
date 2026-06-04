import { ChefHat } from 'lucide-react';
import { Button } from './ui/button';

type RecipeNotFoundProps = {
  slug?: string;
  onBrowseRecipes: () => void;
};

export function RecipeNotFound({ slug, onBrowseRecipes }: RecipeNotFoundProps) {
  return (
    <div className="jamie-page-shell flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <ChefHat className="mx-auto mb-4 size-16 text-muted-foreground" aria-hidden="true" />
        <h1 className="mb-2 text-2xl font-semibold">Recipe not found</h1>
        <p className="mb-6 text-muted-foreground">
          {slug
            ? `We couldn't find a recipe for "${slug}". It may have moved or the link is outdated.`
            : "We couldn't find that recipe. It may have moved or the link is outdated."}
        </p>
        <Button type="button" onClick={onBrowseRecipes}>
          Browse all recipes
        </Button>
      </div>
    </div>
  );
}
