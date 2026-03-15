'use client';

import dynamic from 'next/dynamic';

const SwaggerUI = dynamic(
    () => import('swagger-ui-react').then((mod) => {
        // Load CSS only when the component is actually rendered
        require('swagger-ui-react/swagger-ui.css');
        return mod;
    }),
    { ssr: false }
);

export default function ApiDocsPage() {
    return (
        <div style={{ padding: '20px' }}>
            <SwaggerUI url="/openapi.json" />
        </div>
    );
}
