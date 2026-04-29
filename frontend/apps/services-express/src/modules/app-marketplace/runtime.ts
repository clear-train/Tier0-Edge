import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const OPENEMS_DOCS_URL = 'https://openems.github.io/openems.io/openems/latest/edge/deploy/docker.html';
export const runtimeRoot = path.resolve(process.cwd(), '.runtime', 'app-marketplace');

export interface DeployPayload {
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

export interface DeploymentRecord {
  appId: string;
  version: string;
  params: Record<string, string>;
  composeYaml: string;
  deploymentSpec: DeployPayload['deploymentSpec'];
  status: 'install' | 'open';
  deployedAt?: string;
  launchUrl?: string;
  lastError?: string;
}

export const getAppDir = (appId: string) => path.join(runtimeRoot, appId);
export const getComposeFilePath = (appId: string) => path.join(getAppDir(appId), 'docker-compose.generated.yml');
export const getMetaFilePath = (appId: string) => path.join(getAppDir(appId), 'deployment.json');
export const getSyncFilePath = (appId: string) => path.join(getAppDir(appId), 'tier0-openems-sync.json');

export const readDeployment = async (appId: string): Promise<DeploymentRecord | null> => {
  const metaFile = getMetaFilePath(appId);
  if (!existsSync(metaFile)) {
    return null;
  }
  const content = await readFile(metaFile, 'utf-8');
  return JSON.parse(content) as DeploymentRecord;
};

export const writeDeployment = async (record: DeploymentRecord) => {
  const appDir = getAppDir(record.appId);
  await mkdir(appDir, { recursive: true });
  await writeFile(getComposeFilePath(record.appId), record.composeYaml, 'utf-8');
  await writeFile(getMetaFilePath(record.appId), JSON.stringify(record, null, 2), 'utf-8');
};
