import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId parameter required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      identityKeyPublic: true,
      signedPreKeyPublic: true,
      signedPreKeySig: true,
      signedPreKeyId: true,
    },
  });

  if (
    !user ||
    !user.identityKeyPublic ||
    !user.signedPreKeyPublic
  ) {
    return NextResponse.json(
      { error: "Key bundle not found" },
      { status: 404 }
    );
  }

  // Fetch an unused one-time pre-key
  const oneTimePreKey = await prisma.preKey.findFirst({
    where: { userId, used: false },
    orderBy: { keyId: "asc" },
  });

  // Mark it as used
  if (oneTimePreKey) {
    await prisma.preKey.update({
      where: { id: oneTimePreKey.id },
      data: { used: true },
    });
  }

  return NextResponse.json({
    bundle: {
      identityKey: user.identityKeyPublic,
      signedPreKey: user.signedPreKeyPublic,
      signedPreKeySig: user.signedPreKeySig,
      signedPreKeyId: user.signedPreKeyId,
      oneTimePreKey: oneTimePreKey?.publicKey || undefined,
      oneTimePreKeyId: oneTimePreKey?.keyId,
    },
  });
}
