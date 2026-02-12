'use client';

import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
    audioData?: Float32Array;
    volume?: number;
    isActive?: boolean;
    color?: string;
    backgroundColor?: string;
    className?: string;
}

export function AudioWaveform({
    audioData,
    volume = 0,
    isActive = false,
    color = '#3b82f6',
    backgroundColor = '#1e293b',
    className = '',
}: AudioWaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(undefined);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const width = canvas.width;
            const height = canvas.height;
            const centerY = height / 2;

            // Clear canvas
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);

            if (!isActive) {
                // Draw flat line when inactive
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, centerY);
                ctx.lineTo(width, centerY);
                ctx.stroke();
                return;
            }

            // Draw waveform
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();

            if (audioData && audioData.length > 0) {
                // Real audio data
                const sliceWidth = width / audioData.length;
                let x = 0;

                for (let i = 0; i < audioData.length; i++) {
                    const v = audioData[i];
                    const y = centerY + v * centerY * 0.8;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }

                    x += sliceWidth;
                }
            } else {
                // Simulated waveform based on volume
                const barCount = 64;
                const barWidth = width / barCount;

                for (let i = 0; i < barCount; i++) {
                    const x = i * barWidth;
                    const normalizedVolume = Math.min(volume * 10, 1);
                    const random = Math.sin(Date.now() / 100 + i * 0.5) * 0.5 + 0.5;
                    const amplitude = normalizedVolume * random * centerY * 0.8;

                    const y = centerY + amplitude * Math.sin(i * 0.3 + Date.now() / 200);

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }

            ctx.stroke();

            // Add glow effect
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.shadowBlur = 0;
        };

        const animate = () => {
            draw();
            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [audioData, volume, isActive, color, backgroundColor]);

    return (
        <canvas
            ref={canvasRef}
            width={400}
            height={100}
            className={`rounded-lg ${className}`}
            style={{ width: '100%', height: '100px' }}
        />
    );
}

// Volume meter component
interface VolumeMeterProps {
    volume: number;
    className?: string;
}

export function VolumeMeter({ volume, className = '' }: VolumeMeterProps) {
    const bars = 10;
    const activeCount = Math.min(Math.round(volume * bars * 10), bars);

    return (
        <div className={`flex items-end gap-1 h-8 ${className}`}>
            {Array.from({ length: bars }).map((_, i) => (
                <div
                    key={i}
                    className={`w-2 rounded-sm transition-all duration-75 ${i < activeCount
                        ? i < 3
                            ? 'bg-green-500'
                            : i < 7
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                        : 'bg-gray-700'
                        }`}
                    style={{
                        height: `${(i + 1) * 10}%`,
                    }}
                />
            ))}
        </div>
    );
}
