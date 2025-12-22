// app/server.js
// Simple Node.js SRE Monitoring Application

const http = require('http');
const os = require('os');

const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || '1.0.0';

// Metrics storage
let requestCount = 0;
let errorCount = 0;
const startTime = Date.now();

// Request handler
const server = http.createServer((req, res) => {
  requestCount++;

  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Readiness check endpoint
  if (req.url === '/ready' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ready',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Metrics endpoint (Prometheus format)
  if (req.url === '/metrics' && req.method === 'GET') {
    const uptime = (Date.now() - startTime) / 1000;
    const metrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${requestCount}

# HELP http_errors_total Total number of HTTP errors
# TYPE http_errors_total counter
http_errors_total ${errorCount}

# HELP app_uptime_seconds Application uptime in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds ${uptime}

# HELP nodejs_memory_usage_bytes Node.js memory usage
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{type="rss"} ${process.memoryUsage().rss}
nodejs_memory_usage_bytes{type="heapTotal"} ${process.memoryUsage().heapTotal}
nodejs_memory_usage_bytes{type="heapUsed"} ${process.memoryUsage().heapUsed}
nodejs_memory_usage_bytes{type="external"} ${process.memoryUsage().external}
`;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(metrics);
    return;
  }

  // Info endpoint
  if (req.url === '/info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      app: 'SRE Monitoring Application',
      version: VERSION,
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpus: os.cpus().length,
      loadAvg: os.loadavg()
    }, null, 2));
    return;
  }

  // Simulate error endpoint (for testing)
  if (req.url === '/error' && req.method === 'GET') {
    errorCount++;
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Simulated error',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Root endpoint
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>SRE Monitoring App</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #2c3e50; }
    .endpoint { background: #f4f4f4; padding: 10px; margin: 10px 0; border-radius: 5px; }
    code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>🚀 SRE Monitoring Application</h1>
  <p>Version: ${VERSION}</p>
  <p>Hostname: ${os.hostname()}</p>
  
  <h2>Available Endpoints:</h2>
  <div class="endpoint">
    <strong>GET /health</strong> - Health check endpoint
  </div>
  <div class="endpoint">
    <strong>GET /ready</strong> - Readiness probe endpoint
  </div>
  <div class="endpoint">
    <strong>GET /metrics</strong> - Prometheus metrics
  </div>
  <div class="endpoint">
    <strong>GET /info</strong> - System information
  </div>
  <div class="endpoint">
    <strong>GET /error</strong> - Simulate an error (for testing)
  </div>
  
  <h2>Statistics:</h2>
  <p>Total Requests: ${requestCount}</p>
  <p>Total Errors: ${errorCount}</p>
  <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
</body>
</html>
    `);
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not Found',
    path: req.url
  }));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SRE Monitoring App v${VERSION} listening on port ${PORT}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
});