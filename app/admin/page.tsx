'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AdminPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Ayarlar</h1>
        <p className="text-muted-foreground">Sistem yapılandırması ve entegrasyonlar</p>
      </div>

      <Tabs defaultValue="n8n" className="space-y-4">
        <TabsList>
          <TabsTrigger value="n8n">n8n</TabsTrigger>
          <TabsTrigger value="twilio">Twilio</TabsTrigger>
          <TabsTrigger value="google">Google Calendar</TabsTrigger>
          <TabsTrigger value="ai">AI Provider</TabsTrigger>
        </TabsList>

        <TabsContent value="n8n">
          <Card>
            <CardHeader>
              <CardTitle>n8n Yapılandırması</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="n8n-url">n8n Base URL</Label>
                <Input id="n8n-url" defaultValue="http://localhost:5678" />
              </div>
              <div>
                <Label htmlFor="n8n-secret">Webhook Secret</Label>
                <Input id="n8n-secret" type="password" />
              </div>
              <Button>Kaydet</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="twilio">
          <Card>
            <CardHeader>
              <CardTitle>Twilio Yapılandırması</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="twilio-sid">Account SID</Label>
                <Input id="twilio-sid" />
              </div>
              <div>
                <Label htmlFor="twilio-token">Auth Token</Label>
                <Input id="twilio-token" type="password" />
              </div>
              <div>
                <Label htmlFor="twilio-phone">Phone Number</Label>
                <Input id="twilio-phone" />
              </div>
              <Button>Kaydet</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google">
          <Card>
            <CardHeader>
              <CardTitle>Google Calendar Entegrasyonu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="google-client-id">Client ID</Label>
                <Input id="google-client-id" />
              </div>
              <div>
                <Label htmlFor="google-client-secret">Client Secret</Label>
                <Input id="google-client-secret" type="password" />
              </div>
              <Button>OAuth ile Bağlan</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>AI Provider Ayarları</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="llm-provider">Provider</Label>
                <select id="llm-provider" className="w-full p-2 border rounded">
                  <option value="local">Ollama (Local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude (Anthropic)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="openai-key">OpenAI API Key</Label>
                <Input id="openai-key" type="password" />
              </div>
              <div>
                <Label htmlFor="claude-key">Claude API Key</Label>
                <Input id="claude-key" type="password" />
              </div>
              <Button>Kaydet</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

