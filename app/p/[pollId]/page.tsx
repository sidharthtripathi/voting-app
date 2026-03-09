'use client';

import { useState, useEffect, use } from 'react';
import fpPromise from '@fingerprintjs/fingerprintjs';
import { getPusherClient, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import { formatTimeRemaining, calculateBarWidth } from '@/lib/utils';
import type { Poll, Option, Suggestion, VoteUpdateEvent } from '@/types';

interface PollDataResponse {
  poll: Poll;
  options: Option[];
  suggestions: Suggestion[];
  hasVoted: boolean;
}

interface VoteResponse {
  success: boolean;
  updatedCounts: { optionId: string; count: number }[];
}

export default function PollPage({ params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = use(params);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [suggestionText, setSuggestionText] = useState('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);

  // Initialize FingerprintJS
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await fpPromise.load();
        const result = await fp.get();
        setAnonymousId(result.visitorId);
      } catch (error) {
        console.error('Failed to load FingerprintJS:', error);
      }
    };

    initFingerprint();
  }, []);

  // Fetch poll data
  useEffect(() => {
    const fetchPollData = async () => {
      try {
        const response = await fetch(`/api/polls/${pollId}`);
        if (response.ok) {
          const data: PollDataResponse = await response.json();
          setPoll(data.poll);
          setOptions(data.options);
          setSuggestions(data.suggestions);
          setHasVoted(data.hasVoted);
        } else {
          console.error('Failed to fetch poll data:', await response.json());
        }
      } catch (error) {
        console.error('Error fetching poll data:', error);
      }
    };

    fetchPollData();
  }, [pollId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!poll) return;

    const channelName = getPollChannelName(pollId);
    const pusher = getPusherClient();
    const channel = pusher.subscribe(channelName);

    channel.bind(PUSHER_EVENTS.VOTE_UPDATE, (data: VoteUpdateEvent) => {
      setOptions((prevOptions) =>
        prevOptions.map((option) =>
          option.id === data.optionId
            ? { ...option, voteCount: data.count }
            : option
        )
      );
    });

    channel.bind(PUSHER_EVENTS.POLL_CLOSED, () => {
      setPoll((prev) => prev && { ...prev, closed: true });
    });

    channel.bind(PUSHER_EVENTS.POLL_REOPENED, () => {
      setPoll((prev) => prev && { ...prev, closed: false });
    });

    channel.bind(PUSHER_EVENTS.SUGGESTION_CREATED, (data: { suggestion: Suggestion }) => {
      setSuggestions((prev) => [...prev, data.suggestion]);
    });

    channel.bind(PUSHER_EVENTS.OPTION_EDITED, (data: { optionId: string; text: string }) => {
      setOptions((prev) =>
        prev.map((option) =>
          option.id === data.optionId ? { ...option, text: data.text } : option
        )
      );
    });

    return () => {
      pusher.unsubscribe(channelName);
    };
  }, [poll]);

  const handleVote = async (optionId: string) => {
    if (!anonymousId || voting || hasVoted || poll?.closed) return;

    setVoting(true);
    try {
      const response = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          optionId,
          anonymousId,
        }),
      });

      if (response.ok) {
        const data: VoteResponse = await response.json();
        data.updatedCounts.forEach(({ optionId: id, count }) => {
          setOptions((prev) =>
            prev.map((option) => (option.id === id ? { ...option, voteCount: count } : option))
          );
        });
        setHasVoted(true);
      } else {
        console.error('Failed to vote:', await response.json());
      }
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setVoting(false);
    }
  };

  const handleSuggestion = async () => {
    if (!suggestionText.trim() || !anonymousId || submittingSuggestion) return;

    setSubmittingSuggestion(true);
    try {
      const response = await fetch(`/api/polls/${pollId}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: suggestionText.trim(),
          anonymousId,
        }),
      });

      if (response.ok) {
        setSuggestionText('');
      } else {
        console.error('Failed to submit suggestion:', await response.json());
      }
    } catch (error) {
      console.error('Error submitting suggestion:', error);
    } finally {
      setSubmittingSuggestion(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/p/${pollId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: poll?.title || 'Settle It Poll',
          text: 'Vote on this poll',
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (!poll) {
    return (
      <div className="min-h-screen bg-black text-zinc-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 text-yellow-500 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const totalVotes = options.reduce((sum, option) => sum + option.voteCount, 0);
  const maxVotes = Math.max(...options.map((option) => option.voteCount), 0);

  return (
    <div className="min-h-screen bg-black text-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-zinc-50">{poll.title}</h1>
          {poll.expiresAt && (
            <p className="text-zinc-400 text-sm">
              {formatTimeRemaining(new Date(poll.expiresAt))}
            </p>
          )}
        </div>

        <div className="bg-zinc-900 rounded-2xl p-6 shadow-xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4 text-zinc-50">Options</h2>
            <div className="space-y-4">
              {options.map((option) => {
                const barWidth = calculateBarWidth(option.voteCount, maxVotes);
                const percentage = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;

                return (
                  <div
                    key={option.id}
                    className="bg-black rounded-xl p-4 border border-zinc-800 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-medium text-zinc-50">{option.text}</span>
                      <span className="text-zinc-400 text-sm">{option.voteCount} votes</span>
                    </div>

                    {hasVoted && (
                      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        ></div>
                      </div>
                    )}

                    {!hasVoted && !poll.closed && (
                      <button
                        onClick={() => handleVote(option.id)}
                        disabled={voting}
                        className="mt-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Vote
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {poll.suggestionsEnabled && !poll.closed && (
            <div className="mb-6 p-4 bg-zinc-800 rounded-xl">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">
                Suggest an option
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={suggestionText}
                  onChange={(e) => setSuggestionText(e.target.value)}
                  placeholder="Your suggestion..."
                  className="flex-1 bg-black border border-zinc-700 rounded-lg p-2 text-sm text-zinc-50 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSuggestion();
                    }
                  }}
                />
                <button
                  onClick={handleSuggestion}
                  disabled={!suggestionText.trim() || submittingSuggestion}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-50 py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-zinc-800 pt-6">
            <div className="space-y-3">
              <button
                onClick={handleShare}
                className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                  />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
