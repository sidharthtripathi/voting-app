import { generateControlToken, parseOptions, calculateExpirationTime, formatTimeRemaining, calculateBarWidth } from '../utils';
import * as fc from 'fast-check';

jest.mock('../prisma', () => ({
  prisma: {
    poll: {
      findUnique: jest.fn(),
    },
  },
}));

describe('generateControlToken', () => {
  describe('Unit Tests', () => {
    it('should generate a 64-character hex string', () => {
      const token = generateControlToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique tokens on successive calls', () => {
      const token1 = generateControlToken();
      const token2 = generateControlToken();
      const token3 = generateControlToken();

      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(token1).not.toBe(token3);
    });

    it('should only contain valid hexadecimal characters', () => {
      const token = generateControlToken();
      const hexRegex = /^[0-9a-f]+$/;
      expect(hexRegex.test(token)).toBe(true);
    });
  });

  describe('Property-Based Tests', () => {
    // Feature: settle-it-voting-app, Property 3: Poll ID Uniqueness
    // (Control tokens must also be unique, similar requirement)
    it('should generate unique tokens across multiple invocations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          (count) => {
            const tokens = new Set<string>();
            for (let i = 0; i < count; i++) {
              tokens.add(generateControlToken());
            }
            // All tokens should be unique
            return tokens.size === count;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: settle-it-voting-app, Property 4: Control Token Generation and Storage
    // (Validates token format consistency)
    it('should always generate tokens with correct format (64 hex chars)', () => {
      fc.assert(
        fc.property(
          fc.constant(null), // No input needed, just run multiple times
          () => {
            const token = generateControlToken();
            return (
              token.length === 64 &&
              /^[0-9a-f]{64}$/.test(token)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate tokens with high entropy (no obvious patterns)', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const token = generateControlToken();
            // Check that not all characters are the same
            const uniqueChars = new Set(token.split(''));
            // A 64-char hex string should have multiple unique characters
            return uniqueChars.size > 10;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
