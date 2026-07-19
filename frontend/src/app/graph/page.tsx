"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

export default function GraphPage() {
  const [data, setData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [forceGraph, setForceGraph] = useState<any>(null);

  useEffect(() => {
    api.graph.get().then(setData);
  }, []);

  useEffect(() => {
    if (data.nodes.length === 0) return;
    import("react-force-graph-2d").then(({ default: ForceGraph2D }) => {
      setForceGraph(() => ForceGraph2D);
    });
  }, [data]);

  if (!forceGraph) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-3xl font-bold text-zap-400 mb-4">Grafo de Conhecimento</h1>
        {data.nodes.length === 0 ? (
          <p className="text-zinc-500">Nenhuma nota ainda. Crie notas e conecte-as com links <code>[[nota]]</code>.</p>
        ) : (
          <p className="text-zinc-500">Carregando visualizacao...</p>
        )}
      </main>
    );
  }

  const GraphComponent = forceGraph;

  return (
    <main className="min-h-screen">
      <div className="absolute top-4 left-4 z-10">
        <h1 className="text-2xl font-bold text-zap-400">Grafo de Conhecimento</h1>
        <p className="text-zinc-500 text-sm">{data.nodes.length} notas, {data.edges.length} conexoes</p>
      </div>
      <GraphComponent
        graphData={data}
        nodeLabel="label"
        nodeColor={(n: any) => n.area ? "#22c55e" : "#71717a"}
        linkColor={() => "#3f3f46"}
        width={typeof window !== "undefined" ? window.innerWidth : 1200}
        height={typeof window !== "undefined" ? window.innerHeight : 800}
        nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
          const label = node.label || node.id;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = "#a1a1aa";
          ctx.fillText(label, node.x + 6, node.y + 4);
        }}
      />
    </main>
  );
}
