/**
 * Responsive Layout Tests
 *
 * Structural tests that verify page files contain the necessary
 * responsive CSS classes for mobile-friendly layouts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readPage(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

describe('Responsive Layout', () => {
  describe('Dashboard (app/page.tsx)', () => {
    const content = readPage('app/page.tsx');

    it('has responsive stats grid classes', () => {
      expect(content).toMatch(/grid\s+grid-cols-2/);
      expect(content).toMatch(/xl:grid-cols-/);
    });

    it('has responsive chart grid', () => {
      expect(content).toMatch(/grid\s+grid-cols-1\s+xl:grid-cols-/);
    });

    it('uses responsive padding', () => {
      expect(content).toMatch(/p-3\s+sm:p-4\s+md:p-8/);
    });
  });

  describe('Calls page (app/calls/page.tsx)', () => {
    const content = readPage('app/calls/page.tsx');

    it('has overflow-x-auto on table container', () => {
      expect(content).toContain('overflow-x-auto');
    });

    it('has responsive stats grid (2-col mobile)', () => {
      expect(content).toMatch(/grid\s+grid-cols-2/);
    });

    it('hides non-essential columns on mobile', () => {
      expect(content).toContain('hidden lg:table-cell');
      expect(content).toContain('hidden md:table-cell');
    });

    it('has flex-wrap on button groups', () => {
      expect(content).toContain('flex flex-wrap');
    });

    it('has responsive modal with max-height', () => {
      expect(content).toMatch(/max-h-\[.*vh\]/);
    });
  });

  describe('Customers page (app/customers/page.tsx)', () => {
    const content = readPage('app/customers/page.tsx');

    it('has overflow-x-auto on table container', () => {
      expect(content).toContain('overflow-x-auto');
    });

    it('has responsive stats grid (2-col mobile)', () => {
      expect(content).toMatch(/grid\s+grid-cols-2/);
    });

    it('customer detail panel uses full-width on mobile', () => {
      expect(content).toContain('w-full md:w-1/3');
    });

    it('has max-height on detail dialog', () => {
      expect(content).toMatch(/max-h-\[90vh\]/);
    });
  });

  describe('Campaigns page (app/campaigns/page.tsx)', () => {
    const content = readPage('app/campaigns/page.tsx');

    it('has responsive compliance grid (2-col mobile, 4-col desktop)', () => {
      expect(content).toMatch(/grid\s+grid-cols-2\s+md:grid-cols-4/);
    });

    it('has overflow-x-auto on contact table', () => {
      expect(content).toContain('overflow-x-auto');
    });

    it('new campaign modal has max-height for mobile', () => {
      expect(content).toMatch(/max-h-\[90vh\]\s+overflow-y-auto/);
    });
  });

  describe('Billing page (app/billing/page.tsx)', () => {
    const content = readPage('app/billing/page.tsx');

    it('has responsive plan grid (1-col mobile, 3-col desktop)', () => {
      expect(content).toMatch(/grid\s+grid-cols-1\s+md:grid-cols-3/);
    });

    it('currency selector buttons wrap properly', () => {
      expect(content).toContain('flex flex-wrap');
    });

    it('has responsive usage stat cards', () => {
      expect(content).toMatch(/grid\s+grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-4/);
    });
  });

  describe('Pricing page (app/pricing/page.tsx)', () => {
    const content = readPage('app/pricing/page.tsx');

    it('has responsive plan grid (1-col mobile, 3-col desktop)', () => {
      expect(content).toMatch(/grid\s+grid-cols-1\s+md:grid-cols-3/);
    });

    it('currency selector wraps on mobile', () => {
      expect(content).toContain('flex flex-wrap');
    });
  });

  describe('Sidebar (components/layout/Sidebar.tsx)', () => {
    const content = readPage('components/layout/Sidebar.tsx');

    it('has mobile hamburger menu button', () => {
      expect(content).toContain('lg:hidden');
      expect(content).toMatch(/Menu/);
    });

    it('has mobile overlay backdrop', () => {
      expect(content).toContain('bg-black/50');
      expect(content).toContain('backdrop-blur');
    });

    it('has mobile drawer with translate transition', () => {
      expect(content).toContain('translate-x-0');
      expect(content).toContain('-translate-x-full');
    });

    it('has aria attributes for mobile menu', () => {
      expect(content).toContain('aria-expanded');
      expect(content).toContain('aria-modal');
      expect(content).toContain('aria-label');
    });

    it('desktop sidebar is hidden on mobile', () => {
      expect(content).toContain('hidden lg:flex');
    });
  });

  describe('k6 load test configuration', () => {
    it('k6 load test file exists and has correct configuration', () => {
      const content = readPage('k6/load-test.js');
      expect(content).toContain("import http from 'k6/http'");
      expect(content).toContain('http_req_duration');
      expect(content).toContain('http_req_failed');
      expect(content).toContain('stages');
      expect(content).toContain('localhost:3009');
      expect(content).toContain('/pricing');
      expect(content).toContain('/api/health');
    });
  });
});
