import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, ChevronUp, ChevronDown, X, Bell, Check } from 'lucide-react';
import { Button } from './ui/button';

export interface ActiveTimer {
  id: string;
  step_id: string | null;
  label: string;
  duration_secs: number;
  started_at: string;
  remaining_secs: number | null;
}

interface TimerPanelProps {
  timers: ActiveTimer[];
  onTimerComplete?: (timer: ActiveTimer) => void;
  onTimerCancel?: (timerId: string) => void;
  onTimerSelect?: (timer: ActiveTimer) => void;
  className?: string;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getProgressPercent(timer: ActiveTimer): number {
  if (!timer.remaining_secs || timer.duration_secs <= 0) return 0;
  const elapsed = timer.duration_secs - timer.remaining_secs;
  return Math.min(100, (elapsed / timer.duration_secs) * 100);
}

function getTimerColor(timer: ActiveTimer): string {
  const remaining = timer.remaining_secs || 0;
  if (remaining <= 30) return 'text-red-500 bg-red-500/10';
  if (remaining <= 60) return 'text-orange-500 bg-orange-500/10';
  return 'text-emerald-500 bg-emerald-500/10';
}

export function TimerPanel({
  timers,
  onTimerComplete,
  onTimerCancel,
  onTimerSelect,
  className = ''
}: TimerPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [localTimers, setLocalTimers] = useState<ActiveTimer[]>(timers);
  
  // Update local timers when props change
  useEffect(() => {
    setLocalTimers(timers);
  }, [timers]);
  
  // Tick down local timers every second
  useEffect(() => {
    if (localTimers.length === 0) return;
    
    const interval = setInterval(() => {
      setLocalTimers(prev => 
        prev.map(timer => {
          if (timer.remaining_secs && timer.remaining_secs > 0) {
            const newRemaining = timer.remaining_secs - 1;
            
            // Notify when timer completes
            if (newRemaining <= 0 && onTimerComplete) {
              onTimerComplete(timer);
            }
            
            return { ...timer, remaining_secs: Math.max(0, newRemaining) };
          }
          return timer;
        })
      );
    }, 1000);
    
    return () => clearInterval(interval);
  }, [localTimers.length, onTimerComplete]);
  
  if (localTimers.length === 0) {
    return null;
  }
  
  const sortedTimers = [...localTimers].sort((a, b) => 
    (a.remaining_secs || 0) - (b.remaining_secs || 0)
  );
  
  const urgentCount = sortedTimers.filter(t => (t.remaining_secs || 0) <= 60).length;
  
  return (
    <motion.div
      className={`bg-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-lg overflow-hidden shadow-xl ${className}`}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Timer className="w-5 h-5 text-amber-500" />
          <span className="font-medium text-slate-100">
            Active Timers ({localTimers.length})
          </span>
          {urgentCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-red-500/20 text-red-400 rounded-full animate-pulse">
              {urgentCount} urgent
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>
      
      {/* Timer List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-slate-700/50">
              {sortedTimers.map((timer) => (
                <TimerItem
                  key={timer.id}
                  timer={timer}
                  onCancel={() => onTimerCancel?.(timer.id)}
                  onSelect={() => onTimerSelect?.(timer)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface TimerItemProps {
  timer: ActiveTimer;
  onCancel?: () => void;
  onSelect?: () => void;
}

function TimerItem({ timer, onCancel, onSelect }: TimerItemProps) {
  const remaining = timer.remaining_secs || 0;
  const isComplete = remaining <= 0;
  const isUrgent = remaining <= 30 && remaining > 0;
  const colorClass = getTimerColor(timer);
  const progress = getProgressPercent(timer);
  
  return (
    <motion.div
      className={`relative px-4 py-3 hover:bg-slate-800/30 transition-colors cursor-pointer ${
        isUrgent ? 'animate-pulse' : ''
      }`}
      onClick={onSelect}
      layout
    >
      {/* Progress bar background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${
            isComplete ? 'bg-emerald-500/10' : 'bg-amber-500/5'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Timer icon with color indicator */}
          <div className={`p-2 rounded-full ${colorClass}`}>
            {isComplete ? (
              <Bell className="w-4 h-4" />
            ) : (
              <Timer className="w-4 h-4" />
            )}
          </div>
          
          {/* Timer info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">
              {timer.label}
            </p>
            {timer.step_id && (
              <p className="text-xs text-slate-500 truncate">
                Step: {timer.step_id}
              </p>
            )}
          </div>
        </div>
        
        {/* Time remaining */}
        <div className="flex items-center gap-2">
          <span className={`text-lg font-mono font-bold ${
            isComplete ? 'text-emerald-400' :
            isUrgent ? 'text-red-400' :
            remaining <= 60 ? 'text-orange-400' :
            'text-slate-200'
          }`}>
            {isComplete ? 'Done!' : formatTime(remaining)}
          </span>
          
          {/* Cancel button */}
          {onCancel && !isComplete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          
          {/* Complete indicator */}
          {isComplete && (
            <div className="p-1 rounded-full bg-emerald-500/20">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default TimerPanel;
