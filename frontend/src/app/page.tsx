export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zap-400">ZapCards</h1>
        <p className="text-zinc-400 mt-1">Sistema de estudos com IA</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <a href="/notes" className="p-6 rounded-xl border border-zinc-800 hover:border-zap-600 transition-colors bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Notas</h2>
          <p className="text-zinc-400 mt-2">Crie e organize suas notas em Markdown com tags</p>
        </a>

        <a href="/graph" className="p-6 rounded-xl border border-zinc-800 hover:border-zap-600 transition-colors bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Grafo</h2>
          <p className="text-zinc-400 mt-2">Visualize conexoes entre seus conhecimentos</p>
        </a>

        <a href="/flashcards" className="p-6 rounded-xl border border-zinc-800 hover:border-zap-600 transition-colors bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Flashcards</h2>
          <p className="text-zinc-400 mt-2">Estude com repeticao espacada inteligente</p>
        </a>

        <a href="/chat" className="p-6 rounded-xl border border-zinc-800 hover:border-zap-600 transition-colors bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Chat IA</h2>
          <p className="text-zinc-400 mt-2">Converse com seu conhecimento, sem invencoes</p>
        </a>

        <a href="/import" className="p-6 rounded-xl border border-zinc-800 hover:border-zap-600 transition-colors bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Importar</h2>
          <p className="text-zinc-400 mt-2">PDF, imagens, audio — tudo vira nota</p>
        </a>
      </div>
    </main>
  );
}
