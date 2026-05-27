export type AppStatus = 'install' | 'open';
export type AppDeployFieldType = 'text' | 'number' | 'select';
export type Tier0SourceType = 'alias' | 'path';
export type SyncValueType = 'number' | 'boolean' | 'string';
export type OpenEmsTargetType = 'channel' | 'config-property';
export type Isa95TopicCategory = 'State' | 'Action' | 'Metric';

export interface AppDeployField {
  key: string;
  label: string;
  labelKey?: string;
  placeholder: string;
  placeholderKey?: string;
  type?: AppDeployFieldType;
  defaultValue?: string;
  required?: boolean;
  options?: Array<{
    label: string;
    labelKey?: string;
    value: string;
  }>;
}

export interface MarketplaceApp {
  id: string;
  name: string;
  nameKey?: string;
  description: string;
  descriptionKey?: string;
  version: string;
  status: AppStatus;
  docsUrl?: string;
  launchUrl?: string;
  deployFields: AppDeployField[];
  syncTemplate?: Tier0OpenEmsSyncFormValues;
  sync?: MarketplaceAppSyncSummary;
}

export interface Tier0OpenEmsFormMapping {
  id?: string;
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
  pollIntervalMs: string;
  scale: string;
  offset: string;
  lastValue?: string | number | boolean | null;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface OpenEmsTier0FeedbackFormMapping {
  id?: string;
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
  pollIntervalMs: string;
  scale: string;
  offset: string;
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

export interface Tier0OpenEmsSyncFormValues {
  syncEnabled: boolean;
  syncMappings: Tier0OpenEmsFormMapping[];
  feedbackEnabled: boolean;
  feedbackMappings: OpenEmsTier0FeedbackFormMapping[];
}

export interface MarketplaceAppSyncSummary {
  direction: 'bidirectional';
  enabled: boolean;
  mappingCount: number;
  enabledMappingCount: number;
  feedbackEnabled?: boolean;
  feedbackMappingCount?: number;
  feedbackEnabledMappingCount?: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
}
