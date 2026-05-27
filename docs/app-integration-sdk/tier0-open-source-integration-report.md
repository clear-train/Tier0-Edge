# Tier0 与开源软件集成 SDK 技术总结（OpenEMS 参考实现）


> 核心结论：当前代码已经实现了一个 OpenEMS 优先的 App Marketplace 参考集成，包括部署、打开、卸载、Tier0 -> OpenEMS 数据写入、OpenEMS -> Tier0 反馈回传、ISA95 Topic 构建、UNS Topic 自动创建和本地反馈历史。通用 SDK 的类型契约已经预留，但运行时代码仍主要硬编码在 OpenEMS 路由和 OpenEMS 同步管理器中。

## 1. 当前实现边界

### 已实现

- 在 Tier0 前端提供 `App Marketplace` 页面，当前集成应用为 `OpenEMS`。
- 支持从页面生成 OpenEMS Docker Compose 方案。
- 后端执行 `docker compose up -d` / `docker compose down` 完成 OpenEMS 部署和卸载。
- 支持两种 OpenEMS 部署形态：
  - `edge-only`：只部署 OpenEMS Edge。
  - `edge-ui`：部署 OpenEMS Edge 和官方 OpenEMS UI。
- 支持双向数据链路：
  - `Tier0 -> OpenEMS`：订阅 Tier0 MQTT/UNS 数据，将值写入 OpenEMS Channel 或组件配置属性。
  - `OpenEMS -> Tier0`：轮询 OpenEMS Channel 或配置属性，将反馈值发布到 Tier0 MQTT，并按 ISA95 路径组织 Topic。
- 支持本地运行状态记录：
  - 部署元数据。
  - 生成的 Docker Compose 文件。
  - 同步配置。
  - OpenEMS 反馈历史。
- 支持 Marketplace 页面中的 OpenEMS 反馈 Dashboard。

### 尚未完全通用化

- 当前后端接口只支持 `appId = openems`，其他 app 会返回 `Unsupported app`。
- 通用 `GET /apps/:appId/sync`、`PUT /apps/:appId/sync` 还只是文档建议，当前实现路径仍是 `/sync/tier0-openems`。
- `MarketplaceProvider`、`DeploymentAdapter`、`MarketplaceDataAdapter` 等通用 SDK 类型已经存在，但还没有被完全接入运行时注册机制。
- 当前 OpenEMS 部署和同步逻辑仍集中在 `app-marketplace.ts` 和 `openems-sync.ts`，不是独立 adapter 包。

## 2. 关键源码位置

| 层级 | 文件 | 作用 |
| --- | --- | --- |
| 前端应用入口 | `frontend/apps/web/src/pages/app-marketplace/index.tsx` | Marketplace 页面、安装弹窗、同步配置表单、反馈 Dashboard |
| 前端 app manifest | `frontend/apps/web/src/pages/app-marketplace/manifest.ts` | OpenEMS 卡片、部署字段、默认同步模板 |
| 前端 Compose 构建 | `frontend/apps/web/src/pages/app-marketplace/compose.ts` | 根据表单生成 Docker Compose 预览和部署结构 |
| 前端同步配置转换 | `frontend/apps/web/src/pages/app-marketplace/tier0-sync.ts` | 默认映射、表单值和 API payload 的转换 |
| 前端 API client | `frontend/apps/web/src/apis/inter-api/app-marketplace.ts` | 调用后端 App Marketplace API |
| 后端路由 | `frontend/apps/services-express/src/routes/open-api/app-marketplace.ts` | App 列表、部署、打开、卸载、同步配置、运行同步 |
| 后端运行时文件 | `frontend/apps/services-express/src/modules/app-marketplace/runtime.ts` | runtime 路径、部署元数据读写 |
| 后端同步管理器 | `frontend/apps/services-express/src/modules/app-marketplace/openems-sync.ts` | MQTT 订阅、OpenEMS API 读写、UNS Topic 创建、本地历史 |
| SDK 类型契约 | `frontend/apps/services-express/src/modules/app-marketplace/contracts.ts` | 预留的通用 Marketplace/Adapter 类型 |
| SDK 文档模板 | `docs/app-integration-sdk/templates/app-marketplace-provider.ts` | 面向未来通用 SDK 的 provider/adapter 示例类型 |

## 3. 总体架构

