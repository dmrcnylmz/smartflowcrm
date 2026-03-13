'use client';

/**
 * AssignToAgentDialog — Assign a KB document to a specific agent.
 *
 * Fetches agent list via GET /api/agents and allows the user
 * to select one to link the document to via PATCH /api/knowledge.
 */

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';
import { Bot, Loader2, CheckCircle, Search } from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    role?: string;
    isActive?: boolean;
}

interface AssignToAgentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    documentId: string;
    documentTitle: string;
    onAssigned?: (agentId: string, agentName: string) => void;
}

export function AssignToAgentDialog({
    open,
    onOpenChange,
    documentId,
    documentTitle,
    onAssigned,
}: AssignToAgentDialogProps) {
    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [assigning, setAssigning] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch agents when dialog opens
    useEffect(() => {
        if (!open) return;
        setSelectedAgentId(null);
        setSearchQuery('');
        setLoading(true);

        authFetch('/api/agents')
            .then(res => res.json())
            .then(data => {
                setAgents(data.agents || []);
            })
            .catch(() => {
                toast({ title: 'Hata', description: 'Asistan listesi yuklenemedi.', variant: 'error' });
            })
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filteredAgents = searchQuery
        ? agents.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : agents;

    async function handleAssign() {
        if (!selectedAgentId) return;
        setAssigning(true);
        try {
            const res = await authFetch('/api/knowledge', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentIds: [documentId],
                    agentId: selectedAgentId,
                }),
            });

            if (!res.ok) throw new Error('Atama basarisiz');

            const selectedAgent = agents.find(a => a.id === selectedAgentId);
            toast({
                title: 'Atandı',
                description: `Belge "${selectedAgent?.name || 'Asistan'}" asistanına atandı.`,
            });
            onAssigned?.(selectedAgentId, selectedAgent?.name || '');
            onOpenChange(false);
        } catch {
            toast({ title: 'Hata', description: 'Belge atanamadı.', variant: 'error' });
        } finally {
            setAssigning(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-violet-500" />
                        Asistana Ata
                    </DialogTitle>
                    <DialogDescription>
                        &quot;{documentTitle}&quot; belgesini bir asistana atayın.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                        <p className="text-sm text-muted-foreground">Asistanlar yukleniyor...</p>
                    </div>
                ) : agents.length === 0 ? (
                    <div className="text-center py-8">
                        <Bot className="h-10 w-10 text-white/20 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                            Henuz asistan olusturulmamıs. Once bir asistan olusturun.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Search */}
                        {agents.length > 3 && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Asistan ara..."
                                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                />
                            </div>
                        )}

                        {/* Agent list */}
                        <div className="max-h-[240px] overflow-y-auto space-y-1.5">
                            {filteredAgents.map((agent) => (
                                <button
                                    key={agent.id}
                                    onClick={() => setSelectedAgentId(agent.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all text-sm
                                        ${selectedAgentId === agent.id
                                            ? 'border-violet-500 bg-violet-500/10'
                                            : 'border-border hover:border-violet-500/50 hover:bg-violet-500/5'
                                        }
                                    `}
                                >
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                                        selectedAgentId === agent.id
                                            ? 'bg-violet-500/20 text-violet-400'
                                            : 'bg-muted text-muted-foreground'
                                    }`}>
                                        {selectedAgentId === agent.id ? (
                                            <CheckCircle className="h-4 w-4" />
                                        ) : (
                                            <Bot className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{agent.name}</p>
                                        {agent.role && (
                                            <p className="text-xs text-muted-foreground">{agent.role}</p>
                                        )}
                                    </div>
                                    {agent.isActive && (
                                        <span className="h-2 w-2 rounded-full bg-emerald-400" title="Aktif" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Assign button */}
                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleAssign}
                                disabled={!selectedAgentId || assigning}
                                className="gap-2"
                            >
                                {assigning ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Atanıyor...
                                    </>
                                ) : (
                                    <>
                                        <Bot className="h-4 w-4" />
                                        Ata
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
