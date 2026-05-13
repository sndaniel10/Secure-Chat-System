"use client";

import { useInstall } from "./install-provider";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function InstallButton() {
  const { installable, install } = useInstall();
  if (!installable) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={install}
    >
      <Download className="h-3.5 w-3.5" />
      Install App
    </Button>
  );
}