```text
Tier0 Web UI
  -> App Marketplace 页面
  -> services-express /open-api/app-marketplace
  -> 生成并保存 OpenEMS Docker Compose
  -> Docker Compose 启动 OpenEMS Edge / UI
  -> OpenEmsSyncManager 负责双向数据桥接
  -> Tier0 MQTT / UNS 与 OpenEMS REST / JSON-RPC 互通
```

数据链路可以拆成两条：

```text
Tier0 -> OpenEMS
Tier0 MQTT Topic
  -> services-express MQTT client
  -> 字段解析、类型转换、scale/offset
  -> OpenEMS REST Channel Write 或 JSON-RPC Config Update
```

```text
OpenEMS -> Tier0
OpenEMS REST Channel Read 或 JSON-RPC Config Read
  -> 字段解析、类型转换、scale/offset
  -> ISA95 Topic 构建
  -> 可选调用 Tier0 UNS batch API 创建 Topic
  -> 发布 MQTT retained message
  -> 写入本地 feedback history
```

## 4. 软件特性

### 4.1 Marketplace 管理能力

当前 OpenEMS 在 Marketplace 中具备以下生命周期能力：

- `install`：用户填写部署参数，前端生成 Compose 预览，后端保存并执行部署。
- `open`：后端根据部署记录返回 OpenEMS 的访问 URL。
- `uninstall`：后端执行 Docker Compose down，并关闭同步任务。
- `status reconcile`：后端读取 Docker 容器运行状态，修正 app 状态为 `install` 或 `open`。

实现文件：

- `frontend/apps/services-express/src/routes/open-api/app-marketplace.ts`
- `frontend/apps/services-express/src/modules/app-marketplace/runtime.ts`

### 4.2 OpenEMS Docker 嵌入

OpenEMS 默认部署到 Tier0 共享 Docker 网络：

```text
tier0_edge_network
```

默认镜像：

```text
openems/edge:latest
openems/ui-edge:latest
```

默认端口：

| 服务 | 默认宿主机端口 | 容器端口/含义 |
| --- | ---: | --- |
| OpenEMS Edge Felix | `18080` | `8080`，OpenEMS Edge 控制台 |
| OpenEMS Edge REST | `18084` | 当前实现将 REST API 暴露为可配置端口 |
| OpenEMS Edge WebSocket | `18085` | `8085`，OpenEMS UI 连接 Edge |
| OpenEMS UI HTTP | `18081` | `80` |
| OpenEMS UI HTTPS | `18443` | `443` |

部署完成后，后端还会做三件 OpenEMS 相关的初始化：

1. 写入 `Controller.Api.Rest.ReadWrite` 配置，启用 OpenEMS REST read/write API。
2. 通过 OpenEMS JSON-RPC 补齐模拟组件：
   - `simulateConsumption`
   - `meter0`
   - `ess0`
   - `ctrlBalancing0`
3. 如果部署了 UI，则对官方 `openems/ui-edge` 容器里的静态文件做运行时 patch，使本地 UI 默认英文，并避免语言设置持久化失败时出现误导性错误提示。

这些行为发生在部署接口中，不是前端模拟。

### 4.3 双向数据桥接

当前桥接能力由 `OpenEmsSyncManager` 实现：

- 启动时如果发现本地已有 `tier0-openems-sync.json`，会自动 bootstrap 同步任务。
- 保存同步配置后，会停止旧 MQTT client / timer，再按新配置重新调度。
- `Tier0 -> OpenEMS` 使用 MQTT 订阅触发，另有 `Run Sync Now` 手动拉取当前值。
- `OpenEMS -> Tier0` 使用定时轮询触发。
- 单条 mapping 执行时有运行锁，避免同一 mapping 重入执行。
- 成功/失败状态会写回 mapping 的 `lastValue`、`lastSyncedAt`、`lastError`。

## 5. 后端 API

前端 API base URL 当前由浏览器协议和 hostname 拼出，固定访问 `4000` 端口：

