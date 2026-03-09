/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    poll: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/pusher', () => ({
  getPusherServer: jest.fn(),
  getPollChannelName: jest.fn(),
  PUSHER_EVENTS: {
    POLL_CLOSED: 'poll-closed',
  },
}));

describe('POST /api/polls/[pollId]/admin/close', () => {
  const mockPollId = 'test-poll-id';
  const mockControlToken = 'valid-control-token';
  const mockPoll = {
    id: mockPollId,
    title: 'Test Poll',
    description: null,
    controlToken: mockControlToken,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: null,
    closed: false,
    suggestionsEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should close a poll with valid control token', async () => {
    // Arrange
    const mockUpdatedPoll = { ...mockPoll, closed: true };
    const mockPusher = { trigger: jest.fn().mockResolvedValue(undefined) };
    
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.poll.update as jest.Mock).mockResolvedValue(mockUpdatedPoll);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);
    (getPollChannelName as jest.Mock).mockReturnValue(`poll-${mockPollId}`);

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin/close', {
      method: 'POST',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await POST(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(prisma.poll.findUnique).toHaveBeenCalledWith({
      where: { id: mockPollId },
    });
    expect(prisma.poll.update).toHaveBeenCalledWith({
      where: { id: mockPollId },
      data: { closed: true },
    });
    expect(mockPusher.trigger).toHaveBeenCalledWith(
      `poll-${mockPollId}`,
      PUSHER_EVENTS.POLL_CLOSED,
      {
        pollId: mockPollId,
        closedAt: mockUpdatedPoll.createdAt.toISOString(),
      }
    );
  });

  it('should return 401 when control token is missing', async () => {
    // Arrange
    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin/close', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    // Act
    const response = await POST(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error.code).toBe('MISSING_TOKEN');
    expect(data.error.message).toBe('Control token is required');
    expect(prisma.poll.findUnique).not.toHaveBeenCalled();
  });

  it('should return 404 when poll does not exist', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin/close', {
      method: 'POST',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await POST(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error.code).toBe('POLL_NOT_FOUND');
    expect(data.error.message).toBe('Poll not found');
    expect(prisma.poll.update).not.toHaveBeenCalled();
  });

  it('should return 401 when control token is invalid', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin/close', {
      method: 'POST',
      body: JSON.stringify({ controlToken: 'invalid-token' }),
    });

    // Act
    const response = await POST(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error.code).toBe('INVALID_TOKEN');
    expect(data.error.message).toBe('Invalid control token');
    expect(prisma.poll.update).not.toHaveBeenCalled();
  });

  it('should succeed even if Pusher event fails', async () => {
    // Arrange
    const mockUpdatedPoll = { ...mockPoll, closed: true };
    const mockPusher = { trigger: jest.fn().mockRejectedValue(new Error('Pusher error')) };
    
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.poll.update as jest.Mock).mockResolvedValue(mockUpdatedPoll);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);
    (getPollChannelName as jest.Mock).mockReturnValue(`poll-${mockPollId}`);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin/close', {
      method: 'POST',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await POST(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to trigger Pusher event:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should return 500 when database operation fails', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin/close', {
      method: 'POST',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await POST(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.error.message).toBe('Failed to close poll');

    consoleErrorSpy.mockRestore();
  });
});
