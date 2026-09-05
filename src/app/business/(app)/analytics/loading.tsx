import { ChartsSkeleton, PageHeaderSkeleton, StatsSkeleton } from "@/components/shared/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <StatsSkeleton count={4} />
      <ChartsSkeleton />
    </div>
  );
}
