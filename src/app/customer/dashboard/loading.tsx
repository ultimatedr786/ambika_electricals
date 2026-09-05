import { CardGridSkeleton, StatsSkeleton } from "@/components/shared/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <StatsSkeleton count={4} />
      <CardGridSkeleton count={4} />
    </div>
  );
}
