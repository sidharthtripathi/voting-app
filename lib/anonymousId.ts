import FingerprintJS from '@fingerprintjs/fingerprintjs';

const ANONYMOUS_ID_KEY = 'settle_anonymous_id';

/**
 * Generate or retrieve anonymous identifier for vote deduplication
 * Uses local storage with browser fingerprinting as fallback
 */
export async function generateAnonymousId(): Promise<string> {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('generateAnonymousId can only be called in browser context');
  }

  // Try to get existing ID from local storage
  try {
    const existingId = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existingId) {
      return existingId;
    }
  } catch (error) {
    console.warn('Local storage not available:', error);
  }

  // Generate new ID using browser fingerprinting
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const anonymousId = result.visitorId;

    // Try to store in local storage
    try {
      localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId);
    } catch (error) {
      console.warn('Could not store anonymous ID in local storage:', error);
    }

    return anonymousId;
  } catch (error) {
    console.error('Failed to generate fingerprint:', error);
    // Fallback to random ID if fingerprinting fails
    const fallbackId = `fallback_${Math.random().toString(36).substring(2, 15)}`;
    try {
      localStorage.setItem(ANONYMOUS_ID_KEY, fallbackId);
    } catch (e) {
      console.warn('Could not store fallback ID:', e);
    }
    return fallbackId;
  }
}

/**
 * Get the current anonymous ID without generating a new one
 */
export function getAnonymousId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(ANONYMOUS_ID_KEY);
  } catch (error) {
    console.warn('Could not retrieve anonymous ID:', error);
    return null;
  }
}
