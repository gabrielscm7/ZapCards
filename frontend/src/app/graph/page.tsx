"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitGraph, Loader2 } from "lucide-react";

export default function GraphPage() {
  const [data, setData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.graph.get().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (data.nodes.length === 0) return;
    import("react-force-graph-2d").then((m) => {
      setForceGraph2D(() => m.default);
    });
  }, [data]);

  const areaColors: Record<string, string> = {
    "": "#6b7280",
  };
  const defaultColors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  return (
    <div className="min-h-screen relative">
      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !ForceGraph2D || data.nodes.length === 0 ? (
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitGraph className="w-5 h-5 text-primary" />
                Grafo de Conhecimento
              </CardTitle>
            </CardHeader>
            <CardContent className="py-12 text-center">
              <GitGraph className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nenhuma nota com conexoes ainda.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie notas e use links wiki <code className="bg-muted px-1 rounded">[[nota]]</code> para conecta-las.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="absolute top-4 left-20 z-10 flex items-center gap-4">
            <div className="bg-card/80 backdrop-blur-sm rounded-xl px-4 py-3 border shadow-lg">
              <h1 className="text-xl font-bold">Grafo de Conhecimento</h1>
              <p className="text-sm text-muted-foreground">
                {data.nodes.length} notas · {data.edges.length} conexoes
              </p>
            </div>
          </div>

          <ForceGraph2D
            graphData={data}
            nodeLabel="label"
            nodeColor={(node: any) => {
              if (!node.area) return defaultColors[0];
              const idx = Array.from(new Set(data.nodes.map((n: any) => n.area))).indexOf(node.area);
              return defaultColors[idx % defaultColors.length] || defaultColors[0];
            }}
            linkColor={() => "#3f3f46"}
            linkWidth={1.5}
            nodeRelSize={6}
            width={typeof window !== "undefined" ? window.innerWidth - 64 : 1200}
            height={typeof window !== "undefined" ? window.innerHeight : 800}
            nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
              const label = node.label || node.id;
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const bgWidth = ctx.measureText(label).width + 8;
              const bgHeight = fontSize + 4;

              ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
              ctx.fillRect(
                node.x - bgWidth / 2,
                node.y + 8,
                bgWidth,
                bgHeight
              );

              ctx.fillStyle = "#d4d4d8";
              ctx.fillText(label, node.x, node.y + 8 + bgHeight / 2);
            }}
          />
        </>
      )}
    </div>
  );
}
