import React, { useState, useRef, useEffect } from 'react';
import { Recipe } from '../data/recipes';
import { RecipeCarousel } from './RecipeCarousel';
import { ArrowUp } from 'lucide-react';
import { motion } from 'motion/react';
// @ts-expect-error - Vite resolves figma:asset imports via alias configuration
import imgImage11 from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';
// @ts-expect-error - Vite resolves figma:asset imports via alias configuration
import imgJamieAvatar from 'figma:asset/dbe757ff22db65b8c6e8255fc28d6a6a29240332.png';
import { searchRecipes } from '../lib/api';
import { transformRecipeMatch, loadRecipeFromLocal } from '../data/recipeTransformer';
import type { RecipeMatchResponse } from '../lib/api';
import type { JamieOliverRecipe } from '../data/recipeTransformer';

interface Message {
  id: string;
  type: 'user' | 'jamie';
  content: string;
  recipes?: Recipe[];
  timestamp: Date;
}

interface ChatWithJamieProps {
  onClose: () => void;
  onRecipeClick: (recipe: Recipe) => void;
}

export function ChatWithJamie({ onClose, onRecipeClick }: ChatWithJamieProps) {
  const [messages, setMessages] = useState([
    {
      id: '1',
      type: 'jamie' as const,
      content: "Hello there! I'm Jamie Oliver, and I'm here to help you discover amazing recipes. What are you in the mood for today?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null as string | null);
  const [displayedThinkingText, setDisplayedThinkingText] = useState('');
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [error, setError] = useState(null as string | null);
  const messagesEndRef = useRef(null as HTMLDivElement | null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Animate thinking status text letter by letter
  useEffect(() => {
    if (thinkingStatus) {
      setDisplayedThinkingText('');
      let currentIndex = 0;
      
      const typeInterval = setInterval(() => {
        if (currentIndex < thinkingStatus.length) {
          setDisplayedThinkingText(thinkingStatus.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(typeInterval);
        }
      }, 50); // 50ms per character for smooth typing effect
      
      return () => clearInterval(typeInterval);
    } else {
      setDisplayedThinkingText('');
    }
  }, [thinkingStatus]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    const savedInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setError(null);
    setThinkingStatus("Searching for recipes...");
    setLoadingRecipes(true);

    try {
      // Call semantic search API
      const searchResponse = await searchRecipes(savedInput, {
        include_full_recipe: true,
        top_k: 10,
        include_chunks: false,
        similarity_threshold: 0.7, // Umbral mínimo de similitud (0.0-1.0). Solo retorna resultados con score >= threshold
      });

      setThinkingStatus(null);
      setLoadingRecipes(false);

      if (searchResponse.results.length === 0) {
        // No results found
        const noResultsMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'jamie',
          content: "I couldn't find any recipes matching your search. Try describing what you're looking for in a different way!",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, noResultsMessage]);
        setIsTyping(false);
        return;
      }

      // Transform all recipe matches to Recipe format
      const transformedRecipes: Recipe[] = [];
      
      for (let i = 0; i < searchResponse.results.length; i++) {
        const match = searchResponse.results[i];
        
        try {
          let fullRecipe;
          
          // Check if full_recipe is available in the response
          if (match.full_recipe) {
            fullRecipe = match.full_recipe as unknown as JamieOliverRecipe;
        } else {
            // Fallback: load from local JSON files
            const localRecipe = await loadRecipeFromLocal(match.recipe_id);
            if (!localRecipe) {
              console.warn(`Could not load recipe ${match.recipe_id} from local files`);
              continue;
            }
            fullRecipe = localRecipe;
          }
          
          const transformed = transformRecipeMatch(match, fullRecipe, i);
          transformedRecipes.push(transformed);
        } catch (error) {
          console.error(`Error transforming recipe ${match.recipe_id}:`, error);
          // Continue with other recipes
        }
      }

      if (transformedRecipes.length === 0) {
        // All recipes failed to transform
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'jamie',
          content: "I found some recipes, but there was an error loading them. Please try again!",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsTyping(false);
        return;
      }

      // Add message with recipes (no text content, just recipes)
          const jamieMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'jamie',
        content: '', // No text content, only recipes
        recipes: transformedRecipes,
            timestamp: new Date(),
          };
          
          setMessages(prev => [...prev, jamieMessage]);
      setIsTyping(false);
    } catch (error) {
      console.error('Error searching recipes:', error);
      setThinkingStatus(null);
              setLoadingRecipes(false);
      setError(error instanceof Error ? error.message : 'An error occurred while searching for recipes');
      
      // Show error message to user
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'jamie',
        content: error instanceof Error && error.message.includes('connect')
          ? "I'm having trouble connecting to the recipe search service. Please make sure the backend is running and try again!"
          : "Sorry, something went wrong while searching for recipes. Please try again!",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
            setIsTyping(false);
          }
  };

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ 
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] // Custom easing for smooth spring-like motion
      }}
      className="fixed inset-0 bg-white z-50 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Nav */}
      <div className="bg-white relative rounded-bl-[16px] rounded-br-[16px] h-[56px] shrink-0">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute left-[11px] size-[24px] top-[16px] z-10"
        >
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6L18 18" stroke="#327179" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </button>
        
        {/* Logo */}
        <div className="absolute h-[24px] left-[110px] top-[16px] w-[171.75px]">
          <img alt="Jamie Oliver" className="absolute inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgImage11} />
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-[20px] py-4">
        <div className="max-w-[350px] mx-auto space-y-4">
          {messages.map((message, index) => (
            <div key={message.id}>
              {/* Separator */}
              {index > 0 && (
                <div className="h-px w-full bg-black/5 my-4" />
              )}
              
              {message.type === 'jamie' ? (
                message.content && (
                <div className="flex gap-4 items-start">
                  {/* Avatar */}
                  <div className="relative shrink-0 size-[31.875px]">
                    <img alt="" className="block size-full rounded-full" src={imgJamieAvatar} />
                  </div>
                  
                  {/* Message Content */}
                  <p className="flex-1 font-['Work_Sans',sans-serif] leading-[1.5] text-[#2c2c2c] text-base whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
                )
              ) : (
                <div className="bg-[#f5f5f5] rounded-[16px] p-4">
                  <p className="font-['Work_Sans',sans-serif] leading-[24px] text-[#090909] text-base">
                    {message.content}
                  </p>
                </div>
              )}

              {/* Recipe Carousel */}
              {message.recipes && message.recipes.length > 0 && (
                <div className="mt-4">
                  <RecipeCarousel 
                    recipes={message.recipes} 
                    onRecipeClick={(recipe) => {
                      onRecipeClick(recipe);
                      onClose();
                    }} 
                  />
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator with Contextual Status */}
          {isTyping && thinkingStatus && (
            <>
              <div className="h-px w-full bg-black/5 my-4" />
              <div className="flex gap-4 items-start">
                <div className="relative shrink-0 size-[31.875px]">
                  <img alt="" className="block size-full rounded-full" src={imgJamieAvatar} />
                </div>
                <div className="flex items-center gap-0 pt-1">
                  {/* Status text with blinking cursor */}
                  <span className="text-sm font-['Work_Sans',sans-serif] text-[#2c2c2c] italic">
                    {displayedThinkingText}
                  </span>
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="text-sm font-['Work_Sans',sans-serif] text-[#2c2c2c] ml-0.5"
                  >
                    |
                  </motion.span>
                </div>
              </div>
            </>
          )}

          {/* Loading Recipes Card with Spinner */}
          {loadingRecipes && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-white rounded-2xl border border-black/5 shadow-sm p-8"
            >
              <div className="flex items-center justify-center">
                <div className="relative">
                  {/* Small spinning ring */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="size-6 rounded-full border-2 border-[#46BEA8]/20 border-t-[#46BEA8]"
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input - Fixed at bottom */}
      <div className="px-[20px] py-3 shrink-0">
        <div className="max-w-[350px] mx-auto">
          <div className="bg-white relative rounded-[32px] border border-black/10 shadow-[0px_2px_5px_0px_rgba(0,0,0,0.06),0px_9px_9px_0px_rgba(0,0,0,0.01)]">
            <div className="flex items-center gap-5 p-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask your question…"
                className="flex-1 font-['Inter',sans-serif] text-base leading-[24px] text-[#8e8e93] placeholder:text-[#8e8e93] bg-transparent outline-none"
              />
              
              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className={`shrink-0 size-9 rounded-full flex items-center justify-center transition-colors ${
                  inputValue.trim() 
                    ? 'bg-[#46BEA8] hover:bg-[#327179]' 
                    : 'bg-[#b4b4b4]'
                }`}
              >
                <ArrowUp className="size-6 text-white" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}