import express, { Request, Response } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const appMarketplaceRouter = express.Router();
const execFileAsync = promisify(execFile);

const OPENEMS_DOCS_URL = 'https://openems.github.io/openems.io/openems/latest/edge/deploy/docker.html';
const runtimeRoot = path.resolve(process.cwd(), '.runtime', 'app-marketplace');

interface DeployPayload {
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

interface DeploymentRecord {
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

const sendSuccess = (res: Response, data: unknown) => {
  res.status(200).json({ code: 200, data });
};

const sendFailure = (res: Response, message: string, status = 500) => {
  res.status(status).json({ code: status, msg: message });
};

const getAppDir = (appId: string) => path.join(runtimeRoot, appId);
const getComposeFilePath = (appId: string) => path.join(getAppDir(appId), 'docker-compose.generated.yml');
const getMetaFilePath = (appId: string) => path.join(getAppDir(appId), 'deployment.json');

const getLaunchUrl = (req: Request, params: Record<string, string>) => {
  const protocol = req.protocol || 'http';
  const host = req.hostname || 'localhost';
  const profile = params.deploymentProfile;
  const port = profile === 'edge-ui' ? params.uiHttpPort || '80' : params.edgeFelixPort || '8080';
  return `${protocol}://${host}:${port}`;
};

const readDeployment = async (appId: string): Promise<DeploymentRecord | null> => {
  const metaFile = getMetaFilePath(appId);
  if (!existsSync(metaFile)) {
    return null;
  }
  const content = await readFile(metaFile, 'utf-8');
  return JSON.parse(content) as DeploymentRecord;
};

const writeDeployment = async (record: DeploymentRecord) => {
  const appDir = getAppDir(record.appId);
  await mkdir(appDir, { recursive: true });
  await writeFile(getComposeFilePath(record.appId), record.composeYaml, 'utf-8');
  await writeFile(getMetaFilePath(record.appId), JSON.stringify(record, null, 2), 'utf-8');
};

const runDockerCompose = async (appId: string) => {
  const composeFile = getComposeFilePath(appId);
  return execFileAsync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
    cwd: getAppDir(appId),
    timeout: 120000,
  });
};

const runDockerComposeDown = async (appId: string) => {
  const composeFile = getComposeFilePath(appId);
  return execFileAsync('docker', ['compose', '-f', composeFile, 'down'], {
    cwd: getAppDir(appId),
    timeout: 120000,
  });
};

appMarketplaceRouter.get('/apps', async (_: Request, res: Response) => {
  const deployment = await readDeployment('openems');
  sendSuccess(res, [
    {
      id: 'openems',
      name: 'OpenEMS',
      description: 'Deploy OpenEMS Edge and optional OpenEMS UI using the official Docker topology.',
      version: deployment?.version || 'latest',
      status: deployment?.status || 'install',
      docsUrl: OPENEMS_DOCS_URL,
      deployment: deployment || undefined,
    },
  ]);
});

appMarketplaceRouter.get('/apps/:appId', async (req: Request, res: Response) => {
  if (req.params.appId !== 'openems') {
    sendFailure(res, 'Unsupported app', 404);
    return;
  }
  const deployment = await readDeployment(req.params.appId);
  sendSuccess(res, {
    id: 'openems',
    docsUrl: OPENEMS_DOCS_URL,
    deployment,
  });
});

appMarketplaceRouter.post('/deploy', async (req: Request, res: Response) => {
  const payload = req.body as DeployPayload;
  if (payload.appId !== 'openems') {
    sendFailure(res, 'Unsupported app', 400);
    return;
  }

  const launchUrl = getLaunchUrl(req, payload.params);
  const draftRecord: DeploymentRecord = {
    appId: payload.appId,
    version: payload.version,
    params: payload.params,
    composeYaml: payload.composeYaml,
    deploymentSpec: payload.deploymentSpec,
    status: 'install',
    launchUrl,
  };

  await writeDeployment(draftRecord);

  try {
    const result = await runDockerCompose(payload.appId);
    const finalRecord: DeploymentRecord = {
      ...draftRecord,
      status: 'open',
      deployedAt: new Date().toISOString(),
      lastError: '',
    };
    await writeDeployment(finalRecord);
    sendSuccess(res, {
      ...finalRecord,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error: any) {
    const failedRecord: DeploymentRecord = {
      ...draftRecord,
      status: 'install',
      lastError: error?.stderr || error?.message || 'docker compose up failed',
    };
    await writeDeployment(failedRecord);
    sendFailure(res, failedRecord.lastError || 'docker compose up failed');
  }
});

appMarketplaceRouter.post('/apps/:appId/open', async (req: Request, res: Response) => {
  if (req.params.appId !== 'openems') {
    sendFailure(res, 'Unsupported app', 404);
    return;
  }
  const deployment = await readDeployment(req.params.appId);
  if (!deployment?.launchUrl) {
    sendFailure(res, 'App has not been deployed yet', 404);
    return;
  }
  sendSuccess(res, {
    appId: req.params.appId,
    url: deployment.launchUrl,
    docsUrl: OPENEMS_DOCS_URL,
  });
});

appMarketplaceRouter.delete('/apps/:appId', async (req: Request, res: Response) => {
  if (req.params.appId !== 'openems') {
    sendFailure(res, 'Unsupported app', 404);
    return;
  }

  const deployment = await readDeployment(req.params.appId);
  if (!deployment) {
    sendFailure(res, 'App has not been deployed yet', 404);
    return;
  }

  try {
    const result = await runDockerComposeDown(req.params.appId);
    const nextRecord: DeploymentRecord = {
      ...deployment,
      status: 'install',
      lastError: '',
    };
    await writeDeployment(nextRecord);
    sendSuccess(res, {
      ...nextRecord,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error: any) {
    sendFailure(res, error?.stderr || error?.message || 'docker compose down failed');
  }
});

export { appMarketplaceRouter };
