/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { DELETE } from './route';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    poll: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe('DELETE /api/polls/[pollId]/admin', () => {
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

  it('should delete a poll with valid control token', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.poll.delete as jest.Mock).mockResolvedValue(mockPoll);

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin', {
      method: 'DELETE',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await DELETE(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(prisma.poll.findUnique).toHaveBeenCalledWith({
      where: { id: mockPollId },
    });
    expect(prisma.poll.delete).toHaveBeenCalledWith({
      where: { id: mockPollId },
    });
  });

  it('should return 401 when control token is missing', async () => {
    // Arrange
    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });

    // Act
    const response = await DELETE(request, { params: Promise.resolve({ pollId: mockPollId }) });
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

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin', {
      method: 'DELETE',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await DELETE(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error.code).toBe('POLL_NOT_FOUND');
    expect(data.error.message).toBe('Poll not found');
    expect(prisma.poll.delete).not.toHaveBeenCalled();
  });

  it('should return 401 when control token is invalid', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin', {
      method: 'DELETE',
      body: JSON.stringify({ controlToken: 'invalid-token' }),
    });

    // Act
    const response = await DELETE(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error.code).toBe('INVALID_TOKEN');
    expect(data.error.message).toBe('Invalid control token');
    expect(prisma.poll.delete).not.toHaveBeenCalled();
  });

  it('should cascade delete options, votes, and suggestions', async () => {
    // Arrange
    // Note: Cascade deletion is handled by Prisma schema (onDelete: Cascade)
    // This test verifies that the delete operation is called correctly
    (prisma.poll.findUnique as jest.Mock).mockResolvedValue(mockPoll);
    (prisma.poll.delete as jest.Mock).mockResolvedValue(mockPoll);

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin', {
      method: 'DELETE',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await DELETE(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    // Verify that delete was called - cascade is handled by Prisma schema
    expect(prisma.poll.delete).toHaveBeenCalledWith({
      where: { id: mockPollId },
    });
  });

  it('should return 500 when database operation fails', async () => {
    // Arrange
    (prisma.poll.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = new NextRequest('http://localhost:3000/api/polls/test-poll-id/admin', {
      method: 'DELETE',
      body: JSON.stringify({ controlToken: mockControlToken }),
    });

    // Act
    const response = await DELETE(request, { params: Promise.resolve({ pollId: mockPollId }) });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.error.message).toBe('Failed to delete poll');

    consoleErrorSpy.mockRestore();
  });
});
