import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  parseOptions,
  generateControlToken,
  calculateExpirationTime,
} from '@/lib/utils';
import type { CreatePollRequest, CreatePollResponse, ErrorResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: CreatePollRequest = await request.json();
    const { title, options: optionsInput, suggestionsEnabled, expiresIn } = body;

    // Validate title
    if (!title || title.trim().length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'INVALID_TITLE',
            message: 'Poll title cannot be empty',
          },
        },
        { status: 400 }
      );
    }

    // Parse options
    const { options } = parseOptions(optionsInput);

    // Validate minimum 2 options
    if (options.length < 2) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: 'INSUFFICIENT_OPTIONS',
            message: 'Poll must have at least 2 options',
            details: { parsedOptions: options },
          },
        },
        { status: 400 }
      );
    }

    // Calculate expiration timestamp if provided
    let expiresAt: Date | null = null;
    if (expiresIn) {
      expiresAt = calculateExpirationTime(expiresIn);
      if (expiresAt === null) {
        return NextResponse.json<ErrorResponse>(
          {
            error: {
              code: 'INVALID_EXPIRATION',
              message: 'Invalid expiration time format',
              details: { expiresIn },
            },
          },
          { status: 400 }
        );
      }
    }

    // Generate control token
    const controlToken = generateControlToken();

    // Create poll and options in database transaction
    const poll = await prisma.$transaction(async (tx) => {
      // Create poll
      const newPoll = await tx.poll.create({
        data: {
          title: title.trim(),
          controlToken,
          suggestionsEnabled: suggestionsEnabled ?? false,
          expiresAt,
        },
      });

      // Create options
      await tx.option.createMany({
        data: options.map((text) => ({
          pollId: newPoll.id,
          text,
        })),
      });

      return newPoll;
    });

    // Return response
    const response: CreatePollResponse = {
      pollId: poll.id,
      controlToken,
      adminUrl: `/admin/${poll.id}`,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating poll:', error);
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create poll',
        },
      },
      { status: 500 }
    );
  }
}
