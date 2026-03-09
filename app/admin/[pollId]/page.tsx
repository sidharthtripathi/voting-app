"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { getPusherClient, getPollChannelName, PUSHER_EVENTS } from "@/lib/pusher";
import { formatTimeRemaining } from "@/lib/utils";
import type { Poll, Option, Suggestion, VoteUpdateEvent } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    ExternalLink,
    Pencil,
    Check,
    X,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
} from "lucide-react";

interface PollDataResponse {
    poll: Poll;
    options: Option[];
    suggestions: Suggestion[];
    hasVoted: boolean;
}

export default function AdminPage({ params }: { params: Promise<{ pollId: string }> }) {
    const { pollId } = use(params);
    const router = useRouter();

    const [controlToken, setControlToken] = useState<string | null>(null);
    const [poll, setPoll] = useState<Poll | null>(null);
    const [options, setOptions] = useState<Option[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [editingOption, setEditingOption] = useState<string | null>(null);
    const [editOptionText, setEditOptionText] = useState("");

    useEffect(() => {
        const storedTokens = JSON.parse(localStorage.getItem("settle_admin_tokens") || "{}");
        const token = storedTokens[pollId];

        if (!token) {
            setError("You are not the creator of this poll, or your session has expired.");
            setLoading(false);
            return;
        }

        setControlToken(token);

        const fetchPollData = async () => {
            try {
                const response = await fetch(`/api/polls/${pollId}`);
                if (response.ok) {
                    const data: PollDataResponse = await response.json();
                    setPoll(data.poll);
                    setOptions(data.options);
                    setSuggestions(data.suggestions);
                } else {
                    setError("Failed to load poll data. Poll may have been deleted.");
                }
            } catch (err) {
                console.error(err);
                setError("Error loading poll data");
            } finally {
                setLoading(false);
            }
        };

        fetchPollData();
    }, [pollId]);

    useEffect(() => {
        if (!poll) return;

        const channelName = getPollChannelName(pollId);
        const pusher = getPusherClient();
        const channel = pusher.subscribe(channelName);

        channel.bind(PUSHER_EVENTS.VOTE_UPDATE, (data: VoteUpdateEvent) => {
            setOptions((prev) =>
                prev.map((opt) => (opt.id === data.optionId ? { ...opt, voteCount: data.count } : opt))
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
        channel.bind(PUSHER_EVENTS.SUGGESTION_APPROVED, (data: { newOption: Option }) => {
            setOptions((prev) => [...prev, data.newOption]);
        });
        channel.bind(PUSHER_EVENTS.SUGGESTION_REJECTED, (data: { suggestionId: string }) => {
            setSuggestions((prev) => prev.filter((s) => s.id !== data.suggestionId));
        });
        channel.bind(PUSHER_EVENTS.OPTION_EDITED, (data: { optionId: string; text: string }) => {
            setOptions((prev) =>
                prev.map((opt) => (opt.id === data.optionId ? { ...opt, text: data.text } : opt))
            );
        });

        return () => pusher.unsubscribe(channelName);
    }, [poll, pollId]);

    const handleAdminAction = async (ActionType: "CLOSE" | "REOPEN" | "DELETE") => {
        if (!controlToken) return;

        if (ActionType === "DELETE") {
            if (!confirm("Are you sure you want to completely delete this poll? This cannot be undone.")) return;
        }

        const endpoint =
            ActionType === "DELETE"
                ? `/api/polls/${pollId}/admin`
                : `/api/polls/${pollId}/admin/${ActionType.toLowerCase()}`;
        const method = ActionType === "DELETE" ? "DELETE" : "POST";

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ controlToken }),
            });

            if (response.ok) {
                if (ActionType === "DELETE") {
                    router.push("/");
                }
            } else {
                alert(`Failed to ${ActionType.toLowerCase()} poll`);
            }
        } catch (e) {
            console.error(e);
            alert("Network error");
        }
    };

    const startEditOption = (opt: Option) => {
        setEditingOption(opt.id);
        setEditOptionText(opt.text);
    };

    const saveEditedOption = async (optionId: string) => {
        if (!controlToken || editOptionText.trim() === "") return;

        try {
            const response = await fetch(`/api/polls/${pollId}/admin/options/${optionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ controlToken, text: editOptionText.trim() }),
            });

            if (response.ok) {
                setOptions((prev) =>
                    prev.map((o) => (o.id === optionId ? { ...o, text: editOptionText.trim() } : o))
                );
            } else {
                alert("Failed to edit option");
            }
        } catch (e) {
            console.error(e);
            alert("Network error");
        } finally {
            setEditingOption(null);
            setEditOptionText("");
        }
    };

    const handleToggleSuggestions = async (enabled: boolean) => {
        if (!controlToken) return;
        try {
            const response = await fetch(`/api/polls/${pollId}/admin`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ controlToken, suggestionsEnabled: enabled }),
            });
            if (response.ok) {
                setPoll((prev) => prev && { ...prev, suggestionsEnabled: enabled });
            } else {
                alert("Failed to update suggestions setting");
            }
        } catch (e) {
            console.error(e);
            alert("Network error");
        }
    };

    const handleSuggestionAction = async (suggestionId: string, action: "approve" | "reject") => {
        if (!controlToken) return;

        try {
            const response = await fetch(
                `/api/polls/${pollId}/admin/suggestions/${suggestionId}/${action}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ controlToken }),
                }
            );

            if (response.ok) {
                setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
                if (action === "approve") {
                    const newOption = await response.json();
                    setOptions((prev) => [...prev, newOption]);
                }
            } else {
                alert(`Failed to ${action} suggestion`);
            }
        } catch (e) {
            console.error(e);
            alert("Network error");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !controlToken || !poll) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <AlertTriangle className="w-16 h-16 text-destructive mb-6" />
                <h1 className="text-2xl font-bold mb-4">{error || "Poll not found"}</h1>
                <a href="/" className="text-sm text-primary underline underline-offset-4 hover:opacity-80 font-medium">
                    Return to Home
                </a>
            </div>
        );
    }

    const totalVotes = options.reduce((sum, option) => sum + option.voteCount, 0);
    const maxVotes = Math.max(...options.map((option) => option.voteCount), 0);

    return (
        <div className="min-h-screen bg-background py-12 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                            Admin: {poll.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <Badge variant={poll.closed ? "destructive" : "secondary"}>
                                {poll.closed ? "Closed" : "Open"}
                            </Badge>
                            <span>{totalVotes} votes total</span>
                            {poll.expiresAt && (
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatTimeRemaining(new Date(poll.expiresAt))}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3 shrink-0">
                        <Button
                            variant="outline"
                            onClick={() => handleAdminAction(poll.closed ? "REOPEN" : "CLOSE")}
                        >
                            {poll.closed ? "Reopen Poll" : "Close Poll"}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => handleAdminAction("DELETE")}
                        >
                            Delete
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Options Column */}
                    <div className="md:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Manage Options</span>
                                    <Badge variant="outline">{options.length} total</Badge>
                                </CardTitle>
                                <CardDescription>Edit option text or track vote counts in real-time.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {options.map((option) => {
                                    const isEditing = editingOption === option.id;
                                    const percentage = maxVotes > 0 ? (option.voteCount / maxVotes) * 100 : 0;

                                    return (
                                        <div key={option.id} className="rounded-xl border p-4 bg-card">
                                            {isEditing ? (
                                                <div className="flex gap-2">
                                                    <Input
                                                        type="text"
                                                        value={editOptionText}
                                                        onChange={(e) => setEditOptionText(e.target.value)}
                                                        autoFocus
                                                        onKeyDown={(e) =>
                                                            e.key === "Enter" && saveEditedOption(option.id)
                                                        }
                                                    />
                                                    <Button size="sm" onClick={() => saveEditedOption(option.id)}>
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setEditingOption(null)}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="font-medium">{option.text}</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm text-muted-foreground">
                                                                {option.voteCount} votes
                                                            </span>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7"
                                                                onClick={() => startEditOption(option)}
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <Progress value={percentage} className="h-1.5" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Suggestions</span>
                                    {suggestions.length > 0 && (
                                        <Badge>{suggestions.length}</Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    Allow voters to suggest new options for this poll.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                                    <Label htmlFor="suggestions-toggle" className="text-sm font-medium cursor-pointer">
                                        {poll.suggestionsEnabled ? "Suggestions enabled" : "Suggestions disabled"}
                                    </Label>
                                    <Switch
                                        id="suggestions-toggle"
                                        checked={poll.suggestionsEnabled}
                                        onCheckedChange={handleToggleSuggestions}
                                    />
                                </div>

                                {suggestions.length === 0 ? (
                                    <div className="text-center py-6 text-muted-foreground">
                                        <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                        <p className="text-sm">No pending suggestions</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {suggestions.map((suggestion) => (
                                            <div
                                                key={suggestion.id}
                                                className="rounded-lg border p-3 bg-muted/50"
                                            >
                                                <p className="text-sm mb-3">{suggestion.text}</p>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        className="flex-1"
                                                        onClick={() => handleSuggestionAction(suggestion.id, "approve")}
                                                    >
                                                        <Check className="w-3.5 h-3.5 mr-1" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        className="flex-1"
                                                        onClick={() => handleSuggestionAction(suggestion.id, "reject")}
                                                    >
                                                        <X className="w-3.5 h-3.5 mr-1" />
                                                        Reject
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardFooter className="pt-6">
                                <a
                                    href={`/p/${poll.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn(buttonVariants({ variant: "outline" }), "w-full gap-2")}
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    View Live Poll
                                </a>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
