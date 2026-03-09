"use client";

import { useState, useEffect, useRef } from "react";
import fpPromise from "@fingerprintjs/fingerprintjs";
import { parseOptions } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Share2, FileText, Settings, Loader2, PlusCircle } from "lucide-react";

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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              Link Created
            </h1>
            <p className="text-muted-foreground">Share this poll with your friends</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Poll Details</CardTitle>
              <CardDescription>Your poll is ready to be shared.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Poll URL</Label>
                <div className="bg-muted rounded-md p-3 break-all text-sm font-mono text-muted-foreground">
                  {window.location.origin}/p/{createdPoll.pollId}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button onClick={handleShare} className="w-full flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                Share Link
              </Button>

              <a
                href={`/p/${createdPoll.pollId}`}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                <FileText className="w-4 h-4" />
                View Poll
              </a>

              <a
                href={`/admin/${createdPoll.pollId}`}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Settings className="w-4 h-4" />
                Admin Panel
              </a>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight mb-4">
            What are we settling?
          </h1>
          <p className="text-muted-foreground text-lg">
            Decide between options fast with a shareable link. No accounts.
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Use ":" to name it. Use "or", commas, /, | to separate options. Add
            "closes in 2h" to auto-close.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-6">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g., Dinner: Pizza or Thai? closes in 2h"
                className="w-full text-lg resize-none min-h-[120px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreatePoll();
                  }
                }}
              />
            </div>

            {parsedResult && (
              <div className="mb-6 p-4 bg-muted rounded-xl">
                <h3 className="text-sm font-semibold mb-3">
                  {parsedResult.options.length}{" "}
                  {parsedResult.options.length === 1 ? "option" : "options"}
                  {parsedResult.expiresIn &&
                    ` - closes in ${parsedResult.expiresIn}`}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {parsedResult.options.map((option, index) => (
                    <Badge variant="secondary" key={index} className="text-sm py-1 px-3">
                      {option}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleCreatePoll}
              disabled={!parsedResult || creating}
              className="w-full h-12 text-md font-semibold"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusCircle className="mr-2 h-5 w-5" />
                  Create Poll
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
