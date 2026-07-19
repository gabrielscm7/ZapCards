"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";

export default function ChatPage() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.chat.send(userMsg);
      setMessages(prev => [...prev, { role: "assistant", content: res.content }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro ao processar. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-zap-400">Chat IA</h1>
        <p className="text-zinc-400 mt-1">Converse com seu conhecimento — respostas baseadas apenas no que voce estudou</p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
        {messages.length === 0 && (
          <p className="text-zinc-600 text-center py-12">
            Pergunte algo sobre o que voce ja estudou. O assistente so responde com base nas suas notas.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] p-4 rounded-xl ${
              m.role === "user"
                ? "bg-zap-600 text-white"
                : "bg-zinc-800 text-zinc-100"
            }`}>
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 text-zinc-400 p-4 rounded-xl text-sm">Pensando...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500"
          placeholder="Pergunte sobre seu material de estudo..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          disabled={loading}
          className="bg-zap-600 hover:bg-zap-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors"
        >
          Enviar
        </button>
      </div>
    </main>
  );
}
