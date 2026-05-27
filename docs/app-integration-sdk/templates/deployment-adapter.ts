export interface GenericAppDeployValues {
  serviceName: string;
  image: string;
  containerName: string;
  httpPort: string;
  dataVolume: string;
}

const TIER0_SHARED_NETWORK = 'tier0_edge_network';

export const buildGenericAppComposeYaml = (values: GenericAppDeployValues) =>
  [
    'services:',
    `  ${values.serviceName}:`,
    `    image: ${values.image}`,
    `    container_name: ${values.containerName}`,
    `    hostname: ${values.containerName}`,
    '    restart: unless-stopped',
    '    volumes:',
    `      - ${values.dataVolume}:/data:rw`,
    '    networks:',
    `      - ${TIER0_SHARED_NETWORK}`,
    '    ports:',
    `      - ${values.httpPort}:8080`,
    'volumes:',
    `  ${values.dataVolume}:`,
    'networks:',
    `  ${TIER0_SHARED_NETWORK}:`,
    '    external: true',
  ].join('\n');

export const buildGenericAppDeploymentSpec = (values: GenericAppDeployValues) => ({
  kind: 'docker-compose',
  profile: 'default',
  networks: {
    [TIER0_SHARED_NETWORK]: {
      external: true,
    },
  },
  services: [
    {
      name: values.serviceName,
      image: values.image,
      ports: [{ host: values.httpPort, container: '8080' }],
      volumes: [`${values.dataVolume}:/data:rw`],
      networks: [TIER0_SHARED_NETWORK],
    },
  ],
});
