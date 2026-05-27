# Using A Custom App Market With Tier0

This document focuses on the question: if you build your own App Market, how should it use Tier0?

## Recommended Boundary

Keep responsibilities separated:

| Responsibility | Owner |
| --- | --- |
| App catalog, search, category, screenshots | Your App Market |
| Deployment execution | Tier0 marketplace backend |
| Docker/network/runtime metadata | Tier0 marketplace backend |
| Tier0 UNS/MQTT topic creation | Tier0 marketplace backend |
| Data bridge between Tier0 and app | Tier0 marketplace backend |
| App-specific UI, docs, pricing, approval | Your App Market |

This means your App Market should not directly write Tier0 runtime files or directly manipulate Tier0 internal Docker networks. It should call Tier0's marketplace API.

## Minimum API Contract

Your App Market only needs these calls for install/open/uninstall:

```http
GET    /open-api/app-marketplace/apps
GET    /open-api/app-marketplace/apps/:appId
POST   /open-api/app-marketplace/apps/:appId/deploy
POST   /open-api/app-marketplace/apps/:appId/open
DELETE /open-api/app-marketplace/apps/:appId
```

For data integration, add:

```http
GET    /open-api/app-marketplace/apps/:appId/sync
PUT    /open-api/app-marketplace/apps/:appId/sync
POST   /open-api/app-marketplace/apps/:appId/sync/run
GET    /open-api/app-marketplace/apps/:appId/history?limit=360
```

Current OpenEMS implementation uses `/sync/tier0-openems`. That should be treated as the first concrete sync adapter. The future generic endpoint should be `/sync`.

## App Descriptor Returned To UI

A custom marketplace provider should return app descriptors like this:

```json
{
  "id": "openems",
  "name": "OpenEMS",
  "description": "Open-source energy management system.",
  "version": "latest",
  "status": "open",
  "icon": "apps",
  "docsUrl": "https://openems.github.io/openems.io/openems/latest/edge/deploy/docker.html",
  "launchUrl": "http://192.168.0.100:18081",
  "deployFields": [],
  "sync": {
    "direction": "bidirectional",
    "enabled": true,
    "mappingCount": 1,
    "enabledMappingCount": 1,
    "feedbackEnabled": true,
    "feedbackMappingCount": 12,
    "feedbackEnabledMappingCount": 8,
    "lastSuccessAt": "2026-05-15T02:30:00.000Z"
  }
}
```

The UI can render cards directly from this response.

## Deployment Request

```json
{
  "appId": "my-app",
  "version": "1.0.0",
  "params": {
    "image": "example/my-app:latest",
    "serviceName": "my-app",
    "containerName": "my_app",
    "httpPort": "18090",
    "dataVolume": "my-app-data"
  }
}
```

The backend adapter turns this into a deployment plan.

## Sync Request

```json
{
  "appId": "my-app",
  "enabled": true,
  "inputMappings": [
    {
      "id": "tier0-command-to-app",
      "enabled": true,
      "tier0MqttUrl": "mqtt://emqx:1883",
      "tier0SourceType": "path",
      "tier0SourceValue": "State/myCommand",
      "tier0Field": "value",
      "targetType": "http-endpoint",
      "targetId": "/api/input",
      "valueType": "number",
      "scale": 1,
      "offset": 0,
      "pollIntervalMs": 5000
    }
  ],
  "feedbackEnabled": true,
  "feedbackMappings": [
    {
      "id": "app-result-to-tier0",
      "enabled": true,
      "tier0MqttUrl": "mqtt://emqx:1883",
      "sourceType": "http-endpoint",
      "sourceId": "/api/metrics/currentPower",
      "tier0TargetTopic": "V1/Tier0Site/Area1/Line1/Cell1/MyApp/State/currentPower",
      "tier0PayloadField": "value",
      "valueType": "number",
      "scale": 1,
      "offset": 0,
      "pollIntervalMs": 5000,
      "isa95": {
        "enterprise": "V1",
        "site": "Tier0Site",
        "area": "Area1",
        "line": "Line1",
        "cell": "Cell1",
        "asset": "MyApp",
        "category": "State",
        "tag": "currentPower"
      }
    }
  ]
}
```

## Provider Modes

### Local JSON provider

Use this when apps are curated and shipped with the Tier0 project.

```text
configs/app-marketplace/apps/*.json
```

The backend reads JSON, validates it, and returns app cards.

### Remote catalog provider

Use this when your App Market is independent.

```text
Tier0 services-express -> calls remote app catalog -> merges local deployment status -> returns cards to UI
```

The remote catalog should not decide runtime status alone. Tier0 should merge actual local deployment status from `.runtime/app-marketplace/<appId>/deployment.json`.

### Plugin provider

Use this when each app ships an adapter package.

```text
app package exports manifest + deploymentAdapter + dataAdapter
Tier0 registers it through registerMarketplaceApp(...)
```

This is the cleanest long-term SDK model.

## Security Rules

- Never accept arbitrary compose YAML from an untrusted remote marketplace without validation.
- Only allow approved Docker images, ports, volumes, and networks in production.
- Store credentials in runtime state or secret store, not in frontend manifest files.
- Validate every MQTT topic before publishing.
- Keep Tier0 internal MQTT URL as `mqtt://emqx:1883` inside Docker, not a changing LAN IP, when services run in the same Docker network.

## Compatibility With Current OpenEMS Code

Current OpenEMS endpoints are kept for stability:

```text
/open-api/app-marketplace/apps/openems/sync/tier0-openems
```

A generic SDK should add `/sync` and internally route to the correct app adapter. The OpenEMS endpoint can remain as a backward-compatible alias.
