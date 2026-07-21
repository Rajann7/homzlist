"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeCtx {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Read persisted choice on mount.
  useEffect(() => {
    const saved = (localStorage.getItem("hz-theme") as Theme | null) ?? "system";
    setThemeState(saved);
  }, []);

  // Apply resolved theme to <html>.
  useEffect(() => {
    const isDark = theme === "dark" || (theme === "system" && systemDark());
    setResolved(isDark ? "dark" : "light");
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  // React to OS changes while in "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const isDark = mq.matches;
      setResolved(isDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", isDark);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (t: Theme) => {
    if (t === "system") localStorage.removeItem("hz-theme");
    else localStorage.setItem("hz-theme", t);
    setThemeState(t);
  };

  const toggle = () => setTheme(resolved === "dark" ? "light" : "dark");

  return <Ctx.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
