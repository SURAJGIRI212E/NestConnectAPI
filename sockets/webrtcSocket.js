// Minimal WebRTC signaling namespace for simple 1:1 calls
// Events: join(roomId), offer, answer, ice-candidate, leave

export const setupWebRTCSocket = (io) => {
  const nsp = io.of('/webrtc');

  nsp.on('connection', (socket) => {
    // Join a specific room for 1:1 call
    socket.on('join', ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      const room = nsp.adapter.rooms.get(roomId);
      const size = room ? room.size : 0;
      // Notify both peers they can proceed
      if (size >= 2) {
        socket.to(roomId).emit('ready');
        socket.emit('ready');
      }
    });

    // SDP Offer/Answer
    socket.on('offer', ({ roomId, description }) => {
      if (!roomId || !description) return;
      socket.to(roomId).emit('offer', { description });
    });

    socket.on('answer', ({ roomId, description }) => {
      if (!roomId || !description) return;
      socket.to(roomId).emit('answer', { description });
    });

    // ICE candidates
    socket.on('ice-candidate', ({ roomId, candidate }) => {
      if (!roomId || !candidate) return;
      socket.to(roomId).emit('ice-candidate', { candidate });
    });

    // Screen share notifications
    socket.on('screen-start', ({ roomId }) => {
      if (!roomId) return;
      socket.to(roomId).emit('peer-screen-started');
    });

    socket.on('screen-stop', ({ roomId }) => {
      if (!roomId) return;
      socket.to(roomId).emit('peer-screen-stopped');
    });

    // Local media status (mute / camera) forwarded to peer(s)
    socket.on('local-status', ({ roomId, muted, cameraOff }) => {
      if (!roomId) return;
      try {
        socket.to(roomId).emit('peer-muted', { muted });
      } catch (e) {}
      try {
        socket.to(roomId).emit('peer-camera-off', { cameraOff });
      } catch (e) {}
      // also emit an aggregated status event for convenience
      try {
        socket.to(roomId).emit('peer-status', { muted, cameraOff });
      } catch (e) {}
    });

    // Leave room
    socket.on('leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      socket.to(roomId).emit('peer-left');
    });

    // Cleanup notify on disconnecting
    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id) {
          // inform peers that this socket left
          socket.to(roomId).emit('peer-left');
          // also notify peers that the disconnection may be network-related
          try { socket.to(roomId).emit('peer-network-lost', { reason: 'disconnecting' }); } catch (e) {}
        }
      }
    });

    // Extra disconnect hook: provide reason for debugging/UX
    socket.on('disconnect', (reason) => {
      // attempt best-effort broadcast to rooms (some frameworks clear rooms on disconnect)
      try {
        for (const roomId of socket.rooms) {
          if (roomId !== socket.id) {
            socket.to(roomId).emit('peer-network-lost', { reason });
          }
        }
      } catch (e) {}
    });
  });
};

export default setupWebRTCSocket;

