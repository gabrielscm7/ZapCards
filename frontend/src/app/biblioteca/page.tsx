"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Library, Search, Trash2, Edit3, Eye, Link2, Unlink, Plus, FileText, BookOpen, X, Save, ArrowLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function BibliotecaPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotes = async () => {
    try {
      const [n, t] = await Promise.all([api.notes.list(), api.tags.list()]);
      setNotes(n);
      setTags(t);
    } catch { toast.error("Erro ao carregar"); }
    setLoading(false);
  };

  useEffect(() => { loadNotes(); }, []);

  const openNote = (note: any) => {
    setSelectedNote(note);
    setViewMode("read");
    setLinking(false);
    setEditTitle(note.title);
    setEditContent(note.content_md);
    setEditArea(note.area);
    setEditTags(note.tags?.map((t: any) => t.name) || []);
  };

  const saveEdit = async () => {
    if (!selectedNote) return;
    try {
      const updated = await api.notes.update(selectedNote.id, {
        title: editTitle,
        content_md: editContent,
        area: editArea,
        tags: editTags,
      });
      setSelectedNote(updated);
      setViewMode("read");
      toast.success("Nota atualizada!");
      loadNotes();
    } catch { toast.error("Erro ao salvar"); }
  };

  const deleteNote = async () => {
    if (!selectedNote) return;
    try {
      await api.notes.delete(selectedNote.id);
      toast.success("Nota excluida");
      setSelectedNote(null);
      loadNotes();
    } catch { toast.error("Erro ao excluir"); }
  };

  const searchLinks = async (q: string) => {
    setLinkSearch(q);
    if (q.length < 1) { setLinkResults([]); return; }
    try {
      const res = await api.notes.list({ search: q });
      setLinkResults(res.filter((n: any) => n.id !== selectedNote?.id));
    } catch { setLinkResults([]); }
  };

  const createLink = async (targetId: string) => {
    if (!selectedNote) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/notes/${selectedNote.id}/link/${targetId}`, { method: "POST" });
      toast.success("Notas vinculadas!");
      setLinking(false);
    } catch { toast.error("Erro ao vincular"); }
  };

  const removeLink = async (targetId: string) => {
    if (!selectedNote) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/notes/${selectedNote.id}/link/${targetId}`, { method: "DELETE" });
      toast.success("Vinculo removido");
      loadNotes();
    } catch { toast.error("Erro ao desvincular"); }
  };

  const toggleEditTag = (tag: string) => {
    setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const filtered = search
    ? notes.filter(n =>
        n.title?.toLowerCase().includes(search.toLowerCase()) ||
        n.content_md?.toLowerCase().includes(search.toLowerCase()) ||
        n.area?.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  const areas = [...new Set(notes.map((n: any) => n.area).filter(Boolean))];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Library className="w-7 h-7 text-primary" />
            Biblioteca
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie, edite e conecte suas notas e documentos</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {notes.length} nota{notes.length !== 1 ? "s" : ""}
        </Badge>
      </header>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo, conteudo ou area..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {areas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="cursor-pointer" onClick={() => setSearch("")}>
            Todas
          </Badge>
          {areas.map((a: string) => (
            <Badge
              key={a}
              variant={search === a ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSearch(search === a ? "" : a)}
            >
              {a}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((n: any) => (
          <Card
            key={n.id}
            className={`cursor-pointer hover:border-primary/40 transition-all ${
              selectedNote?.id === n.id ? "border-primary ring-1 ring-primary/30" : ""
            }`}
            onClick={() => openNote(n)}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base truncate">{n.title || "Sem titulo"}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {n.area && <span className="text-primary">{n.area}</span>}
                    {n.area && n.tags?.length > 0 && " · "}
                    {n.tags?.length || 0} tag{n.tags?.length !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap font-mono">
                {n.content_md || "(vazio)"}
              </p>
              <div className="flex gap-1 mt-2 flex-wrap">
                {n.tags?.slice(0, 3).map((t: any) => (
                  <Badge key={t.id} variant="secondary" className="text-[10px]">{t.name}</Badge>
                ))}
                {n.tags?.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">+{n.tags.length - 3}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && filtered.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma nota encontrada.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Va em Notas para criar ou Importar para adicionar documentos.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!selectedNote} onOpenChange={(open) => { if (!open) setSelectedNote(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedNote && viewMode === "read" && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      {selectedNote.title || "Sem titulo"}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                      {selectedNote.area && <Badge variant="secondary" className="bg-primary/10 text-primary">{selectedNote.area}</Badge>}
                      <span className="text-xs">{new Date(selectedNote.updated_at || selectedNote.created_at).toLocaleDateString("pt-BR")}</span>
                    </DialogDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setViewMode("edit")}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={deleteNote}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedNote(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex gap-2 flex-wrap mb-4">
                {selectedNote.tags?.map((t: any) => (
                  <Badge key={t.id} variant="outline">{t.name}</Badge>
                ))}
              </div>

              <div className="border rounded-lg p-6 bg-muted/30 prose prose-sm dark:prose-invert max-w-none">
                {selectedNote.content_md ? (
                  <ReactMarkdown>{selectedNote.content_md}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">(vazio)</p>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t">
                {!linking ? (
                  <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
                    <Link2 className="w-4 h-4 mr-1" /> Vincular notas
                  </Button>
                ) : (
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Buscar nota para vincular..."
                        value={linkSearch}
                        onChange={(e) => searchLinks(e.target.value)}
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" onClick={() => setLinking(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {linkResults.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {linkResults.map((n: any) => (
                          <div
                            key={n.id}
                            className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer text-sm"
                            onClick={() => createLink(n.id)}
                          >
                            <span>{n.title || "Sem titulo"}</span>
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {selectedNote && viewMode === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5" /> Editar nota
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Titulo</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Area</label>
                  <Input value={editArea} onChange={(e) => setEditArea(e.target.value)} placeholder="Ex: Machine Learning" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Conteudo (Markdown)</label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-48 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t: any) => (
                      <Badge
                        key={t.id}
                        variant={editTags.includes(t.name) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleEditTag(t.name)}
                      >
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={saveEdit}>
                    <Save className="w-4 h-4 mr-1" /> Salvar
                  </Button>
                  <Button variant="outline" onClick={() => { setViewMode("read"); }}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Cancelar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
