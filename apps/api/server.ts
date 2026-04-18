import express from 'express';

const app = express();
const port = Number(process.env.API_PORT || 4000);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nexresto-api', timestamp: new Date().toISOString() });
});

if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on port ${port}`);
  });
}

export default app;
