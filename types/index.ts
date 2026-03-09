// Core types for the Settle It voting app

export interface Poll {
  id: string;
  title: string;
  description: string | null;
  controlToken: string;
  createdAt: Date;
  expiresAt: Date | null;
  closed: boolean;
  suggestionsEnabled: boolean;
}

export interface Option {
  id: string;
  pollId: string;
  text: string;
  voteCount: number;
  createdAt: Date;
}

export interface Vote {
  id: string;
  pollId: string;
  optionId: string;
  anonymousId: string;
  createdAt: Date;
}

export interface Suggestion {
  id: string;
  pollId: string;
  text: string;
  createdAt: Date;
}

// API Request/Response types

export interface CreatePollRequest {
  title: string;
  options: string;
  suggestionsEnabled: boolean;
  expiresIn?: string;
}

export interface CreatePollResponse {
  pollId: string;
  controlToken: string;
  adminUrl: string;
}

export interface VoteRequest {
  optionId: string;
  anonymousId: string;
}

export interface VoteResponse {
  success: boolean;
  updatedCounts: { optionId: string; count: number }[];
}

export interface PollDataResponse {
  poll: Poll;
  options: Option[];
  suggestions: Suggestion[];
  hasVoted: boolean;
}

export interface AdminActionRequest {
  controlToken: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Pusher event types

export interface VoteUpdateEvent {
  optionId: string;
  count: number;
}

export interface PollClosedEvent {
  pollId: string;
  closedAt: string;
}

export interface PollReopenedEvent {
  pollId: string;
}

export interface OptionEditedEvent {
  optionId: string;
  text: string;
}

export interface SuggestionCreatedEvent {
  suggestion: Suggestion;
}

export interface SuggestionApprovedEvent {
  newOption: Option;
}

export interface SuggestionRejectedEvent {
  suggestionId: string;
}
