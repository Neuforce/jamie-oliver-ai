import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-normal leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        difficulty: 'bg-[rgba(240,177,0,0.9)] text-white',
        cuisine: 'bg-[rgba(3,2,19,0.9)] text-white',
        easy: 'bg-[#81EB67] text-white',
        medium: 'bg-[#F0B100] text-white',
        hard: 'bg-[#EF4444] text-white',
      },
    },
    defaultVariants: {
      variant: 'difficulty',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <div className={badgeVariants({ variant, className })} {...props}>
      {children}
    </div>
  );
}
