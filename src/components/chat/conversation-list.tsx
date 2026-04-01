"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { authFetch } from "@/lib/auth-client";
import { useRouter, useParams } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/socket/socket-provider";
import { MessageSquare } from "lucide-react";

interface Participant {
  user: { id: string; username: string; displayName: string };
}

interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  messages: { id: string; timestamp: string; senderId: string }[];
}

export function ConversationList() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { onlineUsers } = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const activeConversationId = params?.conversationId as string | undefined;

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    try {
      const res = await authFetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setLoading(false);
    }
  }

  function getOtherParticipant(conversation: Conversation) {
    return conversation.participants.find(
      (p) => p.user.id !== user?.id
    )?.user;
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Loading conversations...
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
        <MessageSquare className="h-8 w-8" />
        <p>No conversations yet</p>
        <p className="text-xs">Search for users to start chatting</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-1 p-2">
        {conversations.map((conv) => {
          const other = getOtherParticipant(conv);
          if (!other) return null;

          const isActive = activeConversationId === conv.id;
          const isOnline = onlineUsers.has(other.id);

          return (
            <button
              key={conv.id}
              onClick={() => router.push(`/chat/${conv.id}`)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">
                    {getInitials(other.displayName)}
                  </AvatarFallback>
                </Avatar>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">
                    {other.displayName}
                  </span>
                  {isOnline && (
                    <Badge variant="secondary" className="text-[10px] px-1.5">
                      online
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate block">
                  @{other.username}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export function refreshConversations() {
  // This will be called externally to refresh the list
  window.dispatchEvent(new CustomEvent("refresh-conversations"));
}
