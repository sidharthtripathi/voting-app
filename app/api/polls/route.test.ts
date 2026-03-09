/**
 * @jest-environment node
 */
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    poll: {
      create: jest.fn(),
    },
    option: {
      createMany: jest.fn(),
    },
  },
}));

describe('POST /api/polls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a poll with valid input', async () => {
    const mockPoll = {
      id: 'test-poll-id',
      title: 'Test Poll',
      controlToken: 'test-token',
      suggestionsEnabled: false,
      expiresAt: null,
      createdAt: new Date(),
      closed: false,
      description: null,
    };

    // Mock the transaction
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback({
        poll: {
          create: jest.fn().mockResolvedValue(mockPoll),
        },
        option: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      });
    });

    const request = new NextRequest('http://localhost:3000/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Poll',
        options: 'Option 1 or Option 2',
        suggestionsEnabled: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toHaveProperty('pollId');
    expect(data).toHaveProperty('controlToken');
    expect(data).toHaveProperty('adminUrl');
    expect(data.adminUrl).toBe(`/admin/${data.pollId}`);
  });

  it('should reject empty title', async () => {
    const request = new NextRequest('http://localhost:3000/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        title: '',
        options: 'Option 1 or Option 2',
        suggestionsEnabled: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INVALID_TITLE');
    expect(data.error.message).toBe('Poll title cannot be empty');
  });

  it('should reject insufficient options', async () => {
    const request = new NextRequest('http://localhost:3000/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Poll',
        options: 'Only one option',
        suggestionsEnabled: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INSUFFICIENT_OPTIONS');
    expect(data.error.message).toBe('Poll must have at least 2 options');
  });

  it('should handle expiration time', async () => {
    const mockPoll = {
      id: 'test-poll-id',
      title: 'Test Poll',
      controlToken: 'test-token',
      suggestionsEnabled: false,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      createdAt: new Date(),
      closed: false,
      description: null,
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback({
        poll: {
          create: jest.fn().mockResolvedValue(mockPoll),
        },
        option: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      });
    });

    const request = new NextRequest('http://localhost:3000/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Poll',
        options: 'Option 1 or Option 2',
        suggestionsEnabled: false,
        expiresIn: '2h',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toHaveProperty('pollId');
  });

  it('should reject invalid expiration format', async () => {
    const request = new NextRequest('http://localhost:3000/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Poll',
        options: 'Option 1 or Option 2',
        suggestionsEnabled: false,
        expiresIn: 'invalid',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('INVALID_EXPIRATION');
  });

  it('should parse comma-separated options', async () => {
    const mockPoll = {
      id: 'test-poll-id',
      title: 'Test Poll',
      controlToken: 'test-token',
      suggestionsEnabled: false,
      expiresAt: null,
      createdAt: new Date(),
      closed: false,
      description: null,
    };

    let capturedOptions: string[] = [];

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback({
        poll: {
          create: jest.fn().mockResolvedValue(mockPoll),
        },
        option: {
          createMany: jest.fn().mockImplementation((data) => {
            capturedOptions = data.data.map((opt: { text: string }) => opt.text);
            return Promise.resolve({ count: capturedOptions.length });
          }),
        },
      });
    });

    const request = new NextRequest('http://localhost:3000/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Poll',
        options: 'Pizza, Burgers, Tacos',
        suggestionsEnabled: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(capturedOptions).toEqual(['Pizza', 'Burgers', 'Tacos']);
  });
});
