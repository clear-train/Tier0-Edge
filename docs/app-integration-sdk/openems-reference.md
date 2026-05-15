# OpenEMS Reference Integration

OpenEMS is the reference implementation for the Tier0 app integration SDK.

## Deployment

Default topology:

```text
Tier0 Docker network: tier0_edge_network
OpenEMS Edge: openems/edge:latest
OpenEMS UI: openems/ui-edge:latest
```

Default host ports:

| Service | Host Port | Container Port | Purpose |
| --- | ---: | ---: | --- |
| Edge Felix | 18080 | 8080 | OpenEMS Edge console/runtime |
| Edge REST | 18084 | 18084 | REST read/write bridge |
| Edge WebSocket | 18085 | 8085 | UI websocket |
| UI HTTP | 18081 | 80 | OpenEMS UI |
| UI HTTPS | 18443 | 443 | OpenEMS UI HTTPS |

The backend enables OpenEMS REST access after deployment and patches the UI language behavior so local Edge UI usage defaults to English.

## Tier0 -> OpenEMS

Use this flow to push Tier0 values into OpenEMS simulated consumption:

```text
Tier0 topic payload { "value": 1234 }
  -> MQTT topic State/openemsPower
  -> marketplace sync manager
  -> OpenEMS component simulateConsumption channel Data
```

Recommended mapping:

| Field | Value |
| --- | --- |
| `tier0MqttUrl` | `mqtt://emqx:1883` |
| `tier0SourceType` | `path` |
| `tier0SourceValue` | `State/openemsPower` |
| `tier0Field` | `value` |
| `openemsTargetType` | `channel` |
| `openemsComponentId` | `simulateConsumption` |
| `openemsChannelId` | `Data` |
| `valueType` | `number` |

## OpenEMS -> Tier0

Default feedback channels:

| OpenEMS Component | Channel | ISA95 Tag |
| --- | --- | --- |
| `meter0` | `ActivePower` | `meter0ActivePower` |
| `_sum` | `GridActivePower` | `gridActivePower` |
| `_sum` | `ConsumptionActivePower` | `consumptionActivePower` |
| `_sum` | `ProductionActivePower` | `productionActivePower` |
| `_sum` | `EssActivePower` | `essActivePower` |
| `_sum` | `EssSoc` | `essSoc` |
| `_sum` | `GridBuyActiveEnergy` | `gridBuyActiveEnergy` |
| `_sum` | `GridSellActiveEnergy` | `gridSellActiveEnergy` |
| `_sum` | `ConsumptionActiveEnergy` | `consumptionActiveEnergy` |
| `_sum` | `ProductionActiveEnergy` | `productionActiveEnergy` |
| `_sum` | `EssDcChargeEnergy` | `essDcChargeEnergy` |
| `_sum` | `EssDcDischargeEnergy` | `essDcDischargeEnergy` |
| `_sum` | `GridMode` | `gridMode` |
| `_sum` | `State` | `systemState` |

Default Tier0 topic root:

```text
V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/State
```

Example full topic:

```text
V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/State/gridActivePower
```

## Verification

Check OpenEMS REST from the host:

```bash
curl -u x:user http://127.0.0.1:18084/rest/channel/_sum/GridActivePower
```

Check marketplace API from the frontend container:

```bash
docker exec frontend sh -lc 'wget -qO- http://127.0.0.1:4000/open-api/app-marketplace/apps'
```

Check sync config:

```bash
docker exec frontend sh -lc 'wget -qO- http://127.0.0.1:4000/open-api/app-marketplace/apps/openems/sync/tier0-openems'
```

Check the runtime files:

```bash
ls frontend/apps/services-express/.runtime/app-marketplace/openems
```

Expected files:

```text
deployment.json
docker-compose.generated.yml
tier0-openems-sync.json
tier0-openems-feedback-history.json
```
