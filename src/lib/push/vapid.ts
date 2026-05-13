import webpush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@hpochat.app";
  if (!pub || !priv) throw new Error("VAPID keys not set in environment");
  webpush.setVapidDetails(email, pub, priv);
  configured = true;
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY not set");
  return key;
}

export async function sendPush(
  subscription: webpush.PushSubscription,
  payload: {
    title: string;
    body: string;
    url: string;
    tag?: string;
  }
): Promise<void> {
  ensureConfigured();
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
