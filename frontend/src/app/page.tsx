"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Brain, GitGraph, TrendingUp, BookOpen, Zap } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function DashboardPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.notes.list(),
      api.flashcards.list(),
      api.tags.list(),
      api.graph.get(),
    ]).then(([n, c, t, g]) => {
      setNotes(n);
      setCards(c);
      setTags(t);
      setGraphData(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const areaData = notes.reduce((acc: Record<string, number>, n) => {
    const area = n.area || "Sem area";
    acc[area] = (acc[area] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(areaData).map(([name, value]) => ({ name, value }));

  const difficultyData = ["facil", "medio", "dificil"].map((d) => ({
    name: d.charAt(0).toUpperCase() + d.slice(1),
    count: cards.filter((c) => c.difficulty === d).length,
  }));

  const tagUsageData = tags.slice(0, 8).map((t: any) => ({
    name: t.name,
    count: notes.filter((n) => n.tags?.some((nt: any) => nt.id === t.id)).length,
  }));

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visao geral dos seus estudos</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          <Zap className="w-3 h-3 mr-1" />
          ZapCards v1.0
        </Badge>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Total de Notas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{notes.length}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Brain className="w-4 h-4" /> Flashcards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{cards.length}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <GitGraph className="w-4 h-4" /> Conexoes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{graphData.edges.length}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Tags
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{tags.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notas por Area</CardTitle>
            <CardDescription>Distribuicao de notas por area de estudo</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }: any) =>
                      `${name || ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-12">Nenhuma nota com area definida</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Flashcards por Dificuldade</CardTitle>
            <CardDescription>Distribuicao por nivel de dificuldade</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={difficultyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {tagUsageData.some((d) => d.count > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uso de Tags</CardTitle>
            <CardDescription>Tags mais utilizadas nas notas</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tagUsageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Total de Notas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{notes.length}</p>
            <p className="text-xs text-muted-foreground mt-1">notas criadas no sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Brain className="w-4 h-4" /> Cartoes para Revisao
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{cards.length}</p>
            <p className="text-xs text-muted-foreground mt-1">flashcards disponiveis para estudo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <GitGraph className="w-4 h-4" /> Densidade do Grafo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {graphData.nodes.length > 0
                ? (graphData.edges.length / graphData.nodes.length).toFixed(1)
                : "0"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">conexoes medias por nota</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
