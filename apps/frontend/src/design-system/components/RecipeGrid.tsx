import { RecipeCard, RecipeCardProps } from './RecipeCard';

export interface RecipeGridProps {
  recipes: RecipeCardProps[];
}

export function RecipeGrid({ recipes }: RecipeGridProps) {
  return (
    <div className="grid grid-cols-2 gap-px w-full bg-white">
      {recipes.map((recipe, index) => (
        <RecipeCard key={index} {...recipe} />
      ))}
    </div>
  );
}
