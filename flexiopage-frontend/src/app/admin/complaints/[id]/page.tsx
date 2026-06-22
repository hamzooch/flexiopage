'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, type AdminComplaint, type ComplaintStatus, type ComplaintPriority, type StaffRole } from '@/lib/api';
import {
  ArrowLeft, Loader2, Send, Mail, Clock, MessageSquare, Crown, ShieldCheck, User as UserIcon, UserPlus,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  resolved: 'Résolue',
  closed: 'Fermée',
};
const PRIORITY_LABELS: Record<ComplaintPriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

type StaffMember = { _id: string; email: string; name: string; role: StaffRole };

export default function AdminComplaintDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const me = useAuthStore((s) => s.user);
  const [data, setData] = useState<AdminComplaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    adminApi.staff().then((res) => setStaff(res.data.staff)).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.getComplaint(id);
      setData(res.data.complaint);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function changeStatus(status: ComplaintStatus) {
    await adminApi.patchComplaint(id, { status });
    await load();
  }
  async function changePriority(priority: ComplaintPriority) {
    await adminApi.patchComplaint(id, { priority });
    await load();
  }
  async function changeAssignee(userId: string | null) {
    await adminApi.patchComplaint(id, { assignedTo: userId });
    await load();
  }
  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await adminApi.replyComplaint(id, reply.trim());
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
      <Link href="/admin/complaints" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux réclamations
      </Link>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">{data.subject}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{data.userId?.email}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Ouverte le {new Date(data.createdAt).toLocaleString()}</span>
                {data.assignedTo && <span>Assignée à <strong>{data.assignedTo.name}</strong></span>}
              </CardDescription>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor(data.status)}`}>
              {STATUS_LABELS[data.status]}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Statut</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStatus(s)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    data.status === s ? statusColor(s) + ' ring-2 ring-rose-500/30' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Priorité</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => changePriority(p)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    data.priority === p ? priorityColor(p) + ' ring-2 ring-rose-500/30' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Assigné à</div>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                value={data.assignedTo?._id || ''}
                onChange={(e) => changeAssignee(e.target.value || null)}
                className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Personne —</option>
                {staff.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} {s._id === me?._id ? '(moi)' : ''} · {s.role}
                  </option>
                ))}
              </select>
              {me?._id && data.assignedTo?._id !== me._id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => changeAssignee(me._id)}
                  className="h-9 shrink-0 gap-1.5 text-xs"
                  title="Me l'assigner"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Prendre
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thread */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Conversation ({data.messages.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.messages.map((m, i) => {
            const isAdmin = m.authorRole === 'admin' || m.authorRole === 'superadmin';
            return (
              <div key={i} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : ''}`}>
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
                  isAdmin ? 'border-rose-500/20 bg-rose-500/5' : 'border-border/60 bg-muted/30'
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

          {/* Reply form */}
          {data.status !== 'closed' && (
            <form onSubmit={sendReply} className="border-t border-border/60 pt-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Répondre au vendeur…"
                className="min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" disabled={!reply.trim() || sending} className="gap-1.5">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Envoyer la réponse
                </Button>
              </div>
            </form>
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
function priorityColor(p: ComplaintPriority): string {
  return {
    low: 'bg-slate-500/10 text-slate-600',
    normal: 'bg-blue-500/10 text-blue-700',
    high: 'bg-amber-500/10 text-amber-700',
    urgent: 'bg-rose-500/10 text-rose-700',
  }[p];
}
