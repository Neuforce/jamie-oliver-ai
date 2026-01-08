import { cva, type VariantProps } from 'class-variance-authority';

const tabButtonVariants = cva(
  'flex items-center justify-center h-8 rounded-full transition-all',
  {
    variants: {
      variant: {
        active: 'bg-[#46BEA8] text-white',
        inactive: 'bg-transparent text-[#0A0A0A]',
      },
      size: {
        default: 'px-4 min-w-[36px]',
        icon: 'w-9',
      },
    },
    defaultVariants: {
      variant: 'inactive',
      size: 'default',
    },
  }
);

export interface TabButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof tabButtonVariants> {
  icon: React.ReactNode;
  active?: boolean;
}

export function TabButton({ 
  className, 
  variant, 
  size, 
  icon, 
  active = false,
  ...props 
}: TabButtonProps) {
  return (
    <button
      className={tabButtonVariants({ 
        variant: active ? 'active' : 'inactive', 
        size, 
        className 
      })}
      {...props}
    >
      {icon}
    </button>
  );
}
