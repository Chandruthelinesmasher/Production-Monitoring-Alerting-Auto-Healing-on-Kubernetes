// app/server.js
// Production-Grade Node.js SRE Monitoring Application with Static File Serving

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  PORT: process.env.PORT || 3000,
  VERSION: process.env.APP_VERSION || '2.0.0',
  ENV: process.env.NODE_ENV || 'production',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENABLE_PROFILING: process.env.ENABLE_PROFILING === 'true',
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  RATE_LIMIT_MAX: 100,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT: 60000,
  HEALTH_CHECK_DEGRADED_THRESHOLD: 0.8,
  PUBLIC_DIR: path.join(__dirname, 'public'), // Static files directory
};

// Logger utility
class Logger {
  constructor(level = 'info') {
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.level = this.levels[level] || 2;
  }

  _log(level, message, meta = {}) {
    if (this.levels[level] <= this.level) {
      const log = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
        pid: process.pid,
        hostname: os.hostname(),
      };
      console.log(JSON.stringify(log));
    }
  }

  error(message, meta) { this._log('error', message, meta); }
  warn(message, meta) { this._log('warn', message, meta); }
  info(message, meta) { this._log('info', message, meta); }
  debug(message, meta) { this._log('debug', message, meta); }
}

const logger = new Logger(CONFIG.LOG_LEVEL);

// Metrics collector with histograms
class MetricsCollector {
  constructor() {
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      requestDurations: [],
      statusCodes: {},
      endpoints: {},
      startTime: Date.now(),
    };
    this.histogramBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  recordRequest(duration, statusCode, endpoint) {
    this.metrics.requestCount++;
    this.metrics.requestDurations.push(duration);
    
    if (this.metrics.requestDurations.length > 10000) {
      this.metrics.requestDurations.shift();
    }

    this.metrics.statusCodes[statusCode] = (this.metrics.statusCodes[statusCode] || 0) + 1;
    
    if (!this.metrics.endpoints[endpoint]) {
      this.metrics.endpoints[endpoint] = { count: 0, errors: 0, totalDuration: 0 };
    }
    this.metrics.endpoints[endpoint].count++;
    this.metrics.endpoints[endpoint].totalDuration += duration;
    
    if (statusCode >= 400) {
      this.metrics.errorCount++;
      this.metrics.endpoints[endpoint].errors++;
    }
  }

