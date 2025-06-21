// servers_handler.js
// Handles all logic for servers (group chats), channels, and server chat UI
// This keeps app.js focused on DMs/friends only

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://qhbeexkqftbhjkeuruiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYmVleGtxZnRiaGprZXVydWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNzAxMTEsImV4cCI6MjA2NTg0NjExMX0.swpojIxW47IIPX097X45l3LYe5OiDZijGlAMXfCD30I';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;

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
  setupServerMembersRealtime();
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
      openServerSettingsModal();
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

// --- Socket.IO for Channel Chat ---
let channelSocket = null;
let currentChannelRoom = null;

function setupChannelSocketIO(serverId, channelId, user) {
  if (!window.io) return;
  if (!channelSocket) {
    const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
    channelSocket = window.io(socketUrl);
  }
  // Leave previous room
  if (currentChannelRoom) {
    channelSocket.emit('leave_channel', currentChannelRoom);
    channelSocket.off('channel_message');
  }
  // Join new room
  currentChannelRoom = { serverId, channelId };
  channelSocket.emit('join_channel', { serverId, channelId });
  // Listen for new messages
  channelSocket.on('channel_message', (msg) => {
    if (!msg || msg.channelId !== channelId) return;
    const isMe = msg.userId === user.user_id;
    appendChannelMessage(msg, isMe ? 'me' : 'them');
  });
}

// --- Premium Message Rendering ---
async function appendChannelMessage(msg, who) {
  const chat = document.querySelector('.chat-messages');
  if (!chat) return;
  // Get user info for avatar/username
  let username = msg.username || msg.userId || '';
  let avatar_url = msg.avatar_url || '';
  if (!username || !avatar_url) {
    const info = await getUserInfo(msg.userId);
    username = info.username;
    avatar_url = info.avatar_url;
  }
  const msgDiv = document.createElement('div');
  msgDiv.className = 'dm-message ' + who;
  msgDiv.dataset.timestamp = msg.timestamp;
  msgDiv.innerHTML = `
    <div class="dm-message-bubble">
      <div style="display:flex;align-items:center;gap:0.7em;margin-bottom:0.2em;">
        <img class="dm-chat-avatar" src="${avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar" style="width:32px;height:32px;object-fit:cover;border-radius:50%;">
        <span class="dm-chat-username" style="font-size:1.01em;">${username}</span>
        <span class="dm-message-time" style="font-size:0.93em;color:var(--gray);margin-left:0.7em;">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <span class="dm-message-text">${msg.content || ''}</span>
    </div>
  `;
  chat.appendChild(msgDiv);
  void msgDiv.offsetWidth;
  msgDiv.classList.add('dm-message-animate-in');
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

// --- Refactor openServerChannel for Real-time & Premium UI ---
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
  // Render messages with premium UI
  const user = JSON.parse(localStorage.getItem('spice_user'));
  for (const msg of messages) {
    const isMe = msg.user_id === user.user_id;
    await appendChannelMessage({
      userId: msg.user_id,
      username: msg.username,
      avatar_url: msg.avatar_url,
      content: msg.content,
      timestamp: msg.timestamp
    }, isMe ? 'me' : 'them');
  }
  // Setup Socket.IO for real-time
  setupChannelSocketIO(serverId, channelId, user);
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
        const content = input.value.trim();
        if (!user || !user.user_id || !content) return;
        input.value = '';
        // Send via Socket.IO
        channelSocket.emit('channel_message', {
          serverId,
          channelId,
          userId: user.user_id,
          username: user.username,
          avatar_url: user.avatar_url,
          content,
          timestamp: Date.now()
        });
        // Optimistically append as 'me'
        appendChannelMessage({
          userId: user.user_id,
          username: user.username,
          avatar_url: user.avatar_url,
          content,
          timestamp: Date.now()
        }, 'me');
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

// --- Server Icon & Banner Upload/Crop Logic ---
let serverIconCropper = null;
let serverBannerCropper = null;

const serverIconInput = document.getElementById('server-icon-upload-input');
const serverIconCropModal = document.getElementById('server-icon-crop-modal');
const serverIconCropArea = document.getElementById('server-icon-crop-area');
const serverIconCropConfirm = document.getElementById('server-icon-crop-confirm');
const serverIconCropCancel = document.getElementById('server-icon-crop-cancel');
const serverIconLoading = document.getElementById('server-icon-upload-loading');

const serverBannerInput = document.getElementById('server-banner-upload-input');
const serverBannerCropModal = document.getElementById('server-banner-crop-modal');
const serverBannerCropArea = document.getElementById('server-banner-crop-area');
const serverBannerCropConfirm = document.getElementById('server-banner-crop-confirm');
const serverBannerCropCancel = document.getElementById('server-banner-crop-cancel');
const serverBannerLoading = document.getElementById('server-banner-upload-loading');

// Open file input when Change Server Icon is clicked
const changeIconBtn = document.getElementById('server-settings-change-icon');
if (changeIconBtn) {
  changeIconBtn.onclick = (e) => {
    e.preventDefault();
    serverIconInput.value = '';
    serverIconInput.click();
  };
}

// Show crop modal and initialize Cropper.js for server icon
if (serverIconInput) {
  serverIconInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      serverIconCropArea.innerHTML = `<img id="server-icon-crop-img" src="${ev.target.result}" style="max-width:100%;max-height:100%;display:block;" />`;
      serverIconCropModal.style.display = 'flex';
      setTimeout(() => {
        const img = document.getElementById('server-icon-crop-img');
        if (serverIconCropper) serverIconCropper.destroy();
        serverIconCropper = new window.Cropper(img, {
          aspectRatio: 1,
          viewMode: 1,
          background: false,
          dragMode: 'move',
          guides: false,
          autoCropArea: 1,
          movable: true,
          zoomable: true,
          rotatable: false,
          scalable: false,
          cropBoxResizable: true,
          minCropBoxWidth: 100,
          minCropBoxHeight: 100,
        });
      }, 100);
    };
    reader.readAsDataURL(file);
  });
}

// Cancel crop for server icon
if (serverIconCropCancel) {
  serverIconCropCancel.onclick = () => {
    serverIconCropModal.style.display = 'none';
    if (serverIconCropper) { serverIconCropper.destroy(); serverIconCropper = null; }
  };
}

// Confirm crop and upload to Cloudinary for server icon
if (serverIconCropConfirm) {
  serverIconCropConfirm.onclick = async () => {
    if (!serverIconCropper || !currentServer) return;
    serverIconCropModal.style.display = 'none';
    serverIconLoading.style.display = 'flex';
    serverIconCropper.getCroppedCanvas({ width: 256, height: 256 }).toBlob(async (blob) => {
      try {
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', 'user_media');
        const res = await fetch('https://api.cloudinary.com/v1_1/dbriuheef/image/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.secure_url) {
          // Update icon in UI
          document.getElementById('server-settings-icon-preview').src = data.secure_url;
          document.getElementById('server-settings-icon-preview').style.display = 'block';
          document.getElementById('server-settings-icon-preview-card').src = data.secure_url;
          // Save to Supabase
          await supabase.from('servers').update({ icon_url: data.secure_url }).eq('id', currentServer.id);
          currentServer.icon_url = data.secure_url;
          renderServersList();
        } else {
          alert('Upload failed.');
        }
      } catch (err) {
        alert('Upload error: ' + err.message);
      } finally {
        serverIconLoading.style.display = 'none';
        if (serverIconCropper) { serverIconCropper.destroy(); serverIconCropper = null; }
      }
    }, 'image/jpeg', 0.95);
  };
}

