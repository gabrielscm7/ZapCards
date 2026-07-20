"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Tag, BookOpen } from "lucide-react";

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [area, setArea] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      const [n, t] = await Promise.all([api.notes.list(), api.tags.list()]);
      setNotes(n);
      setTags(t);
    } catch {
      toast.error("Erro ao carregar notas");
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title && !content) return;
    try {
      await api.notes.create({ title, content_md: content, area, tags: selectedTags });
      setTitle(""); setContent(""); setArea(""); setSelectedTags([]); setShowForm(false);
      toast.success("Nota criada com sucesso!");
      load();
    } catch {
      toast.error("Erro ao criar nota");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.notes.delete(id);
      toast.success("Nota excluida");
      load();
    } catch {
      toast.error("Erro ao excluir nota");
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notas</h1>
          <p className="text-muted-foreground mt-1">Crie e organize seu conhecimento</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="w-4 h-4" />
          {showForm ? "Fechar" : "Nova Nota"}
        </Button>
      </header>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nova Nota</CardTitle>
            <CardDescription>Escreva em Markdown para melhor formatacao</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Titulo da nota"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Conteudo em Markdown..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-32 font-mono text-sm"
            />
            <Input
              placeholder="Area (ex: Machine Learning)"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {tags.map((t: any) => (
                <Badge
                  key={t.id}
                  variant={selectedTags.includes(t.name) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(t.name) ? prev.filter((x) => x !== t.name) : [...prev, t.name]
                    )
                  }
                >
                  <Tag className="w-3 h-3 mr-1" />
                  {t.name}
                </Badge>
              ))}
            </div>
            <Button onClick={create} disabled={!title && !content}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Nota
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {notes.length === 0 && !showForm && (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma nota ainda.</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>
                Criar primeira nota
              </Button>
            </CardContent>
          </Card>
        )}

        {notes.map((n: any) => (
          <Card key={n.id} className="hover:border-primary/30 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{n.title || "Sem titulo"}</CardTitle>
                  {n.area && (
                    <Badge variant="secondary" className="mt-1 bg-primary/10 text-primary">
                      {n.area}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(n.id)}>
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {n.content_md}
              </p>
              <div className="flex gap-1 mt-2">
                {n.tags?.map((t: any) => (
                  <Badge key={t.id} variant="outline" className="text-xs">
                    {t.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
