import { ImageResponse } from 'next/og';

export const alt = 'Callception - AI Destekli Çağrı Yönetimi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #0a0a14 0%, #1a1a2e 50%, #0a0a14 100%)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Gradient orbs */}
                <div
                    style={{
                        position: 'absolute',
                        top: '-100px',
                        right: '-100px',
                        width: '500px',
                        height: '500px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        bottom: '-100px',
                        left: '-100px',
                        width: '500px',
                        height: '500px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)',
                    }}
                />

                {/* Logo + Icon */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        marginBottom: '24px',
                    }}
                >
                    <div
                        style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '20px',
                            background: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg
                            width="44"
                            height="44"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                    </div>
                    <span
                        style={{
                            fontSize: '56px',
                            fontWeight: 700,
                            color: 'white',
                            letterSpacing: '-1px',
                        }}
                    >
                        Callception
                    </span>
                </div>

                {/* Tagline */}
                <p
                    style={{
                        fontSize: '28px',
                        color: 'rgba(255,255,255,0.7)',
                        textAlign: 'center',
                        maxWidth: '700px',
                        lineHeight: 1.4,
                        margin: 0,
                    }}
                >
                    AI Destekli Sesli Asistan ile
                    Çağrılarınızı Otomatikleştirin
                </p>

                {/* Feature pills */}
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        marginTop: '36px',
                    }}
                >
                    {['7/24 Sesli Asistan', 'Randevu Yönetimi', 'Çağrı Analizi'].map(
                        (feature) => (
                            <div
                                key={feature}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '100px',
                                    border: '1px solid rgba(124,58,237,0.5)',
                                    background: 'rgba(124,58,237,0.1)',
                                    color: 'rgba(255,255,255,0.8)',
                                    fontSize: '18px',
                                }}
                            >
                                {feature}
                            </div>
                        ),
                    )}
                </div>

                {/* Domain */}
                <p
                    style={{
                        position: 'absolute',
                        bottom: '30px',
                        fontSize: '18px',
                        color: 'rgba(255,255,255,0.4)',
                        margin: 0,
                    }}
                >
                    callception.com
                </p>
            </div>
        ),
        { ...size },
    );
}
