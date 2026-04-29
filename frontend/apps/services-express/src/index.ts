import express from 'express';
import { copilotkitHandler, errorHandler, notFoundHandler } from '@/middleware';
import { registerRoutes } from '@/routes';
import { ServerManager } from '@/server';

// 创建Express应用
const app = express();

// 解析 Content-Type: application/json
app.use(express.json());
// 解析 Content-Type: application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Allow the deployed frontend at :8088 to call the local services-express port directly.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Sa-Token, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// 注册所有路由
registerRoutes(app);

// 应用基础中间件

// 应用自定义中间件
// copilotkit => ai
app.use('/copilotkit', copilotkitHandler);

// 应用错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 创建服务器管理器并启动服务器
const serverManager = new ServerManager(app);
serverManager.setupSignalHandlers();
serverManager.start();

export default app;
