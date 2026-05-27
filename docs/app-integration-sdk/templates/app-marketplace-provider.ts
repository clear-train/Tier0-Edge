export type AppStatus = 'install' | 'open' | 'error';
export type AppValueType = 'number' | 'boolean' | 'string';
export type Isa95Category = 'State' | 'Action' | 'Metric';

export interface AppDeployField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'password';
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface MarketplaceAppManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  status?: AppStatus;
  icon?: string;
  docsUrl?: string;
  deployFields: AppDeployField[];
}

export interface DeploymentContext {
  runtimeRoot: string;
  publicOrigin: string;
  tier0NetworkName: string;
  env: Record<string, string | undefined>;
}

export interface DeploymentPlan {
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

export interface DeploymentRecord extends DeploymentPlan {
  status: AppStatus;
  deployedAt?: string;
  lastError?: string;
}

export interface AppHealth {
  status: 'ok' | 'degraded' | 'down';
  message?: string;
}

export interface DeploymentAdapter<TParams = Record<string, string>> {
  appId: string;
  normalizeParams(input: Record<string, unknown>, context: DeploymentContext): TParams;
  buildDeployment(params: TParams, context: DeploymentContext): Promise<DeploymentPlan> | DeploymentPlan;
  deploy(plan: DeploymentPlan, context: DeploymentContext): Promise<DeploymentRecord>;
  uninstall(record: DeploymentRecord, context: DeploymentContext): Promise<void>;
  resolveLaunchUrl(record: DeploymentRecord, context: DeploymentContext): string;
  healthCheck?(record: DeploymentRecord, context: DeploymentContext): Promise<AppHealth>;
}

export interface NormalizedValue {
  value: string | number | boolean;
  valueType: AppValueType;
  unit?: string;
  quality?: 'GOOD' | 'BAD' | 'UNKNOWN';
  timeStamp: string;
  metadata?: Record<string, unknown>;
}

export interface AppDataTarget {
  type: string;
  id: string;
  credentials?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AppDataSource {
  type: string;
  id: string;
  credentials?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AppWriteResult {
  ok: boolean;
  target: AppDataTarget;
  writtenValue?: NormalizedValue;
  message?: string;
}

export interface AppReadResult {
  ok: boolean;
  source: AppDataSource;
  value?: NormalizedValue;
  message?: string;
}

export interface DataBridgeContext {
  deployment: DeploymentRecord;
  tier0MqttUrl: string;
  abortSignal?: AbortSignal;
}

export interface AppDataAdapter<TTarget = AppDataTarget, TSource = AppDataSource> {
  appId: string;
  writeValue(target: TTarget, value: NormalizedValue, context: DataBridgeContext): Promise<AppWriteResult>;
  readValue(source: TSource, context: DataBridgeContext): Promise<AppReadResult>;
  subscribeToAppEvents?(context: DataBridgeContext): AsyncIterable<AppReadResult>;
}

export interface Isa95Descriptor {
  enterprise: string;
  site: string;
  area: string;
  line: string;
  cell: string;
  asset: string;
  category: Isa95Category;
  tag: string;
}

export interface Tier0ToAppMapping {
  id: string;
  name?: string;
  enabled: boolean;
  tier0MqttUrl: string;
  tier0SourceType: 'alias' | 'path' | 'topic';
  tier0SourceValue: string;
  tier0Field: string;
  target: AppDataTarget;
  valueType: AppValueType;
  scale?: number;
  offset?: number;
  pollIntervalMs?: number;
}

export interface AppToTier0Mapping {
  id: string;
  name?: string;
  enabled: boolean;
  tier0MqttUrl: string;
  tier0TargetTopic: string;
  tier0PayloadField: string;
  source: AppDataSource;
  valueType: AppValueType;
  scale?: number;
  offset?: number;
  pollIntervalMs?: number;
  isa95?: Isa95Descriptor;
}

export interface MarketplaceSyncConfig {
  appId: string;
  enabled: boolean;
  inputMappings: Tier0ToAppMapping[];
  feedbackEnabled: boolean;
  feedbackMappings: AppToTier0Mapping[];
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

export interface AppMarketplaceProvider {
  listApps(context: DeploymentContext): Promise<MarketplaceAppManifest[]>;
  getApp(appId: string, context: DeploymentContext): Promise<MarketplaceAppManifest | null>;
  getDeployment(appId: string, context: DeploymentContext): Promise<DeploymentRecord | null>;
  deploy(appId: string, params: Record<string, unknown>, context: DeploymentContext): Promise<DeploymentRecord>;
  uninstall(appId: string, context: DeploymentContext): Promise<void>;
  open(appId: string, context: DeploymentContext): Promise<{ launchUrl: string }>;
  getSyncConfig(appId: string, context: DeploymentContext): Promise<MarketplaceSyncConfig>;
  saveSyncConfig(appId: string, config: MarketplaceSyncConfig, context: DeploymentContext): Promise<MarketplaceSyncConfig>;
  runSync(appId: string, context: DeploymentContext): Promise<{ ok: boolean; results: Array<Record<string, unknown>> }>;
  getHistory(appId: string, limit: number, context: DeploymentContext): Promise<MarketplaceHistoryPoint[]>;
}

export interface RegisteredMarketplaceApp {
  manifest: MarketplaceAppManifest;
  deploymentAdapter: DeploymentAdapter;
  dataAdapter?: AppDataAdapter;
}

export interface MarketplaceRegistry {
  register(app: RegisteredMarketplaceApp): void;
  get(appId: string): RegisteredMarketplaceApp | undefined;
  list(): RegisteredMarketplaceApp[];
}
