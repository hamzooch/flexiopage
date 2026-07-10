'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsProps {
  value: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* Children should be TabsList and TabsContent */}
      {typeof children === 'function'
        ? (children as any)(value, onValueChange)
        : // Wrap children to pass context
          [...(Array.isArray(children) ? children : [children])].map((child: any) => {
            if (!child) return null;
            return child.type === TabsList
              ? { ...child, props: { ...child.props, _activeTab: value, _onValueChange: onValueChange } }
              : child.type === TabsContent
                ? { ...child, props: { ...child.props, _activeTab: value } }
                : child;
          })}
    </div>
  );
}

export function TabsList({ children, className, _activeTab, _onValueChange }: any) {
  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600',
        className,
      )}
      role="tablist"
    >
      {Array.isArray(children)
        ? children.map((child) =>
            child?.type === TabsTrigger
              ? {
                  ...child,
                  props: {
                    ...child.props,
                    _activeTab,
                    _onValueChange,
                  },
                }
              : child,
          )
        : children}
    </div>
  );
}

export function TabsTrigger({ value, children, className, _activeTab, _onValueChange }: any) {
  const isActive = value === _activeTab;
  return (
    <button
      onClick={() => _onValueChange?.(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900',
        className,
      )}
      role="tab"
      aria-selected={isActive}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className, _activeTab }: any) {
  if (value !== _activeTab) return null;
  return (
    <div className={cn('mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2', className)} role="tabpanel">
      {children}
    </div>
  );
}
