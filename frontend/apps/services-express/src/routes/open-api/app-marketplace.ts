import express, { Request, Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openEmsSyncManager, type Tier0ToOpenEmsSyncInput } from '@/modules/app-marketplace/openems-sync';
import {
  getAppDir,
  getComposeFilePath,
  OPENEMS_DOCS_URL,
  readDeployment,
  writeDeployment,
  type DeployPayload,
  type DeploymentRecord,
} from '@/modules/app-marketplace/runtime';

const appMarketplaceRouter = express.Router();
const execFileAsync = promisify(execFile);
const TIER0_SHARED_NETWORK = 'tier0_edge_network';
const DEFAULT_EDGE_IMAGE = 'openems/edge:latest';
const DEFAULT_UI_IMAGE = 'openems/ui-edge:latest';
const DEFAULT_EDGE_WEBSOCKET_INTERNAL_PORT = '8085';

const sendSuccess = (res: Response, data: unknown) => {
  res.status(200).json({ code: 200, data });
};

const sendFailure = (res: Response, message: string, status = 500) => {
  res.status(status).json({ code: status, msg: message });
};

const ensureOpenEmsApp = (appId: string, res: Response) => {
  if (appId !== 'openems') {
    sendFailure(res, 'Unsupported app', 404);
    return false;
  }
  return true;
};

const resolvePublicOrigin = (req: Request) => {
  const envProtocol = process.env.ENTRANCE_PROTOCOL?.trim();
  const envDomain = process.env.ENTRANCE_DOMAIN?.trim();
  const envPort = process.env.ENTRANCE_PORT?.trim();

  if (envProtocol && envDomain) {
    const normalizedPort = envPort && !['80', '443'].includes(envPort) ? `:${envPort}` : '';
    return `${envProtocol}://${envDomain}${normalizedPort}`;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    ?.trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    ?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const protocol = req.protocol || 'http';
  const host = req.get('host') || req.hostname || 'localhost';
  return `${protocol}://${host}`;
};

const getLaunchUrl = (req: Request, params: Record<string, string>) => {
  const origin = resolvePublicOrigin(req);
  const profile = params.deploymentProfile;
  const port = profile === 'edge-ui' ? params.uiHttpPort || '80' : params.edgeFelixPort || '8080';
  const originUrl = new URL(origin);
  originUrl.port = port;
  return originUrl.toString().replace(/\/$/, '');
};

const shouldUseInternalUiProxyHost = (value?: string) => {
  const normalized = value?.trim().toLowerCase() || '';
  const publicDomain = process.env.ENTRANCE_DOMAIN?.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === publicDomain ||
    /^[0-9.]+$/.test(normalized)
  );
};

const resolveUiProxyHost = (params: Record<string, string>) =>
  shouldUseInternalUiProxyHost(params.websocketHost)
    ? params.edgeServiceName || params.edgeContainerName || 'openems-edge'
    : params.websocketHost!.trim();

const resolveUiProxyWebsocketPort = () => DEFAULT_EDGE_WEBSOCKET_INTERNAL_PORT;

const resolveUiProxyRestPort = (params: Record<string, string>) => params.edgeRestPort?.trim() || '8084';

const normalizeOpenEmsParams = (params: Record<string, string>) => ({
  ...params,
  websocketHost: resolveUiProxyHost(params),
  websocketPort: resolveUiProxyWebsocketPort(),
});

