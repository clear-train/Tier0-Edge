import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Divider, Form, Input, Modal, Select, Space, Switch } from 'antd';
import { Apps, Launch } from '@carbon/icons-react';
import ComLayout from '@/components/com-layout';
import ComContent from '@/components/com-layout/ComContent';
import ComCodeSnippet from '@/components/com-code-snippet';
import { useTranslate } from '@/hooks';
import { APP_MARKETPLACE_MANIFEST } from './manifest';
import type {
  AppDeployField,
  MarketplaceApp,
  MarketplaceAppSyncSummary,
  Tier0OpenEmsFormMapping,
  Tier0OpenEmsSyncFormValues,
} from './types';
import { buildOpenEmsComposeYaml, buildOpenEmsDeploymentSpec, type OpenEmsComposeValues } from './compose';
import {
  deployMarketplaceAppApi,
  getMarketplaceAppDetailApi,
  getMarketplaceAppSyncApi,
  getMarketplaceAppsApi,
  openMarketplaceAppApi,
  runMarketplaceAppSyncApi,
  uninstallMarketplaceAppApi,
  updateMarketplaceAppSyncApi,
  type Tier0ToOpenEmsSyncConfig,
} from '@/apis/inter-api/app-marketplace';
import { buildTier0SyncPayload, createDefaultTier0SyncValues, toTier0SyncFormValues } from './tier0-sync';
import styles from './index.module.scss';

const renderField = (field: AppDeployField, getText: (key: string | undefined, fallback: string) => string) => {
  const placeholder = getText(field.placeholderKey, field.placeholder);

  if (field.type === 'select') {
    return (
      <Select
        placeholder={placeholder}
        options={field.options?.map((option) => ({
          value: option.value,
          label: getText(option.labelKey, option.label),
        }))}
      />
    );
  }

  return <Input placeholder={placeholder} type={field.type === 'number' ? 'number' : 'text'} />;
};

const summarizeSync = (config: Tier0ToOpenEmsSyncConfig): MarketplaceAppSyncSummary => ({
  direction: config.direction,
  enabled: Boolean(config.enabled),
  mappingCount: config.mappings.length,
  enabledMappingCount: config.mappings.filter((mapping) => mapping.enabled).length,
  lastRunAt: config.lastRunAt,
  lastSuccessAt: config.lastSuccessAt,
  lastError: config.lastError,
});

