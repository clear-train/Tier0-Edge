# App Adapter Checklist

Use this checklist when integrating another open-source app into Tier0.

## 1. App Discovery

- [ ] Identify official Docker image, compose file, or install command.
- [ ] Confirm CPU/architecture support for target edge devices.
- [ ] List required ports and whether they are internal-only or public.
- [ ] List required volumes and which paths must persist after uninstall.
- [ ] Identify the Docker network needed to reach Tier0 services, usually `tier0_edge_network`.
- [ ] Identify health check endpoint or command.
- [ ] Identify default credentials and how they can be changed.
- [ ] Confirm license and redistribution restrictions.

## 2. Data API Discovery

- [ ] How does the app accept input values from Tier0?
- [ ] Does it support REST write, MQTT command topics, OPC UA, WebSocket, file import, or SDK calls?
- [ ] How does the app expose feedback values?
- [ ] Does it support live subscription or only polling?
- [ ] Which values are numeric, boolean, or string?
- [ ] Which values have units?
- [ ] Which values are unavailable until the app is configured?
- [ ] What authentication is required for read/write?

## 3. ISA95 Mapping

- [ ] Choose `enterprise`, usually `V1`.
- [ ] Choose `site`, usually `Tier0Site` for local demos.
- [ ] Choose `area`, for example `EnergyArea`.
- [ ] Choose `line`, for example `<AppName>Line`.
- [ ] Choose `cell`, for example `EdgeCell`.
- [ ] Choose `asset`, usually the app or device name.
- [ ] Classify each feedback item as `State`, `Action`, or `Metric`.
- [ ] Choose stable tag names such as `gridActivePower` or `temperature`.
- [ ] Verify important live values appear under `State` because current Tier0 UNS tree visibility is strongest there.

## 4. Marketplace Manifest

- [ ] Add stable `appId`.
- [ ] Add name, description, version, icon, and docs URL.
- [ ] Add deployment fields and safe defaults.
- [ ] Add i18n labels if the UI is compiled with local strings.
- [ ] Ensure the manifest is metadata only; do not put secrets or runtime state in it.
- [ ] If using a custom marketplace provider, return the manifest through `GET /open-api/app-marketplace/apps`.

## 5. Deployment Adapter

- [ ] Normalize and validate deployment params.
- [ ] Generate Docker Compose YAML or another deployment plan.
- [ ] Attach the app to `tier0_edge_network` if it must reach EMQX, Kong, UNS, or frontend services.
- [ ] Persist `deployment.json`.
- [ ] Persist generated compose file if Docker Compose is used.
- [ ] Run install command, for example `docker compose up -d`.
- [ ] Implement health check.
- [ ] Resolve stable launch URL from current `ENTRANCE_DOMAIN`.
- [ ] Implement uninstall, for example `docker compose down`.
- [ ] Decide whether volumes are preserved or deleted on uninstall.

## 6. Tier0 -> App Input

- [ ] Define default Tier0 source topics or aliases.
- [ ] Define target app address for each input.
- [ ] Validate payload field, usually `value`.
- [ ] Normalize by `valueType`.
- [ ] Apply scale/offset for numbers.
- [ ] Handle missing values without crashing sync loop.
- [ ] Write through `AppDataAdapter.writeValue()`.
- [ ] Record last value, last success time, and last error.

## 7. App -> Tier0 Feedback

- [ ] Define source app channels/properties/topics.
- [ ] Define target ISA95 topics.
- [ ] Provision UNS topic metadata when possible.
- [ ] Publish MQTT payload with `value`, `timeStamp`, `quality`, `unit`, and `source`.
- [ ] Avoid publishing raw nested app responses as `value`.
- [ ] Skip unavailable values or mark `quality` as `UNKNOWN`.
- [ ] Capture local history if dashboard trends are required.

## 8. API Compatibility

- [ ] Support `GET /open-api/app-marketplace/apps`.
- [ ] Support `GET /open-api/app-marketplace/apps/:appId`.
- [ ] Support deploy/open/uninstall.
- [ ] Support generic sync endpoints or provide backward-compatible app-specific endpoints.
- [ ] Return stable `{ code, data }` success payloads and `{ code, msg }` error payloads.
- [ ] Never expose app credentials in frontend logs.

## 9. UI Verification

- [ ] App card renders correctly in Chinese and English.
- [ ] Install modal shows required fields.
- [ ] Compose preview matches backend generated deployment.
- [ ] Install succeeds from deployed Tier0, not only dev mode.
- [ ] Open button reaches the deployed app.
- [ ] Uninstall leaves the marketplace state consistent.
- [ ] Sync settings remain available after install.
- [ ] Dashboard can filter zero/empty values and select visible metrics.

## 10. End-To-End Verification

- [ ] Start Tier0 with `install.sh` or the project-approved install/update flow.
- [ ] Install the app from App Marketplace.
- [ ] Send one Tier0 MQTT value and confirm app receives it.
- [ ] Read one real app feedback value and confirm Tier0 UNS shows it.
- [ ] Confirm ISA95 topic path is correct.
- [ ] Confirm history/dashboard receives samples.
- [ ] Restart services and confirm runtime state recovers.
- [ ] Uninstall and reinstall without manual cleanup.
