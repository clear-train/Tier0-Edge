export interface OpenEmsComposeValues {
  deploymentProfile: string;
  edgeServiceName: string;
  edgeImage?: string;
  edgeContainerName: string;
  edgeFelixPort: string;
  edgeRestPort: string;
  edgeWebsocketPort: string;
  edgeConfigVolume: string;
  edgeDataVolume: string;
  uiServiceName?: string;
  uiImage?: string;
  uiContainerName?: string;
  uiHttpPort?: string;
  uiHttpsPort?: string;
  uiConfigVolume?: string;
  uiLogVolume?: string;
  websocketHost?: string;
  websocketPort?: string;
}

const withUi = (values: OpenEmsComposeValues) => values.deploymentProfile === 'edge-ui';
const TIER0_SHARED_NETWORK = 'tier0_edge_network';
const DEFAULT_EDGE_IMAGE = 'openems/edge:latest';
const DEFAULT_UI_IMAGE = 'openems/ui-edge:latest';
const DEFAULT_EDGE_WEBSOCKET_INTERNAL_PORT = '8085';

const shouldUseInternalUiProxyHost = (value?: string) => {
  const normalized = value?.trim().toLowerCase() || '';
  return !normalized || normalized === 'localhost' || normalized === '127.0.0.1' || /^[0-9.]+$/.test(normalized);
};

const resolveUiProxyHost = (values: OpenEmsComposeValues) =>
  shouldUseInternalUiProxyHost(values.websocketHost)
    ? values.edgeServiceName || values.edgeContainerName || 'openems-edge'
    : values.websocketHost!.trim();

const resolveUiProxyWebsocketPort = () => DEFAULT_EDGE_WEBSOCKET_INTERNAL_PORT;

const resolveUiProxyRestPort = (values: OpenEmsComposeValues) => values.edgeRestPort?.trim() || '8084';

export const buildOpenEmsComposeYaml = (values: OpenEmsComposeValues) => {
  const uiProxyHost = resolveUiProxyHost(values);
  const uiProxyWebsocketPort = resolveUiProxyWebsocketPort();
  const uiProxyRestPort = resolveUiProxyRestPort(values);
  const lines = [
    'services:',
    `  ${values.edgeServiceName}:`,
    `    image: ${values.edgeImage || DEFAULT_EDGE_IMAGE}`,
    `    container_name: ${values.edgeContainerName}`,
    `    hostname: ${values.edgeContainerName}`,
    '    restart: unless-stopped',
    '    volumes:',
    `      - ${values.edgeConfigVolume}:/var/opt/openems/config:rw`,
    `      - ${values.edgeDataVolume}:/var/opt/openems/data:rw`,
    '    networks:',
    `      - ${TIER0_SHARED_NETWORK}`,
    '    ports:',
    `      - ${values.edgeFelixPort}:8080`,
    `      - ${values.edgeRestPort}:${values.edgeRestPort}`,
  ];

  if (withUi(values)) {
    lines.push(`      - ${values.edgeWebsocketPort}:8085`);
    lines.push(`  ${values.uiServiceName}:`);
    lines.push(`    image: ${values.uiImage || DEFAULT_UI_IMAGE}`);
    lines.push(`    container_name: ${values.uiContainerName}`);
    lines.push(`    hostname: ${values.uiContainerName}`);
    lines.push('    restart: unless-stopped');
    lines.push('    volumes:');
    lines.push(`      - ${values.uiConfigVolume}:/etc/nginx:rw`);
    lines.push(`      - ${values.uiLogVolume}:/var/log/nginx:rw`);
    lines.push('    environment:');
    lines.push(`      - WEBSOCKET_HOST=${uiProxyHost}`);
    lines.push(`      - WEBSOCKET_PORT=${uiProxyWebsocketPort}`);
    lines.push(`      - REST_PORT=${uiProxyRestPort}`);
    lines.push('    networks:');
    lines.push(`      - ${TIER0_SHARED_NETWORK}`);
    lines.push('    ports:');
    lines.push(`      - ${values.uiHttpPort}:80`);
    lines.push(`      - ${values.uiHttpsPort}:443`);
  }

  lines.push('volumes:');
  lines.push(`  ${values.edgeConfigVolume}:`);
  lines.push(`  ${values.edgeDataVolume}:`);

  if (withUi(values)) {
    lines.push(`  ${values.uiConfigVolume}:`);
    lines.push(`  ${values.uiLogVolume}:`);
  }

  lines.push('networks:');
  lines.push(`  ${TIER0_SHARED_NETWORK}:`);
  lines.push('    external: true');

  return lines.join('\n');
};

export const buildOpenEmsDeploymentSpec = (values: OpenEmsComposeValues) => {
  const services: Array<Record<string, unknown>> = [
    {
      name: values.edgeServiceName,
      image: values.edgeImage || DEFAULT_EDGE_IMAGE,
      ports: [
        { host: values.edgeFelixPort, container: '8080' },
        { host: values.edgeRestPort, container: values.edgeRestPort },
      ].concat(withUi(values) ? [{ host: values.edgeWebsocketPort, container: '8085' }] : []),
      volumes: [
        `${values.edgeConfigVolume}:/var/opt/openems/config:rw`,
        `${values.edgeDataVolume}:/var/opt/openems/data:rw`,
      ],
      networks: [TIER0_SHARED_NETWORK],
    },
  ];

  if (withUi(values)) {
    services.push({
      name: values.uiServiceName || 'openems-ui',
      image: values.uiImage || DEFAULT_UI_IMAGE,
      ports: [
        { host: values.uiHttpPort || '80', container: '80' },
        { host: values.uiHttpsPort || '443', container: '443' },
      ],
      environment: {
        WEBSOCKET_HOST: resolveUiProxyHost(values),
        WEBSOCKET_PORT: resolveUiProxyWebsocketPort(values),
        REST_PORT: resolveUiProxyRestPort(values),
      },
      volumes: [
        `${values.uiConfigVolume || 'openems-ui-conf'}:/etc/nginx:rw`,
        `${values.uiLogVolume || 'openems-ui-log'}:/var/log/nginx:rw`,
      ],
      networks: [TIER0_SHARED_NETWORK],
    });
  }

  return {
    kind: 'docker-compose',
    profile: values.deploymentProfile,
    networks: {
      [TIER0_SHARED_NETWORK]: {
        external: true,
      },
    },
    services,
  };
};
