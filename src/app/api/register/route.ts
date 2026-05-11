import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth-server";
import { userCreateSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 422 });
  }

  const { username, displayName, password } = parsed.data;
  const db = await getDb();

  const existing = await db.collection("users").findOne({ username });
  if (existing) {
    return NextResponse.json({ detail: "Username already taken" }, { status: 409 });
  }

  const now = new Date();
  const result = await db.collection("users").insertOne({
    username,
    display_name: displayName,
    password_hash: await hashPassword(password),
    created_at: now,
    updated_at: now,
    identity_key_public: null,
    signed_pre_key_public: null,
    signed_pre_key_sig: null,
    signed_pre_key_id: null,
  });

  return NextResponse.json({
    id: result.insertedId.toString(),
    username,
    displayName,
  });
}
