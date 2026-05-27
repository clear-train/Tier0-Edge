import type { MarketplaceApp } from '../../../frontend/apps/web/src/pages/app-marketplace/types';

export const EXAMPLE_MARKETPLACE_APP: MarketplaceApp = {
  id: 'my-open-source-app',
  name: 'My Open Source App',
  description: 'Deploy and connect My Open Source App with Tier0 UNS/MQTT.',
  version: 'latest',
  status: 'install',
  docsUrl: 'https://example.org/docs',
  deployFields: [
    {
      key: 'serviceName',
      label: 'Service Name',
      placeholder: 'my-app',
      defaultValue: 'my-app',
      required: true,
    },
    {
      key: 'image',
      label: 'Container Image',
      placeholder: 'example/my-app:latest',
      defaultValue: 'example/my-app:latest',
      required: true,
    },
    {
      key: 'httpPort',
      label: 'HTTP Port',
      placeholder: '18090',
      type: 'number',
      defaultValue: '18090',
      required: true,
    },
  ],
};
