/**
 * Signup Routes — Self-Service Tenant Registration
 * 
 * Public endpoints (no auth required):
 *   POST /api/signup          — create tenant + admin
 *   POST /api/verify-email    — verify email token
 *   POST /api/forgot-password — send reset link
 *   POST /api/reset-password  — reset with token
 */
const express = require('express');
const router = express.Router();
const signupService = require('../services/signup.service');

/**
 * @swagger
 * /api/signup:
 *   post:
 *     summary: Self-service tenant signup
 *     tags: [Onboarding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName, email, password]
 *             properties:
 *               companyName: { type: string }
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *     responses:
 *       201: { description: Tenant created with admin user }
 *       400: { description: Validation error }
 *       409: { description: Email already registered }
 */
router.post('/signup', (req, res) => {
    try {
        const result = signupService.signup(req.body);
        res.status(201).json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/verify-email:
 *   post:
 *     summary: Verify email address
 *     tags: [Onboarding]
 */
router.post('/verify-email', (req, res) => {
    try {
        const { token } = req.body || {};
        // Also support query param for link clicks
        const t = token || req.query.token;
        if (!t) return res.status(400).json({ error: 'token required' });
        const result = signupService.verifyEmail(t);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// Also handle GET for email link clicks
router.get('/verify-email', (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(400).json({ error: 'token required' });
        const result = signupService.verifyEmail(token);
        // Redirect to admin panel on success
        res.redirect('/admin?email_verified=true');
    } catch (err) {
        res.redirect('/admin?email_verified=false&error=' + encodeURIComponent(err.message));
    }
});

/**
 * @swagger
 * /api/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Onboarding]
 */
router.post('/forgot-password', (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'email required' });
        const result = signupService.forgotPassword(email);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Onboarding]
 */
router.post('/reset-password', (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'token and password required' });
        const result = signupService.resetPassword(token, password);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

module.exports = router;
