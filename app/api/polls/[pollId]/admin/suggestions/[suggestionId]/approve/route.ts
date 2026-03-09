import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import type { AdminActionRequest, ErrorResponse } from '@/types';

/**
 * POST /api/polls/[pollId]/admin/suggestions/[suggestionId]/approve
 * Approves a user suggestion, converting it into a valid poll option
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

        if (poll.closed) {
            return NextResponse.json<ErrorResponse>(
                { error: { code: 'POLL_CLOSED', message: 'Cannot approve suggestions for a closed poll' } },
                { status: 400 }
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

        // Use transaction to atomic delete and create
        const [newOption] = await prisma.$transaction([
            prisma.option.create({
                data: {
                    pollId: pollId,
                    text: suggestion.text,
                },
            }),
            prisma.suggestion.delete({
                where: { id: suggestionId },
            }),
        ]);

        // Notify clients about the new option based on suggestion approval
        const pusher = getPusherServer();
        await pusher.trigger(
            getPollChannelName(pollId),
            PUSHER_EVENTS.SUGGESTION_APPROVED,
            { newOption }
        );

        return NextResponse.json(newOption, { status: 201 });
    } catch (error) {
        console.error('Error approving suggestion:', error);
        return NextResponse.json<ErrorResponse>(
            { error: { code: 'INTERNAL_ERROR', message: 'Failed to approve suggestion' } },
            { status: 500 }
        );
    }
}
