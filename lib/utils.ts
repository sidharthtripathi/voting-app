import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Shadcn utility — required by all shadcn components
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { randomBytes } from "crypto";

/**
 * Parse natural language option input into an array of option strings
 * Also extracts expiration duration if present (e.g., "closes in 2h")
 */
export function parseOptions(input: string): {
  options: string[];
  expiresIn?: string;
} {
  // Extract expiration from the input string
  const expiresInMatch = input.match(
    /closes?\s+in\s+((\d+)\s*(h(?:ours?)?|m(?:in(?:utes?)?)?|d(?:ays?)?))/i
  );
  const expiresIn = expiresInMatch ? expiresInMatch[1] : undefined;

  // Remove the expiration portion from the input before parsing options
  let cleanInput = input;
  if (expiresInMatch) {
    cleanInput = input.replace(expiresInMatch[0], "").trim();
  }

  // Remove poll title (everything before ":")
  const colonIndex = cleanInput.indexOf(":");
  if (colonIndex !== -1) {
    cleanInput = cleanInput.slice(colonIndex + 1).trim();
  }

  // Split by common separators: "or", comma, slash, pipe
  const rawOptions = cleanInput
    .split(/\s+or\s+|,\s*|\/|\|/i)
    .map((opt) => opt.trim())
    .filter((opt) => opt.length > 0);

  return { options: rawOptions, expiresIn };
}

/**
 * Generate a cryptographically secure random control token
 */
export function generateControlToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Calculate the expiration Date from a human-readable duration like "2h", "30m", "1d"
 * Returns null if the format is invalid
 */
export function calculateExpirationTime(expiresIn: string): Date | null {
  const match = expiresIn.match(
    /^(\d+)\s*(h(?:ours?)?|m(?:in(?:utes?)?)?|d(?:ays?)?)$/i
  );
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2][0].toLowerCase();

  const now = new Date();
  switch (unit) {
    case "h":
      now.setHours(now.getHours() + amount);
      break;
    case "m":
      now.setMinutes(now.getMinutes() + amount);
      break;
    case "d":
      now.setDate(now.getDate() + amount);
      break;
    default:
      return null;
  }

  return now;
}

/**
 * Format time remaining until a given date in a human-readable string
 */
export function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return "Expired";
  }

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `Closes in ${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `Closes in ${hours}h ${minutes % 60}m`;
  } else {
    return `Closes in ${minutes}m`;
  }
}

/**
 * Calculate the bar width percentage for displaying vote counts
 */
export function calculateBarWidth(
  voteCount: number,
  maxVoteCount: number
): number {
  if (maxVoteCount === 0) return 0;
  return (voteCount / maxVoteCount) * 100;
}
