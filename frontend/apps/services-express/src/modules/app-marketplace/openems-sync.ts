import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mqtt, { type MqttClient } from 'mqtt';
import { getAppDir, getSyncFilePath, readDeployment, type DeploymentRecord } from './runtime';

export type Tier0SourceType = 'alias' | 'path';
export type SyncValueType = 'number' | 'boolean' | 'string';
export type OpenEmsTargetType = 'channel' | 'config-property';

export interface Tier0ToOpenEmsMapping {
  id: string;
  name: string;
  enabled: boolean;
  tier0BaseUrl: string;
  tier0MqttUrl: string;
  tier0SourceType: Tier0SourceType;
  tier0SourceValue: string;
  tier0Field: string;
  openemsTargetType: OpenEmsTargetType;
  openemsComponentId: string;
  openemsChannelId: string;
  openemsUsername: string;
  openemsPassword: string;
  valueType: SyncValueType;
  pollIntervalMs: number;
  scale: number;
  offset: number;
  lastValue?: string | number | boolean | null;
  lastSyncedAt?: string;
  lastError?: string;
  lastSourceValue?: string | number | boolean | null;
}

export interface Tier0ToOpenEmsSyncConfig {
  appId: string;
  direction: 'tier0-to-openems';
  enabled: boolean;
  mappings: Tier0ToOpenEmsMapping[];
  updatedAt?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastSourceValue?: string | number | boolean | null;
}

export interface Tier0ToOpenEmsSyncInput {
  enabled?: boolean;
  mappings?: Array<Partial<Tier0ToOpenEmsMapping>>;
}

export interface Tier0ToOpenEmsRunResult {
  mappingId: string;
  mappingName: string;
  status: 'success' | 'error' | 'skipped';
  sourceValue?: unknown;
  targetValue?: string | number | boolean;
  syncedAt: string;
  message: string;
}

const DEFAULT_TIER0_BASE_URL = 'http://kong:8000';
const DEFAULT_TIER0_MQTT_URL = 'mqtt://emqx:1883';
const DEFAULT_OPENEMS_USERNAME = 'admin';
const DEFAULT_OPENEMS_PASSWORD = 'admin';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_SCALE = 1;
const DEFAULT_OFFSET = 0;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const toPositiveInteger = (value: unknown, fallback: number) => {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) {
    return fallback;
  }
  return Math.round(next);
};

