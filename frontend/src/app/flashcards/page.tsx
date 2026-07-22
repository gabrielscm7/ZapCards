"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, Trash2, FlipHorizontal, Zap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function FlashcardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"facil" | "medio" | "dificil">("medio");
  const [quantity, setQuantity] = useState(5);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const [c, n] = await Promise.all([api.flashcards.list(), api.notes.list()]);
      setCards(c);
      setNotes(n);
    } catch {
      toast.error("Erro ao carregar dados");
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!selectedNotes.length) return;
    setGenerating(true);
    try {
      const newCards = await api.flashcards.generate({
        note_ids: selectedNotes,
        difficulty,
        quantity,
      });
      toast.success(`${newCards.length} flashcards gerados!`);
      load();
    } catch {
      toast.error("Erro ao gerar flashcards");
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.flashcards.delete(id);
      toast.success("Flashcard removido");
      load();
    } catch {
      toast.error("Erro ao remover flashcard");
    }
  };

  const toggleFlip = (id: string) => {
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Flashcards</h1>
        <p className="text-muted-foreground mt-1">Repeticao espacada inteligente com FSRS</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Gerar Flashcards
          </CardTitle>
          <CardDescription>Selecione notas como fonte para geracao por IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {notes.map((n: any) => (
              <Badge
                key={n.id}
                variant={selectedNotes.includes(n.id) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() =>
                  setSelectedNotes((prev) =>
                    prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id]
                  )
                }
              >
                {n.title || "Sem titulo"}
              </Badge>
            ))}
          </div>

          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Dificuldade</label>
              <Select value={difficulty} onValueChange={(v) => v && setDifficulty(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facil">Facil</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="dificil">Dificil</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quantidade</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-24"
              />
            </div>

            <Button
              onClick={generate}
              disabled={!selectedNotes.length || generating}
              className="gap-2"
            >
              <Brain className="w-4 h-4" />
              {generating ? "Gerando..." : "Gerar Flashcards"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos ({cards.length})</TabsTrigger>
          <TabsTrigger value="facil">Faceis ({cards.filter((c) => c.difficulty === "facil").length})</TabsTrigger>
          <TabsTrigger value="medio">Medios ({cards.filter((c) => c.difficulty === "medio").length})</TabsTrigger>
          <TabsTrigger value="dificil">Dificeis ({cards.filter((c) => c.difficulty === "dificil").length})</TabsTrigger>
        </TabsList>

        {["all", "facil", "medio", "dificil"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(tab === "all" ? cards : cards.filter((c) => c.difficulty === tab)).map((c: any) => (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:border-primary/40 transition-all group"
                  onClick={() => toggleFlip(c.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge
                        variant="secondary"
                        className={
                          c.difficulty === "facil"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : c.difficulty === "dificil"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }
                      >
                        {c.difficulty}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(c.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">{c.question}</p>
                    {flipped[c.id] && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-primary text-sm">{c.answer}</p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <FlipHorizontal className="w-3 h-3" />
                      Clique para {flipped[c.id] ? "esconder" : "revelar"} resposta
                    </p>
                  </CardContent>
                </Card>
              ))}
              {cards.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center">
                    <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhum flashcard ainda.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Selecione notas acima e gere flashcards com IA.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
