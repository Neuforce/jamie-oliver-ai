import React, { forwardRef } from 'react';

export type SurfaceVariant = 'default' | 'flat' | 'feature';
export type SurfaceRadius = 'md' | 'lg' | 'xl' | 'pill';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: keyof JSX.IntrinsicElements;
  variant?: SurfaceVariant;
  radius?: SurfaceRadius;
}

const variantClass: Record<SurfaceVariant, string> = {
  default: 'jamie-surface',
  flat: 'jamie-surface jamie-surface--flat',
  feature: 'jamie-surface jamie-surface--feature',
};

const radiusStyle: Record<SurfaceRadius, React.CSSProperties | undefined> = {
  md: { borderRadius: 'var(--jamie-radius-md)' },
  lg: undefined,
  xl: { borderRadius: 'var(--jamie-radius-xl)' },
  pill: { borderRadius: 'var(--jamie-radius-pill)' },
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { as = 'div', variant = 'default', radius = 'lg', className = '', style, children, ...rest },
  ref
) {
  const Component = as as React.ElementType;
  const classes = [variantClass[variant], className].filter(Boolean).join(' ');
  const mergedStyle = { ...radiusStyle[radius], ...style } as React.CSSProperties;

  return (
    <Component ref={ref as any} className={classes} style={mergedStyle} {...rest}>
      {children}
    </Component>
  );
});
