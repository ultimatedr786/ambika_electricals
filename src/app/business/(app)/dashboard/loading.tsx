import { ChartsSkeleton, PageHeaderSkeleton, StatsSkeleton } from "@/components/shared/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeaderSkeleton />
      <StatsSkeleton count={6} />
      <ChartsSkeleton />
    </div>
  );
}
