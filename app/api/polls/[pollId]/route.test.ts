/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from './route';
import { prisma } from '@/lib/prisma';
import type { PollDataResponse, ErrorResponse } from '@/types';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    poll: {
      findUnique: jest.fn(),
    },
    vote: {
      findUnique: jest.fn(),
    },
  },
}));

describe('GET /api/polls/[pollId]', () => {
  const mockPollId = 'test-poll-id';
  const mockAnonymousId = 'test-anonymous-id';

  const mockPoll = {
    id: mockPollId,
    title: 'Test Poll',
    description: 'Test Description',
    controlToken: 'test-token',
    createdAt: new Date('2024-01-01'),
    expiresAt: null,
    closed: false,
    suggestionsEnabled: true,
    options: [
      {
        id: 'option-1',
        pollId: mockPollId,
        text: 'Option 1',
        voteCount: 5,
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'option-2',
        pollId: mockPollId,
        text: 'Option 2',
        voteCount: 3,
        createdAt: new Date('2024-01-01'),
      },
    ],
    suggestions: [
      {
        id: 'suggestion-1',
        pollId: mockPollId,
        text: 'Suggested Option',
        createdAt: new Date('2024-01-01'),
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully fetch poll data', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}?anonymousId=${mockAnonymousId}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(response.status).toBe(200);

    const data: PollDataResponse = await response.json();
    expect(data.poll.id).toBe(mockPollId);
    expect(data.poll.title).toBe('Test Poll');
    expect(data.options).toHaveLength(2);
    expect(data.suggestions).toHaveLength(1);
    expect(data.hasVoted).toBe(false);
  });

  it('should return 404 for non-existent poll', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/non-existent-id`
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: 'non-existent-id' }),
    });

    expect(response.status).toBe(404);

    const data: ErrorResponse = await response.json();
    expect(data.error.code).toBe('POLL_NOT_FOUND');
    expect(data.error.message).toBe('Poll not found');
  });

  it('should correctly set hasVoted flag when user has voted', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue({
      id: 'vote-1',
      pollId: mockPollId,
      optionId: 'option-1',
      anonymousId: mockAnonymousId,
      createdAt: new Date('2024-01-01'),
    });

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}?anonymousId=${mockAnonymousId}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(response.status).toBe(200);

    const data: PollDataResponse = await response.json();
    expect(data.hasVoted).toBe(true);
  });

  it('should check anonymous ID from header if not in query param', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}`,
      {
        headers: {
          'x-anonymous-id': mockAnonymousId,
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(response.status).toBe(200);
    expect(prisma.vote.findUnique).toHaveBeenCalledWith({
      where: {
        pollId_anonymousId: {
          pollId: mockPollId,
          anonymousId: mockAnonymousId,
        },
      },
    });
  });

  it('should set hasVoted to false when no anonymous ID provided', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(response.status).toBe(200);

    const data: PollDataResponse = await response.json();
    expect(data.hasVoted).toBe(false);
    expect(prisma.vote.findUnique).not.toHaveBeenCalled();
  });

  it('should return poll with closed status', async () => {
    const closedPoll = { ...mockPoll, closed: true };
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(closedPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(response.status).toBe(200);

    const data: PollDataResponse = await response.json();
    expect(data.poll.closed).toBe(true);
  });

  it('should handle database errors gracefully', async () => {
    (prisma.poll.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection failed')
    );

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(response.status).toBe(500);

    const data: ErrorResponse = await response.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.error.message).toBe(
      'An error occurred while fetching the poll'
    );
  });

  it('should return options ordered by creation date', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}`
    );

    await GET(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });

    expect(prisma.poll.findUnique).toHaveBeenCalledWith({
      where: { id: mockPollId },
      include: {
        options: {
          orderBy: { createdAt: 'asc' },
        },
        suggestions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });
});
