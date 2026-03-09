/**
 * Ambient type declarations for Firebase Client SDK v11
 *
 * Firebase v11 ESM entry points lack physical .d.ts files at their
 * declared paths. These ambient declarations provide the used exports
 * so TypeScript can compile without TS7016/TS2305 errors.
 *
 * NOTE: Runtime behavior is correct — this only fixes compile-time resolution.
 * Update this file when new Firebase client imports are added to the codebase.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── firebase/app ────────────────────────────────────────────────────────────

declare module 'firebase/app' {
    export interface FirebaseApp {
        name: string;
        options: Record<string, any>;
        automaticDataCollectionEnabled: boolean;
    }
    export function initializeApp(config: Record<string, any>, name?: string): FirebaseApp;
    export function getApps(): FirebaseApp[];
    export function getApp(name?: string): FirebaseApp;
}

// ─── firebase/auth ───────────────────────────────────────────────────────────

declare module 'firebase/auth' {
    import type { FirebaseApp } from 'firebase/app';

    export interface User {
        uid: string;
        email: string | null;
        displayName: string | null;
        photoURL: string | null;
        emailVerified: boolean;
        phoneNumber: string | null;
        getIdToken(forceRefresh?: boolean): Promise<string>;
        getIdTokenResult(forceRefresh?: boolean): Promise<any>;
    }

    export interface UserCredential {
        user: User;
        providerId: string | null;
        operationType: string;
    }

    export interface Auth {
        currentUser: User | null;
        app: FirebaseApp;
    }

    export class GoogleAuthProvider {
        static PROVIDER_ID: string;
        addScope(scope: string): this;
        setCustomParameters(params: Record<string, string>): this;
    }

    export function getAuth(app?: FirebaseApp): Auth;
    export function onAuthStateChanged(auth: Auth, callback: (user: User | null) => void): () => void;
    export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
    export function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
    export function signOut(auth: Auth): Promise<void>;
    export function sendPasswordResetEmail(auth: Auth, email: string): Promise<void>;
    export function updateProfile(user: User, profile: { displayName?: string; photoURL?: string }): Promise<void>;
    export function signInWithPopup(auth: Auth, provider: GoogleAuthProvider): Promise<UserCredential>;
    export function signInWithRedirect(auth: Auth, provider: GoogleAuthProvider): Promise<never>;
    export function getRedirectResult(auth: Auth): Promise<UserCredential | null>;
}

// ─── firebase/firestore ──────────────────────────────────────────────────────

declare module 'firebase/firestore' {
    import type { FirebaseApp } from 'firebase/app';

    export class Timestamp {
        seconds: number;
        nanoseconds: number;
        constructor(seconds: number, nanoseconds: number);
        toDate(): Date;
        toMillis(): number;
        static now(): Timestamp;
        static fromDate(date: Date): Timestamp;
        static fromMillis(milliseconds: number): Timestamp;
    }

    export interface DocumentData {
        [field: string]: any;
    }

    export interface DocumentSnapshot<T = DocumentData> {
        id: string;
        ref: DocumentReference<T>;
        exists(): boolean;
        data(): T | undefined;
        get(fieldPath: string): any;
    }

    export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
        data(): T;
    }

    export interface QuerySnapshot<T = DocumentData> {
        docs: QueryDocumentSnapshot<T>[];
        size: number;
        empty: boolean;
        forEach(callback: (doc: QueryDocumentSnapshot<T>) => void): void;
    }

    export interface DocumentReference<T = DocumentData> {
        id: string;
        path: string;
        parent: CollectionReference<T>;
    }

    export interface CollectionReference<T = DocumentData> extends Query<T> {
        id: string;
        path: string;
        parent: DocumentReference | null;
    }

    export interface Query<T = DocumentData> {
        type: string;
    }

    export type QueryConstraint = any;

    export interface Firestore {
        app: FirebaseApp;
        type: string;
    }

    export function getFirestore(app?: FirebaseApp): Firestore;
    export function collection(firestore: Firestore, path: string, ...pathSegments: string[]): CollectionReference;
    export function doc(firestore: Firestore, path: string, ...pathSegments: string[]): DocumentReference;
    export function doc(reference: CollectionReference, path?: string): DocumentReference;
    export function addDoc(reference: CollectionReference, data: DocumentData): Promise<DocumentReference>;
    export function getDocs(query: Query): Promise<QuerySnapshot>;
    export function getDoc(reference: DocumentReference): Promise<DocumentSnapshot>;
    export function deleteDoc(reference: DocumentReference): Promise<void>;
    export function updateDoc(reference: DocumentReference, data: Partial<DocumentData>): Promise<void>;
    export function query(query: Query, ...queryConstraints: QueryConstraint[]): Query;
    export function where(fieldPath: string, opStr: string, value: any): QueryConstraint;
    export function orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): QueryConstraint;
    export function limit(limit: number): QueryConstraint;
    export function documentId(): any;
    export function onSnapshot<T>(query: Query<T>, observer: {
        next?: (snapshot: QuerySnapshot<T>) => void;
        error?: (error: Error) => void;
        complete?: () => void;
    }): () => void;
    export function onSnapshot<T>(
        query: Query<T>,
        onNext: (snapshot: QuerySnapshot<T>) => void,
        onError?: (error: Error) => void,
    ): () => void;
}
