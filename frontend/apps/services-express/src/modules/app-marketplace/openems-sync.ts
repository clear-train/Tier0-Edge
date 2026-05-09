import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mqtt, { type MqttClient } from 'mqtt';
import { getAppDir, getSyncFilePath, getSyncHistoryFilePath, readDeployment, type DeploymentRecord } from './runtime';

export type Tier0SourceType = 'alias' | 'path';
export type SyncValueType = 'number' | 'boolean' | 'string';
export type OpenEmsTargetType = 'channel' | 'config-property';
export type Isa95TopicCategory = 'State' | 'Action' | 'Metric';

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

export interface OpenEmsToTier0Mapping {
  id: string;
  name: string;
  enabled: boolean;
  tier0MqttUrl: string;
  tier0TargetTopic: string;
  tier0PayloadField: string;
  openemsSourceType: OpenEmsTargetType;
  openemsComponentId: string;
  openemsChannelId: string;
  openemsUsername: string;
  openemsPassword: string;
  valueType: SyncValueType;
  pollIntervalMs: number;
  scale: number;
  offset: number;
  isa95Enterprise: string;
  isa95Site: string;
  isa95Area: string;
  isa95Line: string;
  isa95Cell: string;
  isa95Asset: string;
  isa95Category: Isa95TopicCategory;
  isa95Tag: string;
  lastValue?: string | number | boolean | null;
  lastSyncedAt?: string;
  lastError?: string;
  lastSourceValue?: string | number | boolean | null;
}

export interface Tier0ToOpenEmsSyncConfig {
  appId: string;
  direction: 'bidirectional';
  enabled: boolean;
  mappings: Tier0ToOpenEmsMapping[];
  feedbackEnabled: boolean;
  feedbackMappings: OpenEmsToTier0Mapping[];
  updatedAt?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastSourceValue?: string | number | boolean | null;
}

export interface Tier0ToOpenEmsSyncInput {
  enabled?: boolean;
  mappings?: Array<Partial<Tier0ToOpenEmsMapping>>;
  feedbackEnabled?: boolean;
  feedbackMappings?: Array<Partial<OpenEmsToTier0Mapping>>;
}

export interface Tier0ToOpenEmsRunResult {
  mappingId: string;
  mappingName: string;
  direction: 'tier0-to-openems' | 'openems-to-tier0';
  status: 'success' | 'error' | 'skipped';
  sourceValue?: unknown;
  targetValue?: string | number | boolean;
  targetTopic?: string;
  syncedAt: string;
  message: string;
}

export interface OpenEmsFeedbackHistoryPoint {
  mappingId: string;
  mappingName: string;
  tag: string;
  topic: string;
  channel: string;
  value: string | number | boolean;
  sourceValue: string | number | boolean;
  unit?: string;
  openemsType?: string;
  description?: string;
  timestamp: number;
  syncedAt: string;
}

export interface Tier0AuthContext {
  token?: string;
  cookie?: string;
}

interface Tier0UnsNodeRef {
  alias?: string;
  path?: string;
}

interface OpenEmsFeedbackSnapshot {
  value: unknown;
  address?: string;
  type?: string;
  unit?: string;
  text?: string;
}

const DEFAULT_TIER0_BASE_URL = 'http://kong:8000';
const DEFAULT_TIER0_MQTT_URL = 'mqtt://emqx:1883';
const DEFAULT_OPENEMS_USERNAME = 'admin';
const DEFAULT_OPENEMS_PASSWORD = 'admin';
const DEFAULT_OPENEMS_REST_USERNAME = 'x';
const DEFAULT_OPENEMS_REST_PASSWORD = 'user';
const DEFAULT_TIER0_OPEN_API_KEY = '4174348a-9222-4e81-b33e-5d72d2fd7f1e';
const DEFAULT_TIER0_POSTGRES_CONTAINER = 'postgresql';
const DEFAULT_TIER0_POSTGRES_USER = 'postgres';
const DEFAULT_TIER0_POSTGRES_PASSWORD = 'postgres';
const DEFAULT_TIER0_POSTGRES_DATABASE = 'postgres';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_SCALE = 1;
const DEFAULT_OFFSET = 0;
const DEFAULT_HISTORY_LIMIT = 5000;
const DEFAULT_ISA95_ENTERPRISE = 'V1';
const DEFAULT_ISA95_SITE = 'Tier0Site';
const DEFAULT_ISA95_AREA = 'EnergyArea';
const DEFAULT_ISA95_LINE = 'OpenEMSLine';
const DEFAULT_ISA95_CELL = 'EdgeCell';
const DEFAULT_ISA95_ASSET = 'OpenEMS';
const DEFAULT_ISA95_CATEGORY: Isa95TopicCategory = 'State';
const DEFAULT_ISA95_TAG = 'meter0ActivePower';
const TIER0_UNS_INTERNAL_BASE_URL = DEFAULT_TIER0_BASE_URL;
const execFileAsync = promisify(execFile);
const TIER0_TOPIC_TYPE_MAP: Record<Isa95TopicCategory, number> = {
  State: 1,
  Action: 2,
  Metric: 3,
};
const DEFAULT_OPENEMS_FEEDBACK_SOURCES = [
  {
    key: 'meter-active-power',
    name: 'OpenEMS Meter Active Power',
    openemsComponentId: 'meter0',
    openemsChannelId: 'ActivePower',
    isa95Tag: 'meter0ActivePower',
  },
  {
    key: 'grid-active-power',
    name: 'OpenEMS Grid Active Power',
    openemsComponentId: '_sum',
    openemsChannelId: 'GridActivePower',
    isa95Tag: 'gridActivePower',
  },
  {
    key: 'consumption-active-power',
    name: 'OpenEMS Consumption Active Power',
    openemsComponentId: '_sum',
    openemsChannelId: 'ConsumptionActivePower',
    isa95Tag: 'consumptionActivePower',
  },
  {
    key: 'production-active-power',
    name: 'OpenEMS Production Active Power',
    openemsComponentId: '_sum',
    openemsChannelId: 'ProductionActivePower',
    isa95Tag: 'productionActivePower',
  },
  {
    key: 'ess-active-power',
    name: 'OpenEMS ESS Active Power',
    openemsComponentId: '_sum',
    openemsChannelId: 'EssActivePower',
    isa95Tag: 'essActivePower',
  },
  {
    key: 'ess-soc',
    name: 'OpenEMS ESS SoC',
    openemsComponentId: '_sum',
    openemsChannelId: 'EssSoc',
    isa95Tag: 'essSoc',
  },
  {
    key: 'grid-buy-active-energy',
    name: 'OpenEMS Grid Buy Active Energy',
    openemsComponentId: '_sum',
    openemsChannelId: 'GridBuyActiveEnergy',
    isa95Tag: 'gridBuyActiveEnergy',
  },
  {
    key: 'grid-sell-active-energy',
    name: 'OpenEMS Grid Sell Active Energy',
    openemsComponentId: '_sum',
    openemsChannelId: 'GridSellActiveEnergy',
    isa95Tag: 'gridSellActiveEnergy',
  },
  {
    key: 'consumption-active-energy',
    name: 'OpenEMS Consumption Active Energy',
    openemsComponentId: '_sum',
    openemsChannelId: 'ConsumptionActiveEnergy',
    isa95Tag: 'consumptionActiveEnergy',
  },
  {
    key: 'production-active-energy',
    name: 'OpenEMS Production Active Energy',
    openemsComponentId: '_sum',
    openemsChannelId: 'ProductionActiveEnergy',
    isa95Tag: 'productionActiveEnergy',
  },
  {
    key: 'ess-dc-charge-energy',
    name: 'OpenEMS ESS DC Charge Energy',
    openemsComponentId: '_sum',
    openemsChannelId: 'EssDcChargeEnergy',
    isa95Tag: 'essDcChargeEnergy',
  },
  {
    key: 'ess-dc-discharge-energy',
    name: 'OpenEMS ESS DC Discharge Energy',
    openemsComponentId: '_sum',
    openemsChannelId: 'EssDcDischargeEnergy',
    isa95Tag: 'essDcDischargeEnergy',
  },
  {
    key: 'grid-mode',
    name: 'OpenEMS Grid Mode',
    openemsComponentId: '_sum',
    openemsChannelId: 'GridMode',
    isa95Tag: 'gridMode',
  },
  {
    key: 'system-state',
    name: 'OpenEMS System State',
    openemsComponentId: '_sum',
    openemsChannelId: 'State',
    isa95Tag: 'systemState',
  },
];
const GENERATED_FEEDBACK_CATEGORIES: Isa95TopicCategory[] = ['State', 'Metric'];
const DEFAULT_FEEDBACK_CATEGORIES: Isa95TopicCategory[] = ['State'];

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

