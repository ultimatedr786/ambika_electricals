import { ListSkeleton, PageHeaderSkeleton } from "@/components/shared/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton action={false} />
      <ListSkeleton count={7} />
    </div>
  );
}
