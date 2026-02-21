'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { auth } from './config';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    signIn: (email: string, password: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signUp: (email: string, password: string, displayName?: string) => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        try {
            setError(null);
            setLoading(true);
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const signInWithGoogle = async () => {
        try {
            setError(null);
            setLoading(true);
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const signUp = async (email: string, password: string, displayName?: string) => {
        try {
            setError(null);
            setLoading(true);
            const { user } = await createUserWithEmailAndPassword(auth, email, password);
            if (displayName) {
                await updateProfile(user, { displayName });
            }
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        try {
            setError(null);
            await firebaseSignOut(auth);
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    };

    const resetPassword = async (email: string) => {
        try {
            setError(null);
            await sendPasswordResetEmail(auth, email);
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    };

    const clearError = () => setError(null);

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                error,
                signIn,
                signInWithGoogle,
                signUp,
                signOut,
                resetPassword,
                clearError,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Firebase error code to Turkish message mapping
function getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code: string }).code;
        const messages: Record<string, string> = {
            'auth/user-not-found': 'Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı.',
            'auth/wrong-password': 'Şifre hatalı.',
            'auth/email-already-in-use': 'Bu e-posta adresi zaten kullanılıyor.',
            'auth/weak-password': 'Şifre en az 6 karakter olmalıdır.',
            'auth/invalid-email': 'Geçersiz e-posta adresi.',
            'auth/too-many-requests': 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.',
            'auth/network-request-failed': 'Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edin.',
            'auth/invalid-credential': 'E-posta veya şifre hatalı.',
        };
        return messages[code] || 'Bir hata oluştu. Lütfen tekrar deneyin.';
    }
    return 'Bir hata oluştu. Lütfen tekrar deneyin.';
}
