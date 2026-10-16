import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeVehiclePositions } from '../src/pb';
import { filterPositions } from '../src/filter';

const vp = new Uint8Array(readFileSync(new URL('./fixture/vehicle_positions.pb', import.meta.url)));

describe('positions', () => {
  it('decodes free-line vehicles with coordinates in Říčany', () => {
    const r = filterPositions(decodeVehiclePositions(vp));
    expect(r.generatedAt).toBeGreaterThan(1.7e9);
    expect(r.vehicles.length).toBeGreaterThan(0);
    for (const v of r.vehicles) {
      expect(v.routeId).toMatch(/^L173[1-7]$/);
      expect(v.lat).toBeGreaterThan(49.9); expect(v.lat).toBeLessThan(50.1);
      expect(v.lon).toBeGreaterThan(14.5); expect(v.lon).toBeLessThan(14.8);
      expect(v.tripId).toMatch(/^173[1-7]_/);
      expect(v.startDate).toMatch(/^\d{8}$/);
      expect(v.ts).toBeGreaterThan(1.7e9);
    }
  });
});