// Open file input when clicking on banner color or add a "Change Banner" button if needed
const bannerColorsDiv = document.getElementById('server-settings-banner-colors');
if (bannerColorsDiv) {
  bannerColorsDiv.querySelectorAll('.profile-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      // Set selected color
      bannerColorsDiv.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const color = btn.style.backgroundColor || btn.style.background;
      document.getElementById('server-settings-banner-preview').style.background = color;
      // Save to Supabase
      if (currentServer) {
        await supabase.from('servers').update({ banner_url: null, banner_color: color }).eq('id', currentServer.id);
        currentServer.banner_url = null;
        currentServer.banner_color = color;
        renderServersList();
      }
    };
  });
}

// Banner image upload/crop logic
// (Optional: Add a "Change Banner" button for image upload, or allow clicking the preview to upload)
const serverBannerPreview = document.getElementById('server-settings-banner-preview');
if (serverBannerPreview) {
  serverBannerPreview.onclick = (e) => {
    e.preventDefault();
    serverBannerInput.value = '';
    serverBannerInput.click();
  };
}

if (serverBannerInput) {
  serverBannerInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      serverBannerCropArea.innerHTML = `<img id="server-banner-crop-img" src="${ev.target.result}" style="max-width:100%;max-height:100%;display:block;" />`;
      serverBannerCropModal.style.display = 'flex';
      setTimeout(() => {
        const img = document.getElementById('server-banner-crop-img');
        if (serverBannerCropper) serverBannerCropper.destroy();
        serverBannerCropper = new window.Cropper(img, {
          aspectRatio: 4,
          viewMode: 1,
          background: false,
          dragMode: 'move',
          guides: false,
          autoCropArea: 1,
          movable: true,
          zoomable: true,
          rotatable: false,
          scalable: false,
          cropBoxResizable: true,
          minCropBoxWidth: 200,
          minCropBoxHeight: 50,
        });
      }, 100);
    };
    reader.readAsDataURL(file);
  });
}

if (serverBannerCropCancel) {
  serverBannerCropCancel.onclick = () => {
    serverBannerCropModal.style.display = 'none';
    if (serverBannerCropper) { serverBannerCropper.destroy(); serverBannerCropper = null; }
  };
}

if (serverBannerCropConfirm) {
  serverBannerCropConfirm.onclick = async () => {
    if (!serverBannerCropper || !currentServer) return;
    serverBannerCropModal.style.display = 'none';
    serverBannerLoading.style.display = 'flex';
    serverBannerCropper.getCroppedCanvas({ width: 1200, height: 300 }).toBlob(async (blob) => {
      try {
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', 'user_media');
        const res = await fetch('https://api.cloudinary.com/v1_1/dbriuheef/image/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.secure_url) {
          // Update banner in UI
          document.getElementById('server-settings-banner-preview').style.background = '';
          document.getElementById('server-settings-banner-preview').style.backgroundImage = `url('${data.secure_url}')`;
          document.getElementById('server-settings-banner-preview').style.backgroundSize = 'cover';
          document.getElementById('server-settings-banner-preview').style.backgroundPosition = 'center';
          // Save to Supabase
          await supabase.from('servers').update({ banner_url: data.secure_url, banner_color: null }).eq('id', currentServer.id);
          currentServer.banner_url = data.secure_url;
          currentServer.banner_color = null;
          renderServersList();
        } else {
          alert('Upload failed.');
        }
      } catch (err) {
        alert('Upload error: ' + err.message);
      } finally {
        serverBannerLoading.style.display = 'none';
        if (serverBannerCropper) { serverBannerCropper.destroy(); serverBannerCropper = null; }
      }
    }, 'image/jpeg', 0.95);
  };
}

