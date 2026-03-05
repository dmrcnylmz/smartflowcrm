import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock Firebase Auth — all values must be inline (no top-level variable refs due to hoisting)
let authStateCallback: ((user: unknown) => void) | null = null;

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: vi.fn((_auth: unknown, callback: (user: unknown) => void) => {
        // Store callback for later manual triggering
        authStateCallback = callback;
        setTimeout(() => callback(null), 0);
        return vi.fn();
    }),
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com', displayName: 'Test User' },
    }),
    createUserWithEmailAndPassword: vi.fn().mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com', displayName: 'Test User' },
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    getRedirectResult: vi.fn().mockResolvedValue(null),
    GoogleAuthProvider: vi.fn().mockImplementation(() => ({
        setCustomParameters: vi.fn(),
    })),
    signInWithPopup: vi.fn().mockResolvedValue({
        user: { uid: 'google-uid', email: 'google@example.com', displayName: 'Google User' },
    }),
    signInWithRedirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/firebase/config', () => ({
    auth: {},
}));

// Import after mocks
import { AuthProvider, useAuth } from '@/lib/firebase/auth-context';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
} from 'firebase/auth';

// Test component that consumes the auth hook
function AuthTestConsumer() {
    const { user, loading, error, signIn, signUp, signOut: logOut, resetPassword, clearError } = useAuth();

    return (
        <div>
            <span data-testid="loading">{loading ? 'true' : 'false'}</span>
            <span data-testid="user">{user ? user.email : 'null'}</span>
            <span data-testid="error">{error || 'null'}</span>
            <button onClick={() => signIn('test@example.com', 'password123').catch(() => { })}>Sign In</button>
            <button onClick={() => signUp('new@example.com', 'password123', 'New User').catch(() => { })}>Sign Up</button>
            <button onClick={() => logOut()}>Sign Out</button>
            <button onClick={() => resetPassword('test@example.com')}>Reset</button>
            <button onClick={() => clearError()}>Clear Error</button>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authStateCallback = null;
    });

    it('should throw when useAuth is used outside AuthProvider', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => {
            render(<AuthTestConsumer />);
        }).toThrow('useAuth must be used within an AuthProvider');
        consoleSpy.mockRestore();
    });

    it('should start with loading state and then resolve', async () => {
        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(screen.getByTestId('user')).toHaveTextContent('null');
    });

    it('should call signInWithEmailAndPassword on signIn', async () => {
        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        await userEvent.click(screen.getByText('Sign In'));
        expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'test@example.com', 'password123');
    });

    it('should call createUserWithEmailAndPassword on signUp', async () => {
        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        await userEvent.click(screen.getByText('Sign Up'));
        expect(createUserWithEmailAndPassword).toHaveBeenCalledWith({}, 'new@example.com', 'password123');
    });

    it('should call firebaseSignOut on signOut', async () => {
        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        await userEvent.click(screen.getByText('Sign Out'));
        expect(signOut).toHaveBeenCalled();
    });

    it('should call sendPasswordResetEmail on resetPassword', async () => {
        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        await userEvent.click(screen.getByText('Reset'));
        expect(sendPasswordResetEmail).toHaveBeenCalledWith({}, 'test@example.com');
    });

    it('should handle sign-in errors with Turkish messages', async () => {
        const error = { code: 'auth/wrong-password' };
        vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(error);

        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        await userEvent.click(screen.getByText('Sign In'));

        await waitFor(() => {
            expect(screen.getByTestId('error')).toHaveTextContent('Şifre hatalı.');
        });
    });

    it('should clear errors when clearError is called', async () => {
        const error = { code: 'auth/invalid-email' };
        vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(error);

        render(
            <AuthProvider>
                <AuthTestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        await userEvent.click(screen.getByText('Sign In'));
        await waitFor(() => {
            expect(screen.getByTestId('error')).not.toHaveTextContent('null');
        });

        await userEvent.click(screen.getByText('Clear Error'));
        expect(screen.getByTestId('error')).toHaveTextContent('null');
    });
});
