export type AppStatus = 'install' | 'open';
export type AppDeployFieldType = 'text' | 'number' | 'select';
export type Tier0SourceType = 'alias' | 'path';
export type SyncValueType = 'number' | 'boolean' | 'string';
export type OpenEmsTargetType = 'channel' | 'config-property';

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

export interface Tier0OpenEmsSyncFormValues {
  syncEnabled: boolean;
  syncMappings: Tier0OpenEmsFormMapping[];
}

export interface MarketplaceAppSyncSummary {
  direction: 'tier0-to-openems';
  enabled: boolean;
  mappingCount: number;
  enabledMappingCount: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
}
