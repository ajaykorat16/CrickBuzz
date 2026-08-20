/**
 * Socket.IO Implementation for Live Cricket Scoring
 * 
 * This module manages real-time WebSocket connections. It handles user authentication
 * on connection, and uses the Socket.IO "Rooms" feature to broadcast live score
 * updates to users who have subscribed to specific matches.
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');

// Singleton instance of the Socket.IO server
let io;

/**
 * Initialize the Socket.IO server and bind it to the HTTP server.
 * Sets up CORS and applies authentication middleware.
 * 
 * @param {Object} server - The HTTP server instance
 * @returns {Server} The Socket.IO server instance
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*', // Allows connections from any frontend domain/app
      methods: ['GET', 'POST']
    }
  });

  /**
   * Authentication Middleware
   * Intercepts the WebSocket handshake to verify the user's JWT token.
   * If the token is valid, it decodes the user payload and attaches it to the socket instance.
   */
  io.use((socket, next) => {
    try {
      // Standard Socket.IO client auth object
      let token = socket.handshake.auth?.token;

      // Fallback for tools like Postman which send the token in standard HTTP headers
      if (!token && socket.handshake.headers?.authorization) {
        token = socket.handshake.headers.authorization.replace('Bearer ', '');
      }
      if (!token && socket.handshake.headers?.authentication) {
        token = socket.handshake.headers.authentication.replace('Bearer ', '');
      }

      // Reject connection if no token was found in either location
      if (!token) return next(new Error('Authentication error'));

      // Verify and decode token, attaching the user object to the socket for future use
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.user = { ...decoded, id: decoded.sub || decoded.id };
      next();
    } catch (err) {
      // Catches JWT malformed, expired, or invalid signature errors
      next(new Error('Authentication error'));
    }
  });

  // Listen for new client connections
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.user.id})`);

    /**
     * Event: `match:join`
     * Subscribes the user to a specific match's live score updates.
     * Expected Payload: { "match_id": 4 } (or just the raw ID integer for backward compatibility)
     */
    socket.on('match:join', async (payload) => {
      try {
        // Support both object payloads and raw integers
        const matchId = payload && typeof payload === 'object' ? payload.match_id : payload;
        if (!matchId) return;
        
        const { isAuthorizedViewer } = require('../helpers/scoreboard');
        const authorized = await isAuthorizedViewer(matchId, socket.user.id);
        
        if (!authorized) {
          socket.emit('match:error', { error: true, message: 'Unauthorized to view this match' });
          return;
        }
        
        // Use Socket.IO 'Rooms' to isolate users by match
        socket.join(`match:${matchId}`);
        console.log(`User ${socket.user.id} joined match:${matchId}`);
      } catch (err) {
        console.error('Socket match:join error:', err);
        socket.emit('match:error', { error: true, message: 'Failed to join match stream' });
      }
    });

    /**
     * Event: `match:leave`
     * Unsubscribes the user from a specific match's live score updates.
     * Expected Payload: { "match_id": 4 }
     */
    socket.on('match:leave', (payload) => {
      const matchId = payload && typeof payload === 'object' ? payload.match_id : payload;
      if (!matchId) return;
      
      socket.leave(`match:${matchId}`);
      console.log(`User ${socket.user.id} left match:${matchId}`);
    });

    // Handle user disconnect (e.g., closing the app/tab)
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Getter for the Socket.IO instance.
 * Allows other files (like controllers) to broadcast events to connected clients.
 * Example: getIO().to(`match:1`).emit('scoreboard:update', data);
 * 
 * @returns {Server}
 * @throws {Error} If initSocket hasn't been called yet
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
}

module.exports = {
  initSocket,
  getIO
};
