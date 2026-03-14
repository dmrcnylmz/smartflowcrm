/**
 * i18n Message Files — Parity & Structure Tests
 * Ensures all 4 language files have identical key structures.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const LOCALES = ['tr', 'en', 'de', 'fr'] as const;
const MESSAGES_DIR = path.resolve('messages');

function loadMessages(locale: string): Record<string, unknown> {
    const content = fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf-8');
    return JSON.parse(content);
}

function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            keys.push(...getKeys(value as Record<string, unknown>, fullKey));
        } else {
            keys.push(fullKey);
        }
    }
    return keys.sort();
}

describe('i18n Message Files', () => {
    const messages: Record<string, Record<string, unknown>> = {};
    const keys: Record<string, string[]> = {};

    for (const locale of LOCALES) {
        messages[locale] = loadMessages(locale);
        keys[locale] = getKeys(messages[locale]);
    }

    it('all locale files exist', () => {
        for (const locale of LOCALES) {
            expect(fs.existsSync(path.join(MESSAGES_DIR, `${locale}.json`))).toBe(true);
        }
    });

    it('all locale files are valid JSON', () => {
        for (const locale of LOCALES) {
            expect(() => JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf-8'))).not.toThrow();
        }
    });

    it('all locales have identical key structure', () => {
        const referenceKeys = keys['en'];

        for (const locale of LOCALES) {
            if (locale === 'en') continue;
            const missingInLocale = referenceKeys.filter(k => !keys[locale].includes(k));
            const extraInLocale = keys[locale].filter(k => !referenceKeys.includes(k));

            expect(missingInLocale, `Missing in ${locale}: ${missingInLocale.join(', ')}`).toHaveLength(0);
            expect(extraInLocale, `Extra in ${locale}: ${extraInLocale.join(', ')}`).toHaveLength(0);
        }
    });

    it('has required top-level namespaces', () => {
        const required = ['common', 'auth', 'nav', 'dashboard', 'customers', 'tickets', 'billing', 'agents', 'voice', 'knowledge', 'onboarding'];

        for (const locale of LOCALES) {
            for (const ns of required) {
                expect(messages[locale], `${locale} missing namespace: ${ns}`).toHaveProperty(ns);
            }
        }
    });

    it('nav namespace has all sidebar keys', () => {
        const navKeys = [
            'dashboard', 'customers', 'tickets', 'agents', 'knowledge', 'billing', 'settings',
            'mainMenu', 'operations', 'aiAnalysis', 'management', 'calls', 'appointments',
            'complaints', 'reports', 'system', 'systemAdmin', 'expandSidebar', 'collapseSidebar',
            'openMenu', 'mobileNav', 'user',
        ];

        for (const locale of LOCALES) {
            const nav = messages[locale].nav as Record<string, string>;
            for (const key of navKeys) {
                expect(nav, `${locale}.nav missing key: ${key}`).toHaveProperty(key);
            }
        }
    });

    it('knowledge namespace has file upload keys', () => {
        const knowledgeKeys = [
            'uploadFile', 'uploadFileHint', 'dropOrClick', 'maxSize', 'upload',
            'fileAdded', 'fileAddError', 'unsupportedFileType', 'fileTooLarge',
        ];

        for (const locale of LOCALES) {
            const knowledge = messages[locale].knowledge as Record<string, string>;
            for (const key of knowledgeKeys) {
                expect(knowledge, `${locale}.knowledge missing key: ${key}`).toHaveProperty(key);
            }
        }
    });

    it('onboarding namespace has step and sector keys', () => {
        for (const locale of LOCALES) {
            const onboarding = messages[locale].onboarding as Record<string, unknown>;
            expect(onboarding).toHaveProperty('steps');
            expect(onboarding).toHaveProperty('sectors');
            expect(onboarding).toHaveProperty('traits_list');

            const steps = onboarding.steps as Record<string, string>;
            expect(steps).toHaveProperty('company');
            expect(steps).toHaveProperty('template');
            expect(steps).toHaveProperty('voice');
            expect(steps).toHaveProperty('launch');

            const sectors = onboarding.sectors as Record<string, string>;
            expect(Object.keys(sectors).length).toBeGreaterThanOrEqual(10);
        }
    });

    it('no empty string values', () => {
        for (const locale of LOCALES) {
            const allKeys = keys[locale];
            for (const key of allKeys) {
                const parts = key.split('.');
                let value: unknown = messages[locale];
                for (const part of parts) {
                    value = (value as Record<string, unknown>)[part];
                }
                expect(value, `${locale}.${key} is empty`).not.toBe('');
            }
        }
    });
});
