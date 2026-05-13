"use client";

import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface MessageBubbleProps {
  content: string;
  isSender: boolean;
  timestamp: number;
  encrypted: boolean;
}

export function MessageBubble({
  content,
  isSender,
  timestamp,
  encrypted,
}: MessageBubbleProps) {
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn("flex mb-2", isSender ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2 text-sm",
          isSender
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
        <div
          className={cn(
            "flex items-center gap-1 mt-1 text-[10px]",
            isSender ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {encrypted && <Lock className="h-2.5 w-2.5" />}
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}
