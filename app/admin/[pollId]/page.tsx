'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getPusherClient, getPollChannelName, PUSHER_EVENTS } from '@/lib/pusher';
import { formatTimeRemaining, calculateBarWidth } from '@/lib/utils';
import type { Poll, Option, Suggestion, VoteUpdateEvent } from '@/types';

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
    const [error, setError] = useState('');

    // Editing state
    const [editingOption, setEditingOption] = useState<string | null>(null);
    const [editOptionText, setEditOptionText] = useState('');

    useEffect(() => {
        // Get control token from localeStorage
        const storedTokens = JSON.parse(localStorage.getItem('settle_admin_tokens') || '{}');
        const token = storedTokens[pollId];

        if (!token) {
            setError('You are not the creator of this poll, or your session has expired.');
            setLoading(false);
            return;
        }

        setControlToken(token);

        // Fetch initial poll data (public data doesn't require token)
        const fetchPollData = async () => {
            try {
                const response = await fetch(`/api/polls/${pollId}`);
                if (response.ok) {
                    const data: PollDataResponse = await response.json();
                    setPoll(data.poll);
                    setOptions(data.options);
                    setSuggestions(data.suggestions);
                } else {
                    setError('Failed to load poll data. Poll may have been deleted.');
                }
            } catch (err) {
                console.error(err);
                setError('Error loading poll data');
            } finally {
                setLoading(false);
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
            // Remove it from suggestions implicitly by filtering later, or explicitly here
        });
        channel.bind(PUSHER_EVENTS.SUGGESTION_REJECTED, (data: { suggestionId: string }) => {
            setSuggestions((prev) => prev.filter(s => s.id !== data.suggestionId));
        });
        channel.bind(PUSHER_EVENTS.OPTION_EDITED, (data: { optionId: string; text: string }) => {
            setOptions((prev) =>
                prev.map((opt) => (opt.id === data.optionId ? { ...opt, text: data.text } : opt))
            );
        });

        return () => pusher.unsubscribe(channelName);
    }, [poll, pollId]);

    // Actually remove approved suggestions from state when the new option arrives
    // Or handle it immediately after API resolution
    const handleAdminAction = async (ActionType: 'CLOSE' | 'REOPEN' | 'DELETE') => {
        if (!controlToken) return;

        // Safety confirm for deleting
        if (ActionType === 'DELETE') {
            if (!confirm('Are you sure you want to completely delete this poll? This cannot be undone.')) return;
        }

        const endpoint = ActionType === 'DELETE' ? `/api/polls/${pollId}/admin` : `/api/polls/${pollId}/admin/${ActionType.toLowerCase()}`;
        const method = ActionType === 'DELETE' ? 'DELETE' : 'POST';

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ controlToken }),
            });

            if (response.ok) {
                if (ActionType === 'DELETE') {
                    router.push('/');
                }
            } else {
                alert(`Failed to ${ActionType.toLowerCase()} poll`);
            }
        } catch (e) {
            console.error(e);
            alert('Network error');
        }
    };

    const startEditOption = (opt: Option) => {
        setEditingOption(opt.id);
        setEditOptionText(opt.text);
    };

    const saveEditedOption = async (optionId: string) => {
        if (!controlToken || editOptionText.trim() === '') return;

        try {
            const response = await fetch(`/api/polls/${pollId}/admin/options/${optionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ controlToken, text: editOptionText.trim() }),
            });

            if (response.ok) {
                setOptions(prev => prev.map(o => o.id === optionId ? { ...o, text: editOptionText.trim() } : o));
            } else {
                alert('Failed to edit option');
            }
        } catch (e) {
            console.error(e);
            alert('Network error');
        } finally {
            setEditingOption(null);
            setEditOptionText('');
        }
    };

    const handleSuggestionAction = async (suggestionId: string, action: 'approve' | 'reject') => {
        if (!controlToken) return;

        try {
            const response = await fetch(`/api/polls/${pollId}/admin/suggestions/${suggestionId}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ controlToken }),
            });

            if (response.ok) {
                // Optimistically remove suggestion
                setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
                if (action === 'approve') {
                    const newOption = await response.json();
                    setOptions(prev => [...prev, newOption]);
                }
            } else {
                alert(`Failed to ${action} suggestion`);
            }
        } catch (e) {
            console.error(e);
            alert('Network error');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin h-8 w-8 text-yellow-500 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (error || !controlToken || !poll) {
        return (
            <div className="min-h-screen bg-black text-zinc-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-6">
                    <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold mb-4">{error || 'Poll not found'}</h1>
                <a href="/" className="text-yellow-500 hover:text-yellow-400 font-semibold underline underline-offset-4">
                    Return to Home
                </a>
            </div>
        );
    }

    const totalVotes = options.reduce((sum, option) => sum + option.voteCount, 0);
    const maxVotes = Math.max(...options.map((option) => option.voteCount), 0);

    return (
        <div className="min-h-screen bg-black text-zinc-50 py-12 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-8 border-b border-zinc-900 border-opacity-50 border-r-0 border-l-0 border-t-0 bg-black/40">
                    <div className="mb-4 md:mb-0">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent mb-2">
                            Admin: {poll.title}
                        </h1>
                        <div className="flex space-x-4 text-sm text-zinc-400">
                            <span className={`px-2 py-0.5 rounded-full ${poll.closed ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                                {poll.closed ? 'Closed' : 'Open'}
                            </span>
                            <span>Total Votes: {totalVotes}</span>
                            {poll.expiresAt && <span>{formatTimeRemaining(new Date(poll.expiresAt))}</span>}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleAdminAction(poll.closed ? 'REOPEN' : 'CLOSE')}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-50 px-4 py-2 rounded-xl text-sm font-semibold transition"
                        >
                            {poll.closed ? 'Reopen Poll' : 'Close Poll'}
                        </button>
                        <button
                            onClick={() => handleAdminAction('DELETE')}
                            className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50 px-4 py-2 rounded-xl text-sm font-semibold transition"
                        >
                            Delete
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-zinc-900 rounded-3xl p-6 shadow-xl">
                            <h2 className="text-xl font-semibold mb-6 text-zinc-50 flex items-center justify-between">
                                <span>Manage Options</span>
                                <span className="text-sm font-normal text-zinc-400 bg-black px-3 py-1 rounded-full">{options.length} Total</span>
                            </h2>

                            <div className="space-y-4">
                                {options.map((option) => {
                                    const barWidth = calculateBarWidth(option.voteCount, maxVotes);
                                    const isEditing = editingOption === option.id;

                                    return (
                                        <div key={option.id} className="bg-black rounded-2xl p-5 border border-zinc-800">
                                            {isEditing ? (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={editOptionText}
                                                        onChange={(e) => setEditOptionText(e.target.value)}
                                                        className="flex-1 bg-zinc-900 border border-yellow-500 rounded-xl px-4 py-2 text-zinc-50 focus:outline-none"
                                                        autoFocus
                                                        onKeyDown={(e) => e.key === 'Enter' && saveEditedOption(option.id)}
                                                    />
                                                    <button onClick={() => saveEditedOption(option.id)} className="bg-yellow-500 text-black px-4 py-2 rounded-xl font-semibold">Save</button>
                                                    <button onClick={() => setEditingOption(null)} className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl font-semibold">Cancel</button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-lg font-medium text-zinc-50">{option.text}</span>
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-zinc-400 text-sm font-mono">{option.voteCount} votes</span>
                                                            <button onClick={() => startEditOption(option)} className="text-zinc-500 hover:text-yellow-500 transition-colors p-1">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
                                                        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full transition-all duration-1000" style={{ width: `${barWidth}%` }}></div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-1 space-y-6">
                        <div className="bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-800/50">
                            <h2 className="text-xl font-semibold mb-6 flex items-center justify-between">
                                <span>Suggestions</span>
                                {suggestions.length > 0 && (
                                    <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">{suggestions.length}</span>
                                )}
                            </h2>

                            {!poll.suggestionsEnabled ? (
                                <div className="text-center py-8 text-zinc-500">
                                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    <p>Suggestions are disabled for this poll.</p>
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="text-center py-8 text-zinc-500">
                                    <p>No pending suggestions.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {suggestions.map((suggestion) => (
                                        <div key={suggestion.id} className="bg-black p-4 rounded-2xl border border-zinc-800">
                                            <p className="text-zinc-200 mb-4">{suggestion.text}</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleSuggestionAction(suggestion.id, 'approve')}
                                                    className="flex-1 bg-green-500/10 text-green-500 hover:bg-green-500/20 py-2 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => handleSuggestionAction(suggestion.id, 'reject')}
                                                    className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 py-2 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-black rounded-3xl p-6 border border-zinc-800 text-center">
                            <a
                                href={`/p/${poll.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full bg-zinc-800 text-zinc-300 hover:text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                View Live Poll
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