const toNumber = (value: unknown, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizeString = (value: unknown, fallback = '') => {
  const next = String(value ?? '').trim();
  return next || fallback;
};

const defaultConfig = (appId: string): Tier0ToOpenEmsSyncConfig => ({
  appId,
  direction: 'tier0-to-openems',
  enabled: false,
  mappings: [],
});

const getOpenEmsBaseUrl = (deployment: DeploymentRecord) => {
  const restPort = deployment.params.edgeRestPort || '8084';
  const internalHost = deployment.params.edgeServiceName || deployment.params.edgeContainerName || 'openems-edge';
  return `http://${internalHost}:${restPort}`;
};

const getOpenEmsRestBaseUrl = (deployment: DeploymentRecord) => `${getOpenEmsBaseUrl(deployment)}/rest`;

const parseSyncConfig = (content: string, appId: string) => {
  try {
    return JSON.parse(content) as Tier0ToOpenEmsSyncConfig;
  } catch {
    return defaultConfig(appId);
  }
};

class OpenEmsSyncManager {
  private clients = new Map<string, MqttClient>();
  private running = new Set<string>();
  private lastTriggeredAt = new Map<string, number>();

  constructor() {
    this.bootstrapApp('openems');
  }

  private bootstrapApp(appId: string) {
    const syncFile = getSyncFilePath(appId);
    if (!existsSync(syncFile)) {
      return;
    }

    const config = parseSyncConfig(readFileSync(syncFile, 'utf-8'), appId);
    void this.scheduleApp(appId, config);
  }

  private async readConfig(appId: string) {
    const syncFile = getSyncFilePath(appId);
    if (!existsSync(syncFile)) {
      return defaultConfig(appId);
    }

    const content = await readFile(syncFile, 'utf-8');
    return parseSyncConfig(content, appId);
  }

  private async writeConfig(config: Tier0ToOpenEmsSyncConfig) {
    await mkdir(getAppDir(config.appId), { recursive: true });
    await writeFile(getSyncFilePath(config.appId), JSON.stringify(config, null, 2), 'utf-8');
  }

  private stopAppClients(appId: string) {
    for (const [key, client] of this.clients.entries()) {
      if (!key.startsWith(`${appId}:`)) {
        continue;
      }
      client.end(true);
      this.clients.delete(key);
      this.lastTriggeredAt.delete(key);
    }
  }

  private normalizeConfig(appId: string, input: Tier0ToOpenEmsSyncInput, current: Tier0ToOpenEmsSyncConfig) {
    const mappingById = new Map(current.mappings.map((mapping) => [mapping.id, mapping]));
    const mappings = (input.mappings || []).map((mapping, index) => {
      const existing = mapping.id ? mappingById.get(mapping.id) : undefined;
      const id = normalizeString(mapping.id, existing?.id || `mapping-${Date.now()}-${index + 1}`);

      return {
        id,
        name: normalizeString(mapping.name, existing?.name || `Tier0 -> OpenEMS ${index + 1}`),
        enabled: mapping.enabled ?? existing?.enabled ?? true,
        tier0BaseUrl: trimTrailingSlash(
          normalizeString(mapping.tier0BaseUrl, existing?.tier0BaseUrl || DEFAULT_TIER0_BASE_URL)
        ),
        tier0MqttUrl: normalizeString(mapping.tier0MqttUrl, existing?.tier0MqttUrl || DEFAULT_TIER0_MQTT_URL),
        tier0SourceType: mapping.tier0SourceType === 'path' ? 'path' : existing?.tier0SourceType || 'alias',
        tier0SourceValue: normalizeString(mapping.tier0SourceValue, existing?.tier0SourceValue),
        tier0Field: normalizeString(mapping.tier0Field, existing?.tier0Field || 'value'),
        openemsTargetType:
          mapping.openemsTargetType === 'channel' || mapping.openemsTargetType === 'config-property'
            ? mapping.openemsTargetType
            : existing?.openemsTargetType || 'config-property',
        openemsComponentId: normalizeString(mapping.openemsComponentId, existing?.openemsComponentId),
        openemsChannelId: normalizeString(mapping.openemsChannelId, existing?.openemsChannelId),
        openemsUsername: normalizeString(
          mapping.openemsUsername,
          existing?.openemsUsername || DEFAULT_OPENEMS_USERNAME
        ),
        openemsPassword: normalizeString(
          mapping.openemsPassword,
          existing?.openemsPassword || DEFAULT_OPENEMS_PASSWORD
        ),
        valueType:
          mapping.valueType === 'boolean' || mapping.valueType === 'string'
            ? mapping.valueType
            : existing?.valueType || 'number',
        pollIntervalMs: toPositiveInteger(mapping.pollIntervalMs, existing?.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS),
        scale: toNumber(mapping.scale, existing?.scale ?? DEFAULT_SCALE),
        offset: toNumber(mapping.offset, existing?.offset ?? DEFAULT_OFFSET),
        lastValue: existing?.lastValue,
        lastSyncedAt: existing?.lastSyncedAt,
        lastError: existing?.lastError,
      } satisfies Tier0ToOpenEmsMapping;
    });

    return {
      ...current,
      appId,
      direction: 'tier0-to-openems' as const,
      enabled: input.enabled ?? current.enabled,
      mappings,
      updatedAt: new Date().toISOString(),
    } satisfies Tier0ToOpenEmsSyncConfig;
  }

  private async fetchTier0Topic(mapping: Tier0ToOpenEmsMapping) {
    if (mapping.tier0SourceType === 'path') {
      return mapping.tier0SourceValue;
    }

    const requestUrl = new URL(
      `/open-api/uns/file/${encodeURIComponent(mapping.tier0SourceValue)}`,
      `${mapping.tier0BaseUrl}/`
    );
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Tier0 UNS alias lookup failed with ${response.status}`);
    }

    const payload = await this.parseTier0JsonResponse(response, 'Tier0 UNS alias lookup');
    const topic = String(payload?.data?.path || '').trim();
    if (!topic) {
      throw new Error(`Unable to resolve MQTT topic from alias [${mapping.tier0SourceValue}]`);
    }

    return topic;
  }

  private resolveMqttSourceValue(rawPayload: Buffer, field: string) {
    const payloadText = rawPayload.toString('utf-8');

    if (field === '__message') {
      return payloadText;
    }

    let parsed: any = payloadText;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      parsed = payloadText;
    }

    if (field === '__payload') {
      return parsed;
    }

    if (parsed && typeof parsed === 'object') {
      if (Object.prototype.hasOwnProperty.call(parsed, field)) {
        return parsed[field];
      }

      if (parsed.data && typeof parsed.data === 'object' && Object.prototype.hasOwnProperty.call(parsed.data, field)) {
        return parsed.data[field];
      }
    }

    return undefined;
  }

  private async handleMqttMessage(appId: string, mappingId: string, rawPayload: Buffer, topic: string) {
    const runKey = `${appId}:${mappingId}`;
    if (this.running.has(runKey)) {
      return;
    }

    const lastTriggered = this.lastTriggeredAt.get(runKey) || 0;
    const config = await this.readConfig(appId);
    const mapping = config.mappings.find((item) => item.id === mappingId);
    if (!mapping || !config.enabled || !mapping.enabled) {
      return;
    }

    if (Date.now() - lastTriggered < mapping.pollIntervalMs) {
      return;
    }

    this.lastTriggeredAt.set(runKey, Date.now());
    this.running.add(runKey);

    try {
      const deployment = await readDeployment(appId);
      if (!deployment || deployment.status !== 'open') {
        throw new Error('OpenEMS has not been deployed or is not running');
      }

      const sourceValue = this.resolveMqttSourceValue(rawPayload, mapping.tier0Field);
      if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
        throw new Error(`MQTT payload on [${topic}] does not contain field [${mapping.tier0Field}]`);
      }

      const targetValue = this.coerceValue(sourceValue, mapping);
      await this.pushToOpenEms(deployment, mapping, targetValue);

      const result: Tier0ToOpenEmsRunResult = {
        mappingId: mapping.id,
        mappingName: mapping.name,
        status: 'success',
        sourceValue,
        targetValue,
        syncedAt: new Date().toISOString(),
        message:
          mapping.openemsTargetType === 'config-property'
            ? `${topic} -> ${mapping.openemsComponentId}.${mapping.openemsChannelId}`
            : `${topic} -> ${mapping.openemsComponentId}/${mapping.openemsChannelId}`,
      };

      await this.persistRunResult(appId, mapping.id, result);
    } catch (error: any) {
      const result: Tier0ToOpenEmsRunResult = {
        mappingId,
        mappingName: mapping?.name || mappingId,
        status: 'error',
        syncedAt: new Date().toISOString(),
        message: error?.message || `MQTT sync failed for topic [${topic}]`,
      };

      await this.persistRunResult(appId, mappingId, result);
    } finally {
      this.running.delete(runKey);
    }
  }

  private async scheduleApp(appId: string, config: Tier0ToOpenEmsSyncConfig) {
    this.stopAppClients(appId);
    if (!config.enabled) {
      return;
    }

    const deployment = await readDeployment(appId);
    if (!deployment || deployment.status !== 'open') {
      return;
    }

    for (const mapping of config.mappings) {
      if (!mapping.enabled) {
        continue;
      }

      try {
        const clientKey = `${appId}:${mapping.id}`;
        const topic = await this.fetchTier0Topic(mapping);
        const client = mqtt.connect(mapping.tier0MqttUrl, {
          clean: true,
          reconnectPeriod: mapping.pollIntervalMs,
          connectTimeout: 10_000,
          clientId: `tier0-openems-${mapping.id}-${Math.random().toString(16).slice(2, 8)}`,
        });

        client.on('connect', () => {
          client.subscribe(topic, { qos: 1 }, async (error) => {
            if (!error) {
              return;
            }

            await this.persistRunResult(appId, mapping.id, {
              mappingId: mapping.id,
              mappingName: mapping.name,
              status: 'error',
              syncedAt: new Date().toISOString(),
              message: error.message || `Failed to subscribe MQTT topic [${topic}]`,
            });
          });
        });

        client.on('message', (incomingTopic, rawPayload) => {
          if (incomingTopic !== topic) {
            return;
          }

          void this.handleMqttMessage(appId, mapping.id, rawPayload, topic);
        });

        client.on('error', (error) => {
          void this.persistRunResult(appId, mapping.id, {
            mappingId: mapping.id,
            mappingName: mapping.name,
            status: 'error',
            syncedAt: new Date().toISOString(),
            message: error.message || `MQTT connection failed for [${mapping.tier0MqttUrl}]`,
          });
        });

        this.clients.set(clientKey, client);
      } catch (error: any) {
        await this.persistRunResult(appId, mapping.id, {
          mappingId: mapping.id,
          mappingName: mapping.name,
          status: 'error',
          syncedAt: new Date().toISOString(),
          message: error?.message || 'Failed to initialize MQTT sync mapping',
        });
      }
    }
  }

  private async parseTier0JsonResponse(response: Response, operation: string) {
    const rawText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(rawText);
      } catch {
        throw new Error(`${operation} returned invalid JSON`);
      }
    }

    if (/^\s*</.test(rawText)) {
      throw new Error(
        `${operation} returned the Tier0 login page. Run Sync Now needs authenticated UNS API access; live MQTT sync is unaffected.`
      );
    }

    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error(`${operation} returned unsupported response content`);
    }
  }

  private shouldReplayCachedMqttValue(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('login page') || message.includes('authenticated UNS API access');
  }

  private resolveSourceValue(message: any, field: string) {
    if (field === '__payload') {
      return message?.payload;
    }
    if (field === '__message') {
      return message?.msg;
    }
    return message?.data?.[field];
  }

  private coerceValue(value: unknown, mapping: Tier0ToOpenEmsMapping) {
    if (mapping.valueType === 'string') {
      return String(value ?? '');
    }

    if (mapping.valueType === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }

      const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
      if (['true', '1', 'on', 'yes'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'off', 'no'].includes(normalized)) {
        return false;
      }

      throw new Error(`Cannot convert value [${String(value)}] to boolean`);
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`Cannot convert value [${String(value)}] to number`);
    }

    return numericValue * mapping.scale + mapping.offset;
  }

  private async fetchTier0Value(mapping: Tier0ToOpenEmsMapping) {
    const requestUrl = new URL('/inter-api/supos/uns/getLastMsg', `${mapping.tier0BaseUrl}/`);
    requestUrl.searchParams.set(mapping.tier0SourceType, mapping.tier0SourceValue);

    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Tier0 UNS request failed with ${response.status}`);
    }

    const payload = await this.parseTier0JsonResponse(response, 'Tier0 UNS getLastMsg');
    if (payload?.code !== 200) {
      throw new Error(payload?.msg || 'Tier0 UNS request failed');
    }

    const nextValue = this.resolveSourceValue(payload?.data, mapping.tier0Field);
    if (nextValue === undefined || nextValue === null || nextValue === '') {
      throw new Error(`Tier0 field [${mapping.tier0Field}] has no current value`);
    }

    return nextValue;
  }

  private async pushToOpenEms(
    deployment: DeploymentRecord,
    mapping: Tier0ToOpenEmsMapping,
    value: string | number | boolean
  ) {
    const authValue = Buffer.from(`${mapping.openemsUsername}:${mapping.openemsPassword}`).toString('base64');
    const response =
      mapping.openemsTargetType === 'channel'
        ? await fetch(
            `${getOpenEmsRestBaseUrl(deployment)}/channel/${encodeURIComponent(mapping.openemsComponentId)}/${encodeURIComponent(
              mapping.openemsChannelId
            )}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${authValue}`,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
              },
              body: JSON.stringify({ value }),
            }
          )
        : await fetch(`${getOpenEmsBaseUrl(deployment)}/jsonrpc`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authValue}`,
              'Content-Type': 'application/json',
              Accept: 'application/json, text/plain, */*',
            },
            body: JSON.stringify({
              method: 'updateComponentConfig',
              params: {
                componentId: mapping.openemsComponentId,
                properties: [{ name: mapping.openemsChannelId, value }],
              },
            }),
          });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `OpenEMS REST write failed with ${response.status}`);
    }

    if (mapping.openemsTargetType === 'config-property') {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (payload?.error?.message) {
        throw new Error(payload.error.message);
      }
    }
  }

  private async persistRunResult(appId: string, mappingId: string, result: Tier0ToOpenEmsRunResult) {
    const config = await this.readConfig(appId);
    const nextMappings = config.mappings.map((mapping) => {
      if (mapping.id !== mappingId) {
        return mapping;
      }

      return {
        ...mapping,
        lastSyncedAt: result.status === 'success' ? result.syncedAt : mapping.lastSyncedAt,
        lastValue: result.status === 'success' ? (result.targetValue ?? null) : mapping.lastValue,
        lastSourceValue:
          result.status === 'success'
            ? ((result.sourceValue as string | number | boolean | null | undefined) ?? null)
            : mapping.lastSourceValue,
        lastError: result.status === 'error' ? result.message : '',
      };
    });

    const nextConfig: Tier0ToOpenEmsSyncConfig = {
      ...config,
      mappings: nextMappings,
      lastRunAt: result.syncedAt,
      lastSuccessAt: result.status === 'success' ? result.syncedAt : config.lastSuccessAt,
      lastError: result.status === 'error' ? result.message : '',
      updatedAt: new Date().toISOString(),
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async getConfig(appId: string) {
    return this.readConfig(appId);
  }

  async upsertConfig(appId: string, input: Tier0ToOpenEmsSyncInput) {
    const current = await this.readConfig(appId);
    const nextConfig = this.normalizeConfig(appId, input, current);
    await this.writeConfig(nextConfig);
    await this.scheduleApp(appId, nextConfig);
    return nextConfig;
  }

  async refresh(appId: string) {
    const config = await this.readConfig(appId);
    await this.scheduleApp(appId, config);
    return config;
  }

  async disable(appId: string) {
    const current = await this.readConfig(appId);
    const nextConfig = {
      ...current,
      enabled: false,
      updatedAt: new Date().toISOString(),
    } satisfies Tier0ToOpenEmsSyncConfig;

    this.stopAppClients(appId);
    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async runSingle(appId: string, mappingId: string): Promise<Tier0ToOpenEmsRunResult> {
    const runKey = `${appId}:${mappingId}`;
    if (this.running.has(runKey)) {
      return {
        mappingId,
        mappingName: mappingId,
        status: 'skipped',
        syncedAt: new Date().toISOString(),
        message: 'Sync is already running for this mapping',
      };
    }

    this.running.add(runKey);
    try {
      const config = await this.readConfig(appId);
      const mapping = config.mappings.find((item) => item.id === mappingId);
      if (!mapping) {
        throw new Error('Sync mapping not found');
      }
      if (!config.enabled || !mapping.enabled) {
        return {
          mappingId,
          mappingName: mapping.name,
          status: 'skipped',
          syncedAt: new Date().toISOString(),
          message: 'Tier0 to OpenEMS sync is disabled',
        };
      }

      const deployment = await readDeployment(appId);
      if (!deployment || deployment.status !== 'open') {
        throw new Error('OpenEMS has not been deployed or is not running');
      }

      let sourceValue: unknown;
      let replayedCachedValue = false;

      try {
        sourceValue = await this.fetchTier0Value(mapping);
      } catch (error) {
        if (
          this.shouldReplayCachedMqttValue(error) &&
          mapping.lastSourceValue !== undefined &&
          mapping.lastSourceValue !== null
        ) {
          sourceValue = mapping.lastSourceValue;
          replayedCachedValue = true;
        } else {
          throw error;
        }
      }

      const targetValue = this.coerceValue(sourceValue, mapping);
      await this.pushToOpenEms(deployment, mapping, targetValue);

      const result: Tier0ToOpenEmsRunResult = {
        mappingId: mapping.id,
        mappingName: mapping.name,
        status: 'success',
        sourceValue,
        targetValue,
        syncedAt: new Date().toISOString(),
        message: replayedCachedValue
          ? `Replayed cached MQTT value -> ${mapping.openemsTargetType === 'config-property' ? `${mapping.openemsComponentId}.${mapping.openemsChannelId}` : `${mapping.openemsComponentId}/${mapping.openemsChannelId}`}`
          : mapping.openemsTargetType === 'config-property'
            ? `${mapping.tier0SourceType}:${mapping.tier0SourceValue} -> ${mapping.openemsComponentId}.${mapping.openemsChannelId}`
            : `${mapping.tier0SourceType}:${mapping.tier0SourceValue} -> ${mapping.openemsComponentId}/${mapping.openemsChannelId}`,
      };
      await this.persistRunResult(appId, mapping.id, result);
      return result;
    } catch (error: any) {
      const config = await this.readConfig(appId);
      const mapping = config.mappings.find((item) => item.id === mappingId);
      const result: Tier0ToOpenEmsRunResult = {
        mappingId,
        mappingName: mapping?.name || mappingId,
        status: 'error',
        syncedAt: new Date().toISOString(),
        message: error?.message || 'Tier0 to OpenEMS sync failed',
      };
      await this.persistRunResult(appId, mappingId, result);
      return result;
    } finally {
      this.running.delete(runKey);
    }
  }

  async runNow(appId: string) {
    const config = await this.readConfig(appId);
    if (!config.enabled) {
      throw new Error('Tier0 to OpenEMS sync is disabled');
    }

    const enabledMappings = config.mappings.filter((mapping) => mapping.enabled);
    if (!enabledMappings.length) {
      throw new Error('No enabled Tier0 to OpenEMS mappings found');
    }

    const results: Tier0ToOpenEmsRunResult[] = [];
    for (const mapping of enabledMappings) {
      results.push(await this.runSingle(appId, mapping.id));
    }

    return {
      executedAt: new Date().toISOString(),
      results,
      config: await this.readConfig(appId),
    };
  }

  summarize(config: Tier0ToOpenEmsSyncConfig) {
    return {
      direction: config.direction,
      enabled: config.enabled,
      mappingCount: config.mappings.length,
      enabledMappingCount: config.mappings.filter((mapping) => mapping.enabled).length,
      lastRunAt: config.lastRunAt,
      lastSuccessAt: config.lastSuccessAt,
      lastError: config.lastError,
    };
  }
}

export const openEmsSyncManager = new OpenEmsSyncManager();
