import type {
  Isa95TopicCategory,
  OpenEmsTier0FeedbackFormMapping,
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

export const buildIsa95Topic = (
  mapping: Pick<
    OpenEmsTier0FeedbackFormMapping,
    | 'isa95Enterprise'
    | 'isa95Site'
    | 'isa95Area'
    | 'isa95Line'
    | 'isa95Cell'
    | 'isa95Asset'
    | 'isa95Category'
    | 'isa95Tag'
  >
) =>
  [
    mapping.isa95Enterprise || 'V1',
    mapping.isa95Site || 'Tier0Site',
    mapping.isa95Area || 'EnergyArea',
    mapping.isa95Line || 'OpenEMSLine',
    mapping.isa95Cell || 'EdgeCell',
    mapping.isa95Asset || 'OpenEMS',
    mapping.isa95Category || 'State',
    mapping.isa95Tag || 'meter0ActivePower',
  ]
    .map((item) =>
      String(item)
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .replace(/[/#+\s]+/g, '_')
    )
    .filter(Boolean)
    .join('/');

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
const DEFAULT_FEEDBACK_CATEGORIES: Isa95TopicCategory[] = ['State'];

const buildDefaultFeedbackId = (
  source: (typeof DEFAULT_OPENEMS_FEEDBACK_SOURCES)[number],
  category: Isa95TopicCategory
) => `feedback-openems-${category.toLowerCase()}-${source.key}`;

const createDefaultFeedbackMapping = (
  overrides: Partial<OpenEmsTier0FeedbackFormMapping> = {},
  category: Isa95TopicCategory = (overrides.isa95Category || 'State') as Isa95TopicCategory
): OpenEmsTier0FeedbackFormMapping => {
  const mapping = {
    id: overrides.id,
    name: overrides.name || 'OpenEMS -> Tier0 State',
    enabled: true,
    tier0MqttUrl: 'mqtt://emqx:1883',
    tier0TargetTopic: '',
    tier0PayloadField: 'value',
    openemsSourceType: 'channel' as OpenEmsTargetType,
    openemsComponentId: overrides.openemsComponentId || 'meter0',
    openemsChannelId: overrides.openemsChannelId || 'ActivePower',
    openemsUsername: 'x',
    openemsPassword: 'user',
    valueType: 'number' as SyncValueType,
    pollIntervalMs: '5000',
    scale: '1',
    offset: '0',
    isa95Enterprise: 'V1',
    isa95Site: 'Tier0Site',
    isa95Area: 'EnergyArea',
    isa95Line: 'OpenEMSLine',
    isa95Cell: 'EdgeCell',
    isa95Asset: 'OpenEMS',
    isa95Category: category,
    isa95Tag: overrides.isa95Tag || 'meter0ActivePower',
    ...overrides,
  };

  return {
    ...mapping,
    tier0TargetTopic: mapping.tier0TargetTopic || buildIsa95Topic(mapping),
  };
};

const createDefaultFeedbackMappings = (): OpenEmsTier0FeedbackFormMapping[] =>
  DEFAULT_OPENEMS_FEEDBACK_SOURCES.flatMap((source) =>
    DEFAULT_FEEDBACK_CATEGORIES.map((category) =>
      createDefaultFeedbackMapping(
        {
          id: buildDefaultFeedbackId(source, category),
          name: `${source.name} ${category}`,
          openemsComponentId: source.openemsComponentId,
          openemsChannelId: source.openemsChannelId,
          isa95Tag: source.isa95Tag,
          isa95Category: category,
        },
        category
      )
    )
  );

export const createDefaultTier0SyncValues = (): Tier0OpenEmsSyncFormValues => ({
  syncEnabled: false,
  syncMappings: [createDefaultMapping()],
  feedbackEnabled: false,
  feedbackMappings: createDefaultFeedbackMappings(),
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
    feedbackEnabled: Boolean(config.feedbackEnabled),
    feedbackMappings: config.feedbackMappings?.length
      ? config.feedbackMappings.map((mapping) => ({
          id: mapping.id,
          name: mapping.name,
          enabled: Boolean(mapping.enabled),
          tier0MqttUrl: mapping.tier0MqttUrl,
          tier0TargetTopic: mapping.tier0TargetTopic,
          tier0PayloadField: mapping.tier0PayloadField,
          openemsSourceType: (mapping.openemsSourceType || 'channel') as OpenEmsTargetType,
          openemsComponentId: mapping.openemsComponentId,
          openemsChannelId: mapping.openemsChannelId,
          openemsUsername: mapping.openemsUsername,
          openemsPassword: mapping.openemsPassword,
          valueType: mapping.valueType as SyncValueType,
          pollIntervalMs: String(mapping.pollIntervalMs),
          scale: String(mapping.scale),
          offset: String(mapping.offset),
          isa95Enterprise: mapping.isa95Enterprise,
          isa95Site: mapping.isa95Site,
          isa95Area: mapping.isa95Area,
          isa95Line: mapping.isa95Line,
          isa95Cell: mapping.isa95Cell,
          isa95Asset: mapping.isa95Asset,
          isa95Category: mapping.isa95Category as Isa95TopicCategory,
          isa95Tag: mapping.isa95Tag,
          lastValue: mapping.lastValue,
          lastSyncedAt: mapping.lastSyncedAt,
          lastError: mapping.lastError,
          lastSourceValue: mapping.lastSourceValue,
        }))
      : createDefaultFeedbackMappings(),
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

  const feedbackMappings = (values?.feedbackMappings || [])
    .map((mapping) => {
      const next = {
        id: mapping.id,
        name: mapping.name?.trim() || 'OpenEMS -> Tier0 ISA95',
        enabled: mapping.enabled !== false,
        tier0MqttUrl: mapping.tier0MqttUrl?.trim() || 'mqtt://emqx:1883',
        tier0PayloadField: mapping.tier0PayloadField?.trim() || 'value',
        openemsSourceType: (mapping.openemsSourceType || 'channel') as OpenEmsTargetType,
        openemsComponentId: mapping.openemsComponentId?.trim() || '',
        openemsChannelId: mapping.openemsChannelId?.trim() || '',
        openemsUsername: mapping.openemsUsername?.trim() || 'x',
        openemsPassword: mapping.openemsPassword?.trim() || 'user',
        valueType: (mapping.valueType || 'number') as SyncValueType,
        pollIntervalMs: mapping.pollIntervalMs?.trim() || '5000',
        scale: mapping.scale?.trim() || '1',
        offset: mapping.offset?.trim() || '0',
        isa95Enterprise: mapping.isa95Enterprise?.trim() || 'V1',
        isa95Site: mapping.isa95Site?.trim() || 'Tier0Site',
        isa95Area: mapping.isa95Area?.trim() || 'EnergyArea',
        isa95Line: mapping.isa95Line?.trim() || 'OpenEMSLine',
        isa95Cell: mapping.isa95Cell?.trim() || 'EdgeCell',
        isa95Asset: mapping.isa95Asset?.trim() || 'OpenEMS',
        isa95Category: (mapping.isa95Category || 'State') as Isa95TopicCategory,
        isa95Tag: mapping.isa95Tag?.trim() || 'meter0ActivePower',
      };

      return {
        ...next,
        tier0TargetTopic: mapping.tier0TargetTopic?.trim() || buildIsa95Topic(next),
      };
    })
    .filter((mapping) => mapping.openemsComponentId || mapping.openemsChannelId || mapping.tier0TargetTopic);

  return {
    enabled: Boolean(values?.syncEnabled),
    mappings,
    feedbackEnabled: Boolean(values?.feedbackEnabled),
    feedbackMappings,
  };
};
