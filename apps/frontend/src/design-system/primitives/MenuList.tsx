import React from 'react';

export interface MenuListItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  onSelect: () => void;
}

export interface MenuListProps {
  items: MenuListItem[];
}

export function MenuList({ items }: MenuListProps) {
  return (
    <div className="jamie-menu-group" role="menu">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="jamie-menu-row"
          onClick={item.onSelect}
        >
          {item.icon && <span className="jamie-menu-row__icon">{item.icon}</span>}
          <span className="jamie-menu-row__label">{item.label}</span>
          {item.meta !== undefined && item.meta !== null && (
            <span className="jamie-menu-row__meta">{item.meta}</span>
          )}
        </button>
      ))}
    </div>
  );
}
