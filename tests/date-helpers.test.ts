import { describe, it, expect } from 'vitest';
import { toDate } from '@/lib/utils/date-helpers';
import { Timestamp } from 'firebase/firestore';

describe('Date Helpers', () => {
    describe('toDate', () => {
        it('should convert a Firestore Timestamp to Date', () => {
            const now = new Date('2026-02-10T00:00:00Z');
            const timestamp = Timestamp.fromDate(now);
            const result = toDate(timestamp);
            expect(result).toBeInstanceOf(Date);
            expect(result.getTime()).toBe(now.getTime());
        });

        it('should return a Date object unchanged', () => {
            const now = new Date('2026-02-10T00:00:00Z');
            const result = toDate(now);
            expect(result).toBeInstanceOf(Date);
            expect(result.getTime()).toBe(now.getTime());
        });

        it('should handle string dates', () => {
            const result = toDate('2026-02-10T00:00:00Z' as unknown as Timestamp);
            expect(result).toBeInstanceOf(Date);
        });

        it('should handle undefined/null gracefully', () => {
            const result = toDate(undefined as unknown as Timestamp);
            expect(result).toBeInstanceOf(Date);
        });
    });
});
