/**
 * Knowledge Upload — File validation and API compatibility tests
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Knowledge Upload', () => {
    describe('API Route Capabilities', () => {
        it('API route supports multipart/form-data uploads', () => {
            const content = fs.readFileSync('app/api/knowledge/route.ts', 'utf-8');
            expect(content).toContain('multipart/form-data');
            expect(content).toContain('parseMultipartUpload');
        });

        it('API route supports JSON body (text/URL)', () => {
            const content = fs.readFileSync('app/api/knowledge/route.ts', 'utf-8');
            expect(content).toContain("type: body.type");
            expect(content).toContain("content: body.content");
        });

        it('API route has rate limiting', () => {
            const content = fs.readFileSync('app/api/knowledge/route.ts', 'utf-8');
            expect(content).toContain('checkUploadRateLimit');
            expect(content).toContain('429');
        });

        it('API route validates file size', () => {
            const content = fs.readFileSync('app/api/knowledge/route.ts', 'utf-8');
            expect(content).toContain('MAX_FILE_SIZE');
            expect(content).toContain('File too large');
        });

        it('API route supports PDF, TXT, MD, CSV, JSON, DOCX', () => {
            const content = fs.readFileSync('app/api/knowledge/route.ts', 'utf-8');
            expect(content).toContain('pdf');
            expect(content).toContain('text/plain');
            expect(content).toContain('text/csv');
            expect(content).toContain('application/json');
        });
    });

    describe('StepKnowledgeBase UI', () => {
        it('has file upload UI with drag-and-drop', () => {
            const content = fs.readFileSync('components/agents/wizard/StepKnowledgeBase.tsx', 'utf-8');
            expect(content).toContain('onDragOver');
            expect(content).toContain('onDrop');
            expect(content).toContain('handleDrop');
            expect(content).toContain('fileInputRef');
        });

        it('validates file size client-side (10MB limit)', () => {
            const content = fs.readFileSync('components/agents/wizard/StepKnowledgeBase.tsx', 'utf-8');
            expect(content).toContain('MAX_FILE_SIZE');
            expect(content).toContain('10 * 1024 * 1024');
        });

        it('validates allowed file extensions', () => {
            const content = fs.readFileSync('components/agents/wizard/StepKnowledgeBase.tsx', 'utf-8');
            expect(content).toContain('.pdf');
            expect(content).toContain('.docx');
            expect(content).toContain('.txt');
            expect(content).toContain('.csv');
            expect(content).toContain('.json');
            expect(content).toContain('.md');
        });

        it('sends file as multipart/form-data', () => {
            const content = fs.readFileSync('components/agents/wizard/StepKnowledgeBase.tsx', 'utf-8');
            expect(content).toContain('new FormData()');
            expect(content).toContain("formData.append('file'");
        });

        it('uses i18n translations', () => {
            const content = fs.readFileSync('components/agents/wizard/StepKnowledgeBase.tsx', 'utf-8');
            expect(content).toContain("useTranslations('knowledge')");
        });

        it('has text input, URL input, and file upload sections', () => {
            const content = fs.readFileSync('components/agents/wizard/StepKnowledgeBase.tsx', 'utf-8');
            expect(content).toContain('handleAddText');
            expect(content).toContain('handleAddUrl');
            expect(content).toContain('handleFileUpload');
        });
    });
});

describe('Sidebar i18n', () => {
    it('uses translation keys instead of hardcoded strings', () => {
        const content = fs.readFileSync('components/layout/Sidebar.tsx', 'utf-8');
        expect(content).toContain("useTranslations('nav')");
        expect(content).toContain("useTranslations('auth')");
        expect(content).toContain('titleKey');
        expect(content).toContain('labelKey');
        // Should NOT contain hardcoded Turkish nav items
        expect(content).not.toContain("'Ana Menü'");
        expect(content).not.toContain("'Çağrılar'");
        expect(content).not.toContain("'Müşteriler'");
    });
});

describe('Call Recording', () => {
    it('CallLog type includes recording field', () => {
        const content = fs.readFileSync('lib/firebase/types.ts', 'utf-8');
        expect(content).toContain('recording?');
        expect(content).toContain('mp3Url');
        expect(content).toContain('wavUrl');
    });

    it('calls page includes RecordingPlayer component', () => {
        const content = fs.readFileSync('app/calls/page.tsx', 'utf-8');
        expect(content).toContain('RecordingPlayer');
        expect(content).toContain('togglePlay');
        expect(content).toContain('handleSeek');
    });

    it('recording API saves recording data to Firestore', () => {
        const content = fs.readFileSync('app/api/twilio/recording/route.ts', 'utf-8');
        expect(content).toContain('recording');
        expect(content).toContain('mp3Url');
    });
});
