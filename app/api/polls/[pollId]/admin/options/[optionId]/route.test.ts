/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { prisma } from '@/lib/prisma';
import { getPusherServer, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    poll: {
      findUnique: jest.fn(),
    },
    option: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/pusher', () => ({
  getPusherServer: jest.fn(),
  getPollChannelName: jest.fn(),
  PUSHER_EVENTS: {
    OPTION_EDITED: 'option-edited',
  },
}));

describe('PATCH /api/polls/[pollId]/admin/options/[optionId]', () => {
  const mockPollId = 'test-poll-id';
  const mockOptionId = 'test-option-id';
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
  const mockOption = {
    id: mockOptionId,
    pollId: mockPollId,
    text: 'Original option text',
    voteCount: 5,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update option text with valid control token', async () => {
    // Arrange
    const newText = 'Updated option text';
    const mockUpdatedOption = { ...mockOption, text: newText };
    const mockPusher = { trigger: jest.fn().mockResolvedValue(undefined) };
    
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);
    (prisma.option.update as jest.Mock).mockResolvedValue(mockUpdatedOption);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);
    (getPollChannelName as jest.Mock).mockReturnValue(`poll-${mockPollId}`);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: newText }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.updatedOption).toEqual({
      ...mockUpdatedOption,
      createdAt: mockUpdatedOption.createdAt.toISOString(),
    });
    expect(prisma.poll.findUnique).toHaveBeenCalledWith({
      where: { id: mockPollId },
    });
    expect(prisma.option.findUnique).toHaveBeenCalledWith({
      where: { id: mockOptionId },
    });
    expect(prisma.option.update).toHaveBeenCalledWith({
      where: { id: mockOptionId },
      data: { text: newText },
    });
    expect(mockPusher.trigger).toHaveBeenCalledWith(
      `poll-${mockPollId}`,
      PUSHER_EVENTS.OPTION_EDITED,
      {
        optionId: mockOptionId,
        text: newText,
      }
    );
  });

  it('should trim whitespace from option text', async () => {
    // Arrange
    const newText = '  Updated option text  ';
    const trimmedText = 'Updated option text';
    const mockUpdatedOption = { ...mockOption, text: trimmedText };
    const mockPusher = { trigger: jest.fn().mockResolvedValue(undefined) };
    
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);
    (prisma.option.update as jest.Mock).mockResolvedValue(mockUpdatedOption);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);
    (getPollChannelName as jest.Mock).mockReturnValue(`poll-${mockPollId}`);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: newText }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(prisma.option.update).toHaveBeenCalledWith({
      where: { id: mockOptionId },
      data: { text: trimmedText },
    });
  });

  it('should return 401 when control token is missing', async () => {
    // Arrange
    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ text: 'New text' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error.code).toBe('MISSING_TOKEN');
    expect(data.error.message).toBe('Control token is required');
    expect(prisma.poll.findUnique).not.toHaveBeenCalled();
  });

  it('should return 400 when text is empty', async () => {
    // Arrange
    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: '' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INVALID_TEXT');
    expect(data.error.message).toBe('Option text cannot be empty');
    expect(prisma.poll.findUnique).not.toHaveBeenCalled();
  });

  it('should return 400 when text is only whitespace', async () => {
    // Arrange
    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: '   ' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INVALID_TEXT');
    expect(data.error.message).toBe('Option text cannot be empty');
  });

  it('should return 404 when poll does not exist', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: 'New text' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error.code).toBe('POLL_NOT_FOUND');
    expect(data.error.message).toBe('Poll not found');
    expect(prisma.option.findUnique).not.toHaveBeenCalled();
  });

  it('should return 401 when control token is invalid', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: 'invalid-token', text: 'New text' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error.code).toBe('INVALID_TOKEN');
    expect(data.error.message).toBe('Invalid control token');
    expect(prisma.option.findUnique).not.toHaveBeenCalled();
  });

  it('should return 404 when option does not exist', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: 'New text' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error.code).toBe('OPTION_NOT_FOUND');
    expect(data.error.message).toBe('Option not found');
    expect(prisma.option.update).not.toHaveBeenCalled();
  });

  it('should return 400 when option does not belong to poll', async () => {
    // Arrange
    const wrongPollOption = { ...mockOption, pollId: 'different-poll-id' };
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(wrongPollOption);

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: 'New text' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error.code).toBe('OPTION_POLL_MISMATCH');
    expect(data.error.message).toBe('Option does not belong to this poll');
    expect(prisma.option.update).not.toHaveBeenCalled();
  });

  it('should succeed even if Pusher event fails', async () => {
    // Arrange
    const newText = 'Updated option text';
    const mockUpdatedOption = { ...mockOption, text: newText };
    const mockPusher = { trigger: jest.fn().mockRejectedValue(new Error('Pusher error')) };
    
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.option.findUnique as jest.Mock).mockResolvedValue(mockOption);
    (prisma.option.update as jest.Mock).mockResolvedValue(mockUpdatedOption);
    (getPusherServer as jest.Mock).mockReturnValue(mockPusher);
    (getPollChannelName as jest.Mock).mockReturnValue(`poll-${mockPollId}`);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: newText }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
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

    const request = new NextRequest(
      `http://localhost:3000/api/polls/${mockPollId}/admin/options/${mockOptionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ controlToken: mockControlToken, text: 'New text' }),
      }
    );

    // Act
    const response = await PATCH(request, {
      params: Promise.resolve({ pollId: mockPollId, optionId: mockOptionId }),
    });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.error.message).toBe('Failed to update option');

    consoleErrorSpy.mockRestore();
  });
});
