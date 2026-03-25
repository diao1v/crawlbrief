import { describe, it, expect } from 'vitest';
import { monitors, getMonitorById, getEnabledMonitors } from '../../../src/monitors.config.js';

describe('Monitors Config', () => {
  describe('monitors array', () => {
    it('should have at least one monitor configured', () => {
      expect(monitors.length).toBeGreaterThan(0);
    });

    it('should have valid monitor structure', () => {
      for (const monitor of monitors) {
        expect(monitor).toHaveProperty('id');
        expect(monitor).toHaveProperty('name');
        expect(monitor).toHaveProperty('listingUrl');
        expect(monitor).toHaveProperty('schedule');
        expect(monitor).toHaveProperty('enabled');

        expect(typeof monitor.id).toBe('string');
        expect(typeof monitor.name).toBe('string');
        expect(typeof monitor.listingUrl).toBe('string');
        expect(typeof monitor.schedule).toBe('string');
        expect(typeof monitor.enabled).toBe('boolean');
      }
    });

    it('should have valid URLs for listing pages', () => {
      for (const monitor of monitors) {
        expect(() => new URL(monitor.listingUrl)).not.toThrow();
      }
    });

    it('should have unique IDs', () => {
      const ids = monitors.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getMonitorById', () => {
    it('should return monitor when ID exists', () => {
      const monitor = monitors[0];
      const result = getMonitorById(monitor.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(monitor.id);
      expect(result?.name).toBe(monitor.name);
    });

    it('should return undefined for non-existent ID', () => {
      const result = getMonitorById('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('getEnabledMonitors', () => {
    it('should return only enabled monitors', () => {
      const enabledMonitors = getEnabledMonitors();

      for (const monitor of enabledMonitors) {
        expect(monitor.enabled).toBe(true);
      }
    });

    it('should return array', () => {
      const result = getEnabledMonitors();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