```ts
`${window.location.protocol}//${window.location.hostname}:4000/open-api/app-marketplace`
```

后端响应 envelope 形式：

```json
{
  "code": 200,
  "data": {}
}
```

失败时：

```json
{
  "code": 500,
  "msg": "error message"
}
```

### 5.1 已实现接口

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/open-api/app-marketplace/apps` | 返回 Marketplace app 列表，目前只有 OpenEMS |
| `GET` | `/open-api/app-marketplace/apps/:appId` | 返回单个 app 详情和部署记录，目前只支持 `openems` |
| `POST` | `/open-api/app-marketplace/deploy` | 部署 app。当前 payload 中 `appId` 必须是 `openems` |
| `POST` | `/open-api/app-marketplace/apps/:appId/open` | 返回已部署 app 的打开 URL |
| `DELETE` | `/open-api/app-marketplace/apps/:appId` | 卸载 app，并禁用同步 |
| `GET` | `/open-api/app-marketplace/apps/:appId/sync/tier0-openems` | 获取 OpenEMS 同步配置 |
| `PUT` | `/open-api/app-marketplace/apps/:appId/sync/tier0-openems` | 保存 OpenEMS 同步配置，并重新调度同步任务 |
| `POST` | `/open-api/app-marketplace/apps/:appId/sync/tier0-openems/run` | 立即执行一次已启用的双向 mapping |
| `GET` | `/open-api/app-marketplace/apps/:appId/sync/tier0-openems/history?limit=240` | 获取 OpenEMS 反馈本地历史 |

### 5.2 部署请求结构

前端发送的部署请求结构定义在 `DeployAppPayload`：

```ts
interface DeployAppPayload {
  appId: string;
  version: string;
  params: Record<string, string>;
  composeYaml: string;
  deploymentSpec: {
    kind: string;
    profile: string;
    services: Array<Record<string, unknown>>;
  };
}
```

后端不会直接信任 `composeYaml` 完成所有逻辑，而是根据 `params` 再次生成 Compose 并写入 runtime 文件。

### 5.3 同步配置请求结构

同步配置由两个数组组成：

```ts
interface Tier0ToOpenEmsSyncPayload {
  enabled: boolean;
  mappings: Tier0ToOpenEmsSyncMappingPayload[];
  feedbackEnabled: boolean;
  feedbackMappings: OpenEmsToTier0SyncMappingPayload[];
}
```

含义：

- `enabled` / `mappings` 控制 `Tier0 -> OpenEMS`。
- `feedbackEnabled` / `feedbackMappings` 控制 `OpenEMS -> Tier0`。

保存配置时，后端会从请求头提取 Tier0 登录态：

```text
X-Sa-Token
Cookie
```

这些认证信息用于调用 Tier0 内部 UNS API 创建反馈 Topic。没有认证信息时，同步仍可以发布 MQTT，但不会主动创建 UNS 节点。

## 6. Runtime 文件

当前 runtime 根目录：

```text
frontend/apps/services-express/.runtime/app-marketplace
```

OpenEMS 的 runtime 文件：

```text
frontend/apps/services-express/.runtime/app-marketplace/openems/
  deployment.json
  docker-compose.generated.yml
  tier0-openems-sync.json
  tier0-openems-feedback-history.json
```

说明：

| 文件 | 内容 |
| --- | --- |
| `deployment.json` | appId、version、params、deploymentSpec、status、launchUrl、lastError |
| `docker-compose.generated.yml` | 后端生成的 OpenEMS Docker Compose |
| `tier0-openems-sync.json` | 双向同步配置和每条 mapping 的最后运行状态 |
| `tier0-openems-feedback-history.json` | Marketplace Dashboard 使用的本地反馈历史 |

这些文件是运行时产物，不应作为源码提交。

## 7. 数据映射一：Tier0 -> OpenEMS

### 7.1 目标

把 Tier0 UNS/MQTT 中的值写入 OpenEMS，使 Tier0 数据可以驱动 OpenEMS 的模拟负载、控制参数或其他可写目标。

### 7.2 Mapping 字段

```ts
interface Tier0ToOpenEmsMapping {
  id: string;
  name: string;
  enabled: boolean;
  tier0BaseUrl: string;
  tier0MqttUrl: string;
  tier0SourceType: 'alias' | 'path';
  tier0SourceValue: string;
  tier0Field: string;
  openemsTargetType: 'channel' | 'config-property';
  openemsComponentId: string;
  openemsChannelId: string;
  openemsUsername: string;
  openemsPassword: string;
  valueType: 'number' | 'boolean' | 'string';
  pollIntervalMs: number;
  scale: number;
  offset: number;
}
```

关键字段解释：

