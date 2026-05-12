'use client';

import { useEffect, useState } from 'react';

interface Field {
  key: string;
  label: string;
  placeholder?: string;
  type: 'url' | 'text' | 'password' | 'toggle';
}

interface IntegrationCard {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
  setupUrl: string | null;
  fields: Field[];
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    id: 'make',
    label: 'Make（旧Integromat）',
    icon: '⚙️',
    description:
      '最強のノーコード自動化ツール。xLUMINAの生成完了をトリガーに何でも自動化',
    color: '#6366f1',
    setupUrl: 'https://make.com',
    fields: [
      {
        key: 'makeWebhookUrl',
        label: 'Webhook URL',
        placeholder: 'https://hook.make.com/...',
        type: 'url',
      },
      { key: 'makeEnabled', label: '有効にする', type: 'toggle' },
    ],
  },
  {
    id: 'zapier',
    label: 'Zapier',
    icon: '⚡',
    description: '5000以上のアプリと連携。設定も簡単',
    color: '#ff4a00',
    setupUrl: 'https://zapier.com',
    fields: [
      {
        key: 'zapierWebhookUrl',
        label: 'Webhook URL',
        placeholder: 'https://hooks.zapier.com/...',
        type: 'url',
      },
      { key: 'zapierEnabled', label: '有効にする', type: 'toggle' },
    ],
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: '📝',
    description:
      '生成物をNotionデータベースに自動保存。ナレッジベースを自動構築',
    color: '#000000',
    setupUrl: 'https://www.notion.so/my-integrations',
    fields: [
      {
        key: 'notionToken',
        label: 'Integration Token',
        placeholder: 'secret_...',
        type: 'password',
      },
      {
        key: 'notionDatabaseId',
        label: 'Database ID',
        placeholder: 'xxxxxxxx-xxxx-...',
        type: 'text',
      },
      { key: 'notionEnabled', label: '有効にする', type: 'toggle' },
    ],
  },
  {
    id: 'sns',
    label: 'SNS自動投稿',
    icon: '📱',
    description:
      'ブログ公開時にX・Instagramへ自動投稿（Make/Zapier経由）',
    color: '#1d9bf0',
    setupUrl: null,
    fields: [
      {
        key: 'triggerOnBlogPublished',
        label: 'ブログ公開時に自動投稿',
        type: 'toggle',
      },
      {
        key: 'triggerOnPipelineComplete',
        label: 'パイプライン完了時に通知',
        type: 'toggle',
      },
    ],
  },
];

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings');
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, []);

  const loadSettings = async () => {
    const res = await fetch('/api/integrations/settings');
    const data = await res.json();
    if (data.settings) setSettings(data.settings);
  };

  const loadLogs = async () => {
    const res = await fetch('/api/integrations/logs');
    const data = await res.json();
    setLogs(data.logs ?? []);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/integrations/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          makeWebhookUrl: settings.make_webhook_url,
          makeEnabled: settings.make_enabled,
          zapierWebhookUrl: settings.zapier_webhook_url,
          zapierEnabled: settings.zapier_enabled,
          notionToken: settings.notion_token,
          notionDatabaseId: settings.notion_database_id,
          notionEnabled: settings.notion_enabled,
          triggerOnPipelineComplete:
            settings.trigger_on_pipeline_complete ?? true,
          triggerOnBlogPublished:
            settings.trigger_on_blog_published ?? true,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (integrationId: string) => {
    setTestResults((prev) => ({ ...prev, [integrationId]: 'testing' }));

    const res = await fetch('/api/integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId }),
    });
    const { success } = await res.json();
    setTestResults((prev) => ({
      ...prev,
      [integrationId]: success ? 'success' : 'failed',
    }));
    setTimeout(
      () =>
        setTestResults((prev) => ({ ...prev, [integrationId]: '' })),
      5000,
    );
  };

  const getFieldValue = (key: string): unknown => {
    const dbMap: Record<string, string> = {
      makeWebhookUrl: 'make_webhook_url',
      makeEnabled: 'make_enabled',
      zapierWebhookUrl: 'zapier_webhook_url',
      zapierEnabled: 'zapier_enabled',
      notionToken: 'notion_token',
      notionDatabaseId: 'notion_database_id',
      notionEnabled: 'notion_enabled',
      triggerOnBlogPublished: 'trigger_on_blog_published',
      triggerOnPipelineComplete: 'trigger_on_pipeline_complete',
    };
    return settings[dbMap[key] ?? key];
  };

  const setFieldValue = (key: string, value: unknown) => {
    const dbMap: Record<string, string> = {
      makeWebhookUrl: 'make_webhook_url',
      makeEnabled: 'make_enabled',
      zapierWebhookUrl: 'zapier_webhook_url',
      zapierEnabled: 'zapier_enabled',
      notionToken: 'notion_token',
      notionDatabaseId: 'notion_database_id',
      notionEnabled: 'notion_enabled',
      triggerOnBlogPublished: 'trigger_on_blog_published',
      triggerOnPipelineComplete: 'trigger_on_pipeline_complete',
    };
    setSettings((prev) => ({ ...prev, [dbMap[key] ?? key]: value }));
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          🔗 外部連携（SaaS Integration）
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 4,
          }}
        >
          xLUMINAの生成完了を外部ツールに自動連携。Make・Zapier・Notionと繋いで自動化率95%へ
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border-color)',
          marginBottom: 24,
        }}
      >
        {[
          { id: 'settings' as const, label: '⚙️ 連携設定' },
          { id: 'logs' as const, label: `📋 実行ログ（${logs.length}件）` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === tab.id
                  ? '2px solid #4f46e5'
                  : '2px solid transparent',
              color:
                activeTab === tab.id ? '#4f46e5' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <>
          <div
            style={{
              padding: '14px 18px',
              marginBottom: 20,
              background: 'rgba(79,70,229,0.06)',
              border: '1px solid rgba(79,70,229,0.2)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#4f46e5',
                marginBottom: 8,
              }}
            >
              🚀 自動化フロー（設定後）
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  padding: '3px 8px',
                  background: '#4f46e5',
                  color: '#fff',
                  borderRadius: 4,
                }}
              >
                xLUMINA生成完了
              </span>
              <span>→</span>
              <span
                style={{
                  padding: '3px 8px',
                  background: 'rgba(79,70,229,0.1)',
                  color: '#4f46e5',
                  borderRadius: 4,
                }}
              >
                Make Webhook受信
              </span>
              <span>→</span>
              <span
                style={{
                  padding: '3px 8px',
                  background: 'rgba(79,70,229,0.1)',
                  color: '#4f46e5',
                  borderRadius: 4,
                }}
              >
                Notionに自動保存
              </span>
              <span>→</span>
              <span
                style={{
                  padding: '3px 8px',
                  background: 'rgba(79,70,229,0.1)',
                  color: '#4f46e5',
                  borderRadius: 4,
                }}
              >
                X・Instagramに投稿
              </span>
              <span>→</span>
              <span
                style={{
                  padding: '3px 8px',
                  background: 'rgba(79,70,229,0.1)',
                  color: '#4f46e5',
                  borderRadius: 4,
                }}
              >
                Slackに通知
              </span>
            </div>
          </div>

          {INTEGRATIONS.map((integration) => (
            <div
              key={integration.id}
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                overflow: 'hidden',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: '14px 18px',
                  background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span style={{ fontSize: 24 }}>{integration.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {integration.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        marginTop: 1,
                      }}
                    >
                      {integration.description}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {integration.setupUrl && (
                    <a
                      href={integration.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        padding: '5px 10px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        textDecoration: 'none',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-primary)',
                      }}
                    >
                      設定ページ →
                    </a>
                  )}
                  {integration.id !== 'sns' && (
                    <button
                      onClick={() => handleTest(integration.id)}
                      disabled={testResults[integration.id] === 'testing'}
                      style={{
                        fontSize: 12,
                        padding: '5px 10px',
                        background:
                          testResults[integration.id] === 'success'
                            ? '#059669'
                            : testResults[integration.id] === 'failed'
                              ? '#dc2626'
                              : 'var(--bg-primary)',
                        color: testResults[integration.id]
                          ? '#fff'
                          : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      {testResults[integration.id] === 'testing'
                        ? '接続中...'
                        : testResults[integration.id] === 'success'
                          ? '✅ 接続OK'
                          : testResults[integration.id] === 'failed'
                            ? '❌ 失敗'
                            : '🔌 接続テスト'}
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {integration.fields.map((field) => (
                  <div key={field.key}>
                    {field.type === 'toggle' ? (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          onClick={() =>
                            setFieldValue(field.key, !getFieldValue(field.key))
                          }
                          style={{
                            width: 44,
                            height: 24,
                            borderRadius: 12,
                            cursor: 'pointer',
                            position: 'relative',
                            background: getFieldValue(field.key)
                              ? '#4f46e5'
                              : '#d1d5db',
                            transition: 'background 0.2s',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: '#fff',
                              position: 'absolute',
                              top: 3,
                              left: getFieldValue(field.key) ? 23 : 3,
                              transition: 'left 0.2s',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 13 }}>{field.label}</span>
                      </label>
                    ) : (
                      <div>
                        <label
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          {field.label}
                        </label>
                        <input
                          type={field.type === 'password' ? 'password' : 'text'}
                          value={(getFieldValue(field.key) as string) ?? ''}
                          onChange={(e) =>
                            setFieldValue(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: 13,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              width: '100%',
              padding: '14px',
              background: saved ? '#059669' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isSaving
              ? '保存中...'
              : saved
                ? '✅ 保存しました！'
                : '💾 連携設定を保存する'}
          </button>
        </>
      )}

      {activeTab === 'logs' && (
        <div>
          {logs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px',
                border: '2px dashed var(--border-color)',
                borderRadius: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p>まだ連携ログがありません</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                連携設定後、パイプライン実行時に自動記録されます
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {logs.map((log) => {
                const integrationType = String(log.integration_type ?? '');
                const status = String(log.status ?? '');
                return (
                  <div
                    key={String(log.id)}
                    style={{
                      padding: '10px 14px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>
                      {integrationType === 'make'
                        ? '⚙️'
                        : integrationType === 'zapier'
                          ? '⚡'
                          : integrationType === 'notion'
                            ? '📝'
                            : '📱'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {integrationType.toUpperCase()} ← {String(log.source_type ?? '')}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {new Date(String(log.executed_at)).toLocaleString('ja-JP')}
                        {log.error_message ? ` • ${String(log.error_message)}` : ''}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 10,
                        background:
                          status === 'success' ? '#d1fae5' : '#fee2e2',
                        color:
                          status === 'success' ? '#065f46' : '#dc2626',
                      }}
                    >
                      {status === 'success' ? '✅ 成功' : '❌ 失敗'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
