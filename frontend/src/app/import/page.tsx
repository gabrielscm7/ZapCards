"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, File, Loader2, FileText, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

const ACCEPTED_TYPES = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.csv,.mp3,.wav,.ogg,.mp4,.webm,.mov";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [area, setArea] = useState("");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ title: string; type: string; id: string }[]>([]);

  const upload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (area) formData.append("area", area);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/notes/import`,
        { method: "POST", body: formData }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Falha no upload" }));
        throw new Error(err.detail || "Falha no upload");
      }

      const data = await res.json();
      setResults((prev) => [...prev, { title: data.title, type: data.source_type, id: data.note_id }]);
      toast.success(`"${data.title}" importada com sucesso!`);
      setFile(null);
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const typeLabels: Record<string, string> = {
    ocr: "OCR (Imagem)",
    pdf: "PDF",
    docx: "Documento",
    csv: "CSV",
    audio: "Audio",
    video: "Video",
    text: "Texto",
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Importar</h1>
        <p className="text-muted-foreground mt-1">
          Converta arquivos em notas Markdown pesquisaveis
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Upload de Arquivo
          </CardTitle>
          <CardDescription>
            Formatos: JPEG, PNG, PDF, DOCX, CSV, MP3, WAV, MP4 — processamento via IA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <File className="w-10 h-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Clique para selecionar um arquivo"}
              </span>
              {file && (
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
            </label>
          </div>

          <Input
            placeholder="Area (ex: Biologia, opcional)"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />

          <Button onClick={upload} disabled={!file || uploading} className="w-full gap-2">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Importar Arquivo
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              Importados ({results.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="flex-1 text-sm">{r.title}</span>
                <Badge variant="outline">{typeLabels[r.type] || r.type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
