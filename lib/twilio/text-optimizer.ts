/**
 * Phone TTS Text Optimizer
 *
 * Cleans and optimizes LLM responses for Twilio <Say> TTS.
 * Strips emoji, markdown, collapses whitespace, truncates at sentence boundary.
 * Preserves all Latin-script characters including Turkish (çğışüö),
 * German (äöüß), and French (éèêçàùûîïô) — emoji stripping uses
 * Unicode symbol ranges that don't overlap with Latin-1/Extended blocks.
 */

/**
 * Optimize text for phone TTS output.
 * @param text  Raw LLM response
 * @param maxChars  Hard character limit (default 300)
 */
export function optimizeForPhoneTTS(text: string, maxChars: number = 300): string {
    let result = text;

    // Strip emoji and unicode symbols (preserves TR/EN/DE/FR Latin characters)
    result = result.replace(/[\u{1F600}-\u{1F64F}]/gu, '');   // emoticons
    result = result.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');   // symbols & pictographs
    result = result.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');   // transport & map
    result = result.replace(/[\u{2600}-\u{26FF}]/gu, '');      // misc symbols
    result = result.replace(/[\u{2700}-\u{27BF}]/gu, '');      // dingbats
    result = result.replace(/[\u{FE00}-\u{FE0F}]/gu, '');      // variation selectors
    result = result.replace(/[\u{1F900}-\u{1F9FF}]/gu, '');    // supplemental symbols
    result = result.replace(/[\u{200D}\u{20E3}]/gu, '');        // zero-width joiner, combining

    // Strip markdown artifacts
    result = result.replace(/\*\*/g, '');       // bold
    result = result.replace(/\*/g, '');          // italic
    result = result.replace(/`/g, '');           // code
    result = result.replace(/#{1,6}\s/g, '');    // headings
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links → text only

    // Normalize whitespace
    result = result.replace(/\n+/g, '. ');
    result = result.replace(/\s+/g, ' ');
    result = result.trim();

    // Remove double periods from newline conversion
    result = result.replace(/\.{2,}/g, '.');
    result = result.replace(/\.\s*\./g, '.');

    // Truncate at sentence boundary if too long
    if (result.length > maxChars) {
        const truncated = result.substring(0, maxChars);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?'),
        );
        if (lastSentenceEnd > maxChars * 0.5) {
            result = truncated.substring(0, lastSentenceEnd + 1);
        } else {
            result = truncated.trimEnd() + '...';
        }
    }

    return result;
}
