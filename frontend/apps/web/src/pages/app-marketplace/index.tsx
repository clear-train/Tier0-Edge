import { useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space } from 'antd';
import { Apps, Launch } from '@carbon/icons-react';
import ComLayout from '@/components/com-layout';
import ComContent from '@/components/com-layout/ComContent';
import ComCodeSnippet from '@/components/com-code-snippet';
import { useTranslate } from '@/hooks';
import { APP_MARKETPLACE_MANIFEST } from './manifest';
import type { AppDeployField, MarketplaceApp } from './types';
import { buildOpenEmsComposeYaml, buildOpenEmsDeploymentSpec, type OpenEmsComposeValues } from './compose';
import {
  deployMarketplaceAppApi,
  getMarketplaceAppsApi,
  openMarketplaceAppApi,
  uninstallMarketplaceAppApi,
} from '@/apis/inter-api/app-marketplace';
import styles from './index.module.scss';

const renderField = (field: AppDeployField) => {
  if (field.type === 'select') {
    return <Select placeholder={field.placeholder} options={field.options} />;
  }

  return <Input placeholder={field.placeholder} type={field.type === 'number' ? 'number' : 'text'} />;
};

const AppMarketplace = () => {
  const formatMessage = useTranslate();
  const { message } = App.useApp();
  const [apps, setApps] = useState(APP_MARKETPLACE_MANIFEST);
  const [activeApp, setActiveApp] = useState<MarketplaceApp | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<Record<string, string>>();

  const formValues = Form.useWatch([], form) as OpenEmsComposeValues | undefined;
  const composeYaml = activeApp && formValues ? buildOpenEmsComposeYaml(formValues) : '';

  useEffect(() => {
    getMarketplaceAppsApi()
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setApps((prev) =>
            prev.map((app) => {
              const remote = data.find((item: MarketplaceApp) => item.id === app.id);
              return remote ? { ...app, status: remote.status } : app;
            })
          );
        }
      })
      .catch(() => {
        setApps(APP_MARKETPLACE_MANIFEST);
      });
  }, []);

  const openDeployModal = (app: MarketplaceApp) => {
    const initialValues = app.deployFields.reduce(
      (acc, field) => {
        if (field.defaultValue !== undefined) {
          acc[field.key] = field.defaultValue;
        }
        return acc;
      },
      {} as Record<string, string>
    );
    form.setFieldsValue(initialValues);
    setActiveApp(app);
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
    openDeployModal(app);
  };

  const handleUninstall = (app: MarketplaceApp) => {
    Modal.confirm({
      title: formatMessage('common.confirmUnInstall', undefined, 'Confirm uninstall'),
      onOk: async () => {
        try {
          await uninstallMarketplaceAppApi(app.id);
          setApps((prev) => prev.map((item) => (item.id === app.id ? { ...item, status: 'install' } : item)));
          message.success(formatMessage('common.unInstalledSuccess', undefined, 'Uninstalled successfully'));
        } catch (error: any) {
          message.warning(error?.msg || formatMessage('common.serverBusy', undefined, 'Operation failed'));
        }
      },
    });
  };

  const onDeploy = async () => {
    if (!activeApp) return;
    const values = (await form.validateFields()) as OpenEmsComposeValues;
    const nextComposeYaml = buildOpenEmsComposeYaml(values);
    const deploymentSpec = buildOpenEmsDeploymentSpec(values);
    setSubmitting(true);
    try {
      await deployMarketplaceAppApi({
        appId: activeApp.id,
        version: activeApp.version,
        params: values,
        composeYaml: nextComposeYaml,
        deploymentSpec,
      });
      setApps((prev) => prev.map((item) => (item.id === activeApp.id ? { ...item, status: 'open' } : item)));
      message.success(formatMessage('marketplace.installSuccess', { name: activeApp.name }, '{name} installed'));
      setActiveApp(null);
      form.resetFields();
    } catch (error: any) {
      message.warning(
        error?.msg || formatMessage('marketplace.apiPending', undefined, 'Backend deployment API is pending')
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
              <Card key={app.id} className={styles.card} hoverable onClick={() => openDeployModal(app)}>
                <div className={styles.cardHeader}>
                  <div className={styles.appMeta}>
                    <div className={styles.iconWrap}>
                      <Apps size={20} />
                    </div>
                    <div className={styles.appInfo}>
                      <span className={styles.appName}>{app.name}</span>
                      <span className={styles.version}>
                        {formatMessage('common.version', undefined, 'Version')}: {app.version}
                      </span>
                    </div>
                  </div>
                  <Space>
                    <Button
                      type={app.status === 'install' ? 'primary' : 'default'}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAction(app);
                      }}
                    >
                      {app.status === 'install'
                        ? formatMessage('common.install', undefined, 'Install')
                        : formatMessage('common.open', undefined, 'Open')}
                    </Button>
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
                  </Space>
                </div>
                <div className={styles.desc}>{app.description}</div>
              </Card>
            ))}
          </div>
        </div>
      </ComContent>
      <Modal
        title={
          activeApp
            ? `${activeApp.name} ${formatMessage('marketplace.deployConfig', undefined, 'Deployment Parameters')}`
            : ''
        }
        open={Boolean(activeApp)}
        onCancel={() => {
          setActiveApp(null);
          form.resetFields();
        }}
        onOk={onDeploy}
        confirmLoading={submitting}
        width={960}
        okText={formatMessage('common.install', undefined, 'Install')}
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
            {activeApp.docsUrl ? (
              <Button href={activeApp.docsUrl} target="_blank">
                {formatMessage('marketplace.viewDocs', undefined, 'View Docs')} <Launch size={14} />
              </Button>
            ) : null}
          </div>
        )}
        <Form form={form} layout="vertical">
          <div className={styles.formGrid}>
            {activeApp?.deployFields?.map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={field.label}
                rules={[
                  {
                    required: field.required,
                    message: formatMessage('marketplace.required', { name: field.label }, '{name} is required'),
                  },
                ]}
              >
                {renderField(field)}
              </Form.Item>
            ))}
          </div>
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
