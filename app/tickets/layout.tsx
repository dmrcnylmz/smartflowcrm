import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Talepler',
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
