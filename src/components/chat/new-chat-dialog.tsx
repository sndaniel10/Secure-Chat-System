"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquarePlus, Search, Loader2 } from "lucide-react";

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
}

export function NewChatDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.length < 1) {
      setUsers([]);
      return;
    }

    setSearching(true);
    try {
      const res = await authFetch(
        `/api/users/search?q=${encodeURIComponent(value)}`
      );
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    } finally {
      setSearching(false);
    }
  }

  async function startConversation(recipientId: string) {
    setCreating(true);
    try {
      const res = await authFetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      const data = await res.json();
      if (data.conversation) {
        setOpen(false);
        router.push(`/chat/${data.conversation.id}`);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Search for a user to start an encrypted conversation
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {searching && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {!searching && users.length === 0 && query.length > 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No users found
              </p>
            )}
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => startConversation(user.id)}
                disabled={creating}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">
                    {user.displayName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    @{user.username}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
