"use client";

import { useState, useEffect } from "react";
import { parseOptions } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, FileText, Settings, Loader2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  const [input, setInput] = useState("");
  const [parsedResult, setParsedResult] = useState<{
    options: string[];
    expiresIn?: string;
  } | null>(null);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdPoll, setCreatedPoll] = useState<{
    pollId: string;
    controlToken: string;
    adminUrl: string;
  } | null>(null);
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
          suggestionsEnabled,
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
      <div className="flex flex-col items-center justify-center p-6 py-12">
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
                className={cn(buttonVariants({ variant: "secondary" }), "w-full gap-2")}
              >
                <FileText className="w-4 h-4" />
                View Poll
              </a>

              <a
                href={`/admin/${createdPoll.pollId}`}
                className={cn(buttonVariants({ variant: "outline" }), "w-full gap-2")}
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
    <div className="flex flex-col items-center justify-center p-6 py-12">
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

            <div className="flex items-center justify-between mb-4 rounded-lg border p-3 bg-muted/30">
              <Label htmlFor="suggestions-switch" className="text-sm font-medium cursor-pointer">
                Allow voters to suggest options
              </Label>
              <Switch
                id="suggestions-switch"
                checked={suggestionsEnabled}
                onCheckedChange={setSuggestionsEnabled}
              />
            </div>

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
