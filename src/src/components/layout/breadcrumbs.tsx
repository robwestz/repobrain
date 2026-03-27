import Link from "next/link";

export interface BreadcrumbsProps {
  workspaceId: string;
  workspaceName: string;
  repoOwner?: string;
  repoName?: string;
  activeFilePath?: string;
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const inner = maxLen - 3;
  const front = Math.ceil(inner / 2);
  const back = Math.floor(inner / 2);
  return `${str.slice(0, front)}...${str.slice(str.length - back)}`;
}

function Sep() {
  return (
    <span className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden>
      /
    </span>
  );
}

const linkClass =
  "shrink-0 text-sm text-gray-500 underline-offset-2 hover:underline dark:text-gray-400";
const staticClass =
  "min-w-0 truncate text-sm text-gray-500 dark:text-gray-400";

export function Breadcrumbs({
  workspaceId,
  workspaceName,
  repoOwner,
  repoName,
  activeFilePath,
}: BreadcrumbsProps) {
  const repoLabel =
    repoOwner && repoName ? `${repoOwner}/${repoName}` : undefined;
  const pathDisplay =
    activeFilePath && activeFilePath.length > 60
      ? truncateMiddle(activeFilePath, 60)
      : activeFilePath;

  return (
    <nav
      className="flex min-w-0 flex-1 items-center gap-2"
      aria-label="Breadcrumb"
    >
      <Link href="/dashboard" className={linkClass}>
        RepoBrain
      </Link>
      <Sep />
      <Link href={`/workspace/${workspaceId}`} className={linkClass}>
        <span className="truncate">{workspaceName}</span>
      </Link>
      {repoLabel && (
        <>
          <Sep />
          <span
            className={staticClass}
            aria-current={pathDisplay ? undefined : "page"}
          >
            {repoLabel}
          </span>
        </>
      )}
      {pathDisplay && (
        <>
          <Sep />
          <span className={staticClass} title={activeFilePath} aria-current="page">
            {pathDisplay}
          </span>
        </>
      )}
    </nav>
  );
}
