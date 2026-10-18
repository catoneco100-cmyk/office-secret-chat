const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ====== ADMIN SETTINGS ======
const ADMIN_USERNAME = 'admin1';
const ADMIN_PASSWORD = 'xyao321';
// ============================

const rooms = new Map(); // roomCode -> { users: Map(socketId -> username), messages: [] }

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
  });

  socket.on('message', (text) => {
    if (!socket.room || !socket.username) return;

    text = String(text).trim().slice(0, 500);
    if (!text) return;

    // ========== ADMIN COMMANDS ==========
    if (socket.username === ADMIN_USERNAME && text.startsWith('/')) {
      const result = handleAdminCommand(socket, text);
      if (result) return; // command was handled
    }
    // ===================================

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

function handleAdminCommand(socket, text) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // Helper to check password (last part)
  function checkPass(expectedIndex) {
    return parts[expectedIndex] === ADMIN_PASSWORD;
  }
  function formatTimeForPeek(iso) {
    if (!iso) return '--:--:--';
    try {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return '--:--:--'; }
  }
  function formatTimeForPeek(iso) {
    if (!iso) return '--:--:--';
    try {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return '--:--:--'; }
  }
  // /rooms password
  if (cmd === '/rooms') {
    if (!checkPass(1)) {
      socket.emit('system', { text: '// wrong password', time: new Date().toISOString() });
      return true;
    }
    let reply = `// Active rooms (${rooms.size}):\n`;
    if (rooms.size === 0) {
      reply += '//   (no active rooms)';
    } else {
      rooms.forEach((data, name) => {
        reply += `//   ${name}  →  ${data.users.size} people\n`;
      });
    }
    socket.emit('system', { text: reply, time: new Date().toISOString() });
    return true;
  }

  // /users roomname password
  if (cmd === '/users') {
    if (parts.length < 3 || !checkPass(2)) {
      socket.emit('system', { text: '// usage: /users roomname password', time: new Date().toISOString() });
      return true;
    }
    const roomName = parts[1].toLowerCase();
    const roomData = rooms.get(roomName);
    if (!roomData) {
      socket.emit('system', { text: `// room "${roomName}" not found`, time: new Date().toISOString() });
      return true;
    }
    let reply = `// Users in "${roomName}" (${roomData.users.size}):\n`;
    roomData.users.forEach((name) => {
      reply += `//   - ${name}\n`;
    });
    socket.emit('system', { text: reply, time: new Date().toISOString() });
    return true;
  }

  // /kick username roomname password
  if (cmd === '/kick') {
    if (parts.length < 4 || !checkPass(3)) {
      socket.emit('system', { text: '// usage: /kick username roomname password', time: new Date().toISOString() });
      return true;
    }
    const targetUser = parts[1];
    const roomName = parts[2].toLowerCase();
    const roomData = rooms.get(roomName);
    if (!roomData) {
      socket.emit('system', { text: `// room "${roomName}" not found`, time: new Date().toISOString() });
      return true;
    }

    let kicked = false;
    for (const [sid, uname] of roomData.users.entries()) {
      if (uname === targetUser) {
        const targetSocket = io.sockets.sockets.get(sid);
        if (targetSocket) {
          targetSocket.emit('system', { text: '// you have been kicked by admin', time: new Date().toISOString() });
          targetSocket.disconnect(true);
          kicked = true;
        }
      }
    }
    socket.emit('system', { 
      text: kicked ? `// kicked "${targetUser}" from ${roomName}` : `// user "${targetUser}" not found in that room`, 
      time: new Date().toISOString() 
    });
    return true;
  }

  // /close roomname password
  if (cmd === '/close') {
    if (parts.length < 3 || !checkPass(2)) {
      socket.emit('system', { text: '// usage: /close roomname password', time: new Date().toISOString() });
      return true;
    }
    const roomName = parts[1].toLowerCase();
    const roomData = rooms.get(roomName);
    if (!roomData) {
      socket.emit('system', { text: `// room "${roomName}" not found`, time: new Date().toISOString() });
      return true;
    }

    // Disconnect everyone in the room
    for (const sid of roomData.users.keys()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('system', { text: '// this room has been closed by admin', time: new Date().toISOString() });
        s.disconnect(true);
      }
    }
    rooms.delete(roomName);
    socket.emit('system', { text: `// room "${roomName}" closed`, time: new Date().toISOString() });
    return true;
  }

  // /clear roomname password
  if (cmd === '/clear') {
    if (parts.length < 3 || !checkPass(2)) {
      socket.emit('system', { text: '// usage: /clear roomname password', time: new Date().toISOString() });
      return true;
    }
    const roomName = parts[1].toLowerCase();
    const roomData = rooms.get(roomName);
    if (!roomData) {
      socket.emit('system', { text: `// room "${roomName}" not found`, time: new Date().toISOString() });
      return true;
    }
    roomData.messages = [];
    io.to(roomName).emit('system', { text: '// chat history cleared by admin', time: new Date().toISOString() });
    socket.emit('system', { text: `// cleared messages in "${roomName}"`, time: new Date().toISOString() });
    return true;
  }

  // /broadcast message... password
  if (cmd === '/broadcast') {
    if (parts.length < 3 || parts[parts.length - 1] !== ADMIN_PASSWORD) {
      socket.emit('system', { text: '// usage: /broadcast your message here password', time: new Date().toISOString() });
      return true;
    }
    const message = parts.slice(1, -1).join(' ');
    const fullMsg = `// [ADMIN BROADCAST]: ${message}`;
    
    rooms.forEach((_, roomName) => {
      io.to(roomName).emit('system', { text: fullMsg, time: new Date().toISOString() });
    });
    socket.emit('system', { text: `// broadcast sent to all rooms`, time: new Date().toISOString() });
    return true;
  }
  // /peek roomname password  -> privately show last messages in a room without joining
  if (cmd === '/peek') {
    if (parts.length < 3 || !checkPass(2)) {
      socket.emit('system', { text: '// usage: /peek roomname password', time: new Date().toISOString() });
      return true;
    }
    const roomName = parts[1].toLowerCase();
    const roomData = rooms.get(roomName);
    if (!roomData) {
      socket.emit('system', { text: `// room "${roomName}" not found`, time: new Date().toISOString() });
      return true;
    }

    const recent = roomData.messages.slice(-15);
    let reply = `// PEEK: "${roomName}" (${roomData.users.size} online, ${roomData.messages.length} total msgs)\n`;
    if (recent.length === 0) {
      reply += '//   (no messages yet)\n';
    } else {
      for (const m of recent) {
        const t = formatTimeForPeek(m.time);
        reply += `//   [${t}] ${m.username}: ${m.text}\n`;
      }
    }
    socket.emit('system', { text: reply, time: new Date().toISOString() });
    return true;
  }

  // /adminhelp password  -> list all admin commands (private to admin)
  if (cmd === '/adminhelp') {
    if (parts.length < 2 || !checkPass(1)) {
      socket.emit('system', { text: '// usage: /adminhelp password', time: new Date().toISOString() });
      return true;
    }
    const lines = [
      '',
      '// ===== ADMIN COMMANDS (password: xyao321) =====',
      '//   /rooms password                - list all active rooms + user counts',
      '//   /users roomname password       - list users in a specific room',
      '//   /peek roomname password        - privately read last 15 msgs in a room',
      '//   /kick username roomname password - kick a user from a room',
      '//   /close roomname password       - close a room, disconnect everyone',
      '//   /clear roomname password       - wipe a room\'s message history',
      '//   /broadcast message password    - send a msg to every room',
      '//   /adminhelp password            - show this list',
      '// =============================================',
      ''
    ];
    socket.emit('system', { text: lines.join('\n'), time: new Date().toISOString() });
    return true;
  }
  // /peek roomname password  -> privately show last messages in a room without joining
  if (cmd === '/peek') {
    if (parts.length < 3 || !checkPass(2)) {
      socket.emit('system', { text: '// usage: /peek roomname password', time: new Date().toISOString() });
      return true;
    }
    const roomName = parts[1].toLowerCase();
    const roomData = rooms.get(roomName);
    if (!roomData) {
      socket.emit('system', { text: `// room "${roomName}" not found`, time: new Date().toISOString() });
      return true;
    }

    const recent = roomData.messages.slice(-15);
    let reply = `// PEEK: "${roomName}" (${roomData.users.size} online, ${roomData.messages.length} total msgs)\n`;
    if (recent.length === 0) {
      reply += '//   (no messages yet)\n';
    } else {
      for (const m of recent) {
        const t = formatTimeForPeek(m.time);
        reply += `//   [${t}] ${m.username}: ${m.text}\n`;
      }
    }
    socket.emit('system', { text: reply, time: new Date().toISOString() });
    return true;
  }

  // /adminhelp password  -> list all admin commands (private to admin)
  if (cmd === '/adminhelp') {
    if (parts.length < 2 || !checkPass(1)) {
      socket.emit('system', { text: '// usage: /adminhelp password', time: new Date().toISOString() });
      return true;
    }
    const lines = [
      '',
      '// ===== ADMIN COMMANDS (password: xyao321) =====',
      '//   /rooms password                - list all active rooms + user counts',
      '//   /users roomname password       - list users in a specific room',
      '//   /peek roomname password        - privately read last 15 msgs in a room',
      '//   /kick username roomname password - kick a user from a room',
      '//   /close roomname password       - close a room, disconnect everyone',
      '//   /clear roomname password       - wipe a room\'s message history',
      '//   /broadcast message password    - send a msg to every room',
      '//   /adminhelp password            - show this list',
      '// =============================================',
      ''
    ];
    socket.emit('system', { text: lines.join('\n'), time: new Date().toISOString() });
    return true;
  }

  return false; // not an admin command
}

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
add /peek and /adminhelp admin commands
