"use client";

import { useEffect, useRef, useId, useState } from "react";

export interface MermaidRendererProps {
  code: string;
  onNodeClick?: (nodeId: string) => void;
}

// Dynamic import to avoid SSR issues
let mermaidInstance: {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
} | null = null;

async function getMermaid() {
  if (!mermaidInstance) {
    const m = (await import("mermaid")).default;
    m.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose", // Required for click callbacks
      darkMode: true,
      themeVariables: {
        primaryColor: "#1e293b",
        primaryTextColor: "#e2e8f0",
        primaryBorderColor: "#475569",
        lineColor: "#64748b",
        secondaryColor: "#0f172a",
        tertiaryColor: "#0f172a",
        background: "#0f172a",
        mainBkg: "#1e293b",
        nodeBorder: "#475569",
        clusterBkg: "#1e293b",
        titleColor: "#e2e8f0",
        edgeLabelBackground: "#1e293b",
        attributeBackgroundColorEven: "#1e293b",
        attributeBackgroundColorOdd: "#0f172a",
      },
    });
    mermaidInstance = m;
  }
  return mermaidInstance;
}

export function MermaidRenderer({ code, onNodeClick }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const renderId = `mermaid-${uid}`;
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setIsRendering(true);
      setError(null);

      try {
        const mermaid = await getMermaid();

        // Re-initialize with securityLevel loose to allow click handlers
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          darkMode: true,
          themeVariables: {
            primaryColor: "#1e293b",
            primaryTextColor: "#e2e8f0",
            primaryBorderColor: "#475569",
            lineColor: "#64748b",
            secondaryColor: "#0f172a",
            tertiaryColor: "#0f172a",
            background: "#0f172a",
            mainBkg: "#1e293b",
            nodeBorder: "#475569",
            clusterBkg: "#1e293b",
            titleColor: "#e2e8f0",
            edgeLabelBackground: "#1e293b",
          },
        });

        const { svg } = await mermaid.render(renderId, code);

        if (cancelled) return;

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;

          // Add click handlers to all nodes that have an id attribute
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl && onNodeClick) {
            // Find all nodes — mermaid renders them as .node, .label, or elements with data-id
            const nodes = svgEl.querySelectorAll(
              ".node, .cluster, [class*='node'], g[id]",
            );
            nodes.forEach((node) => {
              const nodeId =
                node.getAttribute("data-id") ??
                node.id ??
                node.getAttribute("id") ??
                "";
              if (!nodeId) return;

              (node as HTMLElement).style.cursor = "pointer";
              node.addEventListener("click", () => {
                onNodeClick(nodeId);
              });
            });

            // Also handle flowchart nodes which are <g> with class "node"
            const flowNodes = svgEl.querySelectorAll("g.node");
            flowNodes.forEach((node) => {
              const id = node.id || "";
              if (!id) return;
              (node as HTMLElement).style.cursor = "pointer";
              node.addEventListener("click", () => {
                // Mermaid flowchart node ids look like "flowchart-NodeId-0"
                const match = id.match(/flowchart-(.+?)-\d+/);
                const cleanId = match ? match[1] : id;
                onNodeClick(cleanId);
              });
            });
          }

          // Make SVG responsive
          if (svgEl) {
            svgEl.removeAttribute("height");
            svgEl.setAttribute("width", "100%");
            svgEl.style.maxWidth = "100%";
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to render diagram";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [code, renderId, onNodeClick]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm">
          <p className="font-medium text-red-400">Diagram rendering error</p>
          <p className="mt-1 font-mono text-xs text-red-300/80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-auto">
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--background)]/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Rendering diagram…
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-full w-full p-6 [&_svg]:mx-auto [&_svg]:block"
      />
    </div>
  );
}