const formatTime = (value?: string) => {
  if (!value) {
    return '';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const AppMarketplace = () => {
  const formatMessage = useTranslate();
  const { message } = App.useApp();
  const [apps, setApps] = useState(APP_MARKETPLACE_MANIFEST);
  const [activeApp, setActiveApp] = useState<MarketplaceApp | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [activeSyncConfig, setActiveSyncConfig] = useState<Tier0ToOpenEmsSyncConfig | null>(null);
  const [form] = Form.useForm<Record<string, any>>();

  const formValues = Form.useWatch([], form) as (OpenEmsComposeValues & Tier0OpenEmsSyncFormValues) | undefined;
  const composeYaml = activeApp && formValues ? buildOpenEmsComposeYaml(formValues as OpenEmsComposeValues) : '';
  const syncEnabled = Boolean(formValues?.syncEnabled);

  const activeSyncAlert = useMemo(() => {
    if (!activeSyncConfig?.lastError) {
      return null;
    }
    return activeSyncConfig.lastError;
  }, [activeSyncConfig]);

  const getText = (key: string | undefined, fallback: string) =>
    key ? formatMessage(key, undefined, fallback) : fallback;

  const getAppName = (app: MarketplaceApp) => getText(app.nameKey, app.name);
  const getAppDescription = (app: MarketplaceApp) => getText(app.descriptionKey, app.description);
  const getFieldLabel = (field: AppDeployField) => getText(field.labelKey, field.label);

  const mergeRemoteApps = (remoteApps: MarketplaceApp[]) => {
    setApps((prev) =>
      prev.map((app) => {
        const remote = remoteApps.find((item) => item.id === app.id);
        return remote ? { ...app, ...remote, deployFields: app.deployFields, syncTemplate: app.syncTemplate } : app;
      })
    );
  };

  const applySyncToApp = (appId: string, config: Tier0ToOpenEmsSyncConfig) => {
    setApps((prev) => prev.map((item) => (item.id === appId ? { ...item, sync: summarizeSync(config) } : item)));
  };

  useEffect(() => {
    const loadApps = async () => {
      try {
        const data = await getMarketplaceAppsApi();
        if (Array.isArray(data) && data.length) {
          mergeRemoteApps(data);
        } else {
          setApps(APP_MARKETPLACE_MANIFEST);
        }
      } catch {
        setApps(APP_MARKETPLACE_MANIFEST);
      }
    };

    void loadApps();
  }, []);

  const buildDefaultFormValues = (app: MarketplaceApp) => {
    const deployDefaults = app.deployFields.reduce(
      (acc, field) => {
        if (field.defaultValue !== undefined) {
          acc[field.key] = field.defaultValue;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    return {
      ...deployDefaults,
      ...(app.syncTemplate || createDefaultTier0SyncValues()),
    };
  };

  const openDeployModal = async (app: MarketplaceApp) => {
    const initialValues = buildDefaultFormValues(app);
    form.setFieldsValue(initialValues);
    setActiveSyncConfig(null);
    setActiveApp(app);

    try {
      const [detail, syncConfig] = await Promise.all([
        getMarketplaceAppDetailApi(app.id).catch(() => null),
        getMarketplaceAppSyncApi(app.id).catch(() => null),
      ]);

      const nextValues: Record<string, any> = { ...initialValues };
      if (detail?.deployment?.params) {
        Object.assign(nextValues, detail.deployment.params);
      }

      const nextSyncValues = toTier0SyncFormValues(syncConfig || null);
      Object.assign(nextValues, nextSyncValues);
      form.setFieldsValue(nextValues);
      setActiveSyncConfig(syncConfig || null);
    } catch {
      form.setFieldsValue(initialValues);
    }
  };

  const handleAction = async (app: MarketplaceApp) => {
    if (app.status === 'open') {
      try {
        const result = await openMarketplaceAppApi(app.id);
        if (result?.url) {
          window.open(result.url, '_blank');
        } else {
          window.open(app.docsUrl || app.launchUrl || '/app-marketplace', '_blank');
        }
      } catch {
        window.open(app.docsUrl || app.launchUrl || '/app-marketplace', '_blank');
      }
      message.success(formatMessage('marketplace.openReady', undefined, `${app.name} is opening`));
      return;
    }

    await openDeployModal(app);
  };

  const handleUninstall = (app: MarketplaceApp) => {
    Modal.confirm({
      title: formatMessage('common.confirmUnInstall', undefined, 'Confirm uninstall'),
      onOk: async () => {
        try {
          await uninstallMarketplaceAppApi(app.id);
          setApps((prev) =>
            prev.map((item) =>
              item.id === app.id
                ? {
                    ...item,
                    status: 'install',
                    sync: {
                      direction: 'tier0-to-openems',
                      enabled: false,
                      mappingCount: item.sync?.mappingCount || 0,
                      enabledMappingCount: 0,
                    },
                  }
                : item
            )
          );
          message.success(formatMessage('common.unInstalledSuccess', undefined, 'Uninstalled successfully'));
        } catch (error: any) {
          message.warning(error?.msg || formatMessage('common.serverBusy', undefined, 'Operation failed'));
        }
      },
    });
  };

  const validateSyncPayload = (values: Tier0OpenEmsSyncFormValues) => {
    const payload = buildTier0SyncPayload(values);
    if (payload.enabled && !payload.mappings.length) {
      throw new Error(
        formatMessage(
          'marketplace.syncMappingRequired',
          undefined,
          'At least one Tier0 to OpenEMS mapping is required when sync is enabled'
        )
      );
    }
    return payload;
  };

  const saveSyncConfig = async (appId: string, values: Tier0OpenEmsSyncFormValues) => {
    const payload = validateSyncPayload(values);
    const nextConfig = await updateMarketplaceAppSyncApi(appId, payload);
    setActiveSyncConfig(nextConfig);
    applySyncToApp(appId, nextConfig);
    form.setFieldsValue(toTier0SyncFormValues(nextConfig));
    return nextConfig;
  };

  const handleRunSync = async () => {
    if (!activeApp) {
      return;
    }
    if (activeApp.status !== 'open') {
      message.warning(
        formatMessage(
          'marketplace.syncRequiresInstall',
          undefined,
          'Deploy OpenEMS first, then enable Tier0 to OpenEMS sync'
        )
      );
      return;
    }

    setSyncSubmitting(true);
    try {
      const values = (await form.validateFields()) as Tier0OpenEmsSyncFormValues;
      await saveSyncConfig(activeApp.id, values);
      const result = await runMarketplaceAppSyncApi(activeApp.id);
      if (result?.config) {
        setActiveSyncConfig(result.config);
        applySyncToApp(activeApp.id, result.config);
        form.setFieldsValue(toTier0SyncFormValues(result.config));
      }

      const hasError = Array.isArray(result?.results) && result.results.some((item: any) => item.status === 'error');
      if (hasError) {
        message.warning(
          formatMessage(
            'marketplace.syncRunPartial',
            undefined,
            'Tier0 to OpenEMS sync ran with errors. Check the mapping status below.'
          )
        );
      } else {
        message.success(
          formatMessage('marketplace.syncRunSuccess', undefined, 'Tier0 values were pushed to OpenEMS successfully')
        );
      }
    } catch (error: any) {
      message.warning(
        error?.msg || error?.message || formatMessage('common.serverBusy', undefined, 'Operation failed')
      );
    } finally {
      setSyncSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (!activeApp) {
      return;
    }

    const values = (await form.validateFields()) as OpenEmsComposeValues & Tier0OpenEmsSyncFormValues;
    setSubmitting(true);
    try {
      if (activeApp.status === 'open') {
        await saveSyncConfig(activeApp.id, values);
        message.success(
          formatMessage('marketplace.syncSaved', undefined, 'Tier0 to OpenEMS sync settings saved successfully')
        );
        setActiveApp(null);
        form.resetFields();
        return;
      }

      const valueMap = values as Record<string, any>;
      const deploymentParams = activeApp.deployFields.reduce(
        (acc, field) => {
          acc[field.key] = String(valueMap[field.key] ?? '');
          return acc;
        },
        {} as Record<string, string>
      );
      const composeValues = deploymentParams as unknown as OpenEmsComposeValues;
      const nextComposeYaml = buildOpenEmsComposeYaml(composeValues);
      const deploymentSpec = buildOpenEmsDeploymentSpec(composeValues);
      await deployMarketplaceAppApi({
        appId: activeApp.id,
        version: activeApp.version,
        params: deploymentParams,
        composeYaml: nextComposeYaml,
        deploymentSpec,
      });
      const nextSyncConfig = await saveSyncConfig(activeApp.id, values);
      setApps((prev) =>
        prev.map((item) =>
          item.id === activeApp.id ? { ...item, status: 'open', sync: summarizeSync(nextSyncConfig) } : item
        )
      );
      message.success(formatMessage('marketplace.installSuccess', { name: activeApp.name }, '{name} installed'));
      setActiveApp(null);
      form.resetFields();
    } catch (error: any) {
      message.warning(
        error?.msg || error?.message || formatMessage('marketplace.apiPending', undefined, 'Operation failed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ComLayout>
      <ComContent hasBack={false} mustShowTitle={false} title={null}>
        <div className={styles.wrapper}>
          <div className={styles.header}>
            <div className={styles.headerMeta}>
              <div>
                <h2>{formatMessage('marketplace.title', undefined, 'App Marketplace')}</h2>
                <p>
                  {formatMessage(
                    'marketplace.subtitle',
                    undefined,
                    'Deploy and manage edge applications with one click.'
                  )}
                </p>
              </div>
              <Button
                href="https://openems.github.io/openems.io/openems/latest/edge/deploy/docker.html"
                target="_blank"
              >
                OpenEMS Docker Docs <Launch size={14} />
              </Button>
            </div>
          </div>
          <div className={styles.grid}>
            {apps.map((app) => (
              <Card key={app.id} className={styles.card} hoverable onClick={() => void openDeployModal(app)}>
                <div className={styles.cardHeader}>
                  <div className={styles.appMeta}>
                    <div className={styles.iconWrap}>
                      <Apps size={20} />
                    </div>
                    <div className={styles.appInfo}>
                      <span className={styles.appName}>{getAppName(app)}</span>
                      <span className={styles.version}>
                        {formatMessage('common.version', undefined, 'Version')}: {app.version}
                      </span>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <Button
                      className={styles.primaryAction}
                      type={app.status === 'install' ? 'primary' : 'default'}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleAction(app);
                      }}
                    >
                      {app.status === 'install'
                        ? formatMessage('common.install', undefined, 'Install')
                        : formatMessage('common.open', undefined, 'Open')}
                    </Button>
                    {app.status === 'open' ? (
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          void openDeployModal(app);
                        }}
                      >
                        {formatMessage('common.config', undefined, 'Config')}
                      </Button>
                    ) : null}
                    {app.status === 'open' ? (
                      <Button
                        danger
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUninstall(app);
                        }}
                      >
                        {formatMessage('common.unInstall', undefined, 'Uninstall')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className={styles.desc}>{getAppDescription(app)}</div>
                {app.sync?.enabled ? (
                  <div className={styles.syncSummary}>
                    <span>
                      {formatMessage(
                        'marketplace.syncSummaryEnabled',
                        { count: app.sync.enabledMappingCount },
                        'Tier0 -> OpenEMS sync enabled ({count} mappings)'
                      )}
                    </span>
                    {app.sync.lastError ? (
                      <span className={styles.syncSummaryError}>{app.sync.lastError}</span>
                    ) : app.sync.lastSuccessAt ? (
                      <span>
                        {formatMessage('marketplace.lastSuccess', undefined, 'Last success')}:&nbsp;
                        {formatTime(app.sync.lastSuccessAt)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      </ComContent>
      <Modal
        title={
          activeApp
            ? `${getAppName(activeApp)} ${formatMessage('marketplace.deployConfig', undefined, 'Deployment Parameters')}`
            : ''
        }
        open={Boolean(activeApp)}
        onCancel={() => {
          setActiveApp(null);
          setActiveSyncConfig(null);
          form.resetFields();
        }}
        onOk={() => void onSubmit()}
        confirmLoading={submitting}
        width={1080}
        okText={
          activeApp?.status === 'open'
            ? formatMessage('marketplace.saveSync', undefined, 'Save Sync')
            : formatMessage('common.install', undefined, 'Install')
        }
      >
        {activeApp && (
          <div className={styles.detailMeta}>
            <div className={styles.detailMetaText}>
              {formatMessage(
                'marketplace.configHint',
                undefined,
                'Configure deployment parameters. These fields will map to Docker Compose env values later.'
              )}
            </div>
            <Space>
              {activeApp.status === 'open' ? (
                <Button onClick={() => void handleRunSync()} loading={syncSubmitting}>
                  {formatMessage('marketplace.runSyncNow', undefined, 'Run Sync Now')}
                </Button>
              ) : null}
              {activeApp.docsUrl ? (
                <Button href={activeApp.docsUrl} target="_blank">
                  {formatMessage('marketplace.viewDocs', undefined, 'View Docs')} <Launch size={14} />
                </Button>
              ) : null}
            </Space>
          </div>
        )}

        {activeSyncAlert ? (
          <Alert
            className={styles.alert}
            type="warning"
            showIcon
            message={formatMessage('marketplace.syncLastError', undefined, 'Latest sync error')}
            description={activeSyncAlert}
          />
        ) : null}

        <Form form={form} layout="vertical">
          <div className={styles.formGrid}>
            {activeApp?.deployFields?.map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={getFieldLabel(field)}
                rules={[
                  {
                    required: field.required,
                    message: formatMessage(
                      'marketplace.required',
                      { name: getFieldLabel(field) },
                      '{name} is required'
                    ),
                  },
                ]}
              >
                {renderField(field, getText)}
              </Form.Item>
            ))}
          </div>

          <Divider />

          <div className={styles.syncSectionHeader}>
            <div className={styles.syncSectionTitle}>
              <h3>{formatMessage('marketplace.syncTitle', undefined, 'Tier0 -> OpenEMS')}</h3>
              <p>
                {formatMessage(
                  'marketplace.syncHint',
                  undefined,
                  'Subscribe to Tier0 MQTT topics and write the incoming values into OpenEMS channels or component properties through the official OpenEMS controller APIs. By default, the marketplace provisions a simulated consumption path at simulateConsumption/Data.'
                )}
              </p>
            </div>
            <Form.Item name="syncEnabled" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </div>

          {syncEnabled ? (
            <Form.List name="syncMappings">
              {(fields, { add, remove }) => (
                <div className={styles.syncSectionBody}>
                  {fields.map((field) => {
                    const mappingStatus = formValues?.syncMappings?.[field.name] as Tier0OpenEmsFormMapping | undefined;
                    return (
                      <Card key={field.key} className={styles.mappingCard} size="small">
                        <div className={styles.mappingCardHeader}>
                          <span>
                            {formatMessage(
                              'marketplace.syncMappingTitle',
                              { index: field.name + 1 },
                              'Mapping {index}'
                            )}
                          </span>
                          <Space>
                            <Form.Item name={[field.name, 'enabled']} valuePropName="checked" noStyle>
                              <Switch size="small" />
                            </Form.Item>
                            {fields.length > 1 ? (
                              <Button type="text" danger onClick={() => remove(field.name)}>
                                {formatMessage('common.delete', undefined, 'Delete')}
                              </Button>
                            ) : null}
                          </Space>
                        </div>

                        <Form.Item name={[field.name, 'id']} hidden>
                          <Input />
                        </Form.Item>

                        <div className={styles.formGrid}>
                          <Form.Item
                            name={[field.name, 'name']}
                            label={formatMessage('marketplace.syncMappingName', undefined, 'Mapping Name')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Mapping Name' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input placeholder="Tier0 -> OpenEMS" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'pollIntervalMs']}
                            label={formatMessage('marketplace.syncInterval', undefined, 'Poll Interval (ms)')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Poll Interval' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input type="number" placeholder="5000" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'tier0BaseUrl']}
                            label={formatMessage('marketplace.tier0BaseUrl', undefined, 'Tier0 Base URL')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Tier0 Base URL' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input placeholder="http://kong:8000" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'tier0MqttUrl']}
                            label={formatMessage('marketplace.tier0MqttUrl', undefined, 'Tier0 MQTT URL')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Tier0 MQTT URL' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input placeholder="mqtt://emqx:1883" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'tier0SourceType']}
                            label={formatMessage('marketplace.tier0SourceType', undefined, 'Tier0 Source Type')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Tier0 Source Type' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Select
                              options={[
                                { label: formatMessage('marketplace.alias', undefined, 'Alias'), value: 'alias' },
                                { label: formatMessage('marketplace.path', undefined, 'Path'), value: 'path' },
                              ]}
                            />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'tier0SourceValue']}
                            label={formatMessage(
                              'marketplace.tier0SourceValue',
                              undefined,
                              'Tier0 Alias / Path / Topic'
                            )}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Tier0 Alias / Path / Topic' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input placeholder="grid_active_power" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'tier0Field']}
                            label={formatMessage('marketplace.tier0Field', undefined, 'Tier0 Field')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Tier0 Field' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input placeholder="value" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'openemsTargetType']}
                            label={formatMessage('marketplace.openemsTargetType', undefined, 'OpenEMS Target Type')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'OpenEMS Target Type' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Select
                              options={[
                                {
                                  label: formatMessage('marketplace.channel', undefined, 'Channel'),
                                  value: 'channel',
                                },
                                {
                                  label: formatMessage('marketplace.configProperty', undefined, 'Config Property'),
                                  value: 'config-property',
                                },
                              ]}
                            />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'openemsComponentId']}
                            label={formatMessage('marketplace.openemsComponentId', undefined, 'OpenEMS Component-ID')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'OpenEMS Component-ID' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input
                              placeholder={
                                mappingStatus?.openemsTargetType === 'config-property' ? '_meta' : 'simulateConsumption'
                              }
                            />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'openemsChannelId']}
                            label={
                              mappingStatus?.openemsTargetType === 'config-property'
                                ? formatMessage('marketplace.openemsPropertyName', undefined, 'OpenEMS Property Name')
                                : formatMessage('marketplace.openemsChannelId', undefined, 'OpenEMS Channel-ID')
                            }
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'OpenEMS Channel-ID' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input
                              placeholder={
                                mappingStatus?.openemsTargetType === 'config-property'
                                  ? 'maximumGridFeedInLimit'
                                  : 'Data'
                              }
                            />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'valueType']}
                            label={formatMessage('marketplace.valueType', undefined, 'Value Type')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Value Type' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Select
                              options={[
                                { label: formatMessage('marketplace.number', undefined, 'Number'), value: 'number' },
                                { label: formatMessage('marketplace.boolean', undefined, 'Boolean'), value: 'boolean' },
                                { label: formatMessage('marketplace.string', undefined, 'String'), value: 'string' },
                              ]}
                            />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'scale']}
                            label={formatMessage('marketplace.scale', undefined, 'Scale')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage('marketplace.required', { name: 'Scale' }, '{name} is required'),
                              },
                            ]}
                          >
                            <Input type="number" placeholder="1" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'offset']}
                            label={formatMessage('marketplace.offset', undefined, 'Offset')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'Offset' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input type="number" placeholder="0" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'openemsUsername']}
                            label={formatMessage('marketplace.openemsUsername', undefined, 'OpenEMS Username')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'OpenEMS Username' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input placeholder="x" />
                          </Form.Item>

                          <Form.Item
                            name={[field.name, 'openemsPassword']}
                            label={formatMessage('marketplace.openemsPassword', undefined, 'OpenEMS Password')}
                            rules={[
                              {
                                required: true,
                                message: formatMessage(
                                  'marketplace.required',
                                  { name: 'OpenEMS Password' },
                                  '{name} is required'
                                ),
                              },
                            ]}
                          >
                            <Input.Password placeholder="user" />
                          </Form.Item>
                        </div>

                        {mappingStatus?.lastSyncedAt || mappingStatus?.lastError ? (
                          <div className={styles.mappingStatus}>
                            {mappingStatus.lastSyncedAt ? (
                              <span>
                                {formatMessage('marketplace.lastSuccess', undefined, 'Last success')}:&nbsp;
                                {formatTime(mappingStatus.lastSyncedAt)}
                              </span>
                            ) : null}
                            {mappingStatus.lastError ? (
                              <span className={styles.mappingStatusError}>{mappingStatus.lastError}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}

                  <Button onClick={() => add(createDefaultTier0SyncValues().syncMappings[0])}>
                    {formatMessage('marketplace.addMapping', undefined, 'Add Mapping')}
                  </Button>
                </div>
              )}
            </Form.List>
          ) : null}
        </Form>

        <div className={styles.composeSection}>
          <div className={styles.composeTitle}>
            <span>{formatMessage('marketplace.composePreview', undefined, 'Docker Compose Preview')}</span>
            <span>
              {formatMessage('marketplace.composeSource', undefined, 'Based on official OpenEMS Docker docs')}
            </span>
          </div>
          <ComCodeSnippet
            copyText={composeYaml}
            showLineNumbers
            minCollapsedNumberOfRows={18}
            maxCollapsedNumberOfRows={18}
          >
            {composeYaml}
          </ComCodeSnippet>
        </div>
      </Modal>
    </ComLayout>
  );
};

export default AppMarketplace;
