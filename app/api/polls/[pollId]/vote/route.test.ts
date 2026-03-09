/**
 * @jest-environment node
 */
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { getPusherServer } from '@/lib/pusher';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    poll: {
      findUnique: jest.fn(),
    },
    vote: {
      findUnique: jest.fn(),
    },
    option: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock Pusher
jest.mock('@/lib/pusher', () => ({
  getPusherServer: jest.fn(),
  getPollChannelName: jest.fn((pollId: string) => `poll-${pollId}`),
  PUSHER_EVENTS: {
    VOTE_UPDATE: 'vote-update',
  },
}));

describe('POST /api/polls/[pollId]/vote', () => {
  const mockPollId = 'test-poll-id';
  const mockOptionId = 'test-option-id';
  const mockAnonymousId = 'test-anonymous-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully record a vote', async () => {
    const mockPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: false,
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    const mockOption = {
      id: mockOptionId,
      pollId: mockPollId,
      text: 'Option 1',
      voteCount: 5,
      createdAt: new Date(),
    };

    const mockUpdatedOption = {
      ...mockOption,
      voteCount: 6,
    };

    const mockPusher = {
      trigger: jest.fn().mockResolvedValue({}),
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);

    // Mock the transaction
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback({
        vote: {
          create: jest.fn().mockResolvedValue({
            id: 'vote-id',
            pollId: mockPollId,
            optionId: mockOptionId,
            anonymousId: mockAnonymousId,
            createdAt: new Date(),
          }),
        },
        option: {
          update: jest.fn().mockResolvedValue(mockUpdatedOption),
        },
      });
    });

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.updatedCounts).toHaveLength(1);
    expect(data.updatedCounts[0]).toEqual({
      optionId: mockOptionId,
      count: 6,
    });

    // Verify Pusher was called
    expect(mockPusher.trigger).toHaveBeenCalledWith(
      `poll-${mockPollId}`,
      'vote-update',
      {
        optionId: mockOptionId,
        count: 6,
      }
    );
  });

  it('should reject vote with missing fields', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          // Missing anonymousId
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('MISSING_FIELDS');
    expect(data.error.message).toBe('optionId and anonymousId are required');
  });

  it('should reject vote on non-existent poll', async () => {
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error.code).toBe('POLL_NOT_FOUND');
    expect(data.error.message).toBe('Poll not found');
  });

  it('should reject vote on closed poll', async () => {
    const mockClosedPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: true, // Poll is closed
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockClosedPoll);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error.code).toBe('POLL_CLOSED');
    expect(data.error.message).toBe('Cannot vote on a closed poll');
  });

  it('should reject duplicate vote', async () => {
    const mockPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: false,
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    const mockExistingVote = {
      id: 'existing-vote-id',
      pollId: mockPollId,
      optionId: 'some-option-id',
      anonymousId: mockAnonymousId,
      createdAt: new Date(),
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(mockExistingVote);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error.code).toBe('DUPLICATE_VOTE');
    expect(data.error.message).toBe('You have already voted on this poll');
  });

  it('should reject vote for invalid option', async () => {
    const mockPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: false,
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(null); // Option doesn't exist

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INVALID_OPTION');
    expect(data.error.message).toBe('Invalid option for this poll');
  });

  it('should reject vote for option from different poll', async () => {
    const mockPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: false,
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    const mockOption = {
      id: mockOptionId,
      pollId: 'different-poll-id', // Option belongs to different poll
      text: 'Option 1',
      voteCount: 5,
      createdAt: new Date(),
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INVALID_OPTION');
    expect(data.error.message).toBe('Invalid option for this poll');
  });

  it('should increment vote count atomically', async () => {
    const mockPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: false,
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    const mockOption = {
      id: mockOptionId,
      pollId: mockPollId,
      text: 'Option 1',
      voteCount: 10,
      createdAt: new Date(),
    };

    const mockUpdatedOption = {
      ...mockOption,
      voteCount: 11,
    };

    const mockPusher = {
      trigger: jest.fn().mockResolvedValue({}),
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);

    let voteCreated = false;
    let optionUpdated = false;

    // Mock the transaction to verify both operations happen
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback({
        vote: {
          create: jest.fn().mockImplementation(() => {
            voteCreated = true;
            return Promise.resolve({
              id: 'vote-id',
              pollId: mockPollId,
              optionId: mockOptionId,
              anonymousId: mockAnonymousId,
              createdAt: new Date(),
            });
          }),
        },
        option: {
          update: jest.fn().mockImplementation(() => {
            optionUpdated = true;
            return Promise.resolve(mockUpdatedOption);
          }),
        },
      });
    });

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(voteCreated).toBe(true);
    expect(optionUpdated).toBe(true);
    expect(data.updatedCounts[0].count).toBe(11);
  });

  it('should handle Pusher failure gracefully', async () => {
    const mockPoll = {
      id: mockPollId,
      title: 'Test Poll',
      closed: false,
      controlToken: 'test-token',
      createdAt: new Date(),
      expiresAt: null,
      suggestionsEnabled: false,
      description: null,
    };

    const mockOption = {
      id: mockOptionId,
      pollId: mockPollId,
      text: 'Option 1',
      voteCount: 5,
      createdAt: new Date(),
    };

    const mockUpdatedOption = {
      ...mockOption,
      voteCount: 6,
    };

    const mockPusher = {
      trigger: jest.fn().mockRejectedValue(new Error('Pusher error')),
    };

    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.vote.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback({
        vote: {
          create: jest.fn().mockResolvedValue({
            id: 'vote-id',
            pollId: mockPollId,
            optionId: mockOptionId,
            anonymousId: mockAnonymousId,
            createdAt: new Date(),
          }),
        },
        option: {
          update: jest.fn().mockResolvedValue(mockUpdatedOption),
        },
      });
    });

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          optionId: mockOptionId,
          anonymousId: mockAnonymousId,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ pollId: mockPollId }),
    });
    const data = await response.json();

    // Vote should still succeed even if Pusher fails
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.updatedCounts[0].count).toBe(6);
  });
});
