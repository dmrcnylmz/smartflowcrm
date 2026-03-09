import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';

// Mock auth context — must be before importing hooks that use it
const mockGetIdToken = vi.fn().mockResolvedValue('mock-token');
const mockUser = { getIdToken: mockGetIdToken };

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

import { useAuth } from '@/lib/firebase/auth-context';
import { useDebounce, useDebouncedCallback } from '@/lib/hooks/useDebounce';
import { useFirestoreQuery } from '@/lib/hooks/useFirestoreQuery';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';

// ─── useDebounce ────────────────────────────────────────────────────────────

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } },
    );

    // Change the value
    rerender({ value: 'world', delay: 300 });

    // Before delay: still old value
    expect(result.current).toBe('hello');

    // Advance timers past the delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('world');
  });

  it('does not update before delay completes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    rerender({ value: 'updated', delay: 500 });

    // Advance only part of the delay
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe('initial');

    // Now advance past the remainder
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe('updated');
  });
});

// ─── useDebouncedCallback ───────────────────────────────────────────────────

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls callback after delay', () => {
    const callback = vi.fn();

    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('arg1');
    });

    // Not called yet
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('arg1');
  });

  it('only calls latest callback when timer is reset', () => {
    const callback = vi.fn();

    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    // Call multiple times in quick succession
    act(() => {
      result.current('first');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      result.current('second');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      result.current('third');
    });

    // Advance past the delay from the last call
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should only have been called once, with the last argument
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third');
  });
});

// ─── useFirestoreQuery ──────────────────────────────────────────────────────

describe('useFirestoreQuery', () => {
  const mockOnSnapshot = vi.mocked(onSnapshot);

  beforeEach(() => {
    mockOnSnapshot.mockReset();
    // Default: onSnapshot returns an unsubscribe function
    mockOnSnapshot.mockReturnValue(vi.fn());
  });

  it('returns loading true initially', () => {
    const fakeQuery = {} as any;

    const { result } = renderHook(() => useFirestoreQuery(fakeQuery));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns data after snapshot', async () => {
    const fakeQuery = {} as any;

    const { result } = renderHook(() => useFirestoreQuery(fakeQuery));

    // Grab the success callback passed to onSnapshot
    const [, successCallback] = mockOnSnapshot.mock.calls[0] as any[];

    // Simulate a snapshot arriving
    const fakeSnapshot = {
      docs: [
        { id: 'doc1', data: () => ({ name: 'Alice' }) },
        { id: 'doc2', data: () => ({ name: 'Bob' }) },
      ],
    };

    act(() => {
      successCallback(fakeSnapshot);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      { id: 'doc1', name: 'Alice' },
      { id: 'doc2', name: 'Bob' },
    ]);
  });

  it('sets error on snapshot error', () => {
    const fakeQuery = {} as any;

    const { result } = renderHook(() => useFirestoreQuery(fakeQuery));

    // Grab the error callback (third argument to onSnapshot)
    const [, , errorCallback] = mockOnSnapshot.mock.calls[0] as any[];

    const fakeError = new Error('Permission denied');

    act(() => {
      errorCallback(fakeError);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(fakeError);
    expect(result.current.data).toEqual([]);
  });

  it('returns loading false when query is null', () => {
    const { result } = renderHook(() => useFirestoreQuery(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
    // onSnapshot should not have been called
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

// ─── useAuthFetch ───────────────────────────────────────────────────────────

describe('useAuthFetch', () => {
  const mockFetch = vi.fn();
  const mockedUseAuth = vi.mocked(useAuth);

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(new Response('ok'));
    mockGetIdToken.mockResolvedValue('mock-token');
    mockedUseAuth.mockReturnValue({ user: mockUser } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
    mockGetIdToken.mockReset();
  });

  it('attaches Bearer token to requests', async () => {
    const { result } = renderHook(() => useAuthFetch());

    await act(async () => {
      await result.current('/api/data');
    });

    expect(mockGetIdToken).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/data');

    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer mock-token');
  });

  it('throws when token fetch fails', async () => {
    mockGetIdToken.mockRejectedValue(new Error('Token expired'));

    const { result } = renderHook(() => useAuthFetch());

    await expect(
      act(async () => {
        await result.current('/api/data');
      }),
    ).rejects.toThrow('Kimlik doğrulama başarısız. Lütfen tekrar giriş yapın.');

    // fetch should NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('works without user (no token added)', async () => {
    // Simulate no authenticated user
    mockedUseAuth.mockReturnValue({ user: null } as any);

    const { result } = renderHook(() => useAuthFetch());

    await act(async () => {
      await result.current('/api/public');
    });

    expect(mockGetIdToken).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/public');

    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });
});
