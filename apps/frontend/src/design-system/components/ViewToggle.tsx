import { Grid3x3, List, SlidersHorizontal } from 'lucide-react';
import { TabButton } from './TabButton';

export type ViewMode = 'grid' | 'list' | 'filter';

export interface ViewToggleProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ activeView, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center justify-between px-5 w-full gap-2">
      <TabButton
        icon={<Grid3x3 className="size-4" strokeWidth={activeView === 'grid' ? 2 : 1.5} />}
        active={activeView === 'grid'}
        onClick={() => onViewChange('grid')}
        className="flex-1"
        aria-label="Grid view"
      />
      <TabButton
        icon={<List className="size-4" strokeWidth={activeView === 'list' ? 2 : 1.5} />}
        active={activeView === 'list'}
        onClick={() => onViewChange('list')}
        className="flex-1"
        aria-label="List view"
      />
      <TabButton
        icon={<SlidersHorizontal className="size-4" strokeWidth={activeView === 'filter' ? 2 : 1.5} />}
        active={activeView === 'filter'}
        onClick={() => onViewChange('filter')}
        size="icon"
        aria-label="Filter recipes"
      />
    </div>
  );
}
