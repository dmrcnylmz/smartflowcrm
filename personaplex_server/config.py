# Personaplex Server Configuration

import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class PersonaplexConfig:
    """Configuration for Personaplex voice AI server."""
    
    # Model settings
    model_name: str = "nvidia/personaplex-7b-v1"
    device: str = "cuda"  # "cuda" or "cpu"
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8998
    ssl_enabled: bool = False
    ssl_cert_path: Optional[str] = None
    ssl_key_path: Optional[str] = None
    
    # Audio settings
    sample_rate: int = 24000  # Personaplex default
    channels: int = 1  # Mono audio
    chunk_size: int = 480  # 20ms at 24kHz
    
    # Performance settings
    cpu_offload: bool = False  # For GPUs with < 24GB VRAM
    max_concurrent_sessions: int = 1  # Currently 1 per GPU
    
    # Persona settings (Turkish CRM assistant)
    default_role_prompt: str = """Sen SmartFlow CRM için bir Türkçe müşteri hizmetleri asistanısın.
Görevlerin:
- Müşterilere nazik ve profesyonel şekilde yardım etmek
- Randevu taleplerini almak ve kaydetmek
- Şikayetleri dinlemek ve çözüm yolları sunmak
- Bilgi taleplerini yanıtlamak
- Gerektiğinde yetkili birime yönlendirmek

Her zaman Türkçe konuş ve nazik ol. Kısa ve öz cevaplar ver."""
    
    # Voice prompt path (optional - for voice cloning)
    voice_prompt_path: Optional[str] = None
    
    @classmethod
    def from_env(cls) -> "PersonaplexConfig":
        """Load configuration from environment variables."""
        return cls(
            model_name=os.getenv("PERSONAPLEX_MODEL", cls.model_name),
            device=os.getenv("PERSONAPLEX_DEVICE", cls.device),
            host=os.getenv("PERSONAPLEX_HOST", cls.host),
            port=int(os.getenv("PERSONAPLEX_PORT", str(cls.port))),
            ssl_enabled=os.getenv("PERSONAPLEX_SSL", "false").lower() == "true",
            ssl_cert_path=os.getenv("PERSONAPLEX_SSL_CERT"),
            ssl_key_path=os.getenv("PERSONAPLEX_SSL_KEY"),
            cpu_offload=os.getenv("PERSONAPLEX_CPU_OFFLOAD", "false").lower() == "true",
            voice_prompt_path=os.getenv("PERSONAPLEX_VOICE_PROMPT"),
        )


# SmartFlow CRM specific personas
PERSONAS = {
    "default": {
        "name": "Asistan",
        "role_prompt": PersonaplexConfig.default_role_prompt,
        "voice_style": "professional",
    },
    "support": {
        "name": "Destek",
        "role_prompt": """Sen SmartFlow CRM teknik destek asistanısın.
Müşterilerin teknik sorunlarını çözmeye yardımcı ol.
Sabırlı ve anlayışlı ol. Adım adım rehberlik yap.""",
        "voice_style": "calm",
    },
    "sales": {
        "name": "Satış",
        "role_prompt": """Sen SmartFlow CRM satış asistanısın.
Müşterilere ürün ve hizmetler hakkında bilgi ver.
İkna edici ol ancak baskıcı olma. Müşterinin ihtiyaçlarını dinle.""",
        "voice_style": "energetic",
    },
}
