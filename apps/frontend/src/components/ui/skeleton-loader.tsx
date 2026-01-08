import { motion } from 'motion/react';

export function SkeletonLoader() {
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Nav Skeleton */}
      <div className="bg-white h-[56px] border-b border-border/30">
        <div className="h-[24px] w-[171.75px] mx-auto mt-[16px] bg-gray-200/50 rounded animate-pulse" />
      </div>

      {/* Content Skeleton */}
      <div className="flex-1 overflow-hidden px-5 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Image Skeleton */}
          <motion.div 
            className="w-full h-[400px] bg-gradient-to-r from-gray-200/50 via-gray-300/30 to-gray-200/50 rounded-2xl"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              backgroundSize: '200% 100%',
            }}
          />

          {/* Title Skeleton */}
          <div className="space-y-3">
            <div className="h-8 w-3/4 bg-gray-200/50 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-gray-200/50 rounded animate-pulse" />
          </div>

          {/* Content Lines Skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-200/50 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-200/50 rounded animate-pulse" />
            <div className="h-4 w-4/6 bg-gray-200/50 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecipeSkeletonLoader() {
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
      {/* Hero Image Skeleton */}
      <motion.div 
        className="w-full h-[60vh] bg-gradient-to-r from-gray-200 via-gray-300/50 to-gray-200"
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          backgroundSize: '200% 100%',
        }}
      />

      {/* Content Skeleton */}
      <div className="flex-1 px-5 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Title */}
          <div className="space-y-3">
            <div className="h-10 w-3/4 bg-gray-200/70 rounded animate-pulse" />
            <div className="flex gap-3">
              <div className="h-6 w-24 bg-gray-200/70 rounded-full animate-pulse" />
              <div className="h-6 w-24 bg-gray-200/70 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-gray-200/70 rounded-full animate-pulse" />
            <div className="h-10 w-32 bg-gray-200/70 rounded-full animate-pulse" />
          </div>

          {/* Content Lines */}
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-200/70 rounded animate-pulse" />
            <div className="h-4 w-full bg-gray-200/70 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-200/70 rounded animate-pulse" />
            <div className="h-4 w-4/6 bg-gray-200/70 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatSkeletonLoader() {
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Nav Skeleton */}
      <div className="bg-white h-[56px] border-b border-border/30">
        <div className="h-[24px] w-[171.75px] mx-auto mt-[16px] bg-gray-200/50 rounded animate-pulse" />
      </div>

      {/* Messages Skeleton */}
      <div className="flex-1 overflow-hidden px-5 py-4">
        <div className="max-w-[350px] mx-auto space-y-6">
          {/* Message 1 */}
          <div className="flex gap-4 items-start">
            <div className="size-8 rounded-full bg-gray-200/70 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-full bg-gray-200/70 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-gray-200/70 rounded animate-pulse" />
            </div>
          </div>

          {/* Separator */}
          <div className="h-px w-full bg-gray-200/50" />

          {/* Message 2 */}
          <div className="bg-gray-100/50 rounded-2xl p-4 space-y-2">
            <div className="h-4 w-4/5 bg-gray-200/70 rounded animate-pulse" />
            <div className="h-4 w-3/5 bg-gray-200/70 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Input Skeleton */}
      <div className="px-5 py-3 shrink-0">
        <div className="max-w-[350px] mx-auto">
          <div className="h-[54px] bg-gray-200/50 rounded-[32px] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