| 字段 | 说明 |
| --- | --- |
| `tier0MqttUrl` | Tier0 MQTT broker，Docker 内部默认 `mqtt://emqx:1883` |
| `tier0SourceType` | `alias` 表示按 UNS alias 查路径；`path` 表示直接使用路径 |
| `tier0SourceValue` | UNS alias 或 path |
| `tier0Field` | 从 MQTT payload 中读取的字段名，支持 `value`、`__payload`、`__message` |
| `openemsTargetType` | `channel` 写 OpenEMS REST Channel；`config-property` 写 OpenEMS 组件配置属性 |
| `openemsComponentId` | OpenEMS component id，例如 `simulateConsumption` |
| `openemsChannelId` | OpenEMS channel 或 property 名，例如 `Data` |
| `valueType` | 写入前转换为 `number`、`boolean` 或 `string` |
| `scale` / `offset` | 数字型转换参数 |

数字转换公式：

```text
targetValue = Number(sourceValue) * scale + offset
```

### 7.3 Topic 解析

如果 `tier0SourceType = path`，后端直接把 `tier0SourceValue` 规范化为 MQTT topic。

如果 `tier0SourceType = alias`，后端按以下顺序解析：

1. 查询本地 PostgreSQL 容器中的 `supos.uns_namespace`：

```sql
select path from supos.uns_namespace where alias = '<alias>' limit 1;
```

2. 如果本地查询失败，调用 Tier0 OpenAPI：

```http
GET /open-api/uns/file/:alias
```

3. 如果 alias 文本本身包含 `/`，当前实现会把它作为 topic/path 兜底处理。

### 7.4 MQTT 实时同步

保存配置并启用 `enabled` 后，`scheduleApp()` 会为每条启用的 mapping 创建 MQTT client：

- broker：`mapping.tier0MqttUrl`
- subscribe topic：解析后的 Tier0 topic
- QoS：`1`
- clientId：`tier0-openems-<mappingId>-<random>`

收到 MQTT 消息后：

1. 解析 payload。
2. 根据 `tier0Field` 取值。
3. 按 `valueType`、`scale`、`offset` 转换。
4. 写入 OpenEMS。
5. 持久化运行结果。

为避免同一 mapping 过于频繁触发，代码使用 `pollIntervalMs` 做节流。

### 7.5 手动 Run Sync Now

点击 `Run Sync Now` 时，后端不依赖 MQTT 当前消息，而是调用 Tier0：

```http
GET /inter-api/supos/uns/getLastMsg?alias=<value>
GET /inter-api/supos/uns/getLastMsg?path=<value>
```

然后从返回数据中读取 `tier0Field`。

如果接口返回登录页，并且该 mapping 曾经通过 MQTT 收到过有效值，当前实现允许回放缓存的 `lastSourceValue`。这是一种兼容行为，不代表绕过鉴权读取 Tier0 数据。

### 7.6 写入 OpenEMS 的方式

当 `openemsTargetType = channel`：

```http
POST /rest/channel/:componentId/:channelId
Authorization: Basic <openemsUsername:openemsPassword>
Content-Type: application/json

{
  "value": 123
}
```

当 `openemsTargetType = config-property`：

```http
POST /jsonrpc
Authorization: Basic <openemsUsername:openemsPassword>
Content-Type: application/json

{
  "method": "updateComponentConfig",
  "params": {
    "componentId": "componentId",
    "properties": [
      { "name": "propertyName", "value": 123 }
    ]
  }
}
```

### 7.7 默认建议映射

前端默认给出一个可写入 OpenEMS 模拟消费源的 mapping：

| 字段 | 默认值 |
| --- | --- |
| `tier0BaseUrl` | `http://kong:8000` |
| `tier0MqttUrl` | `mqtt://emqx:1883` |
| `tier0SourceType` | `alias` |
| `tier0Field` | `value` |
| `openemsTargetType` | `channel` |
| `openemsComponentId` | `simulateConsumption` |
| `openemsChannelId` | `Data` |
| `openemsUsername` / `openemsPassword` | `admin` / `admin` |
| `valueType` | `number` |
| `pollIntervalMs` | `5000` |
| `scale` / `offset` | `1` / `0` |

## 8. 数据映射二：OpenEMS -> Tier0

### 8.1 目标

把 OpenEMS 当前运行状态、功率、电量、SOC 等反馈值发布回 Tier0 MQTT/UNS，使 Tier0 能在 UNS 树和 Marketplace Dashboard 中观察开源软件的实时状态。

### 8.2 Mapping 字段

```ts
interface OpenEmsToTier0Mapping {
  id: string;
  name: string;
  enabled: boolean;
  tier0MqttUrl: string;
  tier0TargetTopic: string;
  tier0PayloadField: string;
  openemsSourceType: 'channel' | 'config-property';
  openemsComponentId: string;
  openemsChannelId: string;
  openemsUsername: string;
  openemsPassword: string;
  valueType: 'number' | 'boolean' | 'string';
  pollIntervalMs: number;
  scale: number;
  offset: number;
  isa95Enterprise: string;
  isa95Site: string;
  isa95Area: string;
  isa95Line: string;
  isa95Cell: string;
  isa95Asset: string;
  isa95Category: 'State' | 'Action' | 'Metric';
  isa95Tag: string;
}
```

关键字段解释：

| 字段 | 说明 |
| --- | --- |
| `openemsSourceType` | `channel` 表示读 OpenEMS REST Channel；`config-property` 表示读组件配置属性 |
| `openemsComponentId` | OpenEMS component id，例如 `_sum`、`meter0` |
| `openemsChannelId` | OpenEMS channel 或 property 名 |
| `tier0TargetTopic` | 发布到 Tier0 MQTT/UNS 的完整路径 |
| `tier0PayloadField` | payload 中承载值的字段，默认 `value` |
| `isa95*` | 用于构建 ISA95 路径的结构化字段 |

### 8.3 ISA95 Topic 规范

当前实现使用以下路径结构：

```text
<Enterprise>/<Site>/<Area>/<Line>/<Cell>/<Asset>/<Category>/<Tag>
```

OpenEMS 默认根路径：

```text
V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS
```

示例：

```text
V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/State/gridActivePower
```

`Category` 支持：

| Category | 当前用途 |
| --- | --- |
| `State` | 当前值/实时状态，当前后端默认反馈 mapping 使用该类型 |
| `Action` | 类型上支持，但 OpenEMS 默认映射不使用 |
| `Metric` | 类型和 payload 逻辑支持，但当前后端会过滤自动生成的默认 Metric 映射；如需使用应作为明确的自定义映射处理 |

> 事实说明：仓库中部分旧文档曾描述“默认同时创建 State 和 Metric”。当前后端代码中 `DEFAULT_FEEDBACK_CATEGORIES` 为 `['State']`，自动生成的 Metric 默认映射会被视为 deprecated 并过滤。报告中不要写成“当前默认自动创建 State + Metric 双 Topic”，除非代码后续再次修改。

### 8.4 默认 OpenEMS 反馈点

当前默认反馈源列表：

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

默认 OpenEMS 读取账号：

```text
x:user
```

### 8.5 读取 OpenEMS 的方式

当 `openemsSourceType = channel`：

```http
GET /rest/channel/:componentId/:channelId
Authorization: Basic <openemsUsername:openemsPassword>
```

当前代码会兼容几种返回结构：

- 原始值。
- `{ "value": ... }`
- `{ "data": { "value": ... } }`
- `{ "result": { "value": ... } }`
- `{ "component/channel": ... }`
- `{ "component.channel": ... }`

当 `openemsSourceType = config-property`：

```http
POST /jsonrpc
Authorization: Basic <openemsUsername:openemsPassword>
Content-Type: application/json

{
  "method": "getEdgeConfig",
  "params": {}
}
```

然后从：

```text
result.components[openemsComponentId].properties[openemsChannelId]
```

中取值。

### 8.6 创建 Tier0 UNS Topic

保存配置或执行反馈同步时，如果请求上下文中有 Tier0 登录态，后端会尝试创建缺失的 UNS 节点：

```http
GET  /inter-api/supos/uns/search
POST /inter-api/supos/uns/batch
```

实现细节：

- 先搜索现有 UNS 树，收集已有 path/alias。
- 对目标 Topic 的每一层生成节点。
- alias 使用稳定 hash 生成，格式近似：

```text
_openems_<suffix>_<sha1-prefix>
```

- 叶子节点会根据 ISA95 category 设置 `parentDataType`。
- 对 `Metric` 类型会生成 fields，目前字段名来自 `tier0PayloadField`，类型由 `valueType` 映射为 `DOUBLE` / `BOOLEAN` / `STRING`。

没有登录态时，该步骤直接跳过，不影响 MQTT 发布。

