export type MarketplaceAppStatus = 'install' | 'open' | 'error';
export type MarketplaceValueType = 'number' | 'boolean' | 'string';
export type MarketplaceIsa95Category = 'State' | 'Action' | 'Metric';

export interface MarketplaceDeployField {
  key: string;
  label: string;
  labelKey?: string;
  type?: 'text' | 'number' | 'select' | 'password';
  placeholder?: string;
  placeholderKey?: string;
  defaultValue?: string;
  required?: boolean;
  options?: Array<{ label: string; labelKey?: string; value: string }>;
}

export interface MarketplaceAppManifest {
  id: string;
  name: string;
  nameKey?: string;
  description: string;
  descriptionKey?: string;
  version: string;
  status?: MarketplaceAppStatus;
  icon?: string;
  docsUrl?: string;
  deployFields: MarketplaceDeployField[];
}

export interface MarketplaceRuntimeContext {
  runtimeRoot: string;
  publicOrigin: string;
  tier0NetworkName: string;
  env: Record<string, string | undefined>;
}

export interface MarketplaceDeploymentPlan {
  appId: string;
  version: string;
  params: Record<string, string>;
  composeYaml?: string;
  deploymentSpec: {
    kind: 'docker-compose' | 'external' | 'custom';
    profile: string;
    services: Array<Record<string, unknown>>;
    networks?: Record<string, unknown>;
  };
  launchUrl?: string;
}

export interface MarketplaceDeploymentRecord extends MarketplaceDeploymentPlan {
  status: MarketplaceAppStatus;
  deployedAt?: string;
  lastError?: string;
}

export interface MarketplaceAppHealth {
  status: 'ok' | 'degraded' | 'down';
  message?: string;
}

export interface MarketplaceDeploymentAdapter<TParams = Record<string, string>> {
  appId: string;
  normalizeParams(input: Record<string, unknown>, context: MarketplaceRuntimeContext): TParams;
  buildDeployment(
    params: TParams,
    context: MarketplaceRuntimeContext
  ): Promise<MarketplaceDeploymentPlan> | MarketplaceDeploymentPlan;
  deploy(plan: MarketplaceDeploymentPlan, context: MarketplaceRuntimeContext): Promise<MarketplaceDeploymentRecord>;
  uninstall(record: MarketplaceDeploymentRecord, context: MarketplaceRuntimeContext): Promise<void>;
  resolveLaunchUrl(record: MarketplaceDeploymentRecord, context: MarketplaceRuntimeContext): string;
  healthCheck?(record: MarketplaceDeploymentRecord, context: MarketplaceRuntimeContext): Promise<MarketplaceAppHealth>;
}

export interface MarketplaceNormalizedValue {
  value: string | number | boolean;
  valueType: MarketplaceValueType;
  unit?: string;
  quality?: 'GOOD' | 'BAD' | 'UNKNOWN';
  timeStamp: string;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceDataEndpoint {
  type: string;
  id: string;
  credentials?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceDataBridgeContext {
  deployment: MarketplaceDeploymentRecord;
  tier0MqttUrl: string;
}

export interface MarketplaceDataAdapter<
  TTarget extends MarketplaceDataEndpoint = MarketplaceDataEndpoint,
  TSource extends MarketplaceDataEndpoint = MarketplaceDataEndpoint,
> {
  appId: string;
  writeValue(
    target: TTarget,
    value: MarketplaceNormalizedValue,
    context: MarketplaceDataBridgeContext
  ): Promise<{ ok: boolean; target: TTarget; writtenValue?: MarketplaceNormalizedValue; message?: string }>;
  readValue(
    source: TSource,
    context: MarketplaceDataBridgeContext
  ): Promise<{ ok: boolean; source: TSource; value?: MarketplaceNormalizedValue; message?: string }>;
  subscribeToAppEvents?(context: MarketplaceDataBridgeContext): AsyncIterable<{
    ok: boolean;
    source: TSource;
    value?: MarketplaceNormalizedValue;
    message?: string;
  }>;
}

export interface MarketplaceIsa95Descriptor {
  enterprise: string;
  site: string;
  area: string;
  line: string;
  cell: string;
  asset: string;
  category: MarketplaceIsa95Category;
  tag: string;
}

export interface MarketplaceTier0ToAppMapping {
  id: string;
  name?: string;
  enabled: boolean;
  tier0MqttUrl: string;
  tier0SourceType: 'alias' | 'path' | 'topic';
  tier0SourceValue: string;
  tier0Field: string;
  target: MarketplaceDataEndpoint;
  valueType: MarketplaceValueType;
  scale?: number;
  offset?: number;
  pollIntervalMs?: number;
}

export interface MarketplaceAppToTier0Mapping {
  id: string;
  name?: string;
  enabled: boolean;
  tier0MqttUrl: string;
  tier0TargetTopic: string;
  tier0PayloadField: string;
  source: MarketplaceDataEndpoint;
  valueType: MarketplaceValueType;
  scale?: number;
  offset?: number;
  pollIntervalMs?: number;
  isa95?: MarketplaceIsa95Descriptor;
}

export interface MarketplaceSyncConfig {
  appId: string;
  enabled: boolean;
  inputMappings: MarketplaceTier0ToAppMapping[];
  feedbackEnabled: boolean;
  feedbackMappings: MarketplaceAppToTier0Mapping[];
}

export interface MarketplaceHistoryPoint {
  appId: string;
  mappingId: string;
  topic: string;
  value: string | number | boolean;
  unit?: string;
  quality?: string;
  timeStamp: string;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceProvider {
  listApps(context: MarketplaceRuntimeContext): Promise<MarketplaceAppManifest[]>;
  getApp(appId: string, context: MarketplaceRuntimeContext): Promise<MarketplaceAppManifest | null>;
  getDeployment(appId: string, context: MarketplaceRuntimeContext): Promise<MarketplaceDeploymentRecord | null>;
  deploy(
    appId: string,
    params: Record<string, unknown>,
    context: MarketplaceRuntimeContext
  ): Promise<MarketplaceDeploymentRecord>;
  uninstall(appId: string, context: MarketplaceRuntimeContext): Promise<void>;
  open(appId: string, context: MarketplaceRuntimeContext): Promise<{ launchUrl: string }>;
  getSyncConfig(appId: string, context: MarketplaceRuntimeContext): Promise<MarketplaceSyncConfig>;
  saveSyncConfig(
    appId: string,
    config: MarketplaceSyncConfig,
    context: MarketplaceRuntimeContext
  ): Promise<MarketplaceSyncConfig>;
  runSync(
    appId: string,
    context: MarketplaceRuntimeContext
  ): Promise<{ ok: boolean; results: Array<Record<string, unknown>> }>;
  getHistory(appId: string, limit: number, context: MarketplaceRuntimeContext): Promise<MarketplaceHistoryPoint[]>;
}

export interface RegisteredMarketplaceApp {
  manifest: MarketplaceAppManifest;
  deploymentAdapter: MarketplaceDeploymentAdapter;
  dataAdapter?: MarketplaceDataAdapter;
}

export interface MarketplaceRegistry {
  register(app: RegisteredMarketplaceApp): void;
  get(appId: string): RegisteredMarketplaceApp | undefined;
  list(): RegisteredMarketplaceApp[];
}
