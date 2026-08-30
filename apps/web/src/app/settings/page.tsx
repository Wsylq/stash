'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Bot, Check, Download, Eye, EyeOff, Loader2, LogOut, Moon, Sun,
  Trash2, Upload, Zap,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { AiFeatureKey, AiLog, AiPreset, AiSettingsView } from '@stash/shared';
import { AI_FEATURES } from '@stash/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Spinner, useToast } from '@/components/ui';

const FEATURE_LABELS: Record<AiFeatureKey, string> = {
  summarize: 'Summaries',
  categorize: 'Smart categories & tags',
  extractRecipe: 'Recipe extraction',
  extractWorkout: 'Workout extraction',
};

export default function SettingsPage() {
  const { user, logout, authed } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const toast = useToast();
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [presets, setPresets] = useState<AiPreset[]>([]);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number; model: string; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authed) return;
    void Promise.all([api.getSettings(), api.aiPresets(), api.aiLogs(50)])
      .then(([s, p, l]) => {
        setSettings(s.settings);
        setPresets(p.presets);
        setLogs(l.logs);
        setBaseUrl(s.settings.baseUrl);
        setModel(s.settings.model);
        setFeatureOverrides(s.settings.featureModels ?? {});
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load settings', 'error'));
  }, [authed, toast]);

  function applyLocal(next: AiSettingsView) {
    setSettings(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setFeatureOverrides(next.featureModels ?? {});
  }

  async function pickPreset(p: AiPreset) {
    try {
      const res = await api.applyPreset(p.id);
      applyLocal(res.settings);
      toast(`Provider set to ${p.label}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not apply preset', 'error');
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.saveSettings({
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        featureModels: featureOverrides,
      });
      applyLocal(res.settings);
      setApiKey('');
      setTestResult(null);
      toast(apiKey.trim() ? 'Settings & API key saved (encrypted)' : 'Settings saved');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await api.testAi({
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        featureModels: featureOverrides,
      });
      setTestResult(res);
      if (res.ok) toast(res.model ? `Connected — ${res.model}` : 'Connected');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Test failed', 'error');
    } finally {
      setTesting(false);
    }
  }

  async function clearKey() {
    const res = await api.clearAi();
    applyLocal(res.settings);
    setApiKey('');
    toast('API key removed');
  }

  async function exportData() {
    try {
      const { blob } = await api.exportJson();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `stash-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Export downloaded');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      if (file.name.toLowerCase().endsWith('.csv')) {
        const token = window.localStorage.getItem('stash_token');
        const res = await fetch('/api/v1/import', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
          body: raw,
        });
        const data = (await res.json()) as { imported?: number; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `Import failed (${res.status})`);
        toast(`Imported ${data.imported} items`);
      } else {
        const parsed = JSON.parse(raw) as { items?: unknown[] };
        if (!Array.isArray(parsed.items)) throw new Error('Not a Stash export file');
        const res = await api.importJson({ items: parsed.items });
        toast(`Imported ${res.imported} items`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      e.target.value = '';
    }
  }

  if (!authed) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6 text-coral" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <header>
        <h1 className="text-2xl font-extrabold text-ink dark:text-night-ink">Settings</h1>
        <p className="text-xs text-muted">Everything lives on your own server.</p>
      </header>

      {/* Account */}
      <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Account</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink dark:text-night-ink">{user?.email}</p>
            <p className="text-[11px] text-muted">Data is end-to-end isolated per account.</p>
          </div>
          <button
            onClick={logout}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-coral/10 px-3.5 py-2.5 text-xs font-bold text-coral"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </section>

      {/* Appearance */}
      <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Appearance</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTheme('light')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold',
              resolvedTheme === 'light' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'bg-stone-200/70 text-muted dark:bg-night-2',
            )}
          >
            <Sun className="h-4 w-4" /> Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold',
              resolvedTheme === 'dark' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'bg-stone-200/70 text-muted dark:bg-night-2',
            )}
          >
            <Moon className="h-4 w-4" /> Dark
          </button>
        </div>
      </section>

      {/* AI provider */}
      <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Bot className="h-4 w-4" /> AI provider
          </h2>
          {settings?.apiKeyConfigured ? (
            <span className="flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-bold text-teal-700 dark:text-mint">
              <Check className="h-3 w-3" /> Key set
            </span>
          ) : (
            <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-[11px] font-bold text-muted dark:bg-night-2">No key</span>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => void pickPreset(p)}
              className={clsx(
                'rounded-2xl border px-3 py-2 text-left transition',
                settings?.preset === p.id ? 'border-coral bg-coral/10' : 'border-stone-300/70 bg-card hover:border-stone-300 dark:border-night-card dark:bg-night-card',
              )}
            >
              <span className="block truncate text-xs font-bold text-ink dark:text-night-ink">{p.label}</span>
              <span className="block truncate text-[10px] text-muted">{p.defaultModel}{p.note && ' — BYO key'}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">API URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              className="w-full rounded-2xl border border-stone-300/70 bg-cream px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night"
            />
            <p className="mt-1 text-[11px] text-muted">{presets.find((p) => p.id === settings?.preset)?.note ?? 'Any OpenAI-compatible /chat/completions endpoint.'}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                spellCheck={false}
                className="w-full rounded-2xl border border-stone-300/70 bg-cream px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">API key</label>
              <div className="flex items-center gap-1.5 rounded-2xl border border-stone-300/70 bg-cream px-3.5 py-0.5 focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/30 dark:border-night-card dark:bg-night">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.apiKeyConfigured ? '•••••••• (saved, enter to replace)' : 'sk-…'}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
                />
                <button onClick={() => setShowKey((s) => !s)} aria-label="Toggle key visibility" className="shrink-0 text-muted hover:text-ink">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-coral/25 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
          </button>
          <button
            onClick={() => void test()}
            disabled={testing}
            className="flex items-center justify-center gap-2 rounded-2xl bg-stone-200/70 px-4 py-2.5 text-sm font-bold text-muted hover:text-ink disabled:opacity-60 dark:bg-night-2"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Test
          </button>
          {settings?.apiKeyConfigured && (
            <button
              onClick={() => void clearKey()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-coral/10 px-4 py-2.5 text-sm font-bold text-coral"
              title="Remove the saved API key"
            >
              <Trash2 className="h-4 w-4" /> Clear key
            </button>
          )}
        </div>

        {testResult && (
          <p className={clsx('mt-2 text-xs font-semibold', testResult.ok ? 'text-teal-700 dark:text-mint' : 'text-coral')}>
            {testResult.ok
              ? `Connected in ${testResult.latencyMs}ms${testResult.model ? ` · model "${testResult.model}"` : ''}`
              : testResult.error ?? 'Connection failed'}
          </p>
        )}

        <div className="mt-4 space-y-2 border-t border-stone-200/70 pt-3 dark:border-night-card">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Features & model override</p>
          {AI_FEATURES.map((f) => (
            <div key={f} className="flex flex-col gap-1 rounded-2xl bg-stone-100 p-2.5 sm:flex-row sm:items-center sm:gap-3 dark:bg-night-2">
              <span className="flex-1 text-sm font-semibold text-ink dark:text-night-ink">{FEATURE_LABELS[f]}</span>
              <input
                value={featureOverrides[f] ?? ''}
                onChange={(e) => setFeatureOverrides((o) => ({ ...o, [f]: e.target.value }))}
                placeholder={`Use default (${model || 'no model'})`}
                spellCheck={false}
                className="w-full rounded-xl border border-stone-300/70 bg-cream px-3 py-1.5 text-xs outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 sm:w-56 dark:border-night-card dark:bg-night"
              />
            </div>
          ))}
        </div>
      </section>

      {/* AI activity */}
      <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">AI activity</h2>
          <span className="text-[11px] text-muted">Last {logs.length} calls</span>
        </div>
        {logs.length === 0 ? (
          <p className="py-3 text-sm text-muted">No AI calls yet. Save something with “Organize with AI” enabled.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-2xl bg-stone-100 px-3 py-2 text-xs dark:bg-night-2">
                <span className="w-20 shrink-0 font-bold capitalize text-muted">{l.feature}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink dark:text-night-ink">{l.provider} · {l.model}</span>
                <span className="shrink-0 text-muted">{l.promptTokens + l.completionTokens} tok</span>
                <span className="shrink-0 text-muted">{l.durationMs < 1000 ? `${l.durationMs}ms` : `${(l.durationMs / 1000).toFixed(1)}s`}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Full request/response cost transparency — nothing to hide, ever.</p>
      </section>

      {/* Data */}
      <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Your data</h2>
        <div className="flex gap-2">
          <button
            onClick={() => void exportData()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-mint/15 px-4 py-2.5 text-sm font-bold text-teal-700 dark:text-mint"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-stone-200/70 px-4 py-2.5 text-sm font-bold text-muted hover:text-ink dark:bg-night-2"
          >
            <Upload className="h-4 w-4" /> Import
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json,.csv,text/csv,application/json" className="hidden" onChange={onFile} />
        <p className="mt-2 text-[11px] text-muted">Export downloads a complete JSON backup. Import accepts a Stash export or a simple CSV: title,url,tags|pipe|separated,collection,done.</p>
      </section>

      <p className="pb-2 text-center text-[11px] text-muted">Stash v0.1.0 · self-hosted · open source (AGPL)</p>
    </div>
  );
}