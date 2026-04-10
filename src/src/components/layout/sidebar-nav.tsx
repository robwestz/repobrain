"use client";

import { usePathname } from "next/navigation";
// Use <a> instead of <Link> because feature pages are separate server components
import { useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

function buildNavItems(workspaceId: string): NavItem[] {
  const base = `/workspace/${workspaceId}`;
  return [
    { id: "explorer", label: "Explorer", href: base, icon: <IconFiles /> },
    { id: "search", label: "Search", href: `${base}/search`, icon: <IconSearch /> },
    { id: "galaxy", label: "Galaxy", href: `${base}/galaxy`, icon: <IconNetwork /> },
    { id: "architecture", label: "Architecture", href: `${base}/architecture`, icon: <IconDiagram /> },
    { id: "blast-radius", label: "Blast Radius", href: `${base}/blast-radius`, icon: <IconTarget /> },
    { id: "what-if", label: "What If", href: `${base}/what-if`, icon: <IconLightbulb /> },
    { id: "narrator", label: "Narrator", href: `${base}/narrator`, icon: <IconBook /> },
    { id: "timeline", label: "Timeline", href: `${base}/timeline`, icon: <IconClock /> },
    { id: "health", label: "Health", href: `${base}/health`, icon: <IconHeart /> },
    { id: "api-map", label: "API Map", href: `${base}/api-map`, icon: <IconApi /> },
    { id: "patterns", label: "Patterns", href: `${base}/patterns`, icon: <IconPuzzle /> },
    { id: "onboarding", label: "Onboarding", href: `${base}/onboarding`, icon: <IconGraduation /> },
    { id: "deep-research", label: "Deep Research", href: `${base}/deep-research`, icon: <IconMicroscope /> },
    { id: "code-review", label: "Code Review", href: `${base}/code-review`, icon: <IconCodeReview /> },
    { id: "security-audit", label: "Security Audit", href: `${base}/security-audit`, icon: <IconShield /> },
    { id: "adr", label: "ADR", href: `${base}/adr`, icon: <IconADR /> },
  ];
}

export function SidebarNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const items = buildNavItems(workspaceId);

  function isActive(href: string) {
    if (href === `/workspace/${workspaceId}`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="flex h-full flex-col border-r bg-[var(--card)] transition-all duration-200 ease-in-out"
      style={{ width: expanded ? 180 : 48 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden py-2 px-1.5">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <a
              key={item.id}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap overflow-hidden ${
                active
                  ? "bg-[var(--accent)] text-[var(--foreground)] border-l-2 border-blue-500"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] border-l-2 border-transparent"
              }`}
            >
              <span className="shrink-0 w-5 h-5 flex items-center justify-center">{item.icon}</span>
              {expanded && <span className="truncate">{item.label}</span>}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

// --- Inline SVG Icons (16x16) ---

function IconFiles() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconNetwork() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
      <path d="M12 8v4M9.5 14.5 7 17M14.5 14.5 17 17" />
    </svg>
  );
}

function IconDiagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="8" y="14" width="7" height="7" rx="1" />
      <path d="M6.5 10v2.5a1 1 0 0 0 1 1h2M17.5 10v2.5a1 1 0 0 1-1 1h-2" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconLightbulb() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" /><path d="M10 22h4" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function IconApi() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h8" />
    </svg>
  );
}

function IconPuzzle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.969a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
    </svg>
  );
}

function IconGraduation() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5" />
    </svg>
  );
}

function IconMicroscope() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

function IconCodeReview() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconADR() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}
