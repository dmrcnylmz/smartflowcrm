import '@testing-library/jest-dom/vitest';

// Mock Firebase
vi.mock('@/lib/firebase/config', () => ({
    db: {},
    auth: {
        currentUser: null,
        onAuthStateChanged: vi.fn(),
    },
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    onSnapshot: vi.fn(),
    Timestamp: (() => {
        class MockTimestamp {
            seconds: number;
            nanoseconds: number;
            constructor(seconds: number, nanoseconds: number) {
                this.seconds = seconds;
                this.nanoseconds = nanoseconds;
            }
            toDate() {
                return new Date(this.seconds * 1000);
            }
            static fromDate(date: Date) {
                return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
            }
            static now() {
                return MockTimestamp.fromDate(new Date());
            }
        }
        return MockTimestamp;
    })(),
    serverTimestamp: vi.fn(() => ({
        toDate: () => new Date(),
    })),
}));

// Mock firebase/auth
vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
    GoogleAuthProvider: vi.fn(),
}));
