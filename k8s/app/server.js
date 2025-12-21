const express = require("express");
const client = require("prom-client");
const winston = require("winston");

const app = express();
const port = 3000;

/* Logger */
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

/* Prometheus Metrics */
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});
register.registerMetric(httpRequestCounter);

/* Routes */
app.get("/", (req, res) => {
  httpRequestCounter.inc({ method: "GET", route: "/", status: 200 });
  logger.info("Root endpoint hit");
  res.send("SRE Monitoring App Running");
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || "development",
  });
});

app.get("/slow", async (req, res) => {
  await new Promise((r) => setTimeout(r, 5000));
  httpRequestCounter.inc({ method: "GET", route: "/slow", status: 200 });
  res.send("Simulated slow response");
});

app.get("/crash", () => {
  throw new Error("Simulated application crash");
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  logger.info(`Metrics: http://localhost:${port}/metrics`);
  logger.info(`Health:  http://localhost:${port}/health`);
});
