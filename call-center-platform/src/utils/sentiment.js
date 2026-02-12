/**
 * Mock sentiment analyzer
 * Generates realistic sentiment scores based on keywords
 */

const POSITIVE_KEYWORDS = [
    'teşekkür', 'memnun', 'harika', 'güzel', 'süper', 'mükemmel', 'çok iyi',
    'thank', 'great', 'excellent', 'perfect', 'wonderful', 'happy', 'satisfied',
    'çözüldü', 'resolved', 'helpful', 'yardımcı'
];

const NEGATIVE_KEYWORDS = [
    'şikayet', 'kötü', 'berbat', 'rezalet', 'memnun değil', 'sorun',
    'complaint', 'terrible', 'awful', 'worst', 'angry', 'frustrated',
    'çözülmedi', 'unresolved', 'problem', 'issue', 'broken'
];

function analyzeSentiment(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();

    let score = 0;
    let matches = 0;

    POSITIVE_KEYWORDS.forEach(kw => {
        if (lower.includes(kw)) { score += 0.3; matches++; }
    });

    NEGATIVE_KEYWORDS.forEach(kw => {
        if (lower.includes(kw)) { score -= 0.3; matches++; }
    });

    if (matches === 0) {
        score = (Math.random() * 0.6) - 0.1; // Slight positive bias
    }

    return Math.max(-1, Math.min(1, parseFloat(score.toFixed(2))));
}

function generateSentimentScore() {
    // Distribution: 60% positive, 25% neutral, 15% negative
    const r = Math.random();
    if (r < 0.6) return parseFloat((Math.random() * 0.6 + 0.3).toFixed(2));
    if (r < 0.85) return parseFloat((Math.random() * 0.4 - 0.2).toFixed(2));
    return parseFloat((Math.random() * 0.5 - 0.8).toFixed(2));
}

module.exports = { analyzeSentiment, generateSentimentScore };