const normalizeTopicPath = (value: unknown, fallback = '') =>
  normalizeString(value, fallback)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');

const normalizeTopicSegment = (value: unknown, fallback: string) =>
  normalizeString(value, fallback)
    .replace(/^\/+|\/+$/g, '')
    .replace(/[/#+\s]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;

const escapeSqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

const isIsa95Category = (value: unknown): value is Isa95TopicCategory =>
  value === 'State' || value === 'Action' || value === 'Metric';

const findIsa95CategoryIndex = (segments: string[]) => {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (isIsa95Category(segments[index])) {
      return index;
    }
  }
  return -1;
};

const normalizeLegacyIsa95Topic = (topic: string) => {
  const segments = normalizeTopicPath(topic).split('/').filter(Boolean);
  if (!segments.length) {
    return '';
  }
  if (segments.length === 8 && isIsa95Category(segments[6])) {
    return segments.join('/');
  }
  if (segments.length === 8 && isIsa95Category(segments[0]) && findIsa95CategoryIndex(segments.slice(1)) === -1) {
    return [...segments.slice(1, 7), segments[0], segments[7]].join('/');
  }
  return normalizeTopicPath(topic);
};

const isLegacyDefaultFeedbackMapping = (mapping: Partial<OpenEmsToTier0Mapping>) => {
  const targetTopic = normalizeTopicPath(mapping.tier0TargetTopic || '');
  return (
    normalizeString(mapping.openemsComponentId, 'meter0') === 'meter0' &&
    normalizeString(mapping.openemsChannelId, 'ActivePower') === 'ActivePower' &&
    (targetTopic === 'V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/Metric/consumption' ||
      targetTopic === 'Metric/V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/consumption' ||
      targetTopic === 'State/V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/consumption' ||
      normalizeString(mapping.isa95Tag, '') === 'consumption')
  );
};

const buildDefaultFeedbackId = (
  source: (typeof DEFAULT_OPENEMS_FEEDBACK_SOURCES)[number],
  category: Isa95TopicCategory
) => `feedback-openems-${category.toLowerCase()}-${source.key}`;

const defaultFeedbackTopic = (
  source: (typeof DEFAULT_OPENEMS_FEEDBACK_SOURCES)[number],
  category: Isa95TopicCategory
) =>
  [
    DEFAULT_ISA95_ENTERPRISE,
    DEFAULT_ISA95_SITE,
    DEFAULT_ISA95_AREA,
    DEFAULT_ISA95_LINE,
    DEFAULT_ISA95_CELL,
    DEFAULT_ISA95_ASSET,
    category,
    source.isa95Tag,
  ].join('/');

const sameFeedbackChannel = (
  mapping: Partial<OpenEmsToTier0Mapping>,
  source: (typeof DEFAULT_OPENEMS_FEEDBACK_SOURCES)[number],
  category: Isa95TopicCategory
) =>
  normalizeString(mapping.openemsComponentId, '') === source.openemsComponentId &&
  normalizeString(mapping.openemsChannelId, '') === source.openemsChannelId &&
  (isIsa95Category(mapping.isa95Category) ? mapping.isa95Category : DEFAULT_ISA95_CATEGORY) === category;

const isGeneratedDefaultFeedbackMapping = (mapping: Partial<OpenEmsToTier0Mapping>) =>
  DEFAULT_OPENEMS_FEEDBACK_SOURCES.some((source) =>
    GENERATED_FEEDBACK_CATEGORIES.some(
      (category) =>
        mapping.id === buildDefaultFeedbackId(source, category) || sameFeedbackChannel(mapping, source, category)
    )
  );

const isDeprecatedGeneratedFeedbackMapping = (mapping: Partial<OpenEmsToTier0Mapping>) =>
  DEFAULT_OPENEMS_FEEDBACK_SOURCES.some((source) =>
    GENERATED_FEEDBACK_CATEGORIES.filter((category) => !DEFAULT_FEEDBACK_CATEGORIES.includes(category)).some(
      (category) =>
        mapping.id === buildDefaultFeedbackId(source, category) || sameFeedbackChannel(mapping, source, category)
    )
  );

const createDefaultFeedbackMapping = (
  source: (typeof DEFAULT_OPENEMS_FEEDBACK_SOURCES)[number],
  category: Isa95TopicCategory = DEFAULT_ISA95_CATEGORY,
  existing?: Partial<OpenEmsToTier0Mapping>
): OpenEmsToTier0Mapping => {
  const id = buildDefaultFeedbackId(source, category);
  const matchesExisting = existing ? sameFeedbackChannel(existing, source, category) || existing.id === id : false;

  return {
    id,
    name: `${source.name} ${category}`,
    enabled: existing?.enabled ?? true,
    tier0MqttUrl: normalizeString(existing?.tier0MqttUrl, DEFAULT_TIER0_MQTT_URL),
    tier0TargetTopic: defaultFeedbackTopic(source, category),
    tier0PayloadField: normalizeString(existing?.tier0PayloadField, 'value'),
    openemsSourceType: 'channel',
    openemsComponentId: source.openemsComponentId,
    openemsChannelId: source.openemsChannelId,
    openemsUsername: normalizeString(existing?.openemsUsername, DEFAULT_OPENEMS_REST_USERNAME),
    openemsPassword: normalizeString(existing?.openemsPassword, DEFAULT_OPENEMS_REST_PASSWORD),
    valueType: existing?.valueType === 'boolean' || existing?.valueType === 'string' ? existing.valueType : 'number',
    pollIntervalMs: toPositiveInteger(existing?.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS),
    scale: toNumber(existing?.scale, DEFAULT_SCALE),
    offset: toNumber(existing?.offset, DEFAULT_OFFSET),
    isa95Enterprise: DEFAULT_ISA95_ENTERPRISE,
    isa95Site: DEFAULT_ISA95_SITE,
    isa95Area: DEFAULT_ISA95_AREA,
    isa95Line: DEFAULT_ISA95_LINE,
    isa95Cell: DEFAULT_ISA95_CELL,
    isa95Asset: DEFAULT_ISA95_ASSET,
    isa95Category: category,
    isa95Tag: source.isa95Tag,
    lastValue: matchesExisting ? existing?.lastValue : undefined,
    lastSyncedAt: matchesExisting ? existing?.lastSyncedAt : undefined,
    lastError: matchesExisting ? existing?.lastError : undefined,
    lastSourceValue: matchesExisting ? existing?.lastSourceValue : undefined,
  };
};

const normalizeCustomFeedbackMappingForRead = (
  mapping: Partial<OpenEmsToTier0Mapping>,
  index: number
): OpenEmsToTier0Mapping => {
  const isa95Category = isIsa95Category(mapping.isa95Category) ? mapping.isa95Category : DEFAULT_ISA95_CATEGORY;
  const normalized: OpenEmsToTier0Mapping = {
    id: normalizeString(mapping.id, `feedback-custom-${index + 1}`),
    name: normalizeString(mapping.name, `OpenEMS -> Tier0 ${index + 1}`),
    enabled: mapping.enabled ?? true,
    tier0MqttUrl: normalizeString(mapping.tier0MqttUrl, DEFAULT_TIER0_MQTT_URL),
    tier0TargetTopic: normalizeLegacyIsa95Topic(normalizeTopicPath(mapping.tier0TargetTopic || '')),
    tier0PayloadField: normalizeString(mapping.tier0PayloadField, 'value'),
    openemsSourceType:
      mapping.openemsSourceType === 'channel' || mapping.openemsSourceType === 'config-property'
        ? mapping.openemsSourceType
        : 'channel',
    openemsComponentId: normalizeString(mapping.openemsComponentId, 'meter0'),
    openemsChannelId: normalizeString(mapping.openemsChannelId, 'ActivePower'),
    openemsUsername: normalizeString(mapping.openemsUsername, DEFAULT_OPENEMS_REST_USERNAME),
    openemsPassword: normalizeString(mapping.openemsPassword, DEFAULT_OPENEMS_REST_PASSWORD),
    valueType: mapping.valueType === 'boolean' || mapping.valueType === 'string' ? mapping.valueType : 'number',
    pollIntervalMs: toPositiveInteger(mapping.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS),
    scale: toNumber(mapping.scale, DEFAULT_SCALE),
    offset: toNumber(mapping.offset, DEFAULT_OFFSET),
    isa95Enterprise: normalizeTopicSegment(mapping.isa95Enterprise, DEFAULT_ISA95_ENTERPRISE),
    isa95Site: normalizeTopicSegment(mapping.isa95Site, DEFAULT_ISA95_SITE),
    isa95Area: normalizeTopicSegment(mapping.isa95Area, DEFAULT_ISA95_AREA),
    isa95Line: normalizeTopicSegment(mapping.isa95Line, DEFAULT_ISA95_LINE),
    isa95Cell: normalizeTopicSegment(mapping.isa95Cell, DEFAULT_ISA95_CELL),
    isa95Asset: normalizeTopicSegment(mapping.isa95Asset, DEFAULT_ISA95_ASSET),
    isa95Category,
    isa95Tag: normalizeTopicSegment(mapping.isa95Tag, DEFAULT_ISA95_TAG),
    lastValue: mapping.lastValue,
    lastSyncedAt: mapping.lastSyncedAt,
    lastError: mapping.lastError,
    lastSourceValue: mapping.lastSourceValue,
  };

  return {
    ...normalized,
    tier0TargetTopic:
      normalized.tier0TargetTopic ||
      defaultFeedbackTopic(
        {
          key: normalized.id,
          name: normalized.name,
          openemsComponentId: normalized.openemsComponentId,
          openemsChannelId: normalized.openemsChannelId,
          isa95Tag: normalized.isa95Tag,
        },
        normalized.isa95Category
      ),
  };
};

const createDefaultFeedbackMappings = (
  existingMappings: Array<Partial<OpenEmsToTier0Mapping>> = []
): OpenEmsToTier0Mapping[] => {
  const defaults: OpenEmsToTier0Mapping[] = [];
  const usedExistingIndexes = new Set<number>();

  for (const source of DEFAULT_OPENEMS_FEEDBACK_SOURCES) {
    for (const category of DEFAULT_FEEDBACK_CATEGORIES) {
      const id = buildDefaultFeedbackId(source, category);
      const existingIndex = existingMappings.findIndex((mapping, index) => {
        if (usedExistingIndexes.has(index)) {
          return false;
        }
        return mapping.id === id || sameFeedbackChannel(mapping, source, category);
      });
      const existing = existingIndex >= 0 ? existingMappings[existingIndex] : undefined;
      if (existingIndex >= 0) {
        usedExistingIndexes.add(existingIndex);
      }
      defaults.push(createDefaultFeedbackMapping(source, category, existing));
    }
  }

  const customMappings = existingMappings
    .filter((mapping, index) => {
      if (usedExistingIndexes.has(index)) {
        return false;
      }
      if (isLegacyDefaultFeedbackMapping(mapping)) {
        return false;
      }
      if (isGeneratedDefaultFeedbackMapping(mapping)) {
        return false;
      }
      return Boolean(mapping.openemsComponentId || mapping.openemsChannelId || mapping.tier0TargetTopic);
    })
    .map((mapping, index) => normalizeCustomFeedbackMappingForRead(mapping, defaults.length + index + 1));

  return [...defaults, ...customMappings];
};

const normalizeFeedbackMappingsForRead = (mappings: Array<Partial<OpenEmsToTier0Mapping>>) => {
  if (mappings.length === 1 && isLegacyDefaultFeedbackMapping(mappings[0])) {
    return createDefaultFeedbackMappings(mappings);
  }

  const normalized = mappings.map((mapping) => ({
    ...mapping,
    isa95Category: isIsa95Category(mapping.isa95Category) ? mapping.isa95Category : DEFAULT_ISA95_CATEGORY,
    tier0TargetTopic: normalizeLegacyIsa95Topic(mapping.tier0TargetTopic || ''),
  }));

  return createDefaultFeedbackMappings(normalized);
};

const stableAlias = (path: string) => {
  const normalizedPath = normalizeTopicPath(path);
  const hash = createHash('sha1').update(normalizedPath).digest('hex').slice(0, 20);
  const suffix = normalizedPath.split('/').pop() || 'topic';
  const safeSuffix = normalizeTopicSegment(suffix, 'topic').slice(0, 38);
  return `_openems_${safeSuffix}_${hash}`;
};

const defaultConfig = (appId: string): Tier0ToOpenEmsSyncConfig => ({
  appId,
  direction: 'bidirectional',
  enabled: false,
  mappings: [],
  feedbackEnabled: false,
  feedbackMappings: createDefaultFeedbackMappings(),
});

const withConfigDefaults = (config: Partial<Tier0ToOpenEmsSyncConfig> | null | undefined, appId: string) => ({
  ...defaultConfig(appId),
  ...(config || {}),
  appId,
  direction: 'bidirectional' as const,
  mappings: Array.isArray(config?.mappings) ? config.mappings : [],
  feedbackMappings:
    Array.isArray(config?.feedbackMappings) && config.feedbackMappings.length
      ? normalizeFeedbackMappingsForRead(config.feedbackMappings)
      : createDefaultFeedbackMappings(),
  feedbackEnabled: Boolean(config?.feedbackEnabled),
});

const getOpenEmsBaseUrl = (deployment: DeploymentRecord) => {
  const restPort = deployment.params.edgeRestPort || '8084';
  const internalHost = deployment.params.edgeServiceName || deployment.params.edgeContainerName || 'openems-edge';
  return `http://${internalHost}:${restPort}`;
};

const getOpenEmsRestBaseUrl = (deployment: DeploymentRecord) => `${getOpenEmsBaseUrl(deployment)}/rest`;

const extractFirstJsonObject = (content: string) => {
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return null;
};

const parseSyncConfig = (content: string, appId: string) => {
  try {
    return withConfigDefaults(JSON.parse(content) as Partial<Tier0ToOpenEmsSyncConfig>, appId);
  } catch (error: any) {
    const recoveredContent = extractFirstJsonObject(content);
    if (recoveredContent && recoveredContent !== content.trim()) {
      try {
        console.warn('[app-marketplace] Recovered OpenEMS sync config from trailing invalid content', {
          appId,
          error: error?.message,
        });
        return withConfigDefaults(JSON.parse(recoveredContent) as Partial<Tier0ToOpenEmsSyncConfig>, appId);
      } catch (recoveryError: any) {
        console.error('[app-marketplace] Failed to recover OpenEMS sync config', {
          appId,
          error: recoveryError?.message,
        });
      }
    }

    console.error('[app-marketplace] Failed to parse OpenEMS sync config; using defaults', {
      appId,
      error: error?.message,
    });
    return defaultConfig(appId);
  }
};

class OpenEmsSyncManager {
  private clients = new Map<string, MqttClient>();
  private feedbackTimers = new Map<string, ReturnType<typeof setInterval>>();
  private running = new Set<string>();
  private lastTriggeredAt = new Map<string, number>();
  private historyWrites = new Map<string, Promise<void>>();

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
    const syncFile = getSyncFilePath(config.appId);
    const tempFile = `${syncFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tempFile, JSON.stringify(config, null, 2), 'utf-8');
    await rename(tempFile, syncFile);
  }

  private async readFeedbackHistoryFile(appId: string): Promise<OpenEmsFeedbackHistoryPoint[]> {
    const historyFile = getSyncHistoryFilePath(appId);
    if (!existsSync(historyFile)) {
      return [];
    }

    try {
      const content = await readFile(historyFile, 'utf-8');
      const history = JSON.parse(content) as OpenEmsFeedbackHistoryPoint[];
      return Array.isArray(history) ? history : [];
    } catch (error: any) {
      console.warn('[app-marketplace] Failed to read OpenEMS feedback history', {
        appId,
        message: error?.message || String(error),
      });
      return [];
    }
  }

  private async writeFeedbackHistoryFile(appId: string, history: OpenEmsFeedbackHistoryPoint[]) {
    await mkdir(getAppDir(appId), { recursive: true });
    const historyFile = getSyncHistoryFilePath(appId);
    const tempFile = `${historyFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tempFile, JSON.stringify(history.slice(-DEFAULT_HISTORY_LIMIT), null, 2), 'utf-8');
    await rename(tempFile, historyFile);
  }

  private async appendFeedbackHistory(appId: string, point: OpenEmsFeedbackHistoryPoint) {
    const previousWrite = this.historyWrites.get(appId) || Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(async () => {
        const history = await this.readFeedbackHistoryFile(appId);
        history.push(point);
        await this.writeFeedbackHistoryFile(appId, history);
      });

    this.historyWrites.set(appId, nextWrite);
    try {
      await nextWrite;
    } finally {
      if (this.historyWrites.get(appId) === nextWrite) {
        this.historyWrites.delete(appId);
      }
    }
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

    for (const [key, timer] of this.feedbackTimers.entries()) {
      if (!key.startsWith(`${appId}:`)) {
        continue;
      }
      clearInterval(timer);
      this.feedbackTimers.delete(key);
      this.lastTriggeredAt.delete(key);
    }
  }

  private normalizeConfig(appId: string, input: Tier0ToOpenEmsSyncInput, current: Tier0ToOpenEmsSyncConfig) {
    const mappingById = new Map(current.mappings.map((mapping) => [mapping.id, mapping]));
    const mappings = (input.mappings ?? current.mappings).map((mapping, index) => {
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
        lastSourceValue: existing?.lastSourceValue,
      } satisfies Tier0ToOpenEmsMapping;
    });

    const feedbackById = new Map(current.feedbackMappings.map((mapping) => [mapping.id, mapping]));
    const rawFeedbackMappings = (input.feedbackMappings ?? current.feedbackMappings).filter(
      (mapping) => !isDeprecatedGeneratedFeedbackMapping(mapping)
    );
    const feedbackMappings = rawFeedbackMappings.map((mapping, index) => {
      const existing = mapping.id ? feedbackById.get(mapping.id) : undefined;
      const id = normalizeString(mapping.id, existing?.id || `feedback-${Date.now()}-${index + 1}`);
      const isa95Category =
        mapping.isa95Category === 'State' || mapping.isa95Category === 'Action' || mapping.isa95Category === 'Metric'
          ? mapping.isa95Category
          : existing?.isa95Category || DEFAULT_ISA95_CATEGORY;
      const normalizedMapping = {
        id,
        name: normalizeString(mapping.name, existing?.name || `OpenEMS -> Tier0 ${index + 1}`),
        enabled: mapping.enabled ?? existing?.enabled ?? true,
        tier0MqttUrl: normalizeString(mapping.tier0MqttUrl, existing?.tier0MqttUrl || DEFAULT_TIER0_MQTT_URL),
        tier0TargetTopic: normalizeLegacyIsa95Topic(
          normalizeTopicPath(mapping.tier0TargetTopic, existing?.tier0TargetTopic || '')
        ),
        tier0PayloadField: normalizeString(mapping.tier0PayloadField, existing?.tier0PayloadField || 'value'),
        openemsSourceType:
          mapping.openemsSourceType === 'channel' || mapping.openemsSourceType === 'config-property'
            ? mapping.openemsSourceType
            : existing?.openemsSourceType || 'channel',
        openemsComponentId: normalizeString(mapping.openemsComponentId, existing?.openemsComponentId || 'meter0'),
        openemsChannelId: normalizeString(mapping.openemsChannelId, existing?.openemsChannelId || 'ActivePower'),
        openemsUsername: normalizeString(
          mapping.openemsUsername,
          existing?.openemsUsername || DEFAULT_OPENEMS_REST_USERNAME
        ),
        openemsPassword: normalizeString(
          mapping.openemsPassword,
          existing?.openemsPassword || DEFAULT_OPENEMS_REST_PASSWORD
        ),
        valueType:
          mapping.valueType === 'boolean' || mapping.valueType === 'string'
            ? mapping.valueType
            : existing?.valueType || 'number',
        pollIntervalMs: toPositiveInteger(mapping.pollIntervalMs, existing?.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS),
        scale: toNumber(mapping.scale, existing?.scale ?? DEFAULT_SCALE),
        offset: toNumber(mapping.offset, existing?.offset ?? DEFAULT_OFFSET),
        isa95Enterprise: normalizeTopicSegment(
          mapping.isa95Enterprise,
          existing?.isa95Enterprise || DEFAULT_ISA95_ENTERPRISE
        ),
        isa95Site: normalizeTopicSegment(mapping.isa95Site, existing?.isa95Site || DEFAULT_ISA95_SITE),
        isa95Area: normalizeTopicSegment(mapping.isa95Area, existing?.isa95Area || DEFAULT_ISA95_AREA),
        isa95Line: normalizeTopicSegment(mapping.isa95Line, existing?.isa95Line || DEFAULT_ISA95_LINE),
        isa95Cell: normalizeTopicSegment(mapping.isa95Cell, existing?.isa95Cell || DEFAULT_ISA95_CELL),
        isa95Asset: normalizeTopicSegment(mapping.isa95Asset, existing?.isa95Asset || DEFAULT_ISA95_ASSET),
        isa95Category,
        isa95Tag: normalizeTopicSegment(mapping.isa95Tag, existing?.isa95Tag || DEFAULT_ISA95_TAG),
        lastValue: existing?.lastValue,
        lastSyncedAt: existing?.lastSyncedAt,
        lastError: existing?.lastError,
        lastSourceValue: existing?.lastSourceValue,
      } satisfies OpenEmsToTier0Mapping;

      return {
        ...normalizedMapping,
        tier0TargetTopic: normalizedMapping.tier0TargetTopic || this.buildIsa95Topic(normalizedMapping),
      };
    });

    return {
      ...current,
      appId,
      direction: 'bidirectional' as const,
      enabled: input.enabled ?? current.enabled,
      mappings,
      feedbackEnabled: input.feedbackEnabled ?? current.feedbackEnabled,
      feedbackMappings,
      updatedAt: new Date().toISOString(),
    } satisfies Tier0ToOpenEmsSyncConfig;
  }

  private async resolveTier0TopicFromLocalMetadata(alias: string) {
    const container = normalizeString(process.env.TIER0_POSTGRES_CONTAINER, DEFAULT_TIER0_POSTGRES_CONTAINER);
    const user = normalizeString(process.env.TIER0_POSTGRES_USER, DEFAULT_TIER0_POSTGRES_USER);
    const password = normalizeString(
      process.env.TIER0_POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD,
      DEFAULT_TIER0_POSTGRES_PASSWORD
    );
    const database = normalizeString(process.env.TIER0_POSTGRES_DATABASE, DEFAULT_TIER0_POSTGRES_DATABASE);
    const query = `select path from supos.uns_namespace where alias = ${escapeSqlLiteral(alias)} limit 1;`;

    const result = await execFileAsync(
      'docker',
      ['exec', '-e', `PGPASSWORD=${password}`, container, 'psql', '-U', user, '-d', database, '-t', '-A', '-c', query],
      { timeout: 15000 }
    );
    const topic = normalizeTopicPath(result.stdout.split(/\r?\n/).find((line) => line.trim()) || '');
    if (!topic) {
      throw new Error(`Tier0 alias [${alias}] was not found in local UNS metadata`);
    }
    return topic;
  }

  private async resolveTier0TopicFromOpenApi(mapping: Tier0ToOpenEmsMapping) {
    const apiKey = normalizeString(
      process.env.TIER0_OPEN_API_KEY || process.env.SUPOS_OPEN_API_KEY,
      DEFAULT_TIER0_OPEN_API_KEY
    );
    const requestUrl = new URL(
      `/open-api/uns/file/${encodeURIComponent(mapping.tier0SourceValue)}`,
      `${mapping.tier0BaseUrl}/`
    );
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
        apikey: apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Tier0 UNS alias lookup failed with ${response.status}`);
    }

    const payload = await this.parseTier0JsonResponse(response, 'Tier0 UNS alias lookup');
    const topic = normalizeTopicPath(payload?.data?.path || '');
    if (!topic) {
      throw new Error(`Unable to resolve MQTT topic from alias [${mapping.tier0SourceValue}]`);
    }

    return topic;
  }

  private async fetchTier0Topic(mapping: Tier0ToOpenEmsMapping) {
    if (mapping.tier0SourceType === 'path') {
      return normalizeTopicPath(mapping.tier0SourceValue);
    }

    const alias = normalizeString(mapping.tier0SourceValue, '');
    if (!alias) {
      throw new Error('Tier0 source alias is empty');
    }

    const errors: string[] = [];
    try {
      return await this.resolveTier0TopicFromLocalMetadata(alias);
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }

    try {
      return await this.resolveTier0TopicFromOpenApi(mapping);
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }

    throw new Error(`Unable to resolve Tier0 alias [${alias}] to MQTT topic: ${errors.join('; ')}`);
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
        direction: 'tier0-to-openems',
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
        direction: 'tier0-to-openems',
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
    if (!config.enabled && !config.feedbackEnabled) {
      return;
    }

    const deployment = await readDeployment(appId);
    if (!deployment || deployment.status !== 'open') {
      return;
    }

    if (config.enabled) {
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
              await this.persistRunResult(appId, mapping.id, {
                mappingId: mapping.id,
                mappingName: mapping.name,
                direction: 'tier0-to-openems',
                status: error ? 'error' : 'skipped',
                syncedAt: new Date().toISOString(),
                message: error?.message || `Subscribed MQTT topic [${topic}]`,
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
              direction: 'tier0-to-openems',
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
            direction: 'tier0-to-openems',
            status: 'error',
            syncedAt: new Date().toISOString(),
            message: error?.message || 'Failed to initialize MQTT sync mapping',
          });
        }
      }
    }

    if (config.feedbackEnabled) {
      const enabledFeedbackMappings = config.feedbackMappings.filter((mapping) => mapping.enabled);
      enabledFeedbackMappings.forEach((mapping, index) => {
        if (!mapping.enabled) {
          return;
        }
        const timerKey = `${appId}:feedback:${mapping.id}`;
        const initialDelayMs = Math.floor(
          (mapping.pollIntervalMs / Math.max(enabledFeedbackMappings.length, 1)) * index
        );
        const initialTimer = setTimeout(() => {
          void this.runFeedbackSingle(appId, mapping.id);
          this.feedbackTimers.set(
            timerKey,
            setInterval(() => void this.runFeedbackSingle(appId, mapping.id), mapping.pollIntervalMs)
          );
        }, initialDelayMs);
        this.feedbackTimers.set(timerKey, initialTimer);
      });
    }
  }

  private buildIsa95Topic(mapping: OpenEmsToTier0Mapping) {
    return [
      mapping.isa95Enterprise,
      mapping.isa95Site,
      mapping.isa95Area,
      mapping.isa95Line,
      mapping.isa95Cell,
      mapping.isa95Asset,
      mapping.isa95Category,
      mapping.isa95Tag,
    ]
      .map((item, index) =>
        normalizeTopicSegment(
          item,
          [
            DEFAULT_ISA95_ENTERPRISE,
            DEFAULT_ISA95_SITE,
            DEFAULT_ISA95_AREA,
            DEFAULT_ISA95_LINE,
            DEFAULT_ISA95_CELL,
            DEFAULT_ISA95_ASSET,
            DEFAULT_ISA95_CATEGORY,
            DEFAULT_ISA95_TAG,
          ][index]
        )
      )
      .join('/');
  }

  private buildTier0FeedbackPayload(
    mapping: OpenEmsToTier0Mapping,
    targetValue: string | number | boolean,
    source?: OpenEmsFeedbackSnapshot
  ) {
    const valueField = normalizeTopicSegment(mapping.tier0PayloadField, 'value');
    const value =
      mapping.isa95Category === 'Metric' && typeof targetValue === 'number' ? String(targetValue) : targetValue;
    const timestamp = Date.now();
    const payload: Record<string, unknown> = {
      [valueField]: value,
      timeStamp: timestamp,
      updatedAt: new Date(timestamp).toISOString(),
    };

    if (mapping.isa95Category === 'Metric') {
      payload.quality = 0;
    } else {
      payload.source = 'OpenEMS';
      payload.metadata = {
        channel: source?.address || `${mapping.openemsComponentId}/${mapping.openemsChannelId}`,
        openemsType: source?.type || mapping.valueType,
        unit: source?.unit || undefined,
        description: source?.text || undefined,
      };
    }

    return payload;
  }

  private buildTier0FeedbackFields(mapping: OpenEmsToTier0Mapping) {
    const valueType =
      mapping.valueType === 'boolean' ? 'BOOLEAN' : mapping.valueType === 'string' ? 'STRING' : 'DOUBLE';
    const valueField = normalizeTopicSegment(mapping.tier0PayloadField, 'value');
    return [{ name: valueField, type: valueType }];
  }

  private buildTier0AuthHeaders(auth?: Tier0AuthContext) {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    };

    if (auth?.token) {
      headers['X-Sa-Token'] = auth.token;
    }
    if (auth?.cookie) {
      headers.Cookie = auth.cookie;
    }

    return headers;
  }

  private async parseTier0UnsResponse(response: Response, operation: string) {
    const payload = await this.parseTier0JsonResponse(response, operation);
    if (payload?.code && payload.code !== 200 && payload.code !== 206) {
      throw new Error(payload?.msg || `${operation} failed`);
    }
    return payload;
  }

  private collectTier0UnsNodes(value: unknown, nodes = new Map<string, Tier0UnsNodeRef>()) {
    if (!value) {
      return nodes;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => this.collectTier0UnsNodes(item, nodes));
      return nodes;
    }

    if (typeof value !== 'object') {
      return nodes;
    }

    const node = value as Record<string, any>;
    const path = normalizeTopicPath(node.path || node.topic || node.namespace || node.pathName || '');
    const alias = normalizeString(node.alias, '');
    if (path && alias) {
      nodes.set(path, { alias, path });
    }

    this.collectTier0UnsNodes(node.children, nodes);
    this.collectTier0UnsNodes(node.data, nodes);
    this.collectTier0UnsNodes(node.list, nodes);
    this.collectTier0UnsNodes(node.records, nodes);

    return nodes;
  }

  private async fetchTier0UnsNodeMap(auth?: Tier0AuthContext) {
    if (!auth?.token && !auth?.cookie) {
      return new Map<string, Tier0UnsNodeRef>();
    }

    try {
      const response = await fetch(`${TIER0_UNS_INTERNAL_BASE_URL}/inter-api/supos/uns/search`, {
        headers: this.buildTier0AuthHeaders(auth),
      });
      if (!response.ok) {
        console.warn('[app-marketplace] Tier0 UNS search failed', {
          status: response.status,
          statusText: response.statusText,
        });
        return new Map<string, Tier0UnsNodeRef>();
      }
      const payload = await this.parseTier0UnsResponse(response, 'Tier0 UNS search');
      return this.collectTier0UnsNodes(payload);
    } catch (error: any) {
      console.warn('[app-marketplace] Tier0 UNS search failed', {
        message: error?.message || String(error),
      });
      return new Map<string, Tier0UnsNodeRef>();
    }
  }

  private buildTier0BatchNodes(
    mapping: OpenEmsToTier0Mapping,
    topic: string,
    existingNodes = new Map<string, Tier0UnsNodeRef>()
  ) {
    const topicSegments = normalizeTopicPath(topic).split('/').filter(Boolean);
    if (!topicSegments.length) {
      throw new Error('Tier0 target topic is empty');
    }

    const categoryIndex = findIsa95CategoryIndex(topicSegments);
    const category = categoryIndex >= 0 ? (topicSegments[categoryIndex] as Isa95TopicCategory) : mapping.isa95Category;
    const parentDataType = TIER0_TOPIC_TYPE_MAP[category] || TIER0_TOPIC_TYPE_MAP.Metric;
    const categoryIsTerminalParent = categoryIndex === topicSegments.length - 2;
    const segments = categoryIsTerminalParent
      ? topicSegments.filter((_, index) => index !== categoryIndex)
      : topicSegments;

    const getVisiblePath = (index: number) => {
      const pathSegments = segments.slice(0, index + 1);
      if (categoryIsTerminalParent && index === segments.length - 1) {
        return [...segments.slice(0, -1), category, segments[segments.length - 1]].join('/');
      }
      return pathSegments.join('/');
    };

    return segments
      .map((segment, index) => {
        const currentPath = segments.slice(0, index + 1).join('/');
        const parentPath = segments.slice(0, index).join('/');
        const isLeaf = index === segments.length - 1;
        const visiblePath = getVisiblePath(index);
        const existingNode = existingNodes.get(visiblePath) || existingNodes.get(currentPath);
        if (existingNode?.alias) {
          return null;
        }
        const parentAlias = parentPath ? existingNodes.get(parentPath)?.alias || stableAlias(parentPath) : undefined;

        if (!isLeaf) {
          return {
            name: segment,
            alias: stableAlias(visiblePath),
            parentAlias,
            pathType: 0,
          };
        }

        return {
          name: segment,
          alias: stableAlias(visiblePath),
          parentAlias,
          pathType: 2,
          dataType: parentDataType === TIER0_TOPIC_TYPE_MAP.Metric ? 1 : 8,
          parentDataType,
          save2db: true,
          fields: parentDataType === TIER0_TOPIC_TYPE_MAP.Metric ? this.buildTier0FeedbackFields(mapping) : undefined,
        };
      })
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }

  private async ensureTier0FeedbackTopic(mapping: OpenEmsToTier0Mapping, topic: string, auth?: Tier0AuthContext) {
    if (!auth?.token && !auth?.cookie) {
      return;
    }

    const existingNodes = await this.fetchTier0UnsNodeMap(auth);
    const nodes = this.buildTier0BatchNodes(mapping, topic, existingNodes);
    if (!nodes.length) {
      return;
    }

    console.info('[app-marketplace] Provisioning Tier0 feedback topic', {
      topic,
      nodeCount: nodes.length,
      baseUrl: TIER0_UNS_INTERNAL_BASE_URL,
    });

    const response = await fetch(`${TIER0_UNS_INTERNAL_BASE_URL}/inter-api/supos/uns/batch`, {
      method: 'POST',
      headers: this.buildTier0AuthHeaders(auth),
      // Match the Tier0 UNS reverse-import API used by the native UI.
      body: JSON.stringify({ list: nodes }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[app-marketplace] Tier0 UNS topic provisioning failed', {
        topic,
        status: response.status,
        statusText: response.statusText,
        body,
        nodes,
      });
      throw new Error(body || `Tier0 UNS topic provisioning failed with ${response.status}`);
    }

    const payload = await this.parseTier0UnsResponse(response, 'Tier0 UNS topic provisioning');
    if (payload?.code === 206 && payload?.data && Object.keys(payload.data).length > 0) {
      console.error('[app-marketplace] Tier0 UNS topic provisioning returned partial errors', {
        topic,
        data: payload.data,
        nodes,
      });
      throw new Error(`Tier0 UNS topic provisioning returned partial errors: ${JSON.stringify(payload.data)}`);
    }

    console.info('[app-marketplace] Tier0 feedback topic provisioned', {
      topic,
      code: payload?.code,
      message: payload?.msg,
    });
  }

  private async ensureTier0FeedbackTopics(config: Tier0ToOpenEmsSyncConfig, auth?: Tier0AuthContext) {
    if (!config.feedbackEnabled || (!auth?.token && !auth?.cookie)) {
      return;
    }

    for (const mapping of config.feedbackMappings) {
      if (!mapping.enabled) {
        continue;
      }
      const targetTopic = normalizeTopicPath(mapping.tier0TargetTopic) || this.buildIsa95Topic(mapping);
      await this.ensureTier0FeedbackTopic(mapping, targetTopic, auth);
    }
  }

  private parseOpenEmsJsonRpcPayload(payload: { error?: { message?: string }; result?: any } | null) {
    if (payload?.error?.message) {
      throw new Error(payload.error.message);
    }
    return payload?.result;
  }

  private extractOpenEmsChannelValue(payload: any, componentId: string, channelId: string) {
    if (payload === null || payload === undefined) {
      return undefined;
    }

    if (typeof payload !== 'object') {
      return payload;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'value')) {
      return payload.value;
    }
    if (payload.data && Object.prototype.hasOwnProperty.call(payload.data, 'value')) {
      return payload.data.value;
    }
    if (payload.result && Object.prototype.hasOwnProperty.call(payload.result, 'value')) {
      return payload.result.value;
    }

    const slashKey = `${componentId}/${channelId}`;
    const dotKey = `${componentId}.${channelId}`;
    if (Object.prototype.hasOwnProperty.call(payload, slashKey)) {
      return payload[slashKey];
    }
    if (Object.prototype.hasOwnProperty.call(payload, dotKey)) {
      return payload[dotKey];
    }
    if (payload.data && Object.prototype.hasOwnProperty.call(payload.data, slashKey)) {
      return payload.data[slashKey];
    }
    if (payload.data && Object.prototype.hasOwnProperty.call(payload.data, dotKey)) {
      return payload.data[dotKey];
    }

    return undefined;
  }

  private async readOpenEmsValue(
    deployment: DeploymentRecord,
    mapping: OpenEmsToTier0Mapping
  ): Promise<OpenEmsFeedbackSnapshot> {
    const authValue = Buffer.from(`${mapping.openemsUsername}:${mapping.openemsPassword}`).toString('base64');

    if (mapping.openemsSourceType === 'config-property') {
      const response = await fetch(`${getOpenEmsBaseUrl(deployment)}/jsonrpc`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authValue}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify({
          method: 'getEdgeConfig',
          params: {},
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `OpenEMS JSON-RPC read failed with ${response.status}`);
      }

      const edgeConfig = this.parseOpenEmsJsonRpcPayload(
        (await response.json().catch(() => null)) as { error?: { message?: string }; result?: any } | null
      );
      const value = edgeConfig?.components?.[mapping.openemsComponentId]?.properties?.[mapping.openemsChannelId];
      return {
        value,
        address: `${mapping.openemsComponentId}.${mapping.openemsChannelId}`,
        type: typeof value,
      };
    }

    const response = await fetch(
      `${getOpenEmsRestBaseUrl(deployment)}/channel/${encodeURIComponent(mapping.openemsComponentId)}/${encodeURIComponent(
        mapping.openemsChannelId
      )}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authValue}`,
          Accept: 'application/json, text/plain, */*',
        },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `OpenEMS REST read failed with ${response.status}`);
    }

    const rawText = await response.text();
    let payload: any = rawText;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }

    const value = this.extractOpenEmsChannelValue(payload, mapping.openemsComponentId, mapping.openemsChannelId);
    return {
      value,
      address: payload?.address || `${mapping.openemsComponentId}/${mapping.openemsChannelId}`,
      type: payload?.type,
      unit: payload?.unit,
      text: payload?.text,
    };
  }

  private async publishMqtt(topicUrl: string, topic: string, payload: Record<string, unknown>) {
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(topicUrl, {
        clean: true,
        connectTimeout: 10_000,
        reconnectPeriod: 0,
        clientId: `openems-tier0-${Math.random().toString(16).slice(2, 10)}`,
      });
      let settled = false;
      const done = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        client.end(true);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      client.on('connect', () => {
        client.publish(topic, JSON.stringify(payload), { qos: 1, retain: true }, (error) => {
          done(error || undefined);
        });
      });
      client.on('error', (error) => done(error));
      client.on('close', () => {
        if (!settled) {
          done(new Error(`MQTT connection closed before publishing [${topic}]`));
        }
      });
    });
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

  private coerceValue(
    value: unknown,
    mapping: Pick<Tier0ToOpenEmsMapping | OpenEmsToTier0Mapping, 'valueType' | 'scale' | 'offset'>
  ) {
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

  private async fetchTier0Value(mapping: Tier0ToOpenEmsMapping, auth?: Tier0AuthContext) {
    const requestUrl = new URL('/inter-api/supos/uns/getLastMsg', `${mapping.tier0BaseUrl}/`);
    requestUrl.searchParams.set(mapping.tier0SourceType, mapping.tier0SourceValue);

    const response = await fetch(requestUrl, {
      headers: this.buildTier0AuthHeaders(auth),
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

  private async persistFeedbackRunResult(appId: string, mappingId: string, result: Tier0ToOpenEmsRunResult) {
    const config = await this.readConfig(appId);
    const nextMappings = config.feedbackMappings.map((mapping) => {
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
      feedbackMappings: nextMappings,
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

  async getFeedbackHistory(appId: string, limit = 240) {
    const normalizedLimit = Math.max(
      1,
      Math.min(Number.isFinite(limit) ? Math.floor(limit) : 240, DEFAULT_HISTORY_LIMIT)
    );
    const history = await this.readFeedbackHistoryFile(appId);
    return history.slice(-normalizedLimit);
  }

  async upsertConfig(appId: string, input: Tier0ToOpenEmsSyncInput, auth?: Tier0AuthContext) {
    const current = await this.readConfig(appId);
    const nextConfig = this.normalizeConfig(appId, input, current);
    await this.ensureTier0FeedbackTopics(nextConfig, auth);
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
      feedbackEnabled: false,
      updatedAt: new Date().toISOString(),
    } satisfies Tier0ToOpenEmsSyncConfig;

    this.stopAppClients(appId);
    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async runFeedbackSingle(appId: string, mappingId: string, auth?: Tier0AuthContext): Promise<Tier0ToOpenEmsRunResult> {
    const runKey = `${appId}:feedback:${mappingId}`;
    if (this.running.has(runKey)) {
      return {
        mappingId,
        mappingName: mappingId,
        direction: 'openems-to-tier0',
        status: 'skipped',
        syncedAt: new Date().toISOString(),
        message: 'Feedback sync is already running for this mapping',
      };
    }

    this.running.add(runKey);
    try {
      const config = await this.readConfig(appId);
      const mapping = config.feedbackMappings.find((item) => item.id === mappingId);
      if (!mapping) {
        throw new Error('Feedback mapping not found');
      }
      if (!config.feedbackEnabled || !mapping.enabled) {
        return {
          mappingId,
          mappingName: mapping.name,
          direction: 'openems-to-tier0',
          status: 'skipped',
          syncedAt: new Date().toISOString(),
          message: 'OpenEMS to Tier0 feedback sync is disabled',
        };
      }

      const deployment = await readDeployment(appId);
      if (!deployment || deployment.status !== 'open') {
        throw new Error('OpenEMS has not been deployed or is not running');
      }

      const source = await this.readOpenEmsValue(deployment, mapping);
      const sourceValue = source.value;
      if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
        const targetTopic = normalizeTopicPath(mapping.tier0TargetTopic) || this.buildIsa95Topic(mapping);
        const result: Tier0ToOpenEmsRunResult = {
          mappingId: mapping.id,
          mappingName: mapping.name,
          direction: 'openems-to-tier0',
          status: 'skipped',
          sourceValue,
          targetTopic,
          syncedAt: new Date().toISOString(),
          message: `OpenEMS channel [${mapping.openemsComponentId}/${mapping.openemsChannelId}] has no current value`,
        };
        await this.persistFeedbackRunResult(appId, mapping.id, result);
        return result;
      }
      const targetValue = this.coerceValue(sourceValue, mapping);
      const targetTopic = normalizeTopicPath(mapping.tier0TargetTopic) || this.buildIsa95Topic(mapping);
      const syncedAt = new Date().toISOString();
      const payload = this.buildTier0FeedbackPayload(mapping, targetValue, source);
      await this.ensureTier0FeedbackTopic(mapping, targetTopic, auth);
      await this.publishMqtt(mapping.tier0MqttUrl, targetTopic, payload);
      await this.appendFeedbackHistory(appId, {
        mappingId: mapping.id,
        mappingName: mapping.name,
        tag: mapping.isa95Tag,
        topic: targetTopic,
        channel: source.address || `${mapping.openemsComponentId}/${mapping.openemsChannelId}`,
        value: targetValue,
        sourceValue: sourceValue as string | number | boolean,
        unit: source.unit,
        openemsType: source.type,
        description: source.text,
        timestamp: Date.now(),
        syncedAt,
      }).catch((error: any) => {
        console.warn('[app-marketplace] Failed to append OpenEMS feedback history', {
          appId,
          mappingId: mapping.id,
          message: error?.message || String(error),
        });
      });

      const result: Tier0ToOpenEmsRunResult = {
        mappingId: mapping.id,
        mappingName: mapping.name,
        direction: 'openems-to-tier0',
        status: 'success',
        sourceValue,
        targetValue,
        targetTopic,
        syncedAt,
        message: `${mapping.openemsComponentId}/${mapping.openemsChannelId} -> ${targetTopic}`,
      };

      await this.persistFeedbackRunResult(appId, mapping.id, result);
      return result;
    } catch (error: any) {
      const config = await this.readConfig(appId);
      const mapping = config.feedbackMappings.find((item) => item.id === mappingId);
      const result: Tier0ToOpenEmsRunResult = {
        mappingId,
        mappingName: mapping?.name || mappingId,
        direction: 'openems-to-tier0',
        status: 'error',
        syncedAt: new Date().toISOString(),
        message: error?.message || 'OpenEMS to Tier0 feedback sync failed',
      };
      await this.persistFeedbackRunResult(appId, mappingId, result);
      return result;
    } finally {
      this.running.delete(runKey);
    }
  }

  async runSingle(appId: string, mappingId: string, auth?: Tier0AuthContext): Promise<Tier0ToOpenEmsRunResult> {
    const runKey = `${appId}:${mappingId}`;
    if (this.running.has(runKey)) {
      return {
        mappingId,
        mappingName: mappingId,
        direction: 'tier0-to-openems',
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
          direction: 'tier0-to-openems',
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
        sourceValue = await this.fetchTier0Value(mapping, auth);
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
        direction: 'tier0-to-openems',
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
      if (error?.message?.includes('has no current value')) {
        const result: Tier0ToOpenEmsRunResult = {
          mappingId,
          mappingName: mapping?.name || mappingId,
          direction: 'tier0-to-openems',
          status: 'skipped',
          syncedAt: new Date().toISOString(),
          message: error.message,
        };
        await this.persistRunResult(appId, mappingId, result);
        return result;
      }

      const result: Tier0ToOpenEmsRunResult = {
        mappingId,
        mappingName: mapping?.name || mappingId,
        direction: 'tier0-to-openems',
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

  async runNow(appId: string, auth?: Tier0AuthContext) {
    const config = await this.readConfig(appId);
    if (!config.enabled && !config.feedbackEnabled) {
      throw new Error('OpenEMS sync is disabled');
    }

    const enabledMappings = config.enabled ? config.mappings.filter((mapping) => mapping.enabled) : [];
    const enabledFeedbackMappings = config.feedbackEnabled
      ? config.feedbackMappings.filter((mapping) => mapping.enabled)
      : [];
    if (!enabledMappings.length && !enabledFeedbackMappings.length) {
      throw new Error('No enabled OpenEMS sync mappings found');
    }

    const results: Tier0ToOpenEmsRunResult[] = [];
    for (const mapping of enabledMappings) {
      results.push(await this.runSingle(appId, mapping.id, auth));
    }
    for (const mapping of enabledFeedbackMappings) {
      results.push(await this.runFeedbackSingle(appId, mapping.id, auth));
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
      feedbackEnabled: config.feedbackEnabled,
      feedbackMappingCount: config.feedbackMappings.length,
      feedbackEnabledMappingCount: config.feedbackMappings.filter((mapping) => mapping.enabled).length,
      lastRunAt: config.lastRunAt,
      lastSuccessAt: config.lastSuccessAt,
      lastError: config.lastError,
    };
  }
}

export const openEmsSyncManager = new OpenEmsSyncManager();