// --- Server Name Edit Logic ---
function setupServerNameEdit() {
  const nameText = document.getElementById('server-settings-name-text');
  const editBtn = document.getElementById('server-settings-edit-name-btn');
  const nameInput = document.getElementById('server-settings-name-input');
  const saveBtn = document.getElementById('server-settings-save-name-btn');
  const cancelBtn = document.getElementById('server-settings-cancel-name-btn');
  if (!nameText || !editBtn || !nameInput || !saveBtn || !cancelBtn) return;

  // Show current name
  function showName() {
    nameText.textContent = currentServer ? currentServer.name : '';
    nameText.style.display = '';
    editBtn.style.display = '';
    nameInput.style.display = 'none';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
  }

  // Show input for editing
  function showInput() {
    nameInput.value = currentServer ? currentServer.name : '';
    nameText.style.display = 'none';
    editBtn.style.display = 'none';
    nameInput.style.display = '';
    saveBtn.style.display = '';
    cancelBtn.style.display = '';
    nameInput.focus();
  }

  editBtn.onclick = showInput;
  cancelBtn.onclick = showName;
  nameInput.onkeydown = (e) => { if (e.key === 'Escape') showName(); };
  saveBtn.onclick = async () => {
    const newName = nameInput.value.trim();
    if (!newName || !currentServer) return;
    if (newName === currentServer.name) { showName(); return; }
    saveBtn.disabled = true;
    await supabase.from('servers').update({ name: newName }).eq('id', currentServer.id);
    currentServer.name = newName;
    showName();
    // Update preview card
    const preview = document.getElementById('server-settings-name-preview');
    if (preview) preview.textContent = newName;
    renderServersList();
    saveBtn.disabled = false;
  };

  // On modal open, always show name
  showName();
}

function setupServerIdCopy() {
  const idSpan = document.getElementById('server-settings-id-preview');
  const copyBtn = document.getElementById('server-settings-copy-id-btn');
  const feedback = document.getElementById('server-settings-copy-id-feedback');
  if (!idSpan || !copyBtn || !feedback) return;
  idSpan.textContent = currentServer ? currentServer.id : '';
  copyBtn.onclick = () => {
    if (!currentServer) return;
    navigator.clipboard.writeText(currentServer.id);
    feedback.style.display = 'inline-block';
    setTimeout(() => { feedback.style.display = 'none'; }, 1200);
  };
}

// Call setupServerNameEdit when opening the server settings modal
const serverSettingsModal = document.getElementById('server-settings-modal-overlay');
if (serverSettingsModal) {
  serverSettingsModal.addEventListener('transitionend', (e) => {
    if (serverSettingsModal.classList.contains('active')) {
      setupServerNameEdit();
      setupServerIdCopy();
    }
  });
}

// --- Export nothing (vanilla JS, not a module) ---
// All functions are global for now 

async function fetchServerInvites() {
  if (!currentServer) return;
  const { data: invites, error } = await supabase
    .from('server_invites')
    .select('id, user_id, status')
    .eq('server_id', currentServer.id)
    .eq('status', 'pending');
  const list = document.getElementById('server-invites-list');
  if (!list) return;
  list.innerHTML = '';
  if (error) {
    list.innerHTML = '<div class="friend-request-item">Error loading invites</div>';
    return;
  }
  if (!invites.length) {
    list.innerHTML = '<div class="friend-request-item">No pending join requests</div>';
    return;
  }
  for (const invite of invites) {
    const info = await getUserInfo(invite.user_id);
    list.innerHTML += `
      <div class="friend-request-item">
        <img class="friend-request-avatar" src="${info.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar">
        <span class="friend-request-username">${info.username}</span>
        <button class="friend-request-accept" data-id="${invite.id}" data-user="${invite.user_id}">Accept</button>
        <button class="friend-request-reject" data-id="${invite.id}">Reject</button>
      </div>
    `;
  }
  // Accept/Reject handlers
  document.querySelectorAll('.friend-request-accept').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const userId = btn.getAttribute('data-user');
      // Add to server_members
      await supabase.from('server_members').insert([
        { server_id: currentServer.id, user_id: userId, role: 'member' }
      ]);
      // Mark invite as accepted
      await supabase.from('server_invites').update({ status: 'accepted' }).eq('id', id);
      fetchServerInvites();
      renderServersList();
    };
  });
  document.querySelectorAll('.friend-request-reject').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      await supabase.from('server_invites').update({ status: 'rejected' }).eq('id', id);
      fetchServerInvites();
    };
  });
}

