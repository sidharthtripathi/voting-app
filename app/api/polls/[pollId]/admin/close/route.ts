import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import type { AdminActionRequest, ErrorResponse } from '@/types';

/**
 * POST /api/polls/[pollId]/admin/close
 * Close a poll (requires valid control token)
 * Requirements: 3.2, 3.6, 3.8
 */
export async function POST(
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

    // Update poll closed status to true
    const updatedPoll = await prisma.poll.update({
      where: { id: pollId },
      data: { closed: true },
    });

    // Trigger Pusher event to notify all connected clients
    try {
      const pusher = getPusherServer();
      const channelName = getPollChannelName(pollId);

      await pusher.trigger(channelName, PUSHER_EVENTS.POLL_CLOSED, {
        pollId: updatedPoll.id,
        closedAt: updatedPoll.createdAt.toISOString(),
      });
    } catch (pusherError) {
      // Log Pusher error but don't fail the request
      console.error('Failed to trigger Pusher event:', pusherError);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error closing poll:', error);
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to close poll',
        },
      },
      { status: 500 }
    );
  }
}
