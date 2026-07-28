/**
 * State Components
 *
 * - EmptyState: When no data is available
 * - ErrorState: When an error occurred
 * - LoadingSkeleton: While loading data
 */

import { Database, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
   EmptyState
   ============================================================================ */

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      <div className="text-center max-w-md">
        {icon && <div className="mb-4 text-text-tertiary">{icon}</div>}
        {!icon && <Database className="w-12 h-12 mx-auto mb-4 text-text-tertiary" />}

        <h2 className="text-lg font-display font-semibold text-text mb-2">{title}</h2>

        {description && <p className="text-sm text-text-secondary mb-6">{description}</p>}

        {action && (
          <button
            onClick={action.onClick}
            className="px-4 py-2 bg-primary text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   ErrorState
   ============================================================================ */

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  error,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      <div className="text-center max-w-md">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-danger" />

        <h2 className="text-lg font-display font-semibold text-text mb-2">{title}</h2>

        {description && <p className="text-sm text-text-secondary mb-4">{description}</p>}

        {error && (
          <div className="mb-6 p-3 bg-danger/10 border border-danger/30 rounded-md">
            <p className="text-xs font-mono text-danger">{error}</p>
          </div>
        )}

        {action && (
          <button
            onClick={action.onClick}
            className="px-4 py-2 bg-primary text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   LoadingSkeleton
   ============================================================================ */

interface SkeletonProps {
  className?: string;
  count?: number;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-bg-tertiary rounded-md animate-pulse",
        className
      )}
    />
  );
}

export function LoadingSkeleton({ count = 3 }: SkeletonProps) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 pb-4 border-b border-border">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-5 w-1/4" />
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-bg-secondary p-6 rounded-lg space-y-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-2 pt-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

/* ============================================================================
   Fixtures
   ============================================================================ */

export function StatesFixture() {
  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">State Components</h1>

      {/* Empty State */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">EmptyState</h2>
        <div className="bg-bg-secondary rounded-lg">
          <EmptyState
            title="No institutions found"
            description="Try adjusting your search filters or create a new validation"
            action={{ label: "New Validation", onClick: () => {} }}
          />
        </div>
      </section>

      {/* Error State */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">ErrorState</h2>
        <div className="bg-bg-secondary rounded-lg">
          <ErrorState
            title="Validation failed"
            description="An error occurred while validating this institution"
            error="Database connection timeout after 5000ms"
            action={{ label: "Retry", onClick: () => {} }}
          />
        </div>
      </section>

      {/* Loading Skeleton */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">LoadingSkeleton</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-text-secondary mb-4">Generic Loading</p>
            <div className="bg-bg-secondary rounded-lg">
              <LoadingSkeleton count={3} />
            </div>
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-4">Table Loading</p>
            <div className="bg-bg-secondary p-4 rounded-lg">
              <TableSkeleton rows={3} />
            </div>
          </div>
        </div>
      </section>

      {/* Card Skeleton */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">CardSkeleton</h2>
        <div className="grid grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ EmptyState with semantic icon and clear call-to-action</p>
          <p>✓ ErrorState with technical details for debugging</p>
          <p>✓ Loading state uses pulse animation (can be disabled)</p>
          <p>✓ High contrast skeletons to avoid invisible loading</p>
          <p>✓ Aria-busy could be added for better screen reader support</p>
          <p>✓ No flashing or disorienting motion</p>
        </div>
      </section>
    </div>
  );
}
