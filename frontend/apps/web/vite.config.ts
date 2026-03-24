import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
// import { federation } from '@module-federation/vite';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import packageJson from './package.json';
import { getDevInfo, getProxy, logBuildTime, logDevInfo } from './config/supos.dev';
// import { mfConfig } from './config/mfConfig.ts';

const devInfo = getDevInfo();
const proxy = getProxy(devInfo.API_PROXY_URL, devInfo.SINGLE_API_PROXY_LIST, devInfo.SINGLE_API_PROXY_URL);
logDevInfo(devInfo);
const buildTime = logBuildTime();

const appMarketplaceMenu = {
  id: 'frontend-app-marketplace',
  type: 2,
  icon: 'menu.tag.apps',
  code: 'app-marketplace',
  showName: '应用市场',
  sort: 999,
  url: '/app-marketplace',
  urlType: 1,
  openType: 0,
  enable: true,
};

const sendJson = (res: ServerResponse, data: unknown) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
};

const sendSvg = (res: ServerResponse, color: string) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.end(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="8" width="20" height="20" rx="4" fill="${color}"/><rect x="36" y="8" width="20" height="20" rx="4" fill="${color}" opacity="0.85"/><rect x="8" y="36" width="20" height="20" rx="4" fill="${color}" opacity="0.7"/><rect x="36" y="36" width="20" height="20" rx="4" fill="${color}" opacity="0.55"/></svg>`
  );
};

const devMockPlugin = () => ({
  name: 'tier0-dev-mock',
  configureServer(server: any) {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = req.url ? new URL(req.url, 'http://localhost') : null;
      const pathname = url?.pathname;

      if (pathname === '/inter-api/supos/resource') {
        sendJson(res, { code: 200, data: [appMarketplaceMenu] });
        return;
      }

      if (pathname === '/inter-api/supos/systemConfig') {
        sendJson(res, {
          code: 200,
          data: {
            appTitle: 'Tier0-Edge',
            authEnable: false,
            lang: 'zh-CN',
          },
        });
        return;
      }

      if (pathname === '/inter-api/supos/auth/user') {
        sendJson(res, {
          code: 200,
          data: {
            preferredUsername: 'local-dev',
            sub: 'local-dev',
            homePage: '/app-marketplace',
            superAdmin: true,
            resourceList: [],
            denyResourceList: [],
            roleList: [],
          },
        });
        return;
      }

      if (pathname === '/inter-api/supos/i18n/languages') {
        sendJson(res, {
          code: 200,
          data: {
            list: [
              {
                hasUsed: true,
                id: 1,
                languageCode: 'zh-CN',
                languageName: '中文（简体）',
                languageType: 1,
              },
              {
                hasUsed: true,
                id: 2,
                languageCode: 'en-US',
                languageName: 'English',
                languageType: 1,
              },
            ],
          },
        });
        return;
      }

      if (pathname === '/inter-api/supos/uns/i18n/messages') {
        sendJson(res, {
          code: 200,
          data: {
            messages: {},
          },
        });
        return;
      }

      if (pathname === '/copilotkit' || pathname?.startsWith('/copilotkit/')) {
        sendJson(res, { code: 200, data: {} });
        return;
      }

      if (pathname === '/files/system/resource/supos/menu.tag.apps.svg') {
        sendSvg(res, '#0f62fe');
        return;
      }

      if (pathname === '/files/system/resource/supos/menu.tag.apps-chartreuse.svg') {
        sendSvg(res, '#2d9f75');
        return;
      }

      next();
    });
  },
});

// https://vite.dev/config/
export default defineConfig({
  base: devInfo.VITE_ASSET_PREFIX || '/',
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log'],
    supported: {
      'top-level-await': true,
    },
  },
  plugins: [
    react(),
    devMockPlugin(),
    legacy({
      targets: ['chrome>=89', 'safari>=15', 'firefox>=89', 'edge>=89'],
      modernPolyfills: true,
    }),
    // federation(mfConfig),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    //导入文件时省略的扩展名
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx'],
  },
  define: {
    'process.env': { ...devInfo },
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_APP_BUILD_TIMESTAMP': JSON.stringify(buildTime),
  },
  envPrefix: ['REACT_APP_', 'VITE_', 'OPENAI_'],
  server: {
    origin: devInfo.VITE_ASSET_PREFIX,
    proxy: {
      ...proxy,
      '/copilotkit': 'http://localhost:4000',
      '/open-api': 'http://localhost:4000',
      ...(devInfo.VITE_ASSET_PREFIX !== '1'
        ? {
            '/plugin/': {
              target: devInfo.API_PROXY_URL,
              changeOrigin: true,
            },
          }
        : {
            '/mf-manifest.json': devInfo.VITE_ASSET_PREFIX,
          }),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
          antd: ['antd', '@ant-design/icons'],
          charts: ['@antv/x6'],
          utils: ['ahooks', 'lodash-es', 'dayjs'],
        },
      },
    },
    target: ['chrome89', 'edge89', 'firefox89', 'safari15'],
  },
});
