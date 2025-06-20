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
    // Add double-click event for owner to open server settings modal
    btn.ondblclick = () => {
      if (user && server.owner_id === user.user_id) {
        const modal = document.getElementById('server-settings-modal-overlay');
        if (modal) {
          modal.style.display = 'flex';
          setTimeout(() => modal.classList.add('active'), 10);
        }
      }
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
  // Split channels by type
  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');
  // Text Channels Section
  if (textChannels.length) {
    const textHeader = document.createElement('div');
    textHeader.className = 'channel-section-header';
    textHeader.textContent = 'Text Channels';
    channelsListDiv.appendChild(textHeader);
    textChannels.forEach(channel => {
      const btn = document.createElement('button');
      btn.className = 'channel-btn' + (currentChannel && currentChannel.id === channel.id ? ' active' : '');
      btn.innerHTML = `<span class='channel-icon'>#</span> ${channel.name}`;
      btn.onclick = () => {
        currentChannel = channel;
        renderChannelsList(serverId); // re-render to update active
        openServerChannel(serverId, channel.id);
      };
      channelsListDiv.appendChild(btn);
    });
    const pad = document.createElement('div');
    pad.className = 'channels-list-padding';
    channelsListDiv.appendChild(pad);
  }
  // Voice Channels Section
  if (voiceChannels.length) {
    const voiceHeader = document.createElement('div');
    voiceHeader.className = 'channel-section-header';
    voiceHeader.textContent = 'Voice Channels';
    channelsListDiv.appendChild(voiceHeader);
    voiceChannels.forEach(channel => {
      const btn = document.createElement('button');
      btn.className = 'channel-btn' + (currentChannel && currentChannel.id === channel.id ? ' active' : '');
      btn.innerHTML = `<span class='channel-icon'><i class='fa-solid fa-volume-high'></i></span> ${channel.name}`;
      btn.onclick = () => {
        currentChannel = channel;
        renderChannelsList(serverId); // re-render to update active
        openServerChannel(serverId, channel.id);
      };
      channelsListDiv.appendChild(btn);
    });
  }
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
  // Render message input in footer ONLY for text channels
  const footer = serverChatSection.querySelector('.chat-input-area');
  if (footer) {
    if (channel && channel.type === 'text') {
      footer.innerHTML = `
        <form class="server-chat-input-form fade-in-up" style="display:flex;width:100%;gap:0.5rem;">
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
    } else {
      footer.innerHTML = '';
    }
  }
}

// --- Server Creation/Join ---
function openCreateServerModal() {
  const overlay = document.getElementById('create-server-modal-overlay');
  const modal = document.getElementById('create-server-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('active'), 10);
  // Animate modal elements
  const content = modal.querySelector('.modal-content');
  if (content) {
    content.classList.remove('fade-in-up');
    void content.offsetWidth;
    content.classList.add('fade-in-up');
    const fields = content.querySelectorAll('label, input, button');
    fields.forEach((el, i) => {
      el.classList.remove('fade-in-up');
      void el.offsetWidth;
      el.classList.add('fade-in-up');
      el.style.animationDelay = (0.08 * i) + 's';
    });
  }
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
      // Create default channels
      const { data: textChannel } = await supabase.from('channels').insert([
        { server_id: server.id, name: 'general', type: 'text' }
      ]).select().single();
      const { data: voiceChannel } = await supabase.from('channels').insert([
        { server_id: server.id, name: 'General', type: 'voice' }
      ]).select().single();
      closeCreateServerModal();
      await renderServersList();
      // Auto-select the new server and its general text channel
      currentServer = server;
      if (textChannel) {
        currentChannel = textChannel;
        await renderChannelsList(server.id);
        await openServerChannel(server.id, textChannel.id);
      } else {
        await renderChannelsList(server.id);
      }
    };
  }
  // Add close logic for server settings modal
  const closeServerSettingsBtn = document.getElementById('close-server-settings-modal');
  const serverSettingsModal = document.getElementById('server-settings-modal-overlay');
  if (closeServerSettingsBtn && serverSettingsModal) {
    closeServerSettingsBtn.onclick = () => {
      serverSettingsModal.classList.remove('active');
      setTimeout(() => { serverSettingsModal.style.display = 'none'; }, 400);
    };
  }
});

function openJoinServerModal() {
  // TODO: Show modal for joining a server by invite code
}

// --- Create Channel Modal Logic ---
function openCreateChannelModal() {
  const overlay = document.getElementById('create-channel-modal-overlay');
  const modal = document.getElementById('create-channel-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('active'), 10);
  // Animate modal elements
  const content = modal.querySelector('.modal-content');
  if (content) {
    content.classList.remove('fade-in-up');
    void content.offsetWidth;
    content.classList.add('fade-in-up');
    const fields = content.querySelectorAll('label, input, button, .channel-type-section, .channel-name-input-group, .private-channel-section, .modal-actions');
    fields.forEach((el, i) => {
      el.classList.remove('fade-in-up');
      void el.offsetWidth;
      el.classList.add('fade-in-up');
      el.style.animationDelay = (0.07 * i) + 's';
    });
  }
  const nameInput = document.getElementById('new-channel-name');
  if (nameInput) nameInput.focus();
}

function closeCreateChannelModal() {
  const overlay = document.getElementById('create-channel-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 350);
}

window.addEventListener('DOMContentLoaded', () => {
  // ... existing code ...
  // Create Channel modal open/close
  const createChannelBtn = document.getElementById('create-channel-btn');
  if (createChannelBtn) createChannelBtn.onclick = openCreateChannelModal;
  const closeCreateChannelBtn = document.getElementById('close-create-channel-modal');
  if (closeCreateChannelBtn) closeCreateChannelBtn.onclick = closeCreateChannelModal;
  const cancelCreateChannelBtn = document.getElementById('cancel-create-channel');
  if (cancelCreateChannelBtn) cancelCreateChannelBtn.onclick = closeCreateChannelModal;
  const createChannelOverlay = document.getElementById('create-channel-modal-overlay');
  if (createChannelOverlay) createChannelOverlay.onclick = (e) => {
    if (e.target === createChannelOverlay) closeCreateChannelModal();
  };
  // Channel type selector logic
  const typeText = document.getElementById('channel-type-text');
  const typeVoice = document.getElementById('channel-type-voice');
  if (typeText && typeVoice) {
    typeText.onclick = () => {
      typeText.classList.add('selected');
      typeVoice.classList.remove('selected');
      typeText.querySelector('input').checked = true;
      typeVoice.querySelector('input').checked = false;
      document.getElementById('channel-name-prefix').textContent = '#';
    };
    typeVoice.onclick = () => {
      typeVoice.classList.add('selected');
      typeText.classList.remove('selected');
      typeVoice.querySelector('input').checked = true;
      typeText.querySelector('input').checked = false;
      document.getElementById('channel-name-prefix').textContent = '';
    };
  }
  // Create channel form submit
  const createChannelForm = document.getElementById('create-channel-form');
  if (createChannelForm) {
    createChannelForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!currentServer || !currentServer.id) return;
      const name = document.getElementById('new-channel-name').value.trim();
      const type = typeText && typeText.querySelector('input').checked ? 'text' : 'voice';
      if (!name) return;
      // Create channel in Supabase
      const { data: channel, error } = await supabase.from('channels').insert([
        { server_id: currentServer.id, name, type }
      ]).select().single();
      if (error || !channel) return;
      closeCreateChannelModal();
      await renderChannelsList(currentServer.id);
      // Optionally auto-select the new channel
      currentChannel = channel;
      await openServerChannel(currentServer.id, channel.id);
    };
  }
  // ... existing code ...
});

// --- Real-time Updates ---
// TODO: Setup Socket.IO or Supabase Realtime for server/channel events

// --- Export nothing (vanilla JS, not a module) ---
// All functions are global for now 