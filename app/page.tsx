"use client";

import { useState, useEffect, useRef } from "react";
import fpPromise from "@fingerprintjs/fingerprintjs";
import { parseOptions } from "@/lib/utils";

export default function Home() {
  const [input, setInput] = useState("");
  const [parsedResult, setParsedResult] = useState<{
    options: string[];
    expiresIn?: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdPoll, setCreatedPoll] = useState<{
    pollId: string;
    controlToken: string;
    adminUrl: string;
  } | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  // Initialize FingerprintJS
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await fpPromise.load();
        const result = await fp.get();
        setFingerprint(result.visitorId);
      } catch (error) {
        console.error("Failed to load FingerprintJS:", error);
      }
    };

    initFingerprint();
  }, []);

  // Parse input on change
  useEffect(() => {
    if (input.trim()) {
      const result = parseOptions(input);
      setParsedResult(result);
    } else {
      setParsedResult(null);
    }
  }, [input]);

  const handleCreatePoll = async () => {
    if (!parsedResult) return;

    setCreating(true);
    try {
      const response = await fetch("/api/polls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: input.split(":")[0]?.trim() || "Untitled Poll",
          options: input,
          suggestionsEnabled: false,
          expiresIn: parsedResult.expiresIn,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Save control token to localStorage
        const storedTokens = JSON.parse(
          localStorage.getItem("settle_admin_tokens") || "{}",
        );
        storedTokens[data.pollId] = data.controlToken;
        localStorage.setItem(
          "settle_admin_tokens",
          JSON.stringify(storedTokens),
        );

        setCreatedPoll(data);
        setInput("");
        setParsedResult(null);
      } else {
        console.error("Failed to create poll:", await response.json());
      }
    } catch (error) {
      console.error("Error creating poll:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleShare = async () => {
    if (!createdPoll) return;

    const shareUrl = `${window.location.origin}/p/${createdPoll.pollId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Settle It Poll",
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

  if (createdPoll) {
    return (
      <div className="min-h-screen bg-black text-zinc-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 text-zinc-50">
              Link Created
            </h1>
            <p className="text-zinc-400">Share this poll with your friends</p>
          </div>

          <div className="bg-zinc-900 rounded-2xl p-6 shadow-xl">
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Poll URL
              </label>
              <div className="bg-black rounded-lg p-3 break-all text-sm">
                {window.location.origin}/p/{createdPoll.pollId}
              </div>
            </div>

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

              <a
                href={`/p/${createdPoll.pollId}`}
                className="w-full bg-zinc-800 text-zinc-50 py-3 rounded-xl font-semibold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2 border border-zinc-700"
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
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                View Poll
              </a>

              <a
                href={`/admin/${createdPoll.pollId}`}
                className="w-full bg-transparent text-yellow-500 py-3 rounded-xl font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 border border-yellow-500/50"
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Admin Panel
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            What are we settling?
          </h1>
          <p className="text-zinc-400 text-lg">
            Decide between options fast with a shareable link. No accounts.
          </p>
          <p className="text-zinc-500 text-sm mt-2">
            Use ":" to name it. Use "or", commas, /, | to separate options. Add
            "closes in 2h" to auto-close.
          </p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-6 shadow-xl">
          <div className="mb-6">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., Dinner: Pizza or Thai? closes in 2h"
              className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-lg text-zinc-50 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none h-24"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCreatePoll();
                }
              }}
            />
          </div>

          {parsedResult && (
            <div className="mb-6 p-4 bg-zinc-800 rounded-xl">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">
                {parsedResult.options.length}{" "}
                {parsedResult.options.length === 1 ? "option" : "options"}
                {parsedResult.expiresIn &&
                  ` - closes in ${parsedResult.expiresIn}`}
              </h3>
              <div className="flex flex-wrap gap-2">
                {parsedResult.options.map((option, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-zinc-700 rounded-full text-sm text-zinc-300"
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleCreatePoll}
            disabled={!parsedResult || creating}
            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {creating ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-black"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating...
              </>
            ) : (
              <>
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
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Create Poll
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
