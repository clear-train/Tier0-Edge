import { ApiWrapper } from '@/utils/request';

const baseUrl = '/open-api/app-marketplace';

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

// 获取应用市场列表
export const getMarketplaceAppsApi = async () => api.get('/apps');

// 获取应用详情（含部署参数模板）
export const getMarketplaceAppDetailApi = async (appId: string) => api.get(`/apps/${appId}`);

// 触发应用部署（后续接入 Docker Compose 编排）
export const deployMarketplaceAppApi = async (payload: DeployAppPayload) => api.post('/deploy', payload);

// 打开已安装应用入口（后续由后端返回可访问地址）
export const openMarketplaceAppApi = async (appId: string) => api.post(`/apps/${appId}/open`);

// 卸载应用
export const uninstallMarketplaceAppApi = async (appId: string) => api.delete(`/apps/${appId}`);
