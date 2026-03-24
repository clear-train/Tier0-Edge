export interface OpenEmsComposeValues {
  deploymentProfile: string;
  edgeServiceName: string;
  edgeContainerName: string;
  edgeFelixPort: string;
  edgeWebsocketPort: string;
  edgeConfigVolume: string;
  edgeDataVolume: string;
  uiServiceName?: string;
  uiContainerName?: string;
  uiHttpPort?: string;
  uiHttpsPort?: string;
  uiConfigVolume?: string;
  uiLogVolume?: string;
  websocketHost?: string;
  websocketPort?: string;
}

const withUi = (values: OpenEmsComposeValues) => values.deploymentProfile === 'edge-ui';

export const buildOpenEmsComposeYaml = (values: OpenEmsComposeValues) => {
  const lines = [
    'services:',
    `  ${values.edgeServiceName}:`,
    '    image: openems/edge:latest',
    `    container_name: ${values.edgeContainerName}`,
    `    hostname: ${values.edgeContainerName}`,
    '    restart: unless-stopped',
    '    volumes:',
    `      - ${values.edgeConfigVolume}:/var/opt/openems/config:rw`,
    `      - ${values.edgeDataVolume}:/var/opt/openems/data:rw`,
    '    ports:',
    `      - ${values.edgeFelixPort}:8080`,
  ];

  if (withUi(values)) {
    lines.push(`      - ${values.edgeWebsocketPort}:8085`);
    lines.push(`  ${values.uiServiceName}:`);
    lines.push('    image: openems/ui-edge:latest');
    lines.push(`    container_name: ${values.uiContainerName}`);
    lines.push(`    hostname: ${values.uiContainerName}`);
    lines.push('    restart: unless-stopped');
    lines.push('    volumes:');
    lines.push(`      - ${values.uiConfigVolume}:/etc/nginx:rw`);
    lines.push(`      - ${values.uiLogVolume}:/var/log/nginx:rw`);
    lines.push('    environment:');
    lines.push(`      - WEBSOCKET_HOST=${values.websocketHost}`);
    lines.push(`      - WEBSOCKET_PORT=${values.websocketPort}`);
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

  return lines.join('\n');
};

export const buildOpenEmsDeploymentSpec = (values: OpenEmsComposeValues) => {
  const services = [
    {
      name: values.edgeServiceName,
      image: 'openems/edge:latest',
      ports: [{ host: values.edgeFelixPort, container: '8080' }].concat(
        withUi(values) ? [{ host: values.edgeWebsocketPort, container: '8085' }] : []
      ),
      volumes: [
        `${values.edgeConfigVolume}:/var/opt/openems/config:rw`,
        `${values.edgeDataVolume}:/var/opt/openems/data:rw`,
      ],
    },
  ];

  if (withUi(values)) {
    services.push({
      name: values.uiServiceName || 'openems-ui',
      image: 'openems/ui-edge:latest',
      ports: [
        { host: values.uiHttpPort || '80', container: '80' },
        { host: values.uiHttpsPort || '443', container: '443' },
      ],
      environment: {
        WEBSOCKET_HOST: values.websocketHost || 'openems_edge',
        WEBSOCKET_PORT: values.websocketPort || '8085',
      },
      volumes: [
        `${values.uiConfigVolume || 'openems-ui-conf'}:/etc/nginx:rw`,
        `${values.uiLogVolume || 'openems-ui-log'}:/var/log/nginx:rw`,
      ],
    });
  }

  return {
    kind: 'docker-compose',
    profile: values.deploymentProfile,
    services,
  };
};
