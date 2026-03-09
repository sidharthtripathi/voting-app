import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import type { AdminActionRequest, ErrorResponse } from '@/types';

/**
 * POST /api/polls/[pollId]/admin/suggestions/[suggestionId]/reject
 * Rejects and deletes a user suggestion on a poll
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pollId: string; suggestionId: string }> }
) {
    try {
        const { pollId, suggestionId } = await params;
        const body: AdminActionRequest = await request.json();
        const { controlToken } = body;

        if (!controlToken) {
            return NextResponse.json<ErrorResponse>(
                { error: { code: 'UNAUTHORIZED', message: 'Control token is required' } },
                { status: 401 }
            );
        }

        const poll = await prisma.poll.findUnique({
            where: { id: pollId, controlToken },
        });

        if (!poll) {
            return NextResponse.json<ErrorResponse>(
                { error: { code: 'UNAUTHORIZED', message: 'Invalid control token or poll not found' } },
                { status: 401 }
            );
        }

        const suggestion = await prisma.suggestion.findUnique({
            where: { id: suggestionId, pollId },
        });

        if (!suggestion) {
            return NextResponse.json<ErrorResponse>(
                { error: { code: 'NOT_FOUND', message: 'Suggestion not found' } },
                { status: 404 }
            );
        }

        await prisma.suggestion.delete({
            where: { id: suggestionId },
        });

        // Notify clients about the rejected suggestion
        const pusher = getPusherServer();
        await pusher.trigger(
            getPollChannelName(pollId),
            PUSHER_EVENTS.SUGGESTION_REJECTED,
            { suggestionId }
        );

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error rejecting suggestion:', error);
        return NextResponse.json<ErrorResponse>(
            { error: { code: 'INTERNAL_ERROR', message: 'Failed to reject suggestion' } },
            { status: 500 }
        );
    }
}
