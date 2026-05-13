"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { authFetch } from "@/lib/auth-client";
import { useAuth } from "./auth-provider";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationContextType {
  permission: NotificationPermission | "unsupported";
  requestPermission: () => Promise<void>;
  showInAppNotification: (title: string, body: string, url: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  permission: "default",
  requestPermission: async () => {},
  showInAppNotification: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [showBanner, setShowBanner] = useState(false);

  // Detect support and current permission
  useEffect(() => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    if (Notification.permission === "default" && isAuthenticated) {
      setShowBanner(true);
    }
  }, [isAuthenticated]);

  // Register service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[SW] Registration failed:", err));
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const res = await authFetch("/api/push/subscribe");
    if (!res.ok) return;
    const { publicKey } = await res.json();

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await authFetch("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub.toJSON()),
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    setShowBanner(false);
    if (result === "granted") {
      await subscribe();
    }
  }, [subscribe]);

  const showInAppNotification = useCallback(
    (title: string, body: string, url: string) => {
      if (permission !== "granted") return;
      if (document.hasFocus()) return; // Only show when tab is not focused
      new Notification(title, {
        body,
        icon: "/icons/icon.svg",
        tag: url,
        data: { url },
      });
    },
    [permission]
  );

  return (
    <NotificationContext.Provider
      value={{ permission, requestPermission, showInAppNotification }}
    >
      {showBanner && permission === "default" && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 bg-primary text-primary-foreground px-4 py-2 text-sm shadow-md">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 shrink-0" />
            <span>Enable notifications to get alerted when new messages arrive</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={requestPermission}
            >
              Enable
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-primary-foreground hover:text-primary-foreground hover:bg-primary/80"
              onClick={() => setShowBanner(false)}
            >
              <BellOff className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