### 8.7 发布 MQTT payload

当前发布使用：

- broker：`mapping.tier0MqttUrl`
- QoS：`1`
- retain：`true`
- payload：JSON 字符串

当 `isa95Category = Metric` 且值是 number：

```json
{
  "value": "123.45",
  "timeStamp": 1710000000000,
  "quality": 0
}
```

注意：Metric 数字值当前会被转成字符串。

其他 category，例如 `State`：

```json
{
  "value": 123.45,
  "source": "OpenEMS",
  "metadata": {
    "channel": "_sum/GridActivePower",
    "openemsType": "INTEGER",
    "unit": "W",
    "description": "Grid active power"
  }
}
```

### 8.8 本地历史

每次 OpenEMS -> Tier0 成功后，后端会追加一条 history：

```ts
interface OpenEmsFeedbackHistoryPoint {
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
```

历史文件只保留最后 `DEFAULT_HISTORY_LIMIT` 条。当前值为 `2000`。

## 9. 类型转换和错误处理

### 9.1 类型转换

`coerceValue()` 同时用于两个方向：

- `string`：`String(value ?? '')`
- `boolean`：
  - boolean 原值直接返回。
  - number 中 `0` 为 false，其他为 true。
  - 字符串支持 `true/1/on/yes` 和 `false/0/off/no`。
- `number`：
  - `Number(value)` 必须是有限数字。
  - 应用 `scale` 和 `offset`。

### 9.2 运行状态

每次同步结果结构：

```ts
interface Tier0ToOpenEmsRunResult {
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
```

结果会写回配置：

- 成功：更新 `lastSyncedAt`、`lastValue`、`lastSourceValue`。
- 失败：更新 `lastError`。
- 无当前值：通常作为 `skipped` 处理。

## 10. 面向通用 SDK 的设计抽象

当前仓库已经预留了通用类型契约，但尚未完全运行时化。核心抽象如下。

### 10.1 MarketplaceAppManifest

描述 app 在 Marketplace 中的展示信息和部署字段：

```ts
interface MarketplaceAppManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  status?: 'install' | 'open' | 'error';
  icon?: string;
  docsUrl?: string;
  deployFields: MarketplaceDeployField[];
}
```

### 10.2 MarketplaceDeploymentAdapter

负责把用户表单参数转换成真实部署：

```ts
interface MarketplaceDeploymentAdapter<TParams = Record<string, string>> {
  appId: string;
  normalizeParams(input: Record<string, unknown>, context: MarketplaceRuntimeContext): TParams;
  buildDeployment(params: TParams, context: MarketplaceRuntimeContext): Promise<MarketplaceDeploymentPlan> | MarketplaceDeploymentPlan;
  deploy(plan: MarketplaceDeploymentPlan, context: MarketplaceRuntimeContext): Promise<MarketplaceDeploymentRecord>;
  uninstall(record: MarketplaceDeploymentRecord, context: MarketplaceRuntimeContext): Promise<void>;
  resolveLaunchUrl(record: MarketplaceDeploymentRecord, context: MarketplaceRuntimeContext): string;
  healthCheck?(record: MarketplaceDeploymentRecord, context: MarketplaceRuntimeContext): Promise<MarketplaceAppHealth>;
}
```

OpenEMS 当前的部署 adapter 行为还没有拆成这个接口实例，而是写在 route 文件里。

### 10.3 MarketplaceDataAdapter

负责 app 专属的数据读写：

```ts
interface MarketplaceDataAdapter<TTarget, TSource> {
  appId: string;
  writeValue(target: TTarget, value: MarketplaceNormalizedValue, context: MarketplaceDataBridgeContext): Promise<...>;
  readValue(source: TSource, context: MarketplaceDataBridgeContext): Promise<...>;
  subscribeToAppEvents?(context: MarketplaceDataBridgeContext): AsyncIterable<...>;
}
```

对不同开源软件的落地方式：

| 软件类型 | writeValue | readValue |
| --- | --- | --- |
| OpenEMS | REST Channel write 或 JSON-RPC config update | REST Channel read 或 JSON-RPC getEdgeConfig |
| Node-RED | HTTP endpoint 或 MQTT command topic | MQTT output topic 或 HTTP metrics |
| OPC UA Gateway | 写 OPC UA node | 读/订阅 OPC UA node |
| 数据库型服务 | 写 HTTP API 或数据库入口 | 查询 HTTP API 或数据库 |
| MQTT-native app | MQTT publish | MQTT subscribe |