const buildOpenEmsComposeYaml = (params: Record<string, string>) => {
  const normalizedParams = normalizeOpenEmsParams(params);
  const lines = [
    'services:',
    `  ${normalizedParams.edgeServiceName}:`,
    `    image: ${normalizedParams.edgeImage || DEFAULT_EDGE_IMAGE}`,
    `    container_name: ${normalizedParams.edgeContainerName}`,
    `    hostname: ${normalizedParams.edgeContainerName}`,
    '    restart: unless-stopped',
    '    volumes:',
    `      - ${normalizedParams.edgeConfigVolume}:/var/opt/openems/config:rw`,
    `      - ${normalizedParams.edgeDataVolume}:/var/opt/openems/data:rw`,
    '    networks:',
    `      - ${TIER0_SHARED_NETWORK}`,
    '    ports:',
    `      - ${normalizedParams.edgeFelixPort}:8080`,
    `      - ${normalizedParams.edgeRestPort}:${normalizedParams.edgeRestPort}`,
  ];

  if (normalizedParams.deploymentProfile === 'edge-ui') {
    lines.push(`      - ${normalizedParams.edgeWebsocketPort}:8085`);
    lines.push(`  ${normalizedParams.uiServiceName}:`);
    lines.push(`    image: ${normalizedParams.uiImage || DEFAULT_UI_IMAGE}`);
    lines.push(`    container_name: ${normalizedParams.uiContainerName}`);
    lines.push(`    hostname: ${normalizedParams.uiContainerName}`);
    lines.push('    restart: unless-stopped');
    lines.push('    volumes:');
    lines.push(`      - ${normalizedParams.uiConfigVolume}:/etc/nginx:rw`);
    lines.push(`      - ${normalizedParams.uiLogVolume}:/var/log/nginx:rw`);
    lines.push('    environment:');
    lines.push(`      - WEBSOCKET_HOST=${resolveUiProxyHost(normalizedParams)}`);
    lines.push(`      - WEBSOCKET_PORT=${resolveUiProxyWebsocketPort(normalizedParams)}`);
    lines.push(`      - REST_PORT=${resolveUiProxyRestPort(normalizedParams)}`);
    lines.push('    networks:');
    lines.push(`      - ${TIER0_SHARED_NETWORK}`);
    lines.push('    ports:');
    lines.push(`      - ${normalizedParams.uiHttpPort}:80`);
    lines.push(`      - ${normalizedParams.uiHttpsPort}:443`);
  }

  lines.push('volumes:');
  lines.push(`  ${normalizedParams.edgeConfigVolume}:`);
  lines.push(`  ${normalizedParams.edgeDataVolume}:`);

  if (normalizedParams.deploymentProfile === 'edge-ui') {
    lines.push(`  ${normalizedParams.uiConfigVolume}:`);
    lines.push(`  ${normalizedParams.uiLogVolume}:`);
  }

  lines.push('networks:');
  lines.push(`  ${TIER0_SHARED_NETWORK}:`);
  lines.push('    external: true');

  return lines.join('\n');
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const OPENEMS_ADMIN_USERNAME = 'admin';
const OPENEMS_ADMIN_PASSWORD = 'admin';

const isContainerRunning = async (containerName: string) => {
  try {
    const result = await execFileAsync('docker', ['inspect', '-f', '{{.State.Running}}', containerName], {
      timeout: 15000,
    });
    return result.stdout.trim() === 'true';
  } catch {
    return false;
  }
};

const isOpenEmsRestReady = async (containerName: string, port: string) => {
  try {
    await execFileAsync(
      'docker',
      [
        'exec',
        containerName,
        'sh',
        '-lc',
        `curl -sf -u x:user http://127.0.0.1:${port}/rest/channel/ctrlApiRest0/_PropertyPort >/dev/null`,
      ],
      {
        timeout: 15000,
      }
    );
    return true;
  } catch {
    return false;
  }
};

const getOpenEmsInternalBaseUrl = (params: Record<string, string>) => {
  const host = params.edgeServiceName || params.edgeContainerName || 'openems-edge';
  const port = params.edgeRestPort || '8084';
  return `http://${host}:${port}`;
};

const callOpenEmsJsonRpc = async (params: Record<string, string>, method: string, rpcParams: Record<string, any>) => {
  const response = await fetch(`${getOpenEmsInternalBaseUrl(params)}/jsonrpc`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${OPENEMS_ADMIN_USERNAME}:${OPENEMS_ADMIN_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      method,
      params: rpcParams,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `OpenEMS JSON-RPC failed with ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; result?: any } | null;
  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }

  return payload?.result;
};

const getOpenEmsEdgeConfig = async (params: Record<string, string>) =>
  ((await callOpenEmsJsonRpc(params, 'getEdgeConfig', {})) as {
    components?: Record<string, { properties?: Record<string, unknown> }>;
  }) || { components: {} };

const ensureSchedulerControllers = async (
  params: Record<string, string>,
  components: Record<string, { properties?: Record<string, unknown> }>,
  controllerId: string
) => {
  const scheduler = components.scheduler0;
  const rawControllers = scheduler?.properties?.['controllers.ids'];
  const controllerIds = Array.isArray(rawControllers)
    ? rawControllers.map((item) => String(item))
    : rawControllers
      ? [String(rawControllers)]
      : [];

  if (controllerIds.includes(controllerId)) {
    return;
  }

  await callOpenEmsJsonRpc(params, 'updateComponentConfig', {
    componentId: 'scheduler0',
    properties: [{ name: 'controllers.ids', value: [...controllerIds, controllerId] }],
  });
};

const ensureOpenEmsSimulatorProfile = async (params: Record<string, string>) => {
  const edgeConfig = await getOpenEmsEdgeConfig(params);
  const components = edgeConfig?.components || {};

  if (!components.simulateConsumption) {
    await callOpenEmsJsonRpc(params, 'createComponentConfig', {
      factoryPid: 'Simulator.Datasource.Single.Channel',
      properties: [
        { name: 'id', value: 'simulateConsumption' },
        { name: 'alias', value: 'Tier0 Consumption Source' },
        { name: 'enabled', value: true },
      ],
    });
  }

  if (!components.meter0) {
    await callOpenEmsJsonRpc(params, 'createComponentConfig', {
      factoryPid: 'Simulator.GridMeter.Acting',
      properties: [
        { name: 'id', value: 'meter0' },
        { name: 'alias', value: 'Tier0 Consumption Meter' },
        { name: 'datasource.id', value: 'simulateConsumption' },
      ],
    });
  }

  if (!components.ess0) {
    await callOpenEmsJsonRpc(params, 'createComponentConfig', {
      factoryPid: 'Simulator.EssSymmetric.Reacting',
      properties: [
        { name: 'id', value: 'ess0' },
        { name: 'alias', value: 'Virtual ESS' },
      ],
    });
  }

  const refreshedComponents = (await getOpenEmsEdgeConfig(params))?.components || {};
  if (!refreshedComponents.ctrlBalancing0) {
    await callOpenEmsJsonRpc(params, 'createComponentConfig', {
      factoryPid: 'Controller.Symmetric.Balancing',
      properties: [
        { name: 'id', value: 'ctrlBalancing0' },
        { name: 'alias', value: 'Tier0 Balancing Controller' },
        { name: 'enabled', value: true },
        { name: 'ess.id', value: 'ess0' },
        { name: 'meter.id', value: 'meter0' },
        { name: 'targetGridSetpoint', value: 0 },
      ],
    });
  }

  const balancingComponents = (await getOpenEmsEdgeConfig(params))?.components || {};
  await ensureSchedulerControllers(params, balancingComponents, 'ctrlBalancing0');
};

const buildOpenEmsRestReadWriteConfig = (port: string) =>
  [
    ':org.apache.felix.configadmin.revision:=L"1"',
    'alias=""',
    'apiTimeout=I"60"',
    'connectionlimit=I"5"',
    'debugMode=B"true"',
    'enabled=B"true"',
    'id="ctrlApiRest0"',
    `port=I"${port}"`,
    'service.factoryPid="Controller.Api.Rest.ReadWrite"',
    'service.pid="Controller.Api.Rest.ReadWrite.default"',
  ].join('\n');

const enableOpenEmsRestApi = async (containerName: string, port: string) => {
  const configDir = '/var/opt/openems/config/Controller/Api/Rest/ReadWrite';
  const configPath = `${configDir}/default.config`;
  const config = buildOpenEmsRestReadWriteConfig(port);
  const writeCommand = [`mkdir -p ${configDir}`, `cat > ${configPath} <<'EOF'`, config, 'EOF'].join('\n');

  await execFileAsync('docker', ['exec', containerName, 'sh', '-lc', writeCommand], {
    timeout: 120000,
  });

  await execFileAsync('docker', ['restart', containerName], {
    timeout: 120000,
  });

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const running = await isContainerRunning(containerName);
    if (running && (await isOpenEmsRestReady(containerName, port))) {
      return;
    }
    await sleep(1000);
  }

  throw new Error(`OpenEMS REST API on ${containerName}:${port} did not become ready in time`);
};

const reconcileDeploymentState = async (deployment: DeploymentRecord | null) => {
  if (!deployment || deployment.appId !== 'openems') {
    return deployment;
  }

  const edgeContainerName = deployment.params.edgeContainerName || 'openems_edge';
  const uiContainerName = deployment.params.uiContainerName || 'openems_ui';
  const needsUi = deployment.params.deploymentProfile === 'edge-ui';
  const edgeRunning = await isContainerRunning(edgeContainerName);
  const uiRunning = needsUi ? await isContainerRunning(uiContainerName) : true;

  if (!edgeRunning || !uiRunning) {
    return deployment;
  }

  if (deployment.status === 'open' && !deployment.lastError) {
    return deployment;
  }

  const nextDeployment: DeploymentRecord = {
    ...deployment,
    status: 'open',
    deployedAt: deployment.deployedAt || new Date().toISOString(),
    lastError: '',
  };
  await writeDeployment(nextDeployment);
  return nextDeployment;
};

appMarketplaceRouter.get('/apps', async (_: Request, res: Response) => {
  const deployment = await reconcileDeploymentState(await readDeployment('openems'));
  const syncConfig = await openEmsSyncManager.getConfig('openems');
  sendSuccess(res, [
    {
      id: 'openems',
      name: 'OpenEMS',
      description: 'Deploy OpenEMS Edge and optional OpenEMS UI using the official Docker topology.',
      version: deployment?.version || 'latest',
      status: deployment?.status || 'install',
      docsUrl: OPENEMS_DOCS_URL,
      deployment: deployment || undefined,
      sync: openEmsSyncManager.summarize(syncConfig),
    },
  ]);
});

appMarketplaceRouter.get('/apps/:appId', async (req: Request, res: Response) => {
  if (!ensureOpenEmsApp(req.params.appId, res)) {
    return;
  }

  const deployment = await reconcileDeploymentState(await readDeployment(req.params.appId));
  sendSuccess(res, {
    id: 'openems',
    docsUrl: OPENEMS_DOCS_URL,
    deployment,
  });
});

appMarketplaceRouter.get('/apps/:appId/sync/tier0-openems', async (req: Request, res: Response) => {
  if (!ensureOpenEmsApp(req.params.appId, res)) {
    return;
  }

  const syncConfig = await openEmsSyncManager.getConfig(req.params.appId);
  sendSuccess(res, syncConfig);
});

appMarketplaceRouter.put('/apps/:appId/sync/tier0-openems', async (req: Request, res: Response) => {
  if (!ensureOpenEmsApp(req.params.appId, res)) {
    return;
  }

  try {
    const syncConfig = await openEmsSyncManager.upsertConfig(req.params.appId, req.body as Tier0ToOpenEmsSyncInput);
    sendSuccess(res, syncConfig);
  } catch (error: any) {
    sendFailure(res, error?.message || 'Failed to save Tier0 to OpenEMS sync config');
  }
});

appMarketplaceRouter.post('/apps/:appId/sync/tier0-openems/run', async (req: Request, res: Response) => {
  if (!ensureOpenEmsApp(req.params.appId, res)) {
    return;
  }

  try {
    const result = await openEmsSyncManager.runNow(req.params.appId);
    sendSuccess(res, result);
  } catch (error: any) {
    sendFailure(res, error?.message || 'Tier0 to OpenEMS sync run failed');
  }
});

appMarketplaceRouter.post('/deploy', async (req: Request, res: Response) => {
  const payload = req.body as DeployPayload;
  if (payload.appId !== 'openems') {
    sendFailure(res, 'Unsupported app', 400);
    return;
  }

  const normalizedParams = normalizeOpenEmsParams(payload.params);
  const launchUrl = getLaunchUrl(req, normalizedParams);
  const draftRecord: DeploymentRecord = {
    appId: payload.appId,
    version: payload.version,
    params: normalizedParams,
    composeYaml: buildOpenEmsComposeYaml(normalizedParams),
    deploymentSpec: payload.deploymentSpec,
    status: 'install',
    launchUrl,
  };

  await writeDeployment(draftRecord);

  try {
    const result = await runDockerCompose(payload.appId);
    await enableOpenEmsRestApi(
      payload.params.edgeContainerName || 'openems_edge',
      payload.params.edgeRestPort || '8084'
    );
    await ensureOpenEmsSimulatorProfile(payload.params);
    const finalRecord: DeploymentRecord = {
      ...draftRecord,
      status: 'open',
      deployedAt: new Date().toISOString(),
      lastError: '',
    };
    await writeDeployment(finalRecord);
    await openEmsSyncManager.refresh(payload.appId);
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
  if (!ensureOpenEmsApp(req.params.appId, res)) {
    return;
  }

  const deployment = await reconcileDeploymentState(await readDeployment(req.params.appId));
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
  if (!ensureOpenEmsApp(req.params.appId, res)) {
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
    await openEmsSyncManager.disable(req.params.appId);
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