// Show Invites section when nav-link is clicked
const invitesNavBtn = document.querySelector('.nav-link[data-section="invites"]');
if (invitesNavBtn) {
  invitesNavBtn.addEventListener('click', () => {
    document.querySelectorAll('.profile-modal-content > .modal-stagger').forEach(sec => sec.style.display = 'none');
    const invitesSection = document.getElementById('server-settings-section-invites');
    if (invitesSection) {
      invitesSection.style.display = '';
      fetchServerInvites();
    }
  });
}

let serverInvitesRealtimeSub = null;

function setupServerInvitesRealtime() {
  if (serverInvitesRealtimeSub) return;
  if (!currentServer) return;
  serverInvitesRealtimeSub = supabase.channel('server-invites-rt')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'server_invites',
      filter: `server_id=eq.${currentServer.id}`
    }, payload => {
      const invitesSection = document.getElementById('server-settings-section-invites');
      if (invitesSection && invitesSection.style.display !== 'none') {
        fetchServerInvites();
      }
    })
    .subscribe();
}

function cleanupServerInvitesRealtime() {
  if (serverInvitesRealtimeSub) {
    supabase.removeChannel(serverInvitesRealtimeSub);
    serverInvitesRealtimeSub = null;
  }
}

// Setup/cleanup subscription on modal open/close
if (serverSettingsModal) {
  serverSettingsModal.addEventListener('transitionend', (e) => {
    if (serverSettingsModal.classList.contains('active')) {
      setupServerInvitesRealtime();
    } else {
      cleanupServerInvitesRealtime();
    }
  });
}

// Show Members section when nav-link is clicked
const membersNavBtn = document.querySelector('.nav-link[data-section="members"]');
if (membersNavBtn) {
  membersNavBtn.addEventListener('click', () => {
    document.querySelectorAll('.profile-modal-content > .modal-stagger').forEach(sec => sec.style.display = 'none');
    const membersSection = document.getElementById('server-settings-section-members');
    if (membersSection) {
      membersSection.style.display = '';
      fetchServerMembers();
      setupServerMembersRealtimeForServer();
    }
  });
}

// Fetch and render server members
async function fetchServerMembers() {
  if (!currentServer) return;
  const { data: members, error } = await supabase
    .from('server_members')
    .select('user_id, role, users:users(user_id, username, avatar_url)')
    .eq('server_id', currentServer.id);
  const list = document.getElementById('server-members-list');
  if (!list) return;
  list.innerHTML = '';
  if (error) {
    list.innerHTML = '<div class="friend-request-item">Error loading members</div>';
    return;
  }
  if (!members.length) {
    list.innerHTML = '<div class="friend-request-item">No members found</div>';
    return;
  }
  for (const member of members) {
    const user = member.users || {};
    const isOwner = member.role === 'owner';
    list.innerHTML += `
      <div class="friend-request-item" style="display:flex;align-items:center;gap:1.1rem;">
        <img class="friend-request-avatar" src="${user.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
        <span class="friend-request-username" style="font-size:1.13rem;font-weight:700;">${user.username || member.user_id}</span>
        ${isOwner ? '<span class="owner-gold-tag" style="background:linear-gradient(90deg,#FFD700,#E6C200,#BFA14A);color:#fff;font-weight:800;padding:0.18em 0.8em;border-radius:0.7em;font-size:0.98em;margin-left:0.7em;letter-spacing:0.5px;box-shadow:0 2px 8px 0 rgba(255,215,0,0.13);">OWNER</span>' : ''}
      </div>
    `;
  }
}

