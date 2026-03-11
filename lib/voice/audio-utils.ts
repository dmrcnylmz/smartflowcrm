/**
 * Audio Utilities — Shared audio format conversion helpers
 *
 * Used by TTS providers that return raw PCM audio data.
 * Converts PCM → WAV for browser playback compatibility.
 */

/**
 * PCM raw audio verisine WAV header ekler.
 * Browser Audio API'nin doğrudan çalabilmesi için gerekli.
 *
 * @param pcmBuffer - Raw PCM audio data
 * @param sampleRate - Sample rate in Hz (default: 24000)
 * @param numChannels - Number of channels (default: 1 = mono)
 * @param bitsPerSample - Bits per sample (default: 16)
 */
export function pcmToWav(
    pcmBuffer: Buffer,
    sampleRate = 24000,
    numChannels = 1,
    bitsPerSample = 16,
): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const headerSize = 44;

    const wav = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);

    // fmt sub-chunk
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);         // Sub-chunk size
    wav.writeUInt16LE(1, 20);          // PCM format
    wav.writeUInt16LE(numChannels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);
    pcmBuffer.copy(wav, headerSize);

    return wav;
}