### 10.4 推荐注册模型

长期更合理的通用 SDK 形态：

```ts
registerMarketplaceApp({
  manifest,
  deploymentAdapter,
  dataAdapter,
  dashboardAdapter,
});
```

当前代码还没有这个 `registerMarketplaceApp()` 运行时注册函数。

## 11. 接入其他开源软件的方法

如果要把另一个开源软件接入 Tier0，按当前 OpenEMS 的经验，应拆成 8 个步骤。

### 11.1 明确软件运行方式

需要收集：

- Docker 镜像或安装命令。
- 端口。
- volume。
- network。
- 健康检查方式。
- 启动后访问 URL。

对应 OpenEMS 的实现是 Compose 生成和 Docker Compose 执行。

### 11.2 定义 Marketplace manifest

在 app 卡片中定义：

- `id`
- `name`
- `description`
- `version`
- `docsUrl`
- `deployFields`
- 默认同步模板

当前 OpenEMS manifest 在前端硬编码。通用化后建议改为后端 provider 或 JSON app catalog。

### 11.3 实现部署 adapter

至少实现：

- 参数规范化。
- 部署计划生成。
- 执行部署。
- 写 runtime state。
- 打开 URL。
- 卸载。

### 11.4 分析软件数据 API

必须明确：

- 如何把 Tier0 的值写进软件。
- 如何从软件读出实时反馈。
- 认证方式是什么。
- 数据字段是什么类型。
- 单位和质量信息是否可获得。

OpenEMS 的数据 API 是 REST Channel 和 JSON-RPC。

### 11.5 设计 Tier0 -> App mapping

要求：

- 明确 Tier0 topic/alias/path。
- 明确 payload 字段。
- 明确 app target。
- 定义 valueType、scale、offset。

### 11.6 设计 App -> Tier0 mapping

要求：

- 明确 app source。
- 明确 ISA95 路径。
- 明确 Tier0 payload 字段。
- 明确是否需要 UNS 自动创建。
- 明确是否需要本地历史。

### 11.7 实现数据桥

可复用 OpenEMS 当前模式：

- MQTT subscribe for Tier0 input。
- Polling 或 app event subscription for feedback。
- 统一类型转换。
- 统一运行结果记录。
- 统一错误状态写回。

### 11.8 验证

至少验证：

- Marketplace app 列表可见。
- 部署成功。
- 打开 URL 可访问。
- Tier0 -> App 写入有效。
- App -> Tier0 回传有效。
- UNS 树能看到 Topic。
- Dashboard 能看到反馈历史。
- 卸载后同步停止。

## 12. 安全和工程限制

这些点在报告里应如实说明：

- 当前部署接口会执行 Docker Compose，因此要求宿主机 Docker 可用。
- 当前只允许 OpenEMS，不是任意远程 app marketplace。
- 当前 OpenEMS 账号密码会作为同步配置字段保存到 runtime JSON 中，尚未接入独立 secret store。
- MQTT URL 默认使用 Docker 内部地址 `mqtt://emqx:1883`，适合同网络容器内访问；如果跨主机部署需要调整。
- UNS Topic 自动创建依赖 Tier0 登录态；没有 `X-Sa-Token` 或 Cookie 时只发布 MQTT，不创建 UNS 节点。
- OpenEMS UI 语言 patch 依赖官方镜像里的静态 chunk 文件名，镜像升级后存在失效风险。
- 当前后端默认反馈 mapping 是 `State` 类型；`Metric` 被类型支持，但默认自动生成 Metric 已被后端过滤。
- 通用 SDK 类型已经预留，但“任意 app 插件化注册”尚未完成。

## 13. 报告中可以采用的技术表述

可以写：

> 本项目以 OpenEMS 为参考对象，在 Tier0 中实现了开源工业软件的 Marketplace 嵌入方式。系统不仅将 OpenEMS 作为外部页面链接展示，而是通过后端部署服务生成 Docker Compose、执行容器生命周期管理，并在运行时建立 Tier0 UNS/MQTT 与 OpenEMS REST/JSON-RPC 之间的数据桥。该桥接支持 Tier0 到 OpenEMS 的数据写入，以及 OpenEMS 到 Tier0 的状态回传，并通过 ISA95 风格 Topic 组织回传数据，使开源软件的实时状态可以进入 Tier0 的统一命名空间。