// --- Server Settings Modal Section Switch Logic ---
window.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('#server-settings-modal-overlay .profile-settings-nav .nav-link');
  const sectionMap = {
    'server-profile': {
      section: document.getElementById('server-settings-section-server-profile'),
      title: 'Server Profile',
    },
    'emoji': {
      section: document.getElementById('server-settings-section-emoji'),
      title: 'Emoji',
    },
    'members': {
      section: document.getElementById('server-settings-section-members'),
      title: 'Members',
    },
    'roles': {
      section: document.getElementById('server-settings-section-roles'),
      title: 'Roles',
    },
    'invites': {
      section: document.getElementById('server-settings-section-invites'),
      title: 'Invites',
    },
  };
  const modalTitle = document.getElementById('server-settings-title');
  navLinks.forEach(link => {
    link.onclick = () => {
      // Remove active from all
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // Hide all sections
      Object.values(sectionMap).forEach(obj => { if (obj.section) obj.section.style.display = 'none'; });
      // Show selected section
      const key = link.getAttribute('data-section');
      if (sectionMap[key] && sectionMap[key].section) {
        sectionMap[key].section.style.display = '';
        if (modalTitle) modalTitle.textContent = sectionMap[key].title;
        // Call fetchers if needed
        if (key === 'invites') fetchServerInvites();
        if (key === 'members') fetchServerMembers();
      }
    };
  });
});

// Patch: Always reset server settings modal to Server Profile section and tab when opening
function openServerSettingsModal() {
  const modal = document.getElementById('server-settings-modal-overlay');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('active');
      // Reset to Server Profile tab/section
      const navLinks = modal.querySelectorAll('.profile-settings-nav .nav-link');
      navLinks.forEach(l => l.classList.remove('active'));
      const profileTab = modal.querySelector('.profile-settings-nav .nav-link[data-section="server-profile"]');
      if (profileTab) profileTab.classList.add('active');
      // Hide all sections
      const allSections = modal.querySelectorAll('.profile-modal-content > .modal-stagger');
      allSections.forEach(sec => sec.style.display = 'none');
      const profileSection = document.getElementById('server-settings-section-server-profile');
      if (profileSection) profileSection.style.display = '';
      const modalTitle = document.getElementById('server-settings-title');
      if (modalTitle) modalTitle.textContent = 'Server Profile';
    }, 10);
  }
}

// --- Helper to fetch user info by user_id (copied from app.js for use here) ---
async function getUserInfo(user_id) {
  const { data, error } = await supabase.from('users').select('username,avatar_url').eq('user_id', user_id).single();
  if (error || !data) return { username: user_id, avatar_url: '' };
  return data;
}

// --- Real-time Updates for Server Memberships ---
let serverMembersRealtimeSub = null;
let serverMembersRealtimeSubForServer = null;

function setupServerMembersRealtime() {
  if (serverMembersRealtimeSub) return;
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id) return;
  serverMembersRealtimeSub = supabase.channel('server-members-rt')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'server_members',
      filter: `user_id=eq.${user.user_id}`
    }, payload => {
      renderServersList();
    })
    .subscribe();
}

function setupServerMembersRealtimeForServer() {
  cleanupServerMembersRealtimeForServer();
  if (!currentServer) return;
  serverMembersRealtimeSubForServer = supabase.channel('server-members-rt-server')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'server_members',
      filter: `server_id=eq.${currentServer.id}`
    }, payload => {
      // Only update if the members section is visible
      const membersSection = document.getElementById('server-settings-section-members');
      if (membersSection && membersSection.style.display !== 'none') {
        fetchServerMembers();
      }
    })
    .subscribe();
}

function cleanupServerMembersRealtime() {
  if (serverMembersRealtimeSub) {
    supabase.removeChannel(serverMembersRealtimeSub);
    serverMembersRealtimeSub = null;
  }
}

function cleanupServerMembersRealtimeForServer() {
  if (serverMembersRealtimeSubForServer) {
    supabase.removeChannel(serverMembersRealtimeSubForServer);
    serverMembersRealtimeSubForServer = null;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setupServerMembersRealtime();
}); 