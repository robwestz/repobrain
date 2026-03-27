import { PageLoading } from "@/src/components/ui/page-loading";

export default function WorkspaceLoading() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <PageLoading title="Loading workspace..." />
    </div>
  );
}
