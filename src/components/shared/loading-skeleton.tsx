import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden p-3">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-4 h-9 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16" />
        </Card>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </Card>
      ))}
    </div>
  );
}

/**
 * Route-level skeletons.
 *
 * These back the `loading.tsx` files for each module. They are deliberately
 * small and contextual — a page header line plus the shape of the primary
 * surface — so a module swap shows the *silhouette* of where you are going
 * rather than a full-page shimmer or a spinner.
 */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      {action && <Skeleton className="h-10 w-32 rounded-lg" />}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[220px]" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="hidden h-4 w-16 sm:block" />
        </div>
      ))}
    </Card>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <Card className="p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-[260px] w-full rounded-lg" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-[260px] w-full rounded-lg" />
      </Card>
    </div>
  );
}
