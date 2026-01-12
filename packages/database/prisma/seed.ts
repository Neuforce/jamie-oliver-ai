/**
 * Database seed script
 * 
 * Loads existing recipes from data/recipes/ into the recipes table.
 * Run with: npm run db:seed
 */

import { PrismaClient, RecipeStatus, SourceType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface RecipeJson {
  recipe: {
    id: string;
    title: string;
    description?: string;
    servings?: number;
    difficulty?: string;
    prep_time?: string;
    cook_time?: string;
    total_time?: string;
    image_url?: string;
    categories?: string[];
    moods?: string[];
  };
  steps: Array<{
    step_id: string;
    type?: string;
    duration?: number;
    on_enter?: { say?: string };
    requires_confirm?: boolean;
  }>;
  ingredients: Array<{
    name: string;
    amount?: string;
    unit?: string;
  }>;
  utensils?: string[];
}

function computeMetadata(recipeJson: RecipeJson) {
  const recipe = recipeJson.recipe;
  const steps = recipeJson.steps || [];
  const ingredients = recipeJson.ingredients || [];
  const utensils = recipeJson.utensils || [];
  
  const timerSteps = steps.filter(s => s.type === 'timer');
  const hasOnEnterSay = steps.every(s => s.on_enter?.say && s.on_enter.say.length > 10);
  const hasSemanticIds = !steps.some(s => /^step[_-]?\d+$/i.test(s.step_id || ''));
  
  return {
    title: recipe.title,
    description: recipe.description?.substring(0, 200),
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    step_count: steps.length,
    has_timers: timerSteps.length > 0,
    timer_count: timerSteps.length,
    ingredient_count: ingredients.length,
    utensil_count: utensils.length,
    categories: recipe.categories || [],
    moods: recipe.moods || [],
    image_url: recipe.image_url,
    quality_indicators: {
      has_on_enter_say: hasOnEnterSay,
      has_semantic_step_ids: hasSemanticIds,
      has_timer_steps: timerSteps.length > 0,
    },
  };
}

function computeQualityScore(recipeJson: RecipeJson): number {
  let score = 100;
  const recipe = recipeJson.recipe;
  const steps = recipeJson.steps || [];
  
  // Required fields
  if (!recipe.title) score -= 20;
  if (!recipe.id) score -= 10;
  if (steps.length === 0) score -= 30;
  if (!recipeJson.ingredients?.length) score -= 15;
  
  // Step quality
  const genericIds = steps.filter(s => /^step[_-]?\d+$/i.test(s.step_id || '')).length;
  score -= genericIds * 2;
  
  const missingSay = steps.filter(s => !s.on_enter?.say || s.on_enter.say.length < 10).length;
  score -= missingSay * 3;
  
  const noConfirm = steps.filter(s => !s.requires_confirm).length;
  if (noConfirm === steps.length) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

async function main() {
  const recipesDir = path.resolve(__dirname, '../../../data/recipes');
  
  if (!fs.existsSync(recipesDir)) {
    console.error(`Recipes directory not found: ${recipesDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(recipesDir)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  console.log(`Found ${files.length} recipe files`);
  
  let created = 0;
  let updated = 0;
  let errors = 0;
  
  for (const file of files) {
    const filePath = path.join(recipesDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const recipeJson: RecipeJson = JSON.parse(content);
      
      const slug = recipeJson.recipe.id || file.replace('.json', '');
      const metadata = computeMetadata(recipeJson);
      const qualityScore = computeQualityScore(recipeJson);
      
      const existing = await prisma.recipe.findUnique({ where: { slug } });
      
      if (existing) {
        await prisma.recipe.update({
          where: { slug },
          data: {
            recipeJson: recipeJson as any,
            metadata: metadata as any,
            qualityScore,
            sourceType: SourceType.imported,
          },
        });
        updated++;
        console.log(`  Updated: ${slug} (score: ${qualityScore})`);
      } else {
        await prisma.recipe.create({
          data: {
            slug,
            recipeJson: recipeJson as any,
            metadata: metadata as any,
            qualityScore,
            status: RecipeStatus.draft,
            sourceType: SourceType.imported,
          },
        });
        created++;
        console.log(`  Created: ${slug} (score: ${qualityScore})`);
      }
    } catch (error) {
      console.error(`  Error processing ${file}:`, error);
      errors++;
    }
  }
  
  console.log('\n=== Seed Complete ===');
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
