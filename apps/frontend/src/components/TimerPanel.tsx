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
  stepMetaById?: Record<string, { number?: number; title?: string }>;
  className?: string;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatCompactTime(seconds: number): string {
  if (seconds <= 0) return 'Done';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function prettifyStepId(stepId: string | null | undefined): string {
  if (!stepId) return 'Current step';
  return stepId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  stepMetaById,
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
      className={`jamie-timer-panel ${className}`}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="jamie-timer-panel__toggle"
      >
        <div className="jamie-timer-panel__title-row">
          <Timer className="jamie-timer-panel__title-icon" />
          <div className="jamie-timer-panel__header-copy">
            <span className="jamie-timer-panel__title">Active Timers</span>
            <div className="jamie-timer-panel__pills">
              {sortedTimers.slice(0, 3).map((timer) => {
                const stepMeta = timer.step_id ? stepMetaById?.[timer.step_id] : undefined;
                const timerPillLabel = stepMeta?.number
                  ? `Step ${stepMeta.number}`
                  : prettifyStepId(timer.step_id || timer.label);
                return (
                  <span key={timer.id} className="jamie-timer-panel__pill">
                    <span className="jamie-timer-panel__pill-label">{timerPillLabel}</span>
                    <strong className="jamie-timer-panel__pill-time">
                      {formatCompactTime(timer.remaining_secs || 0)}
                    </strong>
                  </span>
                );
              })}
              {sortedTimers.length > 3 && (
                <span className="jamie-timer-panel__pill jamie-timer-panel__pill--more">
                  +{sortedTimers.length - 3}
                </span>
              )}
            </div>
          </div>
          {urgentCount > 0 && (
            <span className="jamie-timer-panel__urgent">
              {urgentCount} urgent
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="jamie-timer-panel__chevron" />
        ) : (
          <ChevronDown className="jamie-timer-panel__chevron" />
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
            className="jamie-timer-panel__body"
          >
            <div className="jamie-timer-panel__list">
              {sortedTimers.map((timer) => (
                <TimerItem
                  key={timer.id}
                  timer={timer}
                  stepMeta={timer.step_id ? stepMetaById?.[timer.step_id] : undefined}
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
  stepMeta?: { number?: number; title?: string };
  onCancel?: () => void;
  onSelect?: () => void;
}

function TimerItem({ timer, stepMeta, onCancel, onSelect }: TimerItemProps) {
  const remaining = timer.remaining_secs || 0;
  const isComplete = remaining <= 0;
  const isUrgent = remaining <= 30 && remaining > 0;
  const colorClass = getTimerColor(timer);
  const progress = getProgressPercent(timer);
  const primaryLabel = timer.label || stepMeta?.title || prettifyStepId(timer.step_id);
  const secondaryLabel = stepMeta?.number
    ? `Step ${stepMeta.number}`
    : prettifyStepId(timer.step_id);
  
  return (
    <motion.div
      className={`jamie-timer-panel__item ${
        isUrgent ? 'animate-pulse' : ''
      }`}
      onClick={onSelect}
      layout
    >
      {/* Progress bar background */}
      <div className="jamie-timer-panel__progress">
        <div
          className={`jamie-timer-panel__progress-fill ${
            isComplete ? 'jamie-timer-panel__progress-fill--done' : ''
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="jamie-timer-panel__item-row">
        <div className="jamie-timer-panel__item-copy-wrap">
          {/* Timer icon with color indicator */}
          <div className={`jamie-timer-panel__item-icon ${colorClass}`}>
            {isComplete ? (
              <Bell className="w-4 h-4" />
            ) : (
              <Timer className="w-4 h-4" />
            )}
          </div>
          
          {/* Timer info */}
          <div className="jamie-timer-panel__item-copy">
            <p className="jamie-timer-panel__item-title">
              {primaryLabel}
            </p>
            {(timer.step_id || stepMeta?.number) && (
              <p className="jamie-timer-panel__item-subtitle">
                {secondaryLabel}
              </p>
            )}
          </div>
        </div>
        
        {/* Time remaining */}
        <div className="jamie-timer-panel__item-actions">
          <span className={`jamie-timer-panel__time ${
            isComplete ? 'jamie-timer-panel__time--done' :
            isUrgent ? 'jamie-timer-panel__time--urgent' :
            remaining <= 60 ? 'jamie-timer-panel__time--warn' :
            ''
          }`}>
            {isComplete ? 'Done!' : formatTime(remaining)}
          </span>
          
          {/* Cancel button */}
          {onCancel && !isComplete && (
            <Button
              variant="ghost"
              size="icon"
              className="jamie-timer-panel__cancel"
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
            <div className="jamie-timer-panel__done">
              <Check className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default TimerPanel;
