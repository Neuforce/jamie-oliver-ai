import React, { forwardRef } from 'react';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'solid' | 'ghost';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — required for icon-only controls. */
  label: string;
  icon: React.ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
}

const sizeClass: Record<IconButtonSize, string> = {
  sm: '',
  md: 'jamie-icon-button--md',
  lg: 'jamie-icon-button--lg',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'sm', variant = 'solid', className = '', type = 'button', ...rest },
  ref
) {
  const classes = [
    'jamie-icon-button',
    sizeClass[size],
    variant === 'ghost' ? 'jamie-icon-button--ghost' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={classes} {...rest}>
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
    </button>
  );
});
