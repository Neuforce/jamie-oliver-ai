import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy } from 'lucide-react';
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

  const checkedCount = checkedItems.size;
  const totalCount = shoppingList.shopping_list.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden bg-white"
      style={{
        borderRadius: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--jamie-text-heading, #2C5F5D)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              margin: 0,
            }}
          >
            Shopping List
          </h2>
          <span
            style={{
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: '14px',
              color: 'var(--jamie-text-muted, #717182)',
            }}
          >
            {checkedCount} / {totalCount}
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-display, Poppins, sans-serif)',
            fontSize: '14px',
            color: 'var(--jamie-text-muted, #717182)',
            marginTop: '4px',
          }}
        >
          {shoppingList.recipes_included.join(', ')}
        </p>
      </div>

      {/* Items */}
      <div style={{ padding: '0 24px', maxHeight: '280px', overflowY: 'auto' }}>
        {shoppingList.shopping_list.map((item, index) => {
          const isChecked = checkedItems.has(index);
          
          return (
            <React.Fragment key={index}>
              <button
                onClick={() => toggleItem(index)}
                style={{
                  width: '100%',
                  padding: '14px 0',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  textAlign: 'left',
                }}
              >
                {/* Checkbox */}
                <div 
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '1px',
                    background: isChecked ? 'var(--jamie-primary, #46BEA8)' : 'transparent',
                    border: isChecked ? 'none' : '2px solid #D1D5DB',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isChecked && <Check className="size-3 text-white" strokeWidth={3} />}
                </div>
                
                {/* Item */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-display, Poppins, sans-serif)',
                      fontSize: '15px',
                      fontWeight: 500,
                      color: isChecked ? '#9CA3AF' : 'var(--jamie-text-primary, #234252)',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      margin: 0,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.item}
                  </p>
                  {item.quantity && (
                    <p
                      style={{
                        fontFamily: 'var(--font-display, Poppins, sans-serif)',
                        fontSize: '13px',
                        color: isChecked ? '#D1D5DB' : 'var(--jamie-text-muted, #717182)',
                        marginTop: '2px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {item.quantity}
                    </p>
                  )}
                </div>
              </button>
              {index < shoppingList.shopping_list.length - 1 && (
                <div style={{ height: '1px', background: '#F2F5F6' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Copy button */}
      <div style={{ padding: '16px 24px 20px' }}>
        <button
          onClick={handleCopy}
          style={{
            width: '100%',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            borderRadius: '22px',
            border: '1px solid var(--jamie-text-heading, #2C5F5D)',
            background: 'transparent',
            color: 'var(--jamie-text-heading, #2C5F5D)',
            fontFamily: 'var(--font-display, Poppins, sans-serif)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {copied ? (
            <>
              <Check className="size-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy List
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
};
