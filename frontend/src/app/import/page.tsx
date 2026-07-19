"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus("Enviando...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (area) formData.append("area", area);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/notes/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Falha no upload");

      const data = await res.json();
      setStatus(`Nota "${data.title}" criada! Tipo: ${data.source_type}`);
      setFile(null);
    } catch (err: any) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zap-400">Importar</h1>
        <p className="text-zinc-400 mt-1">Converta arquivos em notas Markdown pesquisaveis</p>
      </header>

      <div className="p-8 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 mb-6 text-center">
        <p className="text-zinc-500 mb-4">
          Formatos: JPEG, PNG, PDF, DOCX, CSV, MP3, WAV, MP4
        </p>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.csv,.mp3,.wav,.ogg,.mp4,.webm,.mov"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4 text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-zap-600 file:text-white hover:file:bg-zap-500"
        />
        {file && (
          <>
            <p className="text-zinc-300 mb-3">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 mb-3 text-zinc-100 placeholder-zinc-500 w-full max-w-xs"
              placeholder="Area (opcional)"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <br />
            <button
              onClick={upload}
              disabled={uploading}
              className="bg-zap-600 hover:bg-zap-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              {uploading ? "Processando..." : "Importar Arquivo"}
            </button>
          </>
        )}
      </div>

      {status && (
        <div className={`p-4 rounded-xl border ${status.startsWith("Erro") ? "border-red-800 bg-red-950/30 text-red-400" : "border-zap-800 bg-zap-950/30 text-zap-400"}`}>
          {status}
        </div>
      )}
    </main>
  );
}
