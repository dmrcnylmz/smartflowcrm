const express = require('express');
const router = express.Router();
const recordingService = require('../services/recording.service');
const transcriptionService = require('../services/transcription.service');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * @swagger
 * /api/recordings/{callId}:
 *   get:
 *     summary: Get recording metadata for a call
 *     tags: [Recordings]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:callId', (req, res) => {
    try {
        const recording = recordingService.getRecording(req.tenantId, req.params.callId);
        res.json(recording);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/recordings:
 *   get:
 *     summary: List all recordings
 *     tags: [Recordings]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', (req, res) => {
    try {
        const recordings = recordingService.listRecordings(req.tenantId, req.query);
        res.json({ recordings, count: recordings.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/recordings/stats:
 *   get:
 *     summary: Get storage statistics
 *     tags: [Recordings]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', (req, res) => {
    try {
        const stats = recordingService.getStorageStats(req.tenantId);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
