"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";

export interface DisplayMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: number;
  encrypted: boolean;
}

interface MessageListProps {
  messages: DisplayMessage[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <p>No messages yet</p>
          <p className="text-xs">Send your first encrypted message</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-3 py-4 md:px-4">
      <div className="space-y-1">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            content={msg.content}
            isSender={msg.senderId === currentUserId}
            timestamp={msg.timestamp}
            encrypted={msg.encrypted}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
