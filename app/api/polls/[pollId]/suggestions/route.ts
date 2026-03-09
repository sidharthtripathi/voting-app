import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import type { ErrorResponse } from '@/types';

/**
 * POST /api/polls/[pollId]/suggestions
 * Create a new suggestion for a poll
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pollId: string }> }
) {
    try {
        const { pollId } = await params;
        const body = await request.json();
        const { text } = body;

        if (!text || typeof text !== 'string' || text.trim() === '') {
            return NextResponse.json<ErrorResponse>(
                {
                    error: {
                        code: 'INVALID_SUGGESTION',
                        message: 'Suggestion text cannot be empty or invalid',
                    },
                },
                { status: 400 }
            );
        }

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
        });

        if (!poll) {
            return NextResponse.json<ErrorResponse>(
                {
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Poll not found',
                    },
                },
                { status: 404 }
            );
        }

        if (poll.closed) {
            return NextResponse.json<ErrorResponse>(
                {
                    error: {
                        code: 'POLL_CLOSED',
                        message: 'Cannot suggest options for a closed poll',
                    },
                },
                { status: 400 }
            );
        }

        if (!poll.suggestionsEnabled) {
            return NextResponse.json<ErrorResponse>(
                {
                    error: {
                        code: 'SUGGESTIONS_DISABLED',
                        message: 'Suggestions are disabled for this poll',
                    },
                },
                { status: 400 }
            );
        }

        // Check if the suggestion exactly matches an existing option
        const existingOption = await prisma.option.findFirst({
            where: {
                pollId,
                text: {
                    equals: text.trim(),
                    mode: 'insensitive',
                },
            },
        });

        if (existingOption) {
            return NextResponse.json<ErrorResponse>(
                {
                    error: {
                        code: 'OPTION_EXISTS',
                        message: 'This option already exists in the poll',
                    },
                },
                { status: 400 }
            );
        }

        const suggestion = await prisma.suggestion.create({
            data: {
                pollId,
                text: text.trim(),
            },
        });

        // Notify clients (especially admin) about the new suggestion
        const pusher = getPusherServer();
        await pusher.trigger(
            getPollChannelName(pollId),
            PUSHER_EVENTS.SUGGESTION_CREATED,
            { suggestion }
        );

        return NextResponse.json(suggestion, { status: 201 });
    } catch (error) {
        console.error('Error creating suggestion:', error);
        return NextResponse.json<ErrorResponse>(
            {
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to create suggestion',
                },
            },
            { status: 500 }
        );
    }
}
