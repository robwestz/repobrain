# Job 01: Breadcrumbs & Sidebar Navigation

## Summary
Add breadcrumb navigation to the main repo/shell view and create a sidebar navigation component that all future features will hook into. This is the foundation for the 14 features that follow.

## Scope (terminology)
- **Project folder:** all edits happen inside the RepoBrain repository (this repo only).
- **Workspace (in this job):** RepoBrain’s **in-app** workspace — the product entity that holds connected repos (routes like `/workspace/...`), not the Cursor/IDE workspace name.

## Size: XS (~30 min)

## Dependencies: None

## What to Build

### 1. Breadcrumb Component
Create `src/components/layout/breadcrumbs.tsx`

A horizontal breadcrumb bar showing the current navigation path:
```
RepoBrain / {workspaceName} / {repo.owner}/{repo.name} / {activeFilePath?}
```

Props:
```typescript
interface BreadcrumbsProps {
  workspaceId: string;
  workspaceName: string;
  repoOwner: string;
  repoName: string;
  activeFilePath?: string; // e.g. "src/lib/db/schema.ts"
}
```

Behavior:
- "RepoBrain" links to `/dashboard`
- In-app workspace name links to `/workspace/{workspaceId}`
- Repo name is not clickable (current view)
- File path segments: prefer **decorative only** in this job (do not change file-tree). Optional: links that navigate within the same view only if shell already exposes a hook without touching `file-tree`.
- Use `/` as separator with Tailwind text-gray-400
- Truncate the **active file path** string with `...` in the middle if its length is > 60 chars (repo + workspace crumbs are short; truncation targets the path tail)
- Styling: `text-sm text-gray-500` with hover underlines on links

### 2. Sidebar Navigation Component
Create `src/components/layout/sidebar-nav.tsx`

A vertical sidebar with icon+label navigation items. This is the main navigation for in-app workspace features (shell-level).

```typescript
interface NavItem {
  id: string;
  label: string;
  icon: string; // emoji or SVG component name
  href: string; // absolute app path, e.g. `/workspace/{workspaceId}` or `/workspace/{id}/search` when that route exists
  badge?: number; // optional count badge
}

// Job 01: only Explorer — no routes for features that do not exist yet.
// Construct where workspaceId is in scope (shell or helper), e.g.:
// const NAV_ITEMS: NavItem[] = [{ id: "explorer", label: "Explorer", icon: "files", href: `/workspace/${workspaceId}` }];
```

Layout:
- Fixed left sidebar, 48px wide (icons only by default)
- Expands to 200px on hover showing labels
- Active item highlighted with left border accent
- Icons: use simple SVG icons (create inline or use heroicons-style)
- Bottom section: settings gear icon (decorative / `button` with no navigation in this job unless `/settings` already exists)

### 3. Modify Workspace Shell
Modify `src/components/layout/workspace-shell.tsx`

Current layout:
```
[FileTree] [CodeViewer] [ChatPane]
```

New layout:
```
[Sidebar] [Breadcrumbs                    ]
[       ] [FileTree] [CodeViewer] [ChatPane]
```

- Add Breadcrumbs above the three-panel resizable layout
- Add Sidebar to the left of everything
- Breadcrumbs receive in-app `workspaceId`, workspace display name, repo, and file path from WorkspaceShell state
- Sidebar receives current route (and resolved `href`s) for active highlighting

## Files to Create
- `src/components/layout/breadcrumbs.tsx`
- `src/components/layout/sidebar-nav.tsx`

## Files to Modify
- `src/components/layout/workspace-shell.tsx` — Add breadcrumbs + sidebar to layout

## No DB Changes
## No API Changes
## No New Dependencies

## Acceptance Criteria
1. Breadcrumbs visible above the code panels showing in-app workspace name > repo > file path
2. Clicking "RepoBrain" navigates to dashboard
3. Sidebar visible on left with "Explorer" highlighted
4. Sidebar expands on hover showing labels
5. Three-panel layout (FileTree, CodeViewer, ChatPane) still works correctly
6. Active file path updates in breadcrumbs when clicking files in tree
7. `npm run build` passes

## What NOT to Do
- Do not add a hamburger menu or mobile nav (not needed yet)
- Do not modify the chat, file-tree, or code-viewer components
- Do not add routing for features that don't exist yet (only "Explorer" nav item)
- Do not install any new npm packages — use inline SVGs for icons
