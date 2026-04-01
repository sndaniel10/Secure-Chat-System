"use client";

import { useSession, signOut } from "next-auth/react";
import { ConversationList } from "@/components/chat/conversation-list";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Shield, LogOut, MessageSquare } from "lucide-react";

export default function ChatPage() {
  const { data: session } = useSession();

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 border-r flex flex-col bg-background">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-lg">HPO Chat</h1>
          </div>
          <div className="flex items-center gap-1">
            <NewChatDialog />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Separator />
        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium">
              {session?.user?.name || "User"}
            </span>
          </p>
        </div>
        <Separator />
        <ConversationList />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3 text-muted-foreground">
          <MessageSquare className="h-16 w-16 mx-auto opacity-20" />
          <h2 className="text-xl font-medium">HPO Encrypted Chat</h2>
          <p className="text-sm max-w-md">
            Select a conversation or start a new one. All messages are
            end-to-end encrypted with metadata obfuscation.
          </p>
        </div>
      </div>
    </div>
  );
}
