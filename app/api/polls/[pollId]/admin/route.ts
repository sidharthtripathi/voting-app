import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { AdminActionRequest, ErrorResponse } from '@/types';

/**
 * DELETE /api/polls/[pollId]/admin
 * Delete a poll permanently (requires valid control token)
 * Cascade deletes all associated options, votes, and suggestions
 * Requirements: 3.4, 3.7
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> }
) {
  try {
    const { pollId } = await params;
    const body: AdminActionRequest = await request.json();
    const { controlToken } = body;

    // Validate required fields
    if (!controlToken) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'MISSING_TOKEN',
            message: 'Control token is required',
          },
        },
        { status: 401 }
      );
    }

    // Fetch poll to verify it exists and validate control token
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
    });

    if (!poll) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'POLL_NOT_FOUND',
            message: 'Poll not found',
          },
        },
        { status: 404 }
      );
    }

    // Verify control token matches
    if (poll.controlToken !== controlToken) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid control token',
          },
        },
        { status: 401 }
      );
    }

    // Delete poll (cascade deletes options, votes, suggestions via Prisma schema)
    await prisma.poll.delete({
      where: { id: pollId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting poll:', error);
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete poll',
        },
      },
      { status: 500 }
    );
  }
}
