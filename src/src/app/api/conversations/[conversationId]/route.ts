/**
 * GET /api/conversations/:conversationId
 *
 * Returns a conversation with its full message history.
 * Verifies that the requesting user owns the workspace the conversation belongs to.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { getConversation } from "@/src/modules/chat/service";
import { findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Verify that the requesting user owns the workspace
  const workspace = await findWorkspaceByIdAndUser(conversation.workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json(conversation);
}
