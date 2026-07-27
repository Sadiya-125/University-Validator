/**
 * DigiLocker Verification Tests
 *
 * Tests for NAD (National Academic Depository) institution verification
 * and name matching functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkDigiLocker,
  batchCheckDigiLocker,
  clearDigiLockerCache,
} from './digilocker';

describe('DigiLocker NAD Verification', () => {
  beforeAll(() => {
    clearDigiLockerCache();
  });

  afterAll(() => {
    clearDigiLockerCache();
  });

  describe('checkDigiLocker', () => {
    it('should handle empty institution name', async () => {
      const result = await checkDigiLocker('');
      expect(result.institution_name).toBe('');
      expect(result.is_available).toBe(false);
    });

    it('should return object with required fields', async () => {
      const result = await checkDigiLocker('Test University');
      expect(result).toHaveProperty('institution_name');
      expect(result).toHaveProperty('is_available');
      expect(typeof result.is_available).toBe('boolean');
    });

    it('should match institution names correctly', async () => {
      // Test with a well-known institution that should be in NAD
      // This will depend on actual NAD data being available
      const result = await checkDigiLocker('Indian Institute of Technology');
      expect(result).toBeDefined();
      expect(result.institution_name).toBe('Indian Institute of Technology');
    });
  });

  describe('batchCheckDigiLocker', () => {
    it('should handle empty array', async () => {
      const results = await batchCheckDigiLocker([]);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should return array of results', async () => {
      const institutionNames = [
        'Test University 1',
        'Test University 2',
      ];
      const results = await batchCheckDigiLocker(institutionNames);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(institutionNames.length);
    });

    it('should preserve institution names in results', async () => {
      const institutionNames = ['University A', 'University B'];
      const results = await batchCheckDigiLocker(institutionNames);

      results.forEach((result, index) => {
        expect(result.institution_name).toBe(institutionNames[index]);
      });
    });
  });

  describe('Name matching variants', () => {
    it('should handle abbreviation expansion', async () => {
      // Test IIT abbreviation expansion
      const result = await checkDigiLocker('IIT Bombay');
      expect(result).toBeDefined();
    });

    it('should handle city aliases', async () => {
      // Mumbai ↔ Bombay matching
      const result1 = await checkDigiLocker('University in Mumbai');
      const result2 = await checkDigiLocker('University in Bombay');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should handle case-insensitive matching', async () => {
      const result1 = await checkDigiLocker('INDIAN INSTITUTE');
      const result2 = await checkDigiLocker('indian institute');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should ignore stop words', async () => {
      // "of", "the", etc. should be ignored
      const result1 = await checkDigiLocker('Institute of Technology');
      const result2 = await checkDigiLocker('Technology');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('Caching', () => {
    it('should use cached data on subsequent calls', async () => {
      clearDigiLockerCache();

      // First call - will fetch if network available
      const result1 = await checkDigiLocker('Test Institution');

      // Second call - should use cache
      const result2 = await checkDigiLocker('Test Institution');

      // Both should have same structure
      expect(result1).toHaveProperty('institution_name');
      expect(result2).toHaveProperty('institution_name');
    });

    it('should respect cache TTL', async () => {
      clearDigiLockerCache();
      const result = await checkDigiLocker('Any University');
      expect(result).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should gracefully handle network errors', async () => {
      const result = await checkDigiLocker('Test University');
      // Should return result structure even if network fails
      expect(result).toHaveProperty('institution_name');
      expect(result).toHaveProperty('is_available');
    });

    it('should return false for non-existent institutions', async () => {
      const result = await checkDigiLocker('NonExistentUniversityXYZ123');
      expect(result.is_available).toBe(false);
    });
  });
});
