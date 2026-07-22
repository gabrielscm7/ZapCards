"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Brain, Trash2, FlipHorizontal, Zap, ListOrdered, Columns2,
  ToggleLeft, Lightbulb, HelpCircle, FileText,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TYPE_LABELS: Record<string, string> = {
  basico: "Basico",
  cloze: "Cloze",
  multipla_escolha: "Multipla Escolha",
  verdadeiro_falso: "V ou F",
  sequencia: "Sequencia",
  cenario: "Cenario",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  basico: <HelpCircle className="w-3 h-3" />,
  cloze: <FileText className="w-3 h-3" />,
  multipla_escolha: <Columns2 className="w-3 h-3" />,
  verdadeiro_falso: <ToggleLeft className="w-3 h-3" />,
  sequencia: <ListOrdered className="w-3 h-3" />,
  cenario: <Lightbulb className="w-3 h-3" />,
};

interface ParsedCard {
  id: string;
  note_id: string;
  question: string;
  answer: string;
  difficulty: string;
  card_type: string;
  metadata_json?: string;
  created_at: string;
  metadata?: Record<string, any>;
}

function parseCard(c: any): ParsedCard {
  try {
    return { ...c, metadata: c.metadata_json ? JSON.parse(c.metadata_json) : {} };
  } catch {
    return { ...c, metadata: {} };
  }
}

function renderCardContent(card: ParsedCard, flipped: boolean) {
  const ct = card.card_type || "basico";
  const meta = card.metadata || {};

  if (ct === "cloze") {
    return (
      <>
        <p className="font-medium">
          {flipped
            ? card.question.replace(/\[.*?\]/, `**${card.answer}**`)
            : card.question}
        </p>
        {flipped && <div className="mt-3 pt-3 border-t"><p className="text-primary text-sm">{card.answer}</p></div>}
      </>
    );
  }

  if (ct === "multipla_escolha") {
    const options = meta.options || [];
    const correctIdx = meta.correct_index;
    return (
      <>
        <p className="font-medium">{card.question}</p>
        <div className="mt-2 space-y-1">
          {options.map((opt: string, i: number) => (
            <div
              key={i}
              className={`text-sm p-1.5 rounded border ${
                flipped && i === correctIdx
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                  : "border-muted"
              }`}
            >
              {String.fromCharCode(65 + i)}) {opt}
            </div>
          ))}
        </div>
        {flipped && <p className="text-xs text-muted-foreground mt-2">Resposta: {card.answer}</p>}
      </>
    );
  }

  if (ct === "verdadeiro_falso") {
    const isTrue = meta.is_true === true || meta.is_true === "true" || card.answer === "True";
    return (
      <>
        <p className="font-medium">{card.question}</p>
        <div className="mt-2 flex gap-2">
          <Badge variant={flipped && isTrue ? "default" : "outline"} className="text-xs">Verdadeiro</Badge>
          <Badge variant={flipped && !isTrue ? "default" : "outline"} className="text-xs">Falso</Badge>
        </div>
      </>
    );
  }

  if (ct === "sequencia") {
    const steps = meta.steps || [];
    return (
      <>
        <p className="font-medium">{card.question}</p>
        {flipped && (
          <div className="mt-2">
            <ol className="list-decimal list-inside text-sm space-y-0.5 text-primary">
              {steps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}
      </>
    );
  }

  if (ct === "cenario") {
    return (
      <>
        <p className="text-sm text-muted-foreground italic mb-2">{meta.scenario || ""}</p>
        <p className="font-medium">{card.question}</p>
        {flipped && <div className="mt-3 pt-3 border-t"><p className="text-primary text-sm">{card.answer}</p></div>}
      </>
    );
  }

  return (
    <>
      <p className="font-medium">{card.question}</p>
      {flipped && <div className="mt-3 pt-3 border-t"><p className="text-primary text-sm">{card.answer}</p></div>}
    </>
  );
}

export default function FlashcardsPage() {
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"facil" | "medio" | "dificil">("medio");
  const [quantity, setQuantity] = useState(5);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const [c, n] = await Promise.all([api.flashcards.list(), api.notes.list()]);
      setCards(c.map(parseCard));
      setNotes(n);
    } catch { toast.error("Erro ao carregar dados"); }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!selectedNotes.length) return;
    setGenerating(true);
    try {
      const newCards = await api.flashcards.generate({ note_ids: selectedNotes, difficulty, quantity });
      toast.success(`${newCards.length} flashcards gerados!`);
      load();
    } catch { toast.error("Erro ao gerar flashcards"); }
    finally { setGenerating(false); }
  };

  const remove = async (id: string) => {
    try { await api.flashcards.delete(id); toast.success("Flashcard removido"); load(); }
    catch { toast.error("Erro ao remover flashcard"); }
  };

  const toggleFlip = (id: string) => setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));

  const cardTypes = [...new Set(cards.map((c) => c.card_type || "basico"))];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Flashcards</h1>
        <p className="text-muted-foreground mt-1">Repeticao espacada inteligente com FSRS</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Gerar Flashcards
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
                onClick={() => setSelectedNotes((prev) => prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id])}
              >
                {n.title || "Sem titulo"}
              </Badge>
            ))}
          </div>

          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Dificuldade</label>
              <Select value={difficulty} onValueChange={(v) => v && setDifficulty(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="facil">Facil</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="dificil">Dificil</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quantidade</label>
              <Input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-24" />
            </div>

            <Button onClick={generate} disabled={!selectedNotes.length || generating} className="gap-2">
              <Brain className="w-4 h-4" />
              {generating ? "Gerando..." : "Gerar Flashcards"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos ({cards.length})</TabsTrigger>
          {cardTypes.map((ct) => (
            <TabsTrigger key={ct} value={ct}>
              {TYPE_ICONS[ct]} {TYPE_LABELS[ct] || ct} ({cards.filter((c) => (c.card_type || "basico") === ct).length})
            </TabsTrigger>
          ))}
        </TabsList>

        {["all", ...cardTypes].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(tab === "all" ? cards : cards.filter((c) => (c.card_type || "basico") === tab)).map((c) => (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:border-primary/40 transition-all group"
                  onClick={() => toggleFlip(c.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          {TYPE_ICONS[c.card_type || "basico"]}
                          {TYPE_LABELS[c.card_type || "basico"] || "Basico"}
                        </Badge>
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
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {renderCardContent(c, !!flipped[c.id])}
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
                    <p className="text-sm text-muted-foreground mt-1">Selecione notas acima e gere flashcards com IA.</p>
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
