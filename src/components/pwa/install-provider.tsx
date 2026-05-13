"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallContextType {
  installable: boolean;
  install: () => Promise<void>;
}

const InstallContext = createContext<InstallContextType>({
  installable: false,
  install: async () => {},
});

export function InstallProvider({ children }: { children: ReactNode }) {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      promptRef.current = null;
      setInstallable(false);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    const p = promptRef.current;
    if (!p) return;
    try {
      await p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === "accepted") {
        promptRef.current = null;
        setInstallable(false);
      }
    } catch {}
  }

  return (
    <InstallContext.Provider value={{ installable, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function useInstall() {
  return useContext(InstallContext);
}
