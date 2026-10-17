const socket = io();

const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const output = document.getElementById('output');
const messageInput = document.getElementById('message-input');
const userPrompt = document.getElementById('user-prompt');
const roomTitle = document.getElementById('room-title');
const userListEl = document.getElementById('user-list');
const statusEl = document.getElementById('status');

let currentUsername = '';
let currentRoom = '';

usernameInput.focus();

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    roomInput.focus();
  }
});

roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    join();
  }
});

joinBtn.addEventListener('click', join);

function join() {
  const username = usernameInput.value.trim();
  const room = roomInput.value.trim();

  if (!username) {
    usernameInput.focus();
    return;
  }
  if (!room) {
    roomInput.focus();
    return;
  }

  currentUsername = username;
  currentRoom = room;

  socket.emit('join', { username, room });
}

socket.on('error', (msg) => {
  alert(msg);
  console.error(msg);
});

socket.on('history', (messages) => {
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  roomTitle.textContent = currentRoom;
  userPrompt.textContent = `${currentUsername}@office:~$`;

  output.innerHTML = '';
  appendSystem(`// connected to room: ${currentRoom}`);
  appendSystem(`// type /help for commands`);
  appendSystem('');

  messages.forEach((msg) => appendMessage(msg));
  messageInput.focus();
});

socket.on('message', (msg) => {
  appendMessage(msg);
});

socket.on('system', (msg) => {
  appendSystem(msg.text, msg.time);
});

socket.on('users', (users) => {
  userListEl.innerHTML = '';
  users.forEach((u) => {
    const div = document.createElement('div');
    div.className = 'user-item' + (u === currentUsername ? ' self' : '');
    div.textContent = u;
    userListEl.appendChild(div);
  });
});

socket.on('disconnect', () => {
  statusEl.textContent = '● disconnected';
  statusEl.style.color = '#f85149';
  appendSystem('// connection lost. refresh to reconnect');
});

socket.on('connect', () => {
  statusEl.textContent = '● connected';
  statusEl.style.color = '#3fb950';
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    // Only handle basic local commands. Admin commands go to server.
    const localCommands = ['/help', '/clear', '/users', '/room', '/me'];
    const cmd = text.split(' ')[0].toLowerCase();

    if (localCommands.includes(cmd)) {
      handleCommand(text);
      messageInput.value = '';
      return;
    }

    // Everything else (including /rooms, /kick, etc.) goes to server
    socket.emit('message', text);
    messageInput.value = '';
  }
});

function handleCommand(cmd) {
  const parts = cmd.slice(1).toLowerCase().split(/\s+/);
  const command = parts[0];

  switch (command) {
    case 'help':
      appendSystem('');
      appendSystem('// available commands:');
      appendSystem('//   /help     show this help');
      appendSystem('//   /clear    clear the terminal');
      appendSystem('//   /users    list online users in this room');
      appendSystem('//   /room     show current room');
      appendSystem('//   /me       show your username');
      appendSystem('');
      break;
    case 'clear':
      output.innerHTML = '';
      appendSystem('// terminal cleared');
      break;
    case 'users':
      appendSystem('// users in this room:');
      const items = userListEl.querySelectorAll('.user-item');
      if (items.length === 0) {
        appendSystem('// no users');
      } else {
        items.forEach((el) => {
          appendSystem(`//   ${el.textContent}`);
        });
      }
      break;
    case 'room':
      appendSystem(`// current room: ${currentRoom}`);
      break;
    case 'me':
      appendSystem(`// you are: ${currentUsername}`);
      break;
    default:
      appendSystem(`// unknown command: /${command}`);
  }
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function appendMessage(msg) {
  const div = document.createElement('div');
  div.className = 'msg';

  const isSelf = msg.username === currentUsername;
  const time = formatTime(msg.time);

  div.innerHTML = `
    <span class="time">${time}</span>
    <span class="user ${isSelf ? 'self' : ''}">${escapeHtml(msg.username)}</span>
    <span class="text">: ${escapeHtml(msg.text)}</span>
  `;

  output.appendChild(div);
  scrollToBottom();
}

function appendSystem(text, time) {
  const div = document.createElement('div');
  div.className = 'msg system';
  const t = time ? `<span class="time">${formatTime(time)}</span>` : '';
  div.innerHTML = `${t}<span class="text">${escapeHtml(text)}</span>`;
  output.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  output.scrollTop = output.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.addEventListener('beforeunload', (e) => {
  if (currentRoom) {
    e.preventDefault();
    e.returnValue = '';
  }
});
