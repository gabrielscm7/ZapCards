"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText,
  GitGraph,
  Brain,
  MessageSquare,
  Upload,
  LayoutDashboard,
  Sun,
  Moon,
  Zap,
  Library,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/notes", label: "Notas", icon: FileText },
  { href: "/graph", label: "Grafo", icon: GitGraph },
  { href: "/flashcards", label: "Flashcards", icon: Brain },
  { href: "/chat", label: "Chat IA", icon: MessageSquare },
  { href: "/import", label: "Importar", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-16 flex flex-col items-center py-4 border-r bg-card border-border">
      <Link href="/" className="mb-6 p-2 rounded-lg hover:bg-accent transition-colors">
        <Zap className="w-6 h-6 text-primary" />
      </Link>

      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger>
                <Link href={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="icon"
                    className={cn(
                      "w-10 h-10",
                      isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {mounted && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </TooltipContent>
        </Tooltip>
      )}
    </aside>
  );
}
