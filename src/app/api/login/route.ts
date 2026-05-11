import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createAccessToken, verifyPassword } from "@/lib/auth-server";
import { loginSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 422 });
  }

  const { username, password } = parsed.data;
  const db = await getDb();

  const user = await db.collection("users").findOne({ username });
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json(
      { detail: "Invalid username or password" },
      { status: 401 }
    );
  }

  const userId = user._id.toString();
  const token = await createAccessToken({
    sub: userId,
    username: user.username,
    display_name: user.display_name,
  });

  return NextResponse.json({
    access_token: token,
    token_type: "bearer",
    user: {
      id: userId,
      username: user.username,
      displayName: user.display_name,
    },
  });
}