  getPercentile(percentile) {
    if (this.metrics.requestDurations.length === 0) return 0;
    const sorted = [...this.metrics.requestDurations].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  getPrometheusMetrics() {
    const uptime = (Date.now() - this.metrics.startTime) / 1000;
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    let metrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${this.metrics.requestCount}

# HELP http_errors_total Total number of HTTP errors
# TYPE http_errors_total counter
http_errors_total ${this.metrics.errorCount}

# HELP app_uptime_seconds Application uptime in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds ${uptime}

# HELP http_request_duration_seconds HTTP request latencies
# TYPE http_request_duration_seconds summary
http_request_duration_seconds{quantile="0.5"} ${this.getPercentile(50) / 1000}
http_request_duration_seconds{quantile="0.9"} ${this.getPercentile(90) / 1000}
http_request_duration_seconds{quantile="0.95"} ${this.getPercentile(95) / 1000}
http_request_duration_seconds{quantile="0.99"} ${this.getPercentile(99) / 1000}

# HELP nodejs_memory_usage_bytes Node.js memory usage
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{type="rss"} ${mem.rss}
nodejs_memory_usage_bytes{type="heapTotal"} ${mem.heapTotal}
nodejs_memory_usage_bytes{type="heapUsed"} ${mem.heapUsed}
nodejs_memory_usage_bytes{type="external"} ${mem.external}

# HELP nodejs_cpu_usage_seconds Node.js CPU usage
# TYPE nodejs_cpu_usage_seconds counter
nodejs_cpu_usage_seconds{type="user"} ${cpuUsage.user / 1000000}
nodejs_cpu_usage_seconds{type="system"} ${cpuUsage.system / 1000000}

# HELP nodejs_eventloop_lag_seconds Event loop lag
# TYPE nodejs_eventloop_lag_seconds gauge
nodejs_eventloop_lag_seconds ${this.getEventLoopLag() / 1000}

`;

    Object.entries(this.metrics.statusCodes).forEach(([code, count]) => {
      metrics += `http_requests_by_status{status="${code}"} ${count}\n`;
    });

    Object.entries(this.metrics.endpoints).forEach(([endpoint, data]) => {
      const avgDuration = data.count > 0 ? data.totalDuration / data.count : 0;
      metrics += `http_requests_by_endpoint{endpoint="${endpoint}"} ${data.count}\n`;
      metrics += `http_errors_by_endpoint{endpoint="${endpoint}"} ${data.errors}\n`;
      metrics += `http_request_duration_by_endpoint{endpoint="${endpoint}"} ${avgDuration / 1000}\n`;
    });

    return metrics;
  }

  getEventLoopLag() {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      this._eventLoopLag = lag;
    });
    return this._eventLoopLag || 0;
  }
}

const metricsCollector = new MetricsCollector();

// Circuit Breaker implementation
class CircuitBreaker {
  constructor(threshold, timeout) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info('Circuit breaker closed');
    }
  }

  recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      logger.warn('Circuit breaker opened', { failureCount: this.failureCount });
    }
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker half-open');
        return true;
      }
      return false;
    }
    return true;
  }

  getState() {
    return { state: this.state, failureCount: this.failureCount };
  }
}

const circuitBreaker = new CircuitBreaker(
  CONFIG.CIRCUIT_BREAKER_THRESHOLD,
  CONFIG.CIRCUIT_BREAKER_TIMEOUT
);

// Rate limiter
class RateLimiter {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }
    
    const userRequests = this.requests.get(identifier);
    const validRequests = userRequests.filter(time => time > windowStart);
    
    this.requests.set(identifier, validRequests);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    return true;
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [identifier, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(time => time > windowStart);
      if (valid.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, valid);
      }
    }
  }
}

const rateLimiter = new RateLimiter(CONFIG.RATE_LIMIT_WINDOW, CONFIG.RATE_LIMIT_MAX);
setInterval(() => rateLimiter.cleanup(), 60000);

// Health checker
class HealthChecker {
  constructor() {
    this.checks = new Map();
  }

  registerCheck(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  async runChecks() {
    const results = {};
    let allHealthy = true;
    let anyDegraded = false;

    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const result = await checkFn();
        results[name] = result;
        if (result.status !== 'healthy') {
          allHealthy = false;
          if (result.status === 'degraded') {
            anyDegraded = true;
          }
        }
      } catch (error) {
        results[name] = { status: 'unhealthy', error: error.message };
        allHealthy = false;
      }
    }

    return {
      status: allHealthy ? 'healthy' : (anyDegraded ? 'degraded' : 'unhealthy'),
      checks: results,
      timestamp: new Date().toISOString(),
    };
  }
}

const healthChecker = new HealthChecker();

healthChecker.registerCheck('memory', async () => {
  const usage = process.memoryUsage();
  const percentUsed = usage.heapUsed / usage.heapTotal;
  
  return {
    status: percentUsed < CONFIG.HEALTH_CHECK_DEGRADED_THRESHOLD ? 'healthy' : 'degraded',
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    percentUsed: (percentUsed * 100).toFixed(2) + '%',
  };
});

healthChecker.registerCheck('eventLoop', async () => {
  const lag = metricsCollector.getEventLoopLag();
  return {
    status: lag < 100 ? 'healthy' : (lag < 500 ? 'degraded' : 'unhealthy'),
    lagMs: lag,
  };
});

healthChecker.registerCheck('circuitBreaker', async () => {
  const state = circuitBreaker.getState();
  return {
    status: state.state === 'CLOSED' ? 'healthy' : 'degraded',
    ...state,
  };
});

// Static file serving
function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('❌ Error reading file:', filePath, err.message);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    
    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    console.log('✅ Serving file:', filePath, 'as', contentType);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

function requestLogger(req, startTime, requestId) {
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    remoteAddress: req.socket.remoteAddress,
  });
}

function responseLogger(req, res, startTime, requestId, statusCode) {
  const duration = Date.now() - startTime;
  logger.info('Request completed', {
    requestId,
    method: req.method,
    url: req.url,
    statusCode,
    duration: `${duration}ms`,
  });
}

// Request handler
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  req.setTimeout(CONFIG.REQUEST_TIMEOUT);
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-App-Version', CONFIG.VERSION);
  
  requestLogger(req, startTime, requestId);

  const clientId = req.socket.remoteAddress;
  if (!rateLimiter.isAllowed(clientId)) {
    const duration = Date.now() - startTime;
    metricsCollector.recordRequest(duration, 429, req.url);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      requestId,
    }));
    responseLogger(req, res, startTime, requestId, 429);
    return;
  }

  if (!circuitBreaker.canExecute()) {
    const duration = Date.now() - startTime;
    metricsCollector.recordRequest(duration, 503, req.url);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Service Unavailable',
      message: 'Circuit breaker is open',
      requestId,
    }));
    responseLogger(req, res, startTime, requestId, 503);
    return;
  }

  try {
    await handleRequest(req, res, requestId);
    circuitBreaker.recordSuccess();
  } catch (error) {
    circuitBreaker.recordFailure();
    logger.error('Request handler error', {
      requestId,
      error: error.message,
      stack: error.stack,
    });
    
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        requestId,
        message: CONFIG.ENV === 'development' ? error.message : 'An error occurred',
      }));
    }
  } finally {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode || 500;
    metricsCollector.recordRequest(duration, statusCode, req.url);
    responseLogger(req, res, startTime, requestId, statusCode);
  }
});

async function handleRequest(req, res, requestId) {
  // Serve static files from public directory FIRST (before API routes)
  if (req.url === '/' || req.url === '/index.html') {
    const indexPath = path.join(CONFIG.PUBLIC_DIR, 'index.html');
    console.log('🔍 DEBUG INFO:');
    console.log('  Request URL:', req.url);
    console.log('  PUBLIC_DIR:', CONFIG.PUBLIC_DIR);
    console.log('  Index Path:', indexPath);
    console.log('  File exists:', fs.existsSync(indexPath));
    
    if (!fs.existsSync(indexPath)) {
      console.log('  ❌ FILE NOT FOUND!');
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Index file not found at: ' + indexPath);
      return;
    }
    
    serveStaticFile(indexPath, res);
    return;
  }

  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    const health = await healthChecker.runChecks();
    const statusCode = health.status === 'healthy' ? 200 : (health.status === 'degraded' ? 200 : 503);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
    return;
  }

  // Readiness check
  if (req.url === '/ready' && req.method === 'GET') {
    const health = await healthChecker.runChecks();
    const isReady = health.status !== 'unhealthy';
    res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      requestId,
    }));
    return;
  }

  // Liveness check
  if (req.url === '/live' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'alive',
      timestamp: new Date().toISOString(),
      requestId,
    }));
    return;
  }

  // Metrics endpoint
  if (req.url === '/metrics' && req.method === 'GET') {
    const metrics = metricsCollector.getPrometheusMetrics();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(metrics);
    return;
  }

  // Info endpoint
  if (req.url === '/info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      app: 'Production SRE Monitoring Application',
      version: CONFIG.VERSION,
      environment: CONFIG.ENV,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpus: os.cpus().length,
      loadAvg: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      networkInterfaces: os.networkInterfaces(),
      requestId,
    }, null, 2));
    return;
  }

  // Debug endpoint
  if (req.url === '/debug' && req.method === 'GET') {
    if (CONFIG.ENV !== 'development') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Debug endpoint disabled in production' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      metrics: metricsCollector.metrics,
      circuitBreaker: circuitBreaker.getState(),
      config: CONFIG,
      requestId,
    }, null, 2));
    return;
  }

  // Error simulation endpoint
  if (req.url === '/error' && req.method === 'GET') {
    throw new Error('Simulated error for testing');
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not Found',
    path: req.url,
    requestId,
  }));
}

// Graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`${signal} received, initiating graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', { error: err.message });
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    setTimeout(() => {
      logger.info('Forcing shutdown after timeout');
      process.exit(0);
    }, 10000);
    
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn('Forcing shutdown - timeout reached');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

// Start server
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  logger.info('Server started', {
    version: CONFIG.VERSION,
    port: CONFIG.PORT,
    environment: CONFIG.ENV,
    nodeVersion: process.version,
    pid: process.pid,
    publicDir: CONFIG.PUBLIC_DIR,
  });
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🚀 Production SRE Monitoring Application            ║
║  Version: ${CONFIG.VERSION}                                     ║
║  Environment: ${CONFIG.ENV}                              ║
║  Port: ${CONFIG.PORT}                                        ║
╠═══════════════════════════════════════════════════════╣
║  🌐 Dashboard: http://localhost:${CONFIG.PORT}/             ║
║  📊 Metrics:   http://localhost:${CONFIG.PORT}/metrics      ║
║  🏥 Health:    http://localhost:${CONFIG.PORT}/health       ║
║  🔍 Info:      http://localhost:${CONFIG.PORT}/info         ║
╚═══════════════════════════════════════════════════════╝
  `);
});



