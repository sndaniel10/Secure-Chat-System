import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      identityKeyPublic,
      signedPreKeyPublic,
      signedPreKeySig,
      signedPreKeyId,
      oneTimePreKeys,
    } = await request.json();

    // Update user's key bundle
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        identityKeyPublic,
        signedPreKeyPublic,
        signedPreKeySig,
        signedPreKeyId,
      },
    });

    // Store one-time pre-keys
    if (oneTimePreKeys && Array.isArray(oneTimePreKeys)) {
      for (const pk of oneTimePreKeys) {
        await prisma.preKey.upsert({
          where: {
            userId_keyId: {
              userId: session.user.id,
              keyId: pk.keyId,
            },
          },
          update: { publicKey: pk.publicKey, used: false },
          create: {
            userId: session.user.id,
            keyId: pk.keyId,
            publicKey: pk.publicKey,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to upload keys:", error);
    return NextResponse.json(
      { error: "Failed to upload keys" },
      { status: 500 }
    );
  }
}
