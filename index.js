const express = require('express');

const app = express();

const APP_VERSION = '1.0.0';
const PORT = process.env.PORT || '8080';
const APP_MODE = process.env.APP_MODE || 'dev';
const ERROR_MODE = (process.env.ERROR_MODE || 'off').toLowerCase();
const DEFAULT_SLOW_MS = parseEnvInt(process.env.SLOW_MS, 2000);
const READINESS_DELAY_MS = parseEnvInt(process.env.READINESS_DELAY_MS, 5000);
const SECRET_TOKEN = process.env.SECRET_TOKEN;

let isReady = false;

setTimeout(() => {
  isReady = true;
}, READINESS_DELAY_MS);

if (!SECRET_TOKEN) {
  console.warn('WARN: SECRET_TOKEN is not set');
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });
  next();
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    appMode: APP_MODE,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});

const ITEMS = [
  { id: 1, name: 'Item A' },
  { id: 2, name: 'Item B' },
  { id: 3, name: 'Item C' },
];

app.get('/api/items', (req, res) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter.toLowerCase() : '';
  const result = filter
    ? ITEMS.filter((item) => item.name.toLowerCase().includes(filter))
    : ITEMS;
  res.json(result);
});

app.get('/api/slow', (req, res) => {
  const overrideDelay = parseEnvInt(req.query.ms, NaN);
  const delay = Number.isFinite(overrideDelay) ? overrideDelay : DEFAULT_SLOW_MS;

  setTimeout(() => {
    res.json({ status: 'ok', delayMs: delay });
  }, delay);
});

app.get('/api/error', (req, res) => {
  const shouldError = (() => {
    if (ERROR_MODE === 'always') return true;
    if (ERROR_MODE === 'probabilistic') {
      return Math.random() < 0.5;
    }
    return false;
  })();

  if (shouldError) {
    res.status(500).json({ status: 'error', message: 'Simulated error' });
  } else {
    res.json({ status: 'ok', message: 'No error' });
  }
});

app.get('/healthz', (req, res) => {
  res.type('text/plain').send('ok');
});

app.get('/ready', (req, res) => {
  if (!isReady) {
    return res.status(503).json({ status: 'not-ready' });
  }
  return res.json({ status: 'ready' });
});

app.listen(Number(PORT), () => {
  console.log(`App started on port ${PORT} in mode ${APP_MODE}`);
});

function parseEnvInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
