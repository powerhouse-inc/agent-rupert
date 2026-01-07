import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Powerhouse Agent is running',
    timestamp: new Date().toISOString(),
    reactor: 'Not initialized yet'
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Powerhouse Agent',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /stats - Agent statistics (coming soon)',
      'GET /events - Recent events (coming soon)'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Powerhouse Agent server listening on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

export default app;