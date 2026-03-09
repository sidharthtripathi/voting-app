import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PollDataResponse, ErrorResponse } from '@/types';

/**
 * GET /api/polls/[pollId]
 * Fetch poll data including options, suggestions, and hasVoted status
 * Requirements: 4.1, 4.2, 4.8, 14.5
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> }
) {
  try {
    const { pollId } = await params;

    // Get anonymous ID from query param or header
    const anonymousId =
      request.nextUrl.searchParams.get('anonymousId') ||
      request.headers.get('x-anonymous-id');

    // Fetch poll with related data
    let poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          orderBy: { createdAt: 'asc' },
        },
        suggestions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Handle 404 for non-existent polls
    if (!poll) {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'POLL_NOT_FOUND',
          message: 'Poll not found',
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    // Auto-expire check
    if (!poll.closed && poll.expiresAt && new Date() >= new Date(poll.expiresAt)) {
      poll = await prisma.poll.update({
        where: { id: pollId },
        data: { closed: true },
        include: {
          options: { orderBy: { createdAt: 'asc' } },
          suggestions: { orderBy: { createdAt: 'asc' } },
        },
      });

      try {
        const { getPusherServer, getPollChannelName, PUSHER_EVENTS } = await import('@/lib/pusher');
        const pusher = getPusherServer();
        await pusher.trigger(getPollChannelName(pollId), PUSHER_EVENTS.POLL_CLOSED, {
          pollId,
          closedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to dispatch poll closed event details:', e);
      }
    }

    // Check if anonymous ID has voted
    let hasVoted = false;
    if (anonymousId) {
      const existingVote = await prisma.vote.findUnique({
        where: {
          pollId_anonymousId: {
            pollId,
            anonymousId,
          },
        },
      });
      hasVoted = existingVote !== null;
    }

    // Prepare response
    const response: PollDataResponse = {
      poll: {
        id: poll.id,
        title: poll.title,
        description: poll.description,
        controlToken: poll.controlToken,
        createdAt: poll.createdAt,
        expiresAt: poll.expiresAt,
        closed: poll.closed,
        suggestionsEnabled: poll.suggestionsEnabled,
      },
      options: poll.options.map((option) => ({
        id: option.id,
        pollId: option.pollId,
        text: option.text,
        voteCount: option.voteCount,
        createdAt: option.createdAt,
      })),
      suggestions: poll.suggestions.map((suggestion) => ({
        id: suggestion.id,
        pollId: suggestion.pollId,
        text: suggestion.text,
        createdAt: suggestion.createdAt,
      })),
      hasVoted,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching poll:', error);
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while fetching the poll',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
