"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function FlashcardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("medio");
  const [quantity, setQuantity] = useState(5);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const load = async () => {
    const [c, n] = await Promise.all([api.flashcards.list(), api.notes.list()]);
    setCards(c);
    setNotes(n);
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!selectedNotes.length) return;
    await api.flashcards.generate({ note_ids: selectedNotes, difficulty, quantity });
    load();
  };

  const remove = async (id: string) => {
    await api.flashcards.delete(id);
    load();
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zap-400">Flashcards</h1>
        <p className="text-zinc-400 mt-1">Repeticao espacada inteligente com FSRS</p>
      </header>

      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 mb-8">
        <label className="block text-sm text-zinc-400 mb-2">Selecione notas como fonte</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {notes.map((n: any) => (
            <button
              key={n.id}
              onClick={() => setSelectedNotes(prev => prev.includes(n.id) ? prev.filter(x => x !== n.id) : [...prev, n.id])}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                selectedNotes.includes(n.id)
                  ? "bg-zap-600 border-zap-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {n.title || "Sem titulo"}
            </button>
          ))}
        </div>
        <div className="flex gap-3 mb-3">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100"
          >
            <option value="facil">Facil</option>
            <option value="medio">Medio</option>
            <option value="dificil">Dificil</option>
          </select>
          <input
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100"
          />
        </div>
        <button
          onClick={generate}
          disabled={!selectedNotes.length}
          className="bg-zap-600 hover:bg-zap-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          Gerar Flashcards
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c: any) => (
          <div
            key={c.id}
            onClick={() => setFlipped(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
            className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zap-600 transition-all cursor-pointer min-h-[120px] flex flex-col justify-center"
          >
            <div className="flex justify-between items-start mb-2">
              <span className={`text-xs px-2 py-0.5 rounded ${
                c.difficulty === "facil" ? "bg-green-900 text-green-400" :
                c.difficulty === "dificil" ? "bg-red-900 text-red-400" :
                "bg-yellow-900 text-yellow-400"
              }`}>
                {c.difficulty}
              </span>
              <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="text-zinc-600 hover:text-red-400 text-xs">
                excluir
              </button>
            </div>
            <p className="text-zinc-100 font-medium">{c.question}</p>
            {flipped[c.id] && <p className="text-zap-400 mt-2 text-sm">{c.answer}</p>}
            <p className="text-zinc-600 text-xs mt-2">Clique para {flipped[c.id] ? "esconder" : "revelar"} resposta</p>
          </div>
        ))}
      </div>
    </main>
  );
}
