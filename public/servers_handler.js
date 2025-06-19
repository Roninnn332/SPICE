// servers_handler.js
// Handles all logic for servers (group chats), channels, and server chat UI
// This keeps app.js focused on DMs/friends only

// --- Server State ---
let currentServer = null;
let currentChannel = null;
let serversList = [];
let channelsList = [];

// --- DOM Elements (to be set on page load) ---
let serversSidebar = null;
let channelsSidebar = null;
let serverChatSection = null;

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  serversSidebar = document.querySelector('.servers-sidebar');
  channelsSidebar = document.querySelector('.channels-sidebar');
  serverChatSection = document.querySelector('.chat-section');
  // TODO: Fetch and render servers for the user
  // renderServersList();
});

// --- Server List UI ---
async function renderServersList() {
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id || !serversSidebar) return;
  // Fetch servers where user is a member
  const { data: memberships, error: memErr } = await supabase
    .from('server_members')
    .select('server_id, role, servers!inner(id, name, icon_url, owner_id)')
    .eq('user_id', user.user_id);
  if (memErr || !memberships) return;
  serversList = memberships.map(m => m.servers);
  // Render
  const serversListDiv = serversSidebar.querySelector('.servers-list');
  if (!serversListDiv) return;
  serversListDiv.innerHTML = '';
  // Add "+" button
  const addBtn = document.createElement('button');
  addBtn.className = 'server-btn add-server-btn';
  addBtn.title = 'Add Server';
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  addBtn.onclick = () => {
    // Show modal for create/join
    openCreateServerModal();
  };
  serversListDiv.appendChild(addBtn);
  // Render each server
  serversList.forEach(server => {
    const btn = document.createElement('button');
    btn.className = 'server-btn' + (currentServer && currentServer.id === server.id ? ' active' : '');
    btn.title = server.name;
    if (server.icon_url) {
      btn.innerHTML = `<img src="${server.icon_url}" alt="${server.name}" class="user-avatar-initial" style="width:32px;height:32px;object-fit:cover;border-radius:50%;">`;
    } else {
      btn.innerHTML = `<span class="user-avatar-initial">${server.name[0] ? server.name[0].toUpperCase() : '?'}</span>`;
    }
    btn.onclick = () => {
      currentServer = server;
      renderServersList(); // re-render to update active
      renderChannelsList(server.id);
    };
    serversListDiv.appendChild(btn);
  });
}

// --- Channel List UI ---
async function renderChannelsList(serverId) {
  if (!serverId || !channelsSidebar) return;
  // Fetch channels for the selected server
  const { data: channels, error } = await supabase
    .from('channels')
    .select('*')
    .eq('server_id', serverId)
    .order('created_at', { ascending: true });
  if (error || !channels) return;
  channelsList = channels;
  // Render
  const channelsListDiv = channelsSidebar.querySelector('.channels-list');
  if (!channelsListDiv) return;
  channelsListDiv.innerHTML = '';
  channels.forEach(channel => {
    const btn = document.createElement('button');
    btn.className = 'channel-btn' + (currentChannel && currentChannel.id === channel.id ? ' active' : '');
    btn.textContent = `# ${channel.name}`;
    btn.onclick = () => {
      currentChannel = channel;
      renderChannelsList(serverId); // re-render to update active
      openServerChannel(serverId, channel.id);
    };
    channelsListDiv.appendChild(btn);
  });
}

// --- Server Chat UI ---
async function openServerChannel(serverId, channelId) {
  if (!serverId || !channelId || !serverChatSection) return;
  // Fetch channel info
  const channel = channelsList.find(c => c.id === channelId);
  // Render channel name in header
  const header = serverChatSection.querySelector('.chat-header');
  if (header) header.textContent = channel ? `# ${channel.name}` : '# Channel';
  // Fetch messages for the channel
  const chat = serverChatSection.querySelector('.chat-messages');
  if (chat) chat.innerHTML = '<div class="server-loading">Loading messages...</div>';
  const { data: messages, error } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('server_id', serverId)
    .eq('channel_id', channelId)
    .order('timestamp', { ascending: true });
  if (chat) chat.innerHTML = '';
  if (error || !messages) {
    if (chat) chat.innerHTML = '<div class="server-error">Failed to load messages.</div>';
    return;
  }
  // Render messages
  for (const msg of messages) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'server-message';
    msgDiv.innerHTML = `
      <span class="server-message-user">${msg.user_id}</span>
      <span class="server-message-content">${msg.content || ''}</span>
      <span class="server-message-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
    `;
    chat.appendChild(msgDiv);
  }
  // Render message input in footer
  const footer = serverChatSection.querySelector('.chat-input-area');
  if (footer) {
    footer.innerHTML = `
      <form class="server-chat-input-form" style="display:flex;width:100%;gap:0.5rem;">
        <input type="text" class="server-chat-input" placeholder="Message #${channel ? channel.name : ''}" autocomplete="off" style="flex:1;" />
        <button type="submit" class="server-chat-send-btn"><i class='fa-solid fa-paper-plane'></i></button>
      </form>
    `;
    const form = footer.querySelector('.server-chat-input-form');
    const input = footer.querySelector('.server-chat-input');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem('spice_user'));
      const content = input.value.trim();
      if (!user || !user.user_id || !content) return;
      input.value = '';
      await supabase.from('channel_messages').insert([
        {
          server_id: serverId,
          channel_id: channelId,
          user_id: user.user_id,
          content,
          timestamp: new Date().toISOString()
        }
      ]);
      openServerChannel(serverId, channelId); // re-fetch messages
    };
  }
}

// --- Server Creation/Join ---
function openCreateServerModal() {
  const overlay = document.getElementById('create-server-modal-overlay');
  const modal = document.getElementById('create-server-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('active'), 10);
  const nameInput = document.getElementById('server-name');
  if (nameInput) nameInput.focus();
}

function closeCreateServerModal() {
  const overlay = document.getElementById('create-server-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 350);
}

// Modal close handlers
window.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('create-server-modal-overlay');
  const closeBtn = document.getElementById('close-create-server-modal');
  if (closeBtn) closeBtn.onclick = closeCreateServerModal;
  if (overlay) overlay.onclick = (e) => {
    if (e.target === overlay) closeCreateServerModal();
  };
  const form = document.getElementById('create-server-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem('spice_user'));
      const name = document.getElementById('server-name').value.trim();
      const icon_url = document.getElementById('server-icon-url').value.trim();
      if (!user || !user.user_id || !name) return;
      // Create server
      const { data: server, error } = await supabase.from('servers').insert([
        { name, icon_url: icon_url || null, owner_id: user.user_id }
      ]).select().single();
      if (error || !server) return;
      // Add owner as member
      await supabase.from('server_members').insert([
        { server_id: server.id, user_id: user.user_id, role: 'owner' }
      ]);
      closeCreateServerModal();
      renderServersList();
    };
  }
});

function openJoinServerModal() {
  // TODO: Show modal for joining a server by invite code
}

// --- Real-time Updates ---
// TODO: Setup Socket.IO or Supabase Realtime for server/channel events

// --- Export nothing (vanilla JS, not a module) ---
// All functions are global for now 