'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * IYS Settings Panel
 *
 * Admin settings for configuring the IYS (Ileti Yonetim Sistemi) integration.
 * Allows entering API credentials and testing the connection.
 */
export default function IYSSettingsPanel() {
    const t = useTranslations('compliance');

    const [apiKey, setApiKey] = useState('');
    const [brandCode, setBrandCode] = useState('');
    const [testing, setTesting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');

    async function handleTestConnection() {
        setTesting(true);
        setConnectionStatus('idle');

        try {
            const res = await fetch(`/api/compliance/iys?phone=+905000000000`, {
                headers: {
                    'Authorization': `Bearer ${document.cookie.replace(/.*token=/, '')}`,
                },
            });

            if (res.ok) {
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('error');
            }
        } catch {
            setConnectionStatus('error');
        } finally {
            setTesting(false);
        }
    }

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('iysTitle')}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('iysDescription')}
            </p>

            <div className="mt-4 space-y-4">
                {/* API Key */}
                <div>
                    <label
                        htmlFor="iys-api-key"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        {t('iysApiKey')}
                    </label>
                    <input
                        id="iys-api-key"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                </div>

                {/* Brand Code */}
                <div>
                    <label
                        htmlFor="iys-brand-code"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        {t('iysBrandCode')}
                    </label>
                    <input
                        id="iys-brand-code"
                        type="text"
                        value={brandCode}
                        onChange={(e) => setBrandCode(e.target.value)}
                        placeholder="123456"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                </div>

                {/* Test Connection Button */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                        {testing ? '...' : t('iysTestConnection')}
                    </button>

                    {/* Connection Status */}
                    {connectionStatus === 'connected' && (
                        <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            {t('iysConnected')}
                        </span>
                    )}
                    {connectionStatus === 'error' && (
                        <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            {t('iysNotConnected')}
                        </span>
                    )}
                </div>

                {/* Info text */}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('iysRequired')}
                </p>

                {/* IYS Portal link */}
                <a
                    href="https://iys.org.tr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                    iys.org.tr
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </a>
            </div>
        </div>
    );
}