也可以写：

> 当前实现是 OpenEMS-first 的参考集成，并非完全通用的应用市场 SDK。项目已经抽象出 Marketplace manifest、DeploymentAdapter、DataAdapter、SyncConfig 等类型契约，但运行时代码仍集中在 OpenEMS 专用路由和同步管理器中。后续若接入其他开源软件，应将 OpenEMS 中已经验证的部署、数据映射、反馈发布和历史记录能力抽取为可注册 adapter。

不要写：

- “已经支持任意开源软件一键接入”。
- “已经完成插件化应用市场 SDK”。
- “当前默认自动创建 State 和 Metric 双 Topic”。
- “不需要认证即可创建 Tier0 UNS 节点”。
- “OpenEMS UI patch 对所有未来版本都稳定”。

## 14. 最小 API 调用示例

### 14.1 获取 app 列表

```http
GET /open-api/app-marketplace/apps
```

返回数据中包含部署状态和同步摘要。

### 14.2 保存同步配置

```http
PUT /open-api/app-marketplace/apps/openems/sync/tier0-openems
Content-Type: application/json
X-Sa-Token: <optional tier0 token>

{
  "enabled": true,
  "mappings": [
    {
      "name": "Tier0 -> OpenEMS",
      "enabled": true,
      "tier0BaseUrl": "http://kong:8000",
      "tier0MqttUrl": "mqtt://emqx:1883",
      "tier0SourceType": "path",
      "tier0SourceValue": "V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/Action/targetPower",
      "tier0Field": "value",
      "openemsTargetType": "channel",
      "openemsComponentId": "simulateConsumption",
      "openemsChannelId": "Data",
      "openemsUsername": "admin",
      "openemsPassword": "admin",
      "valueType": "number",
      "pollIntervalMs": 5000,
      "scale": 1,
      "offset": 0
    }
  ],
  "feedbackEnabled": true,
  "feedbackMappings": [
    {
      "name": "OpenEMS Grid Active Power",
      "enabled": true,
      "tier0MqttUrl": "mqtt://emqx:1883",
      "tier0TargetTopic": "V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/State/gridActivePower",
      "tier0PayloadField": "value",
      "openemsSourceType": "channel",
      "openemsComponentId": "_sum",
      "openemsChannelId": "GridActivePower",
      "openemsUsername": "x",
      "openemsPassword": "user",
      "valueType": "number",
      "pollIntervalMs": 5000,
      "scale": 1,
      "offset": 0,
      "isa95Enterprise": "V1",
      "isa95Site": "Tier0Site",
      "isa95Area": "EnergyArea",
      "isa95Line": "OpenEMSLine",
      "isa95Cell": "EdgeCell",
      "isa95Asset": "OpenEMS",
      "isa95Category": "State",
      "isa95Tag": "gridActivePower"
    }
  ]
}
```

### 14.3 立即执行同步

```http
POST /open-api/app-marketplace/apps/openems/sync/tier0-openems/run
```

该接口会顺序执行已启用的 `Tier0 -> OpenEMS` mapping 和 `OpenEMS -> Tier0` feedback mapping。

### 14.4 获取反馈历史

```http
GET /open-api/app-marketplace/apps/openems/sync/tier0-openems/history?limit=240
```

返回本地保存的 OpenEMS 反馈采样点，用于 Marketplace Dashboard 展示。

## 15. 适合放进报告的逻辑链

推荐报告按下面顺序写：

1. 说明 Tier0 需要将外部开源软件纳入统一边缘应用管理。
2. 说明仅提供跳转链接不够，需要部署、状态、数据和反馈四类集成。
3. 以 OpenEMS 为例说明 Marketplace 嵌入：manifest -> 表单 -> Compose -> 后端部署 -> runtime 状态。
4. 说明 Tier0 -> OpenEMS 数据写入：UNS/MQTT -> mapping -> 类型转换 -> OpenEMS API。
5. 说明 OpenEMS -> Tier0 数据回传：OpenEMS polling -> ISA95 topic -> UNS 创建 -> MQTT publish -> Dashboard history。
6. 说明 SDK 抽象方向：Manifest、DeploymentAdapter、DataAdapter、SyncConfig、History。
7. 说明当前限制：OpenEMS-first，通用 adapter 注册尚未完全实现。

