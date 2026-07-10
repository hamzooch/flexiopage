'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle2, Clock, DollarSign, Key, RefreshCw, Send, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';

type TabId = 'config' | 'transactions' | 'webhooks' | 'stats';

interface MoneróoConfig {
  apiKeyConfigured: boolean;
  webhookUrl: string;
  webhookSecret: string;
  testMode: boolean;
}

interface Transaction {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  createdAt: string;
  reference: string;
}

interface WebhookLog {
  id: string;
  event: string;
  status: 'success' | 'failed';
  payload: Record<string, unknown>;
  error?: string;
  createdAt: string;
}

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState<MoneróoConfig | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalVolume: 0,
    successRate: 0,
    avgAmount: 0,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call
      // const res = await fetch('/api/admin/payments/config');
      // const data = await res.json();
      // setConfig(data);
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call
      // const res = await fetch('/api/admin/payments/transactions');
      // const data = await res.json();
      // setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWebhookLogs = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call
      // const res = await fetch('/api/admin/payments/webhooks');
      // const data = await res.json();
      // setWebhookLogs(data);
    } catch (error) {
      console.error('Error loading webhook logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call
      // const res = await fetch('/api/admin/payments/stats');
      // const data = await res.json();
      // setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call
      // const res = await fetch('/api/admin/payments/config', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ apiKey }),
      // });
      // if (res.ok) {
      //   loadConfig();
      // }
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestPayment = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call for test payment
      // const res = await fetch('/api/admin/payments/test', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      // });
      // if (res.ok) {
      //   // Show success message
      // }
    } catch (error) {
      console.error('Error testing payment:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements"
        description="Gérez Moneróo et surveillez les transactions"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration Moneróo</CardTitle>
              <CardDescription>Gérez vos paramètres de paiement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config?.apiKeyConfigured ? (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm text-green-700">Clé API configurée</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="text-sm text-yellow-700">Clé API non configurée</span>
                </div>
              )}

              <div>
                <Label htmlFor="apiKey">Clé API Moneróo</Label>
                <div className="flex gap-2">
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="pvk_sandbox_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <Button onClick={handleSaveConfig} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                <Label className="text-sm font-medium">URL Webhook</Label>
                <code className="block text-xs text-gray-600">{config?.webhookUrl}</code>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Mode Test</Label>
                <Button onClick={handleTestPayment} variant="outline" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Tester un paiement
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transactions Moneróo</CardTitle>
              <CardDescription>Historique des paiements</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadTransactions} variant="outline" disabled={loading} className="mb-4">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Commande</th>
                      <th className="text-left py-2 px-2">Montant</th>
                      <th className="text-left py-2 px-2">Statut</th>
                      <th className="text-left py-2 px-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">
                          Aucune transaction
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 font-mono text-xs">{tx.orderId}</td>
                          <td className="py-2 px-2">
                            {(tx.amount / 100).toFixed(0)} {tx.currency}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                tx.status === 'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : tx.status === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-gray-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs Webhooks</CardTitle>
              <CardDescription>Notifications de paiement reçues</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadWebhookLogs} variant="outline" disabled={loading} className="mb-4">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>

              <div className="space-y-2">
                {webhookLogs.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">Aucun webhook reçu</div>
                ) : (
                  webhookLogs.map((log) => (
                    <div key={log.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{log.event}</span>
                        <span
                          className={`text-xs font-medium ${
                            log.status === 'success' ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <code className="block text-xs bg-gray-50 p-2 rounded max-h-20 overflow-auto">
                        {JSON.stringify(log.payload, null, 2)}
                      </code>
                      {log.error && <div className="text-xs text-red-600">{log.error}</div>}
                      <div className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Volume total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalVolume.toLocaleString()} XOF</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalTransactions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Taux de succès</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{(stats.successRate * 100).toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Montant moyen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{Math.round(stats.avgAmount).toLocaleString()} XOF</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
