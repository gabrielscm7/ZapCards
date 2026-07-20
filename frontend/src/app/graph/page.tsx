"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitGraph, Loader2, AlertTriangle } from "lucide-react";

export default function GraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.graph.get()
      .then((d) => {
        const mapped = {
          nodes: d?.nodes || [],
          links: (d?.edges || []).map((e: any) => ({ source: e.source, target: e.target })),
        };
        setGraphData(mapped);
      })
      .catch((err) => {
        setError(err.message || "Erro ao carregar grafo");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    import("react-force-graph-2d").then((m) => {
      setForceGraph2D(() => m.default);
    });
  }, [graphData]);

  const defaultColors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  const areaList = Array.from(new Set(graphData.nodes.map((n: any) => n?.area).filter(Boolean)));

  return (
    <div className="min-h-screen relative">
      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Erro ao carregar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{error}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Verifique se o backend esta rodando e acessivel.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : !ForceGraph2D || graphData.nodes.length === 0 ? (
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
                Crie notas e link-as entre si para visualizar o grafo.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="absolute top-4 left-20 z-10">
            <div className="bg-card/80 backdrop-blur-sm rounded-xl px-4 py-3 border shadow-lg">
              <h1 className="text-xl font-bold">Grafo de Conhecimento</h1>
              <p className="text-sm text-muted-foreground">
                {graphData.nodes.length} notas · {graphData.links.length} conexoes
              </p>
            </div>
          </div>

          <ForceGraph2D
            graphData={graphData}
            nodeLabel="label"
            nodeColor={(node: any) => {
              if (!node?.area) return defaultColors[0];
              const idx = areaList.indexOf(node.area);
              return idx >= 0 ? defaultColors[idx % defaultColors.length] : defaultColors[0];
            }}
            linkColor={() => "#3f3f46"}
            linkWidth={1.5}
            nodeRelSize={6}
            width={typeof window !== "undefined" ? window.innerWidth - 64 : 1200}
            height={typeof window !== "undefined" ? window.innerHeight : 800}
            nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
              const label = node?.label || node?.id || "?";
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const textWidth = ctx.measureText(label).width;
              const bgWidth = textWidth + 8;
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
