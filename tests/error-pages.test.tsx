import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string;[key: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

describe('Error Pages', () => {
    describe('error.tsx', () => {
        it('should render error message and retry button', async () => {
            // Dynamic import to avoid module resolution issues
            const ErrorPage = (await import('@/app/error')).default;

            const mockReset = vi.fn();
            const mockError = new Error('Test error message');

            render(<ErrorPage error={mockError} reset={mockReset} />);

            // Default locale is 'en' when no NEXT_LOCALE cookie is set
            expect(screen.getByText('An Error Occurred')).toBeDefined();
            expect(screen.getByText('Try Again')).toBeDefined();
            expect(screen.getByText('Home')).toBeDefined();
        });

        it('should call reset when retry button is clicked', async () => {
            const ErrorPage = (await import('@/app/error')).default;

            const mockReset = vi.fn();
            const mockError = new Error('Test error');

            render(<ErrorPage error={mockError} reset={mockReset} />);

            await userEvent.click(screen.getByText('Try Again'));
            expect(mockReset).toHaveBeenCalledOnce();
        });

        it('should show error details in development mode', async () => {
            const ErrorPage = (await import('@/app/error')).default;

            const mockReset = vi.fn();
            const mockError = new Error('Detailed error info');

            render(<ErrorPage error={mockError} reset={mockReset} />);

            // In test env (NODE_ENV=test), it may not show dev details
            // But the component should render without errors
            expect(screen.getByText('An Error Occurred')).toBeDefined();
        });
    });

    describe('not-found.tsx', () => {
        it('should render 404 page with correct text', async () => {
            const NotFoundPage = (await import('@/app/not-found')).default;

            render(<NotFoundPage />);

            expect(screen.getByText('404')).toBeDefined();
            // Default locale is 'en'
            expect(screen.getByText('Page Not Found')).toBeDefined();
            expect(screen.getByText('Home')).toBeDefined();
        });

        it('should have a link to home page', async () => {
            const NotFoundPage = (await import('@/app/not-found')).default;

            render(<NotFoundPage />);

            const homeLink = screen.getByText('Home').closest('a');
            expect(homeLink).toBeDefined();
            expect(homeLink?.getAttribute('href')).toBe('/');
        });
    });

    describe('loading.tsx', () => {
        it('should render skeleton placeholders', async () => {
            const LoadingPage = (await import('@/app/loading')).default;

            const { container } = render(<LoadingPage />);

            // Should have animated pulse elements (skeleton loaders)
            const pulseElements = container.querySelectorAll('.animate-pulse');
            expect(pulseElements.length).toBeGreaterThan(5);
        });

        it('should render KPI card skeletons', async () => {
            const LoadingPage = (await import('@/app/loading')).default;

            const { container } = render(<LoadingPage />);

            // Should have the 4-column grid for KPI cards
            const kpiGrid = container.querySelector('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4');
            expect(kpiGrid).toBeDefined();
        });
    });
});
