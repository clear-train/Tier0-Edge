# Tier0: An Open-Source IIoT Platform

[![Static Badge](https://img.shields.io/badge/Try%20Tier0-Live%20Demo-blue?style=flat&logo=rocket&logoColor=red)](https://tier0.app/trial)
[![Docs](https://img.shields.io/badge/docs-available-brightgreen?style=flat&logo=readthedocs)](https://tier0edge.vercel.app/)
[![License](https://img.shields.io/badge/License-Apache_2.0-yellow?style=flat&logo=open-source-initiative)](./LICENSE)

**Tier0** is an open-source industrial data integration platform built on the **Unified Namespace (UNS)** methodology and powered by production-grade open-source technologies.

<img width="750" src="/deploy/assert/image/open source.png" />

---

## Architecture Overview
<img width="750" src="deploy/assert/image/function_update.png" />

- **Source Flow**  
  Serves as the connection pipeline to devices and systems. It handles real-time protocol translation into JSON payloads. Built entirely on Node-RED.
@@ -20,10 +20,9 @@
  The core of Tier0. A semantic MQTT broker and parser that models data using topic hierarchies and structured JSON payloads.

- **Sink**  
  The storage layer of Tier0.
  - Time-series Namespace values are stored in **TimescaleDB**.
  - Relational Namespace values (e.g., CRM data) are stored in **PostgreSQL**.  
    This enables efficient querying and compression.

- **Event Flow**  
  Orchestrates Namespaces into higher-level event/information flows. Supports merging JSON payloads and appending system-generated prompts for LLM-powered optimization.

---

## Hardware Requirements

|             | Minimum Requirement                  | Recommended Requirement                       |
|-------------|--------------------------------------|-----------------------------------------------|
| CPU         | 4 cores                              | 8 cores                                       |
| Memory      | 8 GB                                 | 16 GB                                         |
| Disk        | 100 GB, 1000 IOPS (30% random write)      | 1 TB, 2000 IOPS (30% random write)        |
| Browser     | Chrome 89, Edge 89, Firefox 89, Safari 15 | Chrome 89, Edge 89, Firefox 89, Safari 15 |

## Deployment
> For detailed guides and advanced examples, see the <a href="https://suposcommunity.vercel.app/">Tier0 Community Docs</a>.

## App Marketplace and OpenEMS

This repository now includes an initial **App Marketplace** entry in the web UI. The first integrated app is **OpenEMS**.

- The reusable integration notes are organized as a generic SDK-style guide under [`docs/app-integration-sdk`](./docs/app-integration-sdk). Use it when connecting another open-source application to Tier0, or when wiring a custom App Market to Tier0 through the provider/adapter contract.
- The custom marketplace integration contract is documented in [`docs/app-integration-sdk/custom-marketplace.md`](./docs/app-integration-sdk/custom-marketplace.md), with TypeScript extension interfaces in [`docs/app-integration-sdk/templates/app-marketplace-provider.ts`](./docs/app-integration-sdk/templates/app-marketplace-provider.ts).
- A backend-facing provider/adapter type contract is reserved at `frontend/apps/services-express/src/modules/app-marketplace/contracts.ts` for the future generic multi-app marketplace extraction.
- A new `App Marketplace` page is available in the frontend navigation and can also be reached from the UNS toolbar.
- The OpenEMS card is no longer a static demo. It maps deployment fields to an OpenEMS Docker topology (`Edge Only` or `Edge + UI`) and generates a Docker Compose preview in the UI.
- A local deployment API was added to `frontend/apps/services-express` under `/open-api/app-marketplace`. It stores generated compose files under a runtime directory and executes `docker compose up -d` / `docker compose down` for install and uninstall.
- The integration flow is now bidirectional. `Tier0 -> OpenEMS` subscribes to Tier0 MQTT topics and writes values into OpenEMS channels or component config properties. `OpenEMS -> Tier0` polls OpenEMS channels/config properties and publishes the feedback into Tier0 MQTT as ISA95-aligned UNS topics.
- OpenEMS feedback creates paired ISA95 topics for each default channel: `State` topics for the live UNS tree and `Metric` topics for time-series friendly numeric history. Examples: `V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/State/essSoc` and `V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/Metric/essSoc`.
- The OpenEMS UI deployment step patches the official `openems/ui-edge` image at runtime so Edge-only deployments default to English and do not show a false `updateUserLanguage` failure when language is changed locally.
- OpenEMS deployment now exposes the Edge REST-API port as part of the compose model, so the local bridge can write values into the deployed Edge instance without additional manual networking.
- Development-mode fallback and mock data were added so the marketplace page can still be opened when the original backend proxy is unavailable.

Relevant implementation areas:

- `frontend/apps/web/src/pages/app-marketplace`
- `frontend/apps/web/src/stores/base/index.ts`
- `frontend/apps/web/src/pages/uns/TopDom.tsx`
- `frontend/apps/services-express/src/routes/open-api/app-marketplace.ts`
- `frontend/apps/services-express/src/modules/app-marketplace`

Local development notes:

- Start the UI and local service together with `npx pnpm@10.13.1 dev:marketplace` from the `frontend` directory.
- Docker must be available on the host if you want OpenEMS install/uninstall to actually run.
- Tier0 must be reachable from the local bridge, defaulting to `http://localhost:8080`.
- To verify feedback, install OpenEMS from the marketplace, enable **OpenEMS -> Tier0 ISA95 Feedback**, keep the default MQTT URL `mqtt://emqx:1883`, then click **Run Sync Now**. In Tier0 UNS, open `V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/State` for live tree values, or `V1/Tier0Site/EnergyArea/OpenEMSLine/EdgeCell/OpenEMS/Metric` for numeric values with `value`, `timeStamp`, and `quality` fields.

### Changing The Local IP

When the host LAN IP changes, run the migration helper instead of editing files manually:

```bash
bash deploy/bin/update-ip.sh 192.168.0.100
```

The script updates `deploy/.env`, regenerates `deploy/.env.tmp`, applies the existing Kong/Keycloak IP migration, refreshes local frontend deployment, updates App Marketplace runtime launch URLs, and rewrites Node-RED MQTT broker references that still point to the previous host IP.

Auto-detect is available on supported systems:

```bash
bash deploy/bin/update-ip.sh --auto
```

Useful flags:

```bash
bash deploy/bin/update-ip.sh 192.168.0.100 --no-frontend
bash deploy/bin/update-ip.sh 192.168.0.100 --no-nodered
```

By default, Node-RED migration only rewrites MQTT broker nodes that match the previous `ENTRANCE_DOMAIN`. If you intentionally want to rewrite other private-IP MQTT brokers too, add `--rewrite-private-brokers`.

### 1.Linux
#### 1.1 Operating Environment
- **Operating System**: Currently tested on Ubuntu Server 24.04 with Docker. We welcome feedback on other OS distributions.
- **Docker**: We assume you have Docker (with `docker compose` and `buildx`) installed. Our tested versions:
  - Docker Engine - Community: 27.4.0
  - Docker Buildx: v0.19.2
  - Docker Compose: v2.31.0
  - containerd: 1.7.24

#### 1.2 Installing Tier0
1. Clone the project.
   ```bash
   git clone <this repo>
   ```
2. Navigate to the `Tier0` directory and edit environment variables in the `.env` file.
   ```bash
   cd Tier0-Edge/deploy
   vi .env.default
   ```
  - Update `VOLUMES_PATH` (directory for storing project data).
  - Update `ENTRANCE_DOMAIN` (frontend entry domain/IP address).
  - Modify other variables as needed.
3. Install Tier0.
   ```bash
   bash bin/install.sh
   ```
### 2.Windows
#### 2.1 Operating Environment
- Install the latest version of **Docker Desktop** and **Git** on Windows 10 or Windows 11.
- It is recommended to perform all operations in **Git Bash** for better compatibility.
#### 2.2 Installing Tier0
1. Clone the project using **Git Bash**.
   ```bash
   git clone <this repo>
   ```
2. Navigate to the `Tier0` directory and edit environment variables in the `.env` file.
   ```bash
   cd Tier0-Edge/deploy
   vi .env.default
   ```
  - Update `OS_PLATFORM_TYPE` = windows
  - Update `VOLUMES_PATH` (directory for storing project data).
  - Update `ENTRANCE_DOMAIN`  (Do not use 127.0.0.1 or localhost, otherwise login and authentication functions **will NOT** work.)
  - Modify other variables as required by the system.
3. Install Tier0.
   ```bash
   bash bin/install.sh
   ```
### 3. Access the Platform
1. Visit `http://<YOUR-DOMAIN>:<YOUR-PORT>` in your browser (based on ENTRANCE_DOMAIN and ENTRANCE_PORT in `.env`).
2. Sign in to Tier0 with default account and password: `tier0/tier0`.
---

## Important Startup Operations
### 1. UNS Data Model Creation
#### 1.1 Building Models Manually
> `Factory/workshop/equipment/CNC` will be used as an example, in which `Factory`, `workshop` and `equipment` are paths and `CNC` is a topic.
1. Log in to Tier0, and then select **UNS** > **Namespace**.
2. Under **Topic**, click <img src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/5.png" /> to add a path (e.g. `factory`).

<img width="450" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/34.png" />

3. Select **equipment**, and then click <img src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/7.png" /> to add a topic (e.g.`CNC`) under it.

<img width="450" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/36.png" />

4. Enter the information of the topic, and then click **Save**.

#### 1.2 Importing Models
1. Log in to Tier0, and then select **UNS** > **Namespace**.
2. Click **Import** at the upper-right corner.

<img width="450" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/69.png" />

3. Import JSON to create models.
- Directly enter JSON.

<img width="450" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/69-1.png" />

- Click **Upload File** to download the template and enter the model content according to template rules.

<img width="450" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/69-2.png" />


> You can manually add a path and topic, export it and use it as an example for import.

<img width="450" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/69-3.png" />


4. Save the template file, and then click **Import** on the **Namespace** page.
5. Select the template, and then click **Save**.


### 2. Model Data Source Connection
> Connect real data to make models alive.
1. Log in to Tier0, go to **UNS** > **Namespace**, and under the **Topic** tab, select a file.
2. Scroll down to **Topology**, click the icon on **Source Flow** to redirect to the generated data flow.

<img width="650" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/49.png" />

3. Change the data source of the generated flow.

<img width="650" src="http://communityimage2.oss-cn-hangzhou.aliyuncs.com/51.png" />

4. Deploy and trigger the flow.
---
## License
This project is licensed under the [Apache 2.0 License](./LICENSE).

## Support & Contact
- 📖 [Documentation](https://suposcommunity.vercel.app)
- 🐞 [GitHub Issues](./issues)

## Contributors
We gratefully acknowledge the following individuals for their contributions to Tier0:

**Wenhao Yu**, **Liebo**, **Weipeng Dong**, **Kangxi**, **Lifang Sun**, **Minghe Zhuang**,  
**Wangji Xin**, **Fayue Zheng & Yue Yang**, **Yanqiu Liu**, **Dongdong An**, **Jianan Zhu**
