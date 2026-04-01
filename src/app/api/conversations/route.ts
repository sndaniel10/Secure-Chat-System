import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET - list conversations for current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      participants: {
        some: { userId: session.user.id },
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true },
          },
        },
      },
      messages: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          id: true,
          timestamp: true,
          senderId: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ conversations });
}

// POST - create a new conversation
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recipientId } = await request.json();

  if (!recipientId) {
    return NextResponse.json(
      { error: "Recipient ID required" },
      { status: 400 }
    );
  }

  // Verify recipient exists
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
  });

  if (!recipient) {
    return NextResponse.json(
      { error: "Recipient not found" },
      { status: 404 }
    );
  }

  // Check if conversation already exists between these two users
  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: session.user.id } } },
        { participants: { some: { userId: recipientId } } },
      ],
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true },
          },
        },
      },
    },
  });

  if (existing) {
    return NextResponse.json({ conversation: existing });
  }

  const conversation = await prisma.conversation.create({
    data: {
      participants: {
        create: [{ userId: session.user.id }, { userId: recipientId }],
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ conversation });
}
