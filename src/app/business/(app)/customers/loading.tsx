import { PageHeaderSkeleton, StatsSkeleton, TableSkeleton } from "@/components/shared/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <StatsSkeleton count={4} />
      <TableSkeleton rows={8} />
    </div>
  );
}
