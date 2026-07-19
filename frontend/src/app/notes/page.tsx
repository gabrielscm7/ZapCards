"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [area, setArea] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const load = async () => {
    const [n, t] = await Promise.all([api.notes.list(), api.tags.list()]);
    setNotes(n);
    setTags(t);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title && !content) return;
    await api.notes.create({ title, content_md: content, area, tags: selectedTags });
    setTitle(""); setContent(""); setArea(""); setSelectedTags([]);
    load();
  };

  const remove = async (id: string) => {
    await api.notes.delete(id);
    load();
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zap-400">Notas</h1>
        <p className="text-zinc-400 mt-1">Crie e organize seu conhecimento</p>
      </header>

      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 mb-8">
        <input
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 mb-3 text-zinc-100 placeholder-zinc-500"
          placeholder="Titulo da nota"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 mb-3 text-zinc-100 placeholder-zinc-500 h-32 font-mono text-sm"
          placeholder="Conteudo em Markdown..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex gap-3 mb-3">
          <input
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100 placeholder-zinc-500"
            placeholder="Area (ex: Machine Learning)"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedTags(prev => prev.includes(t.name) ? prev.filter(x => x !== t.name) : [...prev, t.name])}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                selectedTags.includes(t.name)
                  ? "bg-zap-600 border-zap-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <button
          onClick={create}
          className="bg-zap-600 hover:bg-zap-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          Criar Nota
        </button>
      </div>

      <div className="space-y-4">
        {notes.map((n: any) => (
          <div key={n.id} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">{n.title || "Sem titulo"}</h3>
                {n.area && <span className="text-xs text-zap-400 bg-zap-950 px-2 py-0.5 rounded">{n.area}</span>}
              </div>
              <button onClick={() => remove(n.id)} className="text-zinc-600 hover:text-red-400 transition-colors text-sm">
                excluir
              </button>
            </div>
            <p className="text-zinc-400 text-sm mt-2 line-clamp-2">{n.content_md}</p>
            <div className="flex gap-1 mt-2">
              {n.tags?.map((t: any) => (
                <span key={t.id} className="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded">{t.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
