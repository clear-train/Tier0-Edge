<div align="center">

# Tier0 Edge Frontend

[![React Version](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6+-646CFF?style=flat&logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-Apache_2.0-yellow?style=flat&logo=open-source-initiative)](../LICENSE)
[![Node](https://img.shields.io/badge/Node-22.20.0+-339933?style=flat&logo=node.js)](https://nodejs.org/)

**A modern, modular frontend for industrial IoT data visualization and management**

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Guide](#development-guide)
- [Build & Deployment](#build--deployment)
- [Module Federation](#module-federation)
- [Internationalization](#internationalization)
- [AI Integration](#ai-integration)
- [Styling & Theming](#styling--theming)
- [Testing](#testing)
- [Performance](#performance)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Tier0 Edge Frontend is a modern, production-grade web application built on a **pnpm monorepo architecture**. It provides an intuitive interface for managing industrial IoT data, creating visualizations, configuring device connections, and monitoring real-time data flows.

The application leverages cutting-edge web technologies including React 18, Vite, TypeScript, and Module Federation for a scalable, maintainable codebase.

---

## Architecture

### Monorepo Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      Monorepo Workspace                      │
│                        (pnpm workspaces)                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Web App      │   │  Services App   │   │   Plugins       │
│  (Main UI)    │   │  (Backend API)  │   │  (Optional)     │
└───────────────┘   └─────────────────┘   └─────────────────┘
        │                     │                     │
    Module Federation    Express.js          Dynamic Loading
```

### Module Federation

The application uses **Module Federation** for code splitting and dynamic plugin loading:

- **Host**: Main web application (`apps/web`)
- **Remote**: Plugin modules loaded at runtime
- **Shared**: Common dependencies (React, Ant Design, etc.)

---

## Features

### Core Capabilities

- **Unified Namespace (UNS) Management**
  - Tree-based namespace browser
  - Visual topic creation and editing
  - Drag-and-drop topology builder
  - Real-time data visualization
  - Tag and label management

- **Data Visualization**
  - Interactive dashboard builder
  - Real-time charting with AntV X6
  - Custom visualization components
  - Grafana integration

- **Device & Flow Management**
  - Node-RED flow editor integration
  - Source flow configuration
  - Event flow orchestration
  - Real-time connection monitoring

- **System Administration**
  - User management (Keycloak integration)
  - Role and permission management
  - System configuration
  - Resource monitoring

- **AI-Powered Assistant**
  - CopilotKit integration
  - Natural language query interface
  - Smart suggestions and automation

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 18+, React Router |
| **Language** | TypeScript 5+ |
| **Build Tool** | Vite 6+, Turbo |
| **Package Manager** | pnpm 10.13.1+ |
| **UI Library** | Ant Design 5.x |
| **State Management** | Zustand |
| **Code Editor** | CodeMirror 6 |
| **Diagramming** | AntV X6 |
| **AI Integration** | CopilotKit + OpenAI |
| **Internationalization** | react-intl |
| **Module Federation** | @module-federation/vite |
| **Linting** | ESLint, Prettier, Stylelint |
| **Git Hooks** | Husky, lint-staged |
| **Testing** | Vitest, React Testing Library |

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: 22.20.0 or higher
- **pnpm**: 10.13.1 or higher
- **Git**: Latest version

### Verify Installation

```bash
node --version  # Should be >= 22.20.0
pnpm --version  # Should be >= 10.13.1
git --version
```

### Install pnpm (if not installed)

```bash
npm install -g pnpm@latest
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Tier0-Edge/frontend
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
pnpm install
```

### 3. Configure Environment

Create `.env` files in the respective app directories:

```bash
# apps/web/.env.development
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
VITE_APP_TITLE=Tier0 Edge
```

### 4. Start Development Server

```bash
# Start the main web application
pnpm dev:web

# Or start the services Express app
pnpm dev:servicesExpress

# Or start all apps
pnpm dev
```

The application will be available at:
- **Web App**: http://localhost:5173
- **Services App**: http://localhost:3000

---

## Project Structure

```
frontend/
├── apps/                           # Application packages
│   ├── web/                        # Main React application
│   │   ├── src/
│   │   │   ├── components/         # Reusable components
│   │   │   ├── pages/              # Page components
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   ├── services/           # API services
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── utils/              # Utility functions
│   │   │   ├── types/              # TypeScript types
│   │   │   └── main.tsx            # Entry point
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── services-express/           # Express backend services
│   │   ├── src/
│   │   │   ├── routes/             # API routes
│   │   │   └── index.ts
│   │   └── package.json
│   └── services-hono/              # Hono backend (experimental)
│       └── package.json
├── packages/                       # Shared packages
│   ├── scripts/                    # Build and utility scripts
│   │   ├── src/
│   │   │   ├── intl/               # i18n utilities
│   │   │   └── index.ts
│   │   └── package.json
│   └── typescript-config/          # Shared TypeScript config
│       └── package.json
├── plugins/                        # Plugin modules (Module Federation)
│   └── alert/                      # Alert plugin example
│       ├── src/
│       └── package.json
├── scripts/                        # Project-level scripts
├── pnpm-workspace.yaml             # Workspace configuration
├── turbo.json                      # Turbo build configuration
├── package.json                    # Root package.json
├── pnpm-lock.yaml                  # Lock file
├── eslint.config.mjs               # ESLint configuration
├── .prettierrc                     # Prettier configuration
├── stylelint.config.js             # Stylelint configuration
├── commitlint.config.cjs           # Commit lint configuration
└── tsconfig.json                   # TypeScript configuration
```

---

## Development Guide

### Available Scripts

```bash
# Development
pnpm dev                    # Start all applications
pnpm dev:web                # Start only web app
pnpm dev:servicesExpress    # Start only services app

# Building
pnpm build                  # Build all packages
pnpm build:web              # Build only web app
pnpm build:servicesExpress  # Build only services app
pnpm build:scripts          # Build scripts package

# Code Quality
pnpm lint                   # Run ESLint
pnpm intl:once              # Extract i18n messages (once)
pnpm intl:watch             # Watch for i18n changes
pnpm properties:convert     # Convert JSON to properties

# Maintenance
pnpm clean                  # Clean all node_modules
```

### Creating a New Component

```tsx
// apps/web/src/components/MyComponent/index.tsx
import React from 'react';
import { Button } from 'antd';

interface MyComponentProps {
  title: string;
  onClick?: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onClick }) => {
  return (
    <div className="my-component">
      <h1>{title}</h1>
      <Button onClick={onClick}>Click Me</Button>
    </div>
  );
};
```

### Creating a New Page

```tsx
// apps/web/src/pages/MyPage/index.tsx
import React from 'react';
import { MyComponent } from '../../components/MyComponent';

export const MyPage: React.FC = () => {
  return (
    <div>
      <MyComponent title="Hello World" />
    </div>
  );
};
```

### State Management with Zustand

```typescript
// apps/web/src/stores/useMyStore.ts
import { create } from 'zustand';

interface MyStore {
  count: number;
  increment: () => void;
  decrement: () => void;
}

export const useMyStore = create<MyStore>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));

// Usage in component
import { useMyStore } from '../../stores/useMyStore';

const count = useMyStore((state) => state.count);
const increment = useMyStore((state) => state.increment);
```

### API Service Integration

```typescript
// apps/web/src/services/myService.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

export const myService = {
  async getData() {
    const response = await apiClient.get('/api/data');
    return response.data;
  },

  async postData(data: any) {
    const response = await apiClient.post('/api/data', data);
    return response.data;
  },
};
```

---

## Build & Deployment

### Build for Production

```bash
# Build all applications
pnpm build

# Build specific application
pnpm build:web
```

Build artifacts will be in:
- **Web App**: `apps/web/dist/`
- **Services App**: `apps/services-express/dist/`

### Docker Deployment

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@latest
RUN pnpm install
COPY . .
RUN pnpm build:web

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
    environment:
      - VITE_API_BASE_URL=http://backend:8080
```

---

## Module Federation

The application uses Module Federation for dynamic code splitting and plugin loading.

### Federation Configuration

```typescript
// apps/web/vite.config.ts
import federation from '@module-federation/vite';

export default defineConfig({
  plugins: [
    federation({
      name: 'web',
      remotes: {
        alert: 'alert@http://localhost:5050/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'antd', 'zustand'],
    }),
  ],
});
```

### Creating a Plugin

```typescript
// plugins/alert/src/App.tsx
import React from 'react';

export const AlertPlugin = () => {
  return <div>Alert Plugin Content</div>;
};
```

```typescript
// plugins/alert/src/federation.ts
export { AlertPlugin } from './App';
```

---

## Internationalization

The application supports multiple languages using `react-intl`.

### Adding Translations

```json
// apps/web/src/locales/en.json
{
  "common.save": "Save",
  "common.cancel": "Cancel",
  "dashboard.title": "Dashboard"
}
```

```json
// apps/web/src/locales/zh.json
{
  "common.save": "保存",
  "common.cancel": "取消",
  "dashboard.title": "仪表板"
}
```

### Using Translations in Components

```tsx
import { FormattedMessage } from 'react-intl';

const MyComponent = () => {
  return (
    <button>
      <FormattedMessage id="common.save" />
    </button>
  );
};
```

### Managing i18n

```bash
# Extract messages from source
pnpm intl:once

# Watch for changes
pnpm intl:watch

# Convert JSON to properties
pnpm properties:convert
```

---

## AI Integration

The application integrates with CopilotKit for AI-powered features.

### Setting Up CopilotKit

```typescript
// apps/web/src/main.tsx
import { CopilotKit } from '@copilotkit/react-core';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CopilotKit runtimeUrl="/api/copilot">
      <App />
    </CopilotKit>
  </React.StrictMode>
);
```

### Using AI Features

```tsx
import { useCopilotReadable, useCopilotAction } from '@copilotkit/react-core';

const MyComponent = ({ data }) => {
  useCopilotReadable({
    description: 'Current data',
    value: JSON.stringify(data),
  });

  useCopilotAction({
    name: 'updateData',
    description: 'Update the data',
    parameters: [
      {
        name: 'newValue',
        type: 'string',
        required: true,
      },
    ],
    handler: ({ newValue }) => {
      // Handle action
    },
  });

  return <div>...</div>;
};
```

---

## Styling & Theming

### CSS Modules

```css
/* apps/web/src/components/MyComponent/styles.module.css */
.container {
  display: flex;
  gap: 16px;
}

.button {
  padding: 8px 16px;
}
```

```tsx
import styles from './styles.module.css';

export const MyComponent = () => {
  return <div className={styles.container}>...</div>;
};
```

### Ant Design Theming

```typescript
// apps/web/src/theme/index.ts
import { ConfigProvider, theme } from 'antd';

export const AppTheme = ({ children }: { children: React.ReactNode }) => {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 4,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
};
```

---

## Testing

### Unit Tests with Vitest

```typescript
// apps/web/src/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders title correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

---

## Performance

### Optimization Techniques

- **Code Splitting**: Route-based and component-based splitting
- **Tree Shaking**: Removing unused code
- **Lazy Loading**: Dynamic imports for heavy components
- **Image Optimization**: WebP format, lazy loading
- **Bundle Size**: Optimized with Rollup

### Performance Budgets

- **Initial Bundle**: < 500KB
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s

---

## Troubleshooting

### Common Issues

**Issue**: pnpm install fails
```bash
# Solution: Clear cache and reinstall
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Issue**: Module Federation not working
```bash
# Solution: Ensure remote is running
# Check browser console for errors
# Verify remoteEntry.js is accessible
```

**Issue**: TypeScript errors after update
```bash
# Solution: Rebuild TypeScript
pnpm build:scripts
```

---

## Code Quality

### Linting

```bash
# Run ESLint
pnpm lint

# Fix issues automatically
pnpm lint --fix
```

### Prettier

```bash
# Check formatting
pnpm prettier --check .

# Fix formatting
pnpm prettier --write .
```

### Git Hooks

The project uses Husky and lint-staged for pre-commit hooks:

```bash
# Hooks are configured in .husky/
# Run on every commit
- ESLint for TS/JS files
- Stylelint for CSS/SCSS files
- Prettier for JSON/MD files
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](../CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linters and tests
5. Commit with conventional commits
6. Push and create a PR

### Commit Convention

```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: update dependencies
```

---

## Browser Support

| Browser | Version |
|---------|---------|
| Chrome | 89+ |
| Edge | 89+ |
| Firefox | 89+ |
| Safari | 15+ |

---

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](../LICENSE) file for details.

---

## Support & Contact

- 📖 [Documentation](https://tier0edge.vercel.app/)
- 🐛 [Issue Tracker](https://github.com/freezonex/Tier0-Edge/issues)
- 💬 [Discussions](https://github.com/freezonex/Tier0-Edge/discussions)

---

## Acknowledgments

Built with:

- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Ant Design](https://ant.design/) - UI library
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [AntV X6](https://x6.antv.antgroup.com/) - Diagramming
- [CopilotKit](https://copilotkit.ai/) - AI integration
- All other open-source contributors

---

<div align="center">

**Built with ❤️ for the Industrial IoT Community**

</div>
