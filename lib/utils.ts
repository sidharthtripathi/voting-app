import { randomBytes } from 'crypto';


/**
 * Parse natural language option input into an array of option strings
 * Splits on " or " and commas, extracts expiration time patterns
 */
export function parseOptions(input: string): {
  options: string[];
  expiresIn?: string;
} {
  let text = input;
  let expiresIn: string | undefined;

  // Extract expiration time pattern (e.g., "closes in 2h" or "closes in 30m")
  const expirationMatch = text.match(/closes in (\d+)(h|m)/i);
  if (expirationMatch) {
    expiresIn = expirationMatch[1] + expirationMatch[2];
    // Remove the expiration pattern from the text
    text = text.replace(/closes in \d+(h|m)/gi, '').trim();
  }

  // Split on " or " first, then on commas
  let options = text
    .split(/ or /i)
    .flatMap((part) => part.split(','))
    .map((opt) => opt.trim())
    .filter((opt) => opt.length > 0);

  // Remove duplicates while preserving order
  options = [...new Set(options)];

  return { options, expiresIn };
}

/**
 * Generate a cryptographically secure control token
 */
export function generateControlToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calculate expiration timestamp from duration string (e.g., "2h", "30m")
 */
export function calculateExpirationTime(expiresIn: string): Date | null {
  const match = expiresIn.match(/^(\d+)(h|m)$/i);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = new Date();
  if (unit === 'h') {
    now.setHours(now.getHours() + value);
  } else if (unit === 'm') {
    now.setMinutes(now.getMinutes() + value);
  }

  return now;
}

/**
 * Format time remaining until expiration
 */
export function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

/**
 * Calculate bar chart width percentage based on vote count
 */
export function calculateBarWidth(
  voteCount: number,
  maxVoteCount: number
): number {
  if (maxVoteCount === 0) return 0;
  return (voteCount / maxVoteCount) * 100;
}


