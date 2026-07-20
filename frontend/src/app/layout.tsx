import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/sidebar";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "ZapCards — Estudos com IA",
  description: "Sistema de estudos por flashcards com IA, grafo de conhecimento e bot WhatsApp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider delay={300}>
            <div className="flex min-h-screen">
              <Sidebar />
              <main className="flex-1 ml-16">
                {children}
              </main>
            </div>
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
