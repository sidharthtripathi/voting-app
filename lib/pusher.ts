import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance
let pusherServer: Pusher | null = null;

export function getPusherServer(): Pusher {
  if (!pusherServer) {
    pusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return pusherServer;
}

// Client-side Pusher instance
let pusherClient: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (typeof window === 'undefined') {
    throw new Error('getPusherClient can only be called in browser context');
  }

  if (!pusherClient) {
    pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return pusherClient;
}

/**
 * Get the channel name for a specific poll
 */
export function getPollChannelName(pollId: string): string {
  return `poll-${pollId}`;
}

/**
 * Pusher event names
 */
export const PUSHER_EVENTS = {
  VOTE_UPDATE: 'vote-update',
  POLL_CLOSED: 'poll-closed',
  POLL_REOPENED: 'poll-reopened',
  OPTION_EDITED: 'option-edited',
  SUGGESTION_CREATED: 'suggestion-created',
  SUGGESTION_APPROVED: 'suggestion-approved',
  SUGGESTION_REJECTED: 'suggestion-rejected',
} as const;
