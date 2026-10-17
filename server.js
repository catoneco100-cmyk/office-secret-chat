const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', ({ username, room }) => {
    if (!username || !room) {
      socket.emit('error', 'Username and room code are required');
      return;
    }

    username = username.trim().slice(0, 20);
    room = room.trim().toLowerCase().slice(0, 30);

    if (!username || !room) {
      socket.emit('error', 'Invalid username or room');
      return;
    }

    if (socket.room) {
      leaveRoom(socket);
    }

    if (!rooms.has(room)) {
      rooms.set(room, { users: new Map(), messages: [] });
    }

    const roomData = rooms.get(room);
    roomData.users.set(socket.id, username);
    socket.username = username;
    socket.room = room;
    socket.join(room);

    socket.emit('history', roomData.messages.slice(-50));

    socket.to(room).emit('system', {
      text: `${username} joined the room`,
      time: new Date().toISOString()
    });

    const userList = Array.from(roomData.users.values());
    io.to(room).emit('users', userList);

    console.log(`${username} joined room: ${room}`);
  });

  socket.on('message', (text) => {
    if (!socket.room || !socket.username) return;

    text = String(text).trim().slice(0, 500);
    if (!text) return;

    const roomData = rooms.get(socket.room);
    if (!roomData) return;

    const msg = {
      username: socket.username,
      text,
      time: new Date().toISOString()
    };

    roomData.messages.push(msg);
    if (roomData.messages.length > 200) {
      roomData.messages.shift();
    }

    io.to(socket.room).emit('message', msg);
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
  });
});

function leaveRoom(socket) {
  if (!socket.room) return;

  const roomData = rooms.get(socket.room);
  if (roomData) {
    roomData.users.delete(socket.id);

    if (roomData.users.size === 0) {
      rooms.delete(socket.room);
    } else {
      socket.to(socket.room).emit('system', {
        text: `${socket.username} left the room`,
        time: new Date().toISOString()
      });
      const userList = Array.from(roomData.users.values());
      io.to(socket.room).emit('users', userList);
    }
  }

  socket.leave(socket.room);
  socket.room = null;
  socket.username = null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Office Secret Chat running on port ${PORT}`);
});
