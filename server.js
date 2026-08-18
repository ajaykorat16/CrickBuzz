const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { db } = require('./config/database');
const routes = require('./routes');
const {
  notFoundHandler,
  errorMiddleware,
} = require('./middleware/error.middleware');
const { initSocket } = require('./socket');
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', routes);

// 404 must be registered before the error middleware
app.use(notFoundHandler);
app.use(errorMiddleware);

async function start() {
  try {
    await db.raw('SELECT 1');
    console.log('Database connection OK');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }

  server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port} (${config.env})`);
  });
}

start();
