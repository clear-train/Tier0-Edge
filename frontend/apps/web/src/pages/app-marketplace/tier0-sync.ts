import type {
  OpenEmsTargetType,
  Tier0OpenEmsFormMapping,
  Tier0OpenEmsSyncFormValues,
  Tier0SourceType,
  SyncValueType,
} from './types';
import type { Tier0ToOpenEmsSyncConfig, Tier0ToOpenEmsSyncPayload } from '@/apis/inter-api/app-marketplace';

const createDefaultMapping = (): Tier0OpenEmsFormMapping => ({
  name: 'Tier0 -> OpenEMS',
  enabled: true,
  tier0BaseUrl: 'http://kong:8000',
  tier0MqttUrl: 'mqtt://emqx:1883',
  tier0SourceType: 'alias',
  tier0SourceValue: '',
  tier0Field: 'value',
  openemsTargetType: 'channel',
  openemsComponentId: 'simulateConsumption',
  openemsChannelId: 'Data',
  openemsUsername: 'admin',
  openemsPassword: 'admin',
  valueType: 'number',
  pollIntervalMs: '5000',
  scale: '1',
  offset: '0',
});

export const createDefaultTier0SyncValues = (): Tier0OpenEmsSyncFormValues => ({
  syncEnabled: false,
  syncMappings: [createDefaultMapping()],
});

export const toTier0SyncFormValues = (config?: Tier0ToOpenEmsSyncConfig | null): Tier0OpenEmsSyncFormValues => {
  if (!config) {
    return createDefaultTier0SyncValues();
  }

  return {
    syncEnabled: Boolean(config.enabled),
    syncMappings: config.mappings.length
      ? config.mappings.map((mapping) => ({
          id: mapping.id,
          name: mapping.name,
          enabled: Boolean(mapping.enabled),
          tier0BaseUrl: mapping.tier0BaseUrl,
          tier0MqttUrl: mapping.tier0MqttUrl,
          tier0SourceType: mapping.tier0SourceType as Tier0SourceType,
          tier0SourceValue: mapping.tier0SourceValue,
          tier0Field: mapping.tier0Field,
          openemsTargetType: (mapping.openemsTargetType || 'channel') as OpenEmsTargetType,
          openemsComponentId: mapping.openemsComponentId,
          openemsChannelId: mapping.openemsChannelId,
          openemsUsername: mapping.openemsUsername,
          openemsPassword: mapping.openemsPassword,
          valueType: mapping.valueType as SyncValueType,
          pollIntervalMs: String(mapping.pollIntervalMs),
          scale: String(mapping.scale),
          offset: String(mapping.offset),
          lastValue: mapping.lastValue,
          lastSyncedAt: mapping.lastSyncedAt,
          lastError: mapping.lastError,
        }))
      : [createDefaultMapping()],
  };
};

export const buildTier0SyncPayload = (
  values: Partial<Tier0OpenEmsSyncFormValues> | undefined
): Tier0ToOpenEmsSyncPayload => {
  const mappings = (values?.syncMappings || [])
    .map((mapping) => ({
      id: mapping.id,
      name: mapping.name?.trim() || 'Tier0 -> OpenEMS',
      enabled: mapping.enabled !== false,
      tier0BaseUrl: mapping.tier0BaseUrl?.trim() || 'http://kong:8000',
      tier0MqttUrl: mapping.tier0MqttUrl?.trim() || 'mqtt://emqx:1883',
      tier0SourceType: (mapping.tier0SourceType || 'alias') as Tier0SourceType,
      tier0SourceValue: mapping.tier0SourceValue?.trim() || '',
      tier0Field: mapping.tier0Field?.trim() || 'value',
      openemsTargetType: (mapping.openemsTargetType || 'channel') as OpenEmsTargetType,
      openemsComponentId: mapping.openemsComponentId?.trim() || '',
      openemsChannelId: mapping.openemsChannelId?.trim() || '',
      openemsUsername: mapping.openemsUsername?.trim() || 'admin',
      openemsPassword: mapping.openemsPassword?.trim() || 'admin',
      valueType: (mapping.valueType || 'number') as SyncValueType,
      pollIntervalMs: mapping.pollIntervalMs?.trim() || '5000',
      scale: mapping.scale?.trim() || '1',
      offset: mapping.offset?.trim() || '0',
    }))
    .filter((mapping) => {
      return mapping.tier0SourceValue || mapping.openemsComponentId || mapping.openemsChannelId;
    });

  return {
    enabled: Boolean(values?.syncEnabled),
    mappings,
  };
};
