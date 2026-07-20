"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Bot, User, FileText, Loader2 } from "lucide-react";

export default function ChatPage() {
  const [messages, setMessages] = useState<{ role: string; content: string; sources?: string[] }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.chat.send(userMsg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.content, sources: res.sources || [] },
      ]);
    } catch {
      toast.error("Erro ao processar mensagem");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 2rem)" }}>
      <header className="mb-4 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">Chat IA</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Converse com seu conhecimento — respostas baseadas apenas no que voce estudou
        </p>
      </header>

      <Card className="flex-1 overflow-hidden flex flex-col mb-4">
        <CardContent className="flex-1 overflow-y-auto space-y-4 p-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Bot className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Pergunte algo sobre o que voce ja estudou.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                O assistente so responde com base nas suas notas.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] p-4 rounded-2xl ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m.role === "user" ? (
                    <User className="w-3 h-3" />
                  ) : (
                    <Bot className="w-3 h-3" />
                  )}
                  <span className="text-xs opacity-70">
                    {m.role === "user" ? "Voce" : "ZapCards IA"}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="text-xs opacity-60 mb-1 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Fontes:
                    </p>
                    {m.sources.map((s, j) => (
                      <Badge key={j} variant="outline" className="text-xs mr-1 mb-1">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted p-4 rounded-2xl flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Pensando...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <div className="flex gap-2 shrink-0">
        <Input
          placeholder="Pergunte sobre seu material de estudo..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          className="flex-1"
        />
        <Button onClick={send} disabled={loading || !input.trim()} className="gap-2">
          <Send className="w-4 h-4" />
          Enviar
        </Button>
      </div>
    </div>
  );
}
