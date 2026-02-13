---
description: RunPod servislerini yeniden başlatma ve yönetme
---

# RunPod SmartFlow CRM Deployment

## Pod Bilgileri
- **Pod ID**: mkc7tk5vj4un9i
- **n8n URL**: https://mkc7tk5vj4un9i-5678.proxy.runpod.net
- **Context API URL**: https://mkc7tk5vj4un9i-8999.proxy.runpod.net
- **Personaplex URL**: https://mkc7tk5vj4un9i-8998.proxy.runpod.net (henüz aktif değil)
- **Kalıcı dizin**: /workspace/smartflow/

## Pod Restart Sonrası
// turbo-all

1. Web Terminal'den çalıştır:
```bash
bash /workspace/smartflow/start-services.sh
```

2. Health check:
```bash
curl -s http://localhost:8999/health
curl -s http://localhost:5678/ | head -5
```

## Dosya Transfer (Upload Server)
Pod'da upload server başlat:
```bash
python3 -c "
from http.server import HTTPServer, BaseHTTPRequestHandler
import os
class H(BaseHTTPRequestHandler):
    def do_PUT(self):
        p='/workspace/smartflow'+self.path
        os.makedirs(os.path.dirname(p),exist_ok=True)
        l=int(self.headers['Content-Length'])
        open(p,'wb').write(self.rfile.read(l))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK')
HTTPServer(('0.0.0.0',8998),H).serve_forever()
" &
```

Lokal'den dosya yükle:
```bash
curl -X PUT --data-binary @<dosya> https://mkc7tk5vj4un9i-8998.proxy.runpod.net/<hedef_yol>
```

## n8n API
```bash
N8N_KEY="eyJhbG...Thvc"
curl -H "X-N8N-API-KEY: $N8N_KEY" https://mkc7tk5vj4un9i-5678.proxy.runpod.net/api/v1/workflows
```

## n8n Credentials
- Email: dmrcnylmz@gmail.com
- License Key: d74e4c9d-2bca-49de-872d-335d7a56f7a6
