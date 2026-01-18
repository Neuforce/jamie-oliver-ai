import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShoppingCart, Check, Copy, Share2 } from 'lucide-react';
import type { ShoppingListData } from '../lib/api';

interface ShoppingListCardProps {
  shoppingList: ShoppingListData;
}

export const ShoppingListCard: React.FC<ShoppingListCardProps> = ({
  shoppingList,
}) => {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const toggleItem = (index: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    const text = shoppingList.shopping_list
      .map(item => `${item.quantity ? item.quantity + ' ' : ''}${item.item}`)
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    const text = `Shopping List for: ${shoppingList.recipes_included.join(', ')}\n\n` +
      shoppingList.shopping_list
        .map(item => `• ${item.quantity ? item.quantity + ' ' : ''}${item.item}`)
        .join('\n');
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Shopping List', text });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    }
  };

  const checkedCount = checkedItems.size;
  const totalCount = shoppingList.shopping_list.length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl overflow-hidden bg-white"
      style={{
        border: '1px solid rgba(70, 190, 168, 0.2)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-5 text-white" />
            <h2 className="font-bold text-white text-lg">
              Shopping List
            </h2>
          </div>
          <span className="text-white/90 text-sm font-medium">
            {totalCount} items
          </span>
        </div>
        
        {/* Recipes included */}
        <p className="text-white/80 text-sm mt-1">
          For: {shoppingList.recipes_included.join(', ')}
        </p>
        
        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-white rounded-full"
              transition={{ type: 'spring', damping: 20 }}
            />
          </div>
          <p className="text-white/80 text-xs mt-1">
            {checkedCount} of {totalCount} collected
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 max-h-[300px] overflow-y-auto">
        <div className="space-y-2">
          {shoppingList.shopping_list.map((item, index) => {
            const isChecked = checkedItems.has(index);
            
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => toggleItem(index)}
                className={`
                  flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all
                  ${isChecked 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-transparent hover:bg-gray-100'
                  }
                `}
                style={{ border: '1px solid' }}
              >
                {/* Checkbox */}
                <div 
                  className={`
                    size-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors
                    ${isChecked 
                      ? 'bg-green-500 text-white' 
                      : 'border-2 border-gray-300'
                    }
                  `}
                >
                  {isChecked && <Check className="size-3" strokeWidth={3} />}
                </div>
                
                {/* Item details */}
                <div className="flex-1 min-w-0">
                  <p 
                    className={`text-sm font-medium ${isChecked ? 'line-through text-gray-400' : ''}`}
                    style={{ color: isChecked ? undefined : 'var(--jamie-text-body)' }}
                  >
                    {item.item}
                  </p>
                  {item.quantity && (
                    <p 
                      className={`text-xs ${isChecked ? 'text-gray-400' : ''}`}
                      style={{ color: isChecked ? undefined : 'var(--jamie-text-muted)' }}
                    >
                      {item.quantity}
                    </p>
                  )}
                  {item.notes && (
                    <p 
                      className={`text-xs italic ${isChecked ? 'text-gray-400' : ''}`}
                      style={{ color: isChecked ? undefined : 'var(--jamie-text-muted)' }}
                    >
                      {item.notes}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div 
        className="flex gap-2 p-4 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-colors hover:bg-gray-50"
          style={{ 
            borderColor: '#d97706',
            color: '#d97706',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          {copied ? (
            <>
              <Check className="size-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy List
            </>
          )}
        </button>
        
        {typeof navigator.share === 'function' && (
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white transition-colors"
            style={{ 
              background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            <Share2 className="size-4" />
            Share
          </button>
        )}
      </div>
    </motion.div>
  );
};
