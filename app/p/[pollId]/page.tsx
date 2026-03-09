"use client";

import { useState, useEffect, use } from "react";
import fpPromise from "@fingerprintjs/fingerprintjs";
import { getPusherClient, getPollChannelName, PUSHER_EVENTS } from "@/lib/pusher";
import { formatTimeRemaining } from "@/lib/utils";
import type { Poll, Option, Suggestion, VoteUpdateEvent } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Share2, Clock, CheckCircle2, Loader2, Plus, Info } from "lucide-react";

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
  const [suggestionText, setSuggestionText] = useState("");
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Initialize FingerprintJS
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await fpPromise.load();
        const result = await fp.get();
        setAnonymousId(result.visitorId);
      } catch (error) {
        console.error("Failed to load FingerprintJS:", error);
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
          setNotFound(true);
        }
      } catch (error) {
        console.error("Error fetching poll data:", error);
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

    channel.bind(PUSHER_EVENTS.POLL_DELETED, () => {
      setNotFound(true);
      setPoll(null);
      pusher.unsubscribe(channelName);
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

    channel.bind(PUSHER_EVENTS.SUGGESTION_APPROVED, (data: { newOption: Option }) => {
      setOptions((prev) => [...prev, data.newOption]);
    });

    return () => {
      pusher.unsubscribe(channelName);
    };
  }, [poll, pollId]);

  const handleVote = async (optionId: string) => {
    if (!anonymousId || voting || hasVoted || poll?.closed) return;

    setVoting(true);
    try {
      const response = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        console.error("Failed to vote:", await response.json());
      }
    } catch (error) {
      console.error("Error voting:", error);
    } finally {
      setVoting(false);
    }
  };

  const handleSuggestion = async () => {
    if (!suggestionText.trim() || !anonymousId || submittingSuggestion) return;

    setSubmittingSuggestion(true);
    try {
      const response = await fetch(`/api/polls/${pollId}/suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: suggestionText.trim(),
          anonymousId,
        }),
      });

      if (response.ok) {
        setSuggestionText("");
      } else {
        console.error("Failed to submit suggestion:", await response.json());
      }
    } catch (error) {
      console.error("Error submitting suggestion:", error);
    } finally {
      setSubmittingSuggestion(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/p/${pollId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: poll?.title || "Settle It Poll",
          text: "Vote on this poll",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard");
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <h1 className="text-2xl font-bold mb-2">Poll not found</h1>
        <p className="text-muted-foreground mb-6">This poll may have been deleted or does not exist.</p>
        <a href="/" className={buttonVariants({ variant: "default" })}>Go Home</a>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalVotes = options.reduce((sum, option) => sum + option.voteCount, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">{poll.title}</h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            {poll.closed ? (
              <span className="flex items-center gap-1 text-destructive">
                <Info className="w-4 h-4" />
                Poll Closed
              </span>
            ) : poll.expiresAt ? (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTimeRemaining(new Date(poll.expiresAt))}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-primary">
                <CheckCircle2 className="w-4 h-4" />
                Open
              </span>
            )}
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Options</CardTitle>
            <CardDescription>{totalVotes} votes total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {options.map((option) => {
              const percentage = totalVotes > 0 ? ((option.voteCount / totalVotes) * 100) : 0;

              return (
                <div
                  key={option.id}
                  className="rounded-xl border p-4 bg-card text-card-foreground shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-medium">{option.text}</span>
                    <span className="text-muted-foreground text-sm font-medium">{option.voteCount} votes</span>
                  </div>

                  {hasVoted ? (
                    <div className="space-y-1">
                      <Progress value={percentage} className="h-2" />
                      <div className="text-right text-xs text-muted-foreground">
                        {Math.round(percentage)}%
                      </div>
                    </div>
                  ) : !poll.closed ? (
                    <Button
                      variant="outline"
                      onClick={() => handleVote(option.id)}
                      disabled={voting}
                      className="w-full mt-2"
                    >
                      {voting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Vote"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
          <CardFooter className="flex-col gap-4">
            {poll.suggestionsEnabled && !poll.closed && (
              <div className="w-full bg-muted/50 p-4 rounded-xl border border-border">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Suggest an option
                </h3>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={suggestionText}
                    onChange={(e) => setSuggestionText(e.target.value)}
                    placeholder="Your suggestion..."
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSuggestion();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSuggestion}
                    disabled={!suggestionText.trim() || submittingSuggestion}
                    variant="secondary"
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            <div className="w-full pt-2">
              <Button
                variant="default"
                onClick={handleShare}
                className="w-full flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share Poll
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
