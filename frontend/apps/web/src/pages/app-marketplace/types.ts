export type AppStatus = 'install' | 'open';
export type AppDeployFieldType = 'text' | 'number' | 'select';

export interface AppDeployField {
  key: string;
  label: string;
  placeholder: string;
  type?: AppDeployFieldType;
  defaultValue?: string;
  required?: boolean;
  options?: Array<{
    label: string;
    value: string;
  }>;
}

export interface MarketplaceApp {
  id: string;
  name: string;
  description: string;
  version: string;
  status: AppStatus;
  docsUrl?: string;
  launchUrl?: string;
  deployFields: AppDeployField[];
}
