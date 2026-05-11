import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { keyBundleUploadSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = keyBundleUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 422 });
  }

  const {
    identityKeyPublic,
    signedPreKeyPublic,
    signedPreKeySig,
    signedPreKeyId,
    oneTimePreKeys,
  } = parsed.data;

  const db = await getDb();

  await db.collection("users").updateOne(
    { _id: new ObjectId(user.id) },
    {
      $set: {
        identity_key_public: identityKeyPublic,
        signed_pre_key_public: signedPreKeyPublic,
        signed_pre_key_sig: signedPreKeySig,
        signed_pre_key_id: signedPreKeyId,
      },
    }
  );

  for (const pk of oneTimePreKeys) {
    await db.collection("pre_keys").updateOne(
      { user_id: user.id, key_id: pk.keyId },
      {
        $set: {
          user_id: user.id,
          key_id: pk.keyId,
          public_key: pk.publicKey,
          used: false,
        },
      },
      { upsert: true }
    );
  }

  return NextResponse.json({ success: true });
}
