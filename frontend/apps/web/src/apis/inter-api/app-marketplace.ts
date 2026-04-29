import { ApiWrapper } from '@/utils/request';

const baseUrl = `${window.location.protocol}//${window.location.hostname}:4000/open-api/app-marketplace`;

const api = new ApiWrapper(baseUrl);

export interface DeployAppPayload {
  appId: string;
  version: string;
  params: Record<string, string>;
  composeYaml: string;
  deploymentSpec: {
    kind: string;
    profile: string;
    services: Array<Record<string, unknown>>;
  };
}

export interface Tier0ToOpenEmsSyncMappingPayload {
  id?: string;
  name: string;
  enabled: boolean;
  tier0BaseUrl: string;
  tier0MqttUrl: string;
  tier0SourceType: 'alias' | 'path';
  tier0SourceValue: string;
  tier0Field: string;
  openemsTargetType: 'channel' | 'config-property';
  openemsComponentId: string;
  openemsChannelId: string;
  openemsUsername: string;
  openemsPassword: string;
  valueType: 'number' | 'boolean' | 'string';
  pollIntervalMs: string | number;
  scale: string | number;
  offset: string | number;
}

export interface Tier0ToOpenEmsSyncPayload {
  enabled: boolean;
  mappings: Tier0ToOpenEmsSyncMappingPayload[];
}

export interface Tier0ToOpenEmsSyncConfig {
  appId: string;
  direction: 'tier0-to-openems';
  enabled: boolean;
  updatedAt?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  mappings: Array<
    Tier0ToOpenEmsSyncMappingPayload & {
      id: string;
      lastValue?: string | number | boolean | null;
      lastSyncedAt?: string;
      lastError?: string;
    }
  >;
}

// 获取应用市场列表
export const getMarketplaceAppsApi = async () => api.get('/apps');

// 获取应用详情（含部署参数模板）
export const getMarketplaceAppDetailApi = async (appId: string) => api.get(`/apps/${appId}`);

export const getMarketplaceAppSyncApi = async (appId: string): Promise<Tier0ToOpenEmsSyncConfig> =>
  api.get(`/apps/${appId}/sync/tier0-openems`);

export const updateMarketplaceAppSyncApi = async (appId: string, payload: Tier0ToOpenEmsSyncPayload) =>
  api.put(`/apps/${appId}/sync/tier0-openems`, payload);

export const runMarketplaceAppSyncApi = async (appId: string) => api.post(`/apps/${appId}/sync/tier0-openems/run`);

// 触发应用部署（后续接入 Docker Compose 编排）
export const deployMarketplaceAppApi = async (payload: DeployAppPayload) => api.post('/deploy', payload);

// 打开已安装应用入口（后续由后端返回可访问地址）
export const openMarketplaceAppApi = async (appId: string) => api.post(`/apps/${appId}/open`);

// 卸载应用
export const uninstallMarketplaceAppApi = async (appId: string) => api.delete(`/apps/${appId}`);
