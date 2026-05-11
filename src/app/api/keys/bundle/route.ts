import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { tryObjectId } from "@/lib/conversations";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ detail: "Key bundle not found" }, { status: 404 });
  }

  const db = await getDb();
  const targetOid = tryObjectId(userId);
  const target = targetOid
    ? await db.collection("users").findOne({ _id: targetOid })
    : null;

  if (!target?.identity_key_public || !target?.signed_pre_key_public) {
    return NextResponse.json({ detail: "Key bundle not found" }, { status: 404 });
  }

  const oneTime = await db
    .collection("pre_keys")
    .findOne({ user_id: userId, used: false }, { sort: { key_id: 1 } });

  if (oneTime) {
    await db
      .collection("pre_keys")
      .updateOne({ _id: oneTime._id }, { $set: { used: true } });
  }

  return NextResponse.json({
    bundle: {
      identityKey: target.identity_key_public,
      signedPreKey: target.signed_pre_key_public,
      signedPreKeySig: target.signed_pre_key_sig,
      signedPreKeyId: target.signed_pre_key_id,
      oneTimePreKey: oneTime ? oneTime.public_key : null,
      oneTimePreKeyId: oneTime ? oneTime.key_id : null,
    },
  });
}
