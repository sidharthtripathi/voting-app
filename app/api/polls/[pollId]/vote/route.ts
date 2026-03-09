import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import type { VoteRequest, VoteResponse, ErrorResponse } from '@/types';

/**
 * POST /api/polls/[pollId]/vote
 * Record a vote with duplicate prevention
 * Requirements: 4.4, 4.5, 4.6, 4.8, 10.3, 12.2, 12.3
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> }
) {
  try {
    const { pollId } = await params;
    const body: VoteRequest = await request.json();
    const { optionId, anonymousId } = body;

    // Validate required fields
    if (!optionId || !anonymousId) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'MISSING_FIELDS',
            message: 'optionId and anonymousId are required',
          },
        },
        { status: 400 }
      );
    }

    // Fetch poll to validate it exists and check if it's open
    let poll = await prisma.poll.findUnique({
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

    // Auto-expire check
    if (!poll.closed && poll.expiresAt && new Date() >= new Date(poll.expiresAt)) {
      poll = await prisma.poll.update({
        where: { id: pollId },
        data: { closed: true },
      });

      try {
        const pusher = getPusherServer();
        await pusher.trigger(getPollChannelName(pollId), PUSHER_EVENTS.POLL_CLOSED, {
          pollId,
          closedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to dispatch poll closed event details:', e);
      }
    }

    // Check if poll is closed
    if (poll.closed) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'POLL_CLOSED',
            message: 'Cannot vote on a closed poll',
          },
        },
        { status: 409 }
      );
    }

    // Check if anonymous ID has already voted
    const existingVote = await prisma.vote.findUnique({
      where: {
        pollId_anonymousId: {
          pollId,
          anonymousId,
        },
      },
    });

    if (existingVote) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'DUPLICATE_VOTE',
            message: 'You have already voted on this poll',
          },
        },
        { status: 409 }
      );
    }

    // Verify option exists and belongs to this poll
    const option = await prisma.option.findUnique({
      where: { id: optionId },
    });

    if (!option || option.pollId !== pollId) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'INVALID_OPTION',
            message: 'Invalid option for this poll',
          },
        },
        { status: 400 }
      );
    }

    // Record vote and increment vote count atomically in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create vote record
      await tx.vote.create({
        data: {
          pollId,
          optionId,
          anonymousId,
        },
      });

      // Increment option vote count
      const updatedOption = await tx.option.update({
        where: { id: optionId },
        data: {
          voteCount: {
            increment: 1,
          },
        },
      });

      return updatedOption;
    });

    // Trigger Pusher event with updated counts
    try {
      const pusher = getPusherServer();
      const channelName = getPollChannelName(pollId);

      await pusher.trigger(channelName, PUSHER_EVENTS.VOTE_UPDATE, {
        optionId: result.id,
        count: result.voteCount,
      });
    } catch (pusherError) {
      // Log Pusher error but don't fail the request
      console.error('Failed to trigger Pusher event:', pusherError);
    }

    // Return success response with updated counts
    const response: VoteResponse = {
      success: true,
      updatedCounts: [
        {
          optionId: result.id,
          count: result.voteCount,
        },
      ],
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error recording vote:', error);
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to record vote',
        },
      },
      { status: 500 }
    );
  }
}
