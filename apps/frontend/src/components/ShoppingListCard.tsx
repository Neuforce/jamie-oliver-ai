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
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="overflow-hidden bg-white"
      style={{
        borderRadius: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Header */}
      <div 
        className="px-5 py-4"
        style={{ background: '#3D6E6C' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-5 text-white" />
            <h2
              style={{
                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                fontSize: '16px',
                fontWeight: 700,
                color: 'white',
                textTransform: 'uppercase',
                letterSpacing: '0.087px',
                margin: 0,
              }}
            >
              Shopping List
            </h2>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-body, Inter, sans-serif)',
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: 500,
            }}
          >
            {totalCount} items
          </span>
        </div>
        
        {/* Recipes included */}
        <p
          style={{
            fontFamily: 'var(--font-body, Inter, sans-serif)',
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.75)',
            marginTop: '4px',
          }}
        >
          For: {shoppingList.recipes_included.join(', ')}
        </p>
        
        {/* Progress bar */}
        <div className="mt-3">
          <div 
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255, 255, 255, 0.3)' }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full rounded-full"
              style={{ background: '#81EB67' }}
              transition={{ type: 'spring', damping: 20 }}
            />
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body, Inter, sans-serif)',
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.75)',
              marginTop: '6px',
            }}
          >
            {checkedCount} of {totalCount} collected
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="p-5" style={{ maxHeight: '300px', overflowY: 'auto' }}>
        <div className="space-y-2">
          {shoppingList.shopping_list.map((item, index) => {
            const isChecked = checkedItems.has(index);
            
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => toggleItem(index)}
                className="flex items-start gap-3 p-3 cursor-pointer transition-all"
                style={{
                  borderRadius: '12px',
                  background: isChecked ? '#F0FDF4' : '#F8FAFA',
                  border: isChecked ? '1px solid #86EFAC' : '1px solid transparent',
                }}
              >
                {/* Checkbox */}
                <div 
                  className="size-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                  style={{
                    background: isChecked ? '#22C55E' : 'white',
                    border: isChecked ? 'none' : '2px solid #D1D5DB',
                  }}
                >
                  {isChecked && <Check className="size-3 text-white" strokeWidth={3} />}
                </div>
                
                {/* Item details */}
                <div className="flex-1 min-w-0">
                  <p
                    style={{
                      fontFamily: 'var(--font-body, Inter, sans-serif)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: isChecked ? '#9CA3AF' : '#234252',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      margin: 0,
                    }}
                  >
                    {item.item}
                  </p>
                  {item.quantity && (
                    <p
                      style={{
                        fontFamily: 'var(--font-body, Inter, sans-serif)',
                        fontSize: '12px',
                        color: isChecked ? '#D1D5DB' : '#5d5d5d',
                        marginTop: '2px',
                      }}
                    >
                      {item.quantity}
                    </p>
                  )}
                  {item.notes && (
                    <p
                      style={{
                        fontFamily: 'var(--font-body, Inter, sans-serif)',
                        fontSize: '12px',
                        fontStyle: 'italic',
                        color: isChecked ? '#D1D5DB' : '#5d5d5d',
                        marginTop: '2px',
                      }}
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
        className="flex gap-3 p-5"
        style={{ borderTop: '1px solid #E6EAE9' }}
      >
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-colors hover:bg-gray-50"
          style={{ 
            border: '1px solid #3D6E6C',
            color: '#3D6E6C',
            fontFamily: 'var(--font-display, Poppins, sans-serif)',
            fontSize: '14px',
            fontWeight: 600,
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
        
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-white transition-colors"
            style={{ 
              background: '#3D6E6C',
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: '14px',
              fontWeight: 600,
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
