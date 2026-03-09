import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import type { ErrorResponse, OptionEditedEvent } from '@/types';

interface EditOptionRequest {
  controlToken: string;
  text: string;
}

/**
 * PATCH /api/polls/[pollId]/admin/options/[optionId]
 * Update option text (requires valid control token)
 * Requirements: 3.5, 3.8
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string; optionId: string }> }
) {
  try {
    const { pollId, optionId } = await params;
    const body: EditOptionRequest = await request.json();
    const { controlToken, text } = body;

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

    if (!text || text.trim().length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'INVALID_TEXT',
            message: 'Option text cannot be empty',
          },
        },
        { status: 400 }
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

    // Verify option exists and belongs to this poll
    const option = await prisma.option.findUnique({
      where: { id: optionId },
    });

    if (!option) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'OPTION_NOT_FOUND',
            message: 'Option not found',
          },
        },
        { status: 404 }
      );
    }

    if (option.pollId !== pollId) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'OPTION_POLL_MISMATCH',
            message: 'Option does not belong to this poll',
          },
        },
        { status: 400 }
      );
    }

    // Update option text
    const updatedOption = await prisma.option.update({
      where: { id: optionId },
      data: { text: text.trim() },
    });

    // Trigger Pusher event to notify all connected clients
    try {
      const pusher = getPusherServer();
      const channelName = getPollChannelName(pollId);

      const eventData: OptionEditedEvent = {
        optionId: updatedOption.id,
        text: updatedOption.text,
      };

      await pusher.trigger(channelName, PUSHER_EVENTS.OPTION_EDITED, eventData);
    } catch (pusherError) {
      // Log Pusher error but don't fail the request
      console.error('Failed to trigger Pusher event:', pusherError);
    }

    return NextResponse.json(
      {
        success: true,
        updatedOption,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating option:', error);
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update option',
        },
      },
      { status: 500 }
    );
  }
}
