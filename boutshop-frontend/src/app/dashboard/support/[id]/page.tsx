'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { complaintsApi, type MyComplaint, type ComplaintStatus } from '@/lib/api';
import {
  ArrowLeft, Loader2, Send, MessageSquare, Crown, ShieldCheck, User as UserIcon, Clock,
} from 'lucide-react';

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  resolved: 'Résolue',
  closed: 'Fermée',
};

export default function SellerComplaintThreadPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<MyComplaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await complaintsApi.get(id);
      setData(res.data.complaint);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await complaintsApi.reply(id, reply.trim());
      setReply('');
      await load();
    } finally {
      setSending(false);
    }
  }

  if (loading || !data) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/support" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour à mes réclamations
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">{data.subject}</CardTitle>
              <CardDescription className="mt-1 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> Ouverte le {new Date(data.createdAt).toLocaleString()}
              </CardDescription>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor(data.status)}`}>
              {STATUS_LABELS[data.status]}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Conversation ({data.messages.length})
          </div>

          {data.messages.map((m, i) => {
            const isAdmin = m.authorRole === 'admin' || m.authorRole === 'superadmin';
            return (
              <div key={i} className={`flex gap-3 ${isAdmin ? '' : 'flex-row-reverse'}`}>
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-md ${
                  m.authorRole === 'superadmin' ? 'bg-gradient-to-br from-rose-600 to-orange-600' :
                  m.authorRole === 'admin' ? 'bg-gradient-to-br from-rose-500 to-orange-500' :
                  'gradient-brand'
                }`}>
                  {m.authorRole === 'superadmin' ? <Crown className="h-4 w-4" /> :
                   m.authorRole === 'admin' ? <ShieldCheck className="h-4 w-4" /> :
                   <UserIcon className="h-4 w-4" />}
                </div>
                <div className={`max-w-[75%] rounded-2xl border p-3.5 ${
                  isAdmin ? 'border-rose-500/20 bg-rose-500/5' : 'border-primary/20 bg-primary/5'
                }`}>
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <strong>{m.authorName}</strong>
                    <span className="text-muted-foreground">· {new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{m.body}</p>
                </div>
              </div>
            );
          })}

          {data.status !== 'closed' ? (
            <form onSubmit={sendReply} className="border-t border-border/60 pt-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Ajouter un message…"
                className="min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" disabled={!reply.trim() || sending} className="gap-1.5">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Envoyer
                </Button>
              </div>
            </form>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              Cette réclamation est fermée. Pour un sujet similaire, ouvre un nouveau ticket.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function statusColor(s: ComplaintStatus): string {
  return {
    open: 'bg-rose-500/10 text-rose-700',
    in_progress: 'bg-amber-500/10 text-amber-700',
    resolved: 'bg-emerald-500/10 text-emerald-700',
    closed: 'bg-muted text-muted-foreground',
  }[s];
}
