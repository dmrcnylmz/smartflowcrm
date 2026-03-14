/**
 * Locale Switching Endpoint
 *
 * POST /api/locale
 * Body: { locale: "en" | "de" | "fr" | "tr" }
 *
 * Sets the NEXT_LOCALE cookie so next-intl picks up the new locale.
 * Called by the LanguageSwitcher UI component.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidLocale } from '@/lib/i18n/config';

export async function POST(request: NextRequest) {
    try {
        const { locale } = await request.json();

        if (!locale || !isValidLocale(locale)) {
            return NextResponse.json(
                { error: 'Invalid locale', supported: ['tr', 'en', 'de', 'fr'] },
                { status: 400 },
            );
        }

        const response = NextResponse.json({ locale, success: true });
        response.cookies.set('NEXT_LOCALE', locale, {
            path: '/',
            maxAge: 365 * 24 * 60 * 60, // 1 year
            sameSite: 'lax',
        });
        return response;
    } catch {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
}
