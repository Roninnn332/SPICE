// servers_handler.js
// Handles all logic for servers (group chats), channels, and server chat UI
// This keeps app.js focused on DMs/friends only

// --- Supabase Initialization ---
let supabaseClient = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
  const SUPABASE_URL = 'https://qhbeexkqftbhjkeuruiy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYmVleGtxZnRiaGprZXVydWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNzAxMTEsImV4cCI6MjA2NTg0NjExMX0.swpojIxW47IIPX097X45l3LYe5OiDZijGlAMXfCD30I';
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabase = supabaseClient;
}

// --- Server Members Realtime Subscriptions (move to top to avoid TDZ error) ---
let serverMembersRealtimeSub = null;
let serverMembersRealtimeSubForServer = null;

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
  setupServerMembersRealtime();
  if (serversSidebar) {
    renderServersList();
  }
});

// --- Server List UI ---
async function renderServersList() {
  if (!supabaseClient || !serversSidebar) return;
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id || !serversSidebar) return;
  const { data: memberships, error: memErr } = await supabaseClient
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
  const { data: channels, error } = await supabaseClient
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
    const isMe = String(msg.userId) === String(user.user_id);
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
  const { data: messages, error } = await supabaseClient
    .from('channel_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true });
  if (chat) chat.innerHTML = '';
  if (error || !messages) {
    if (chat) chat.innerHTML = '<div class="server-error">Failed to load messages.</div>';
    return;
  }
  // Render messages with premium UI
  const user = JSON.parse(localStorage.getItem('spice_user'));
  for (const msg of messages) {
    const isMe = String(msg.user_id) === String(user.user_id);
    await appendChannelMessage({
      userId: msg.user_id,
      username: msg.username,
      avatar_url: msg.avatar_url,
      content: msg.content,
      timestamp: msg.created_at
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
          userId: Number(user.user_id),
          username: user.username,
          avatar_url: user.avatar_url,
          content,
          timestamp: Date.now()
        });
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
  if (createServerAvatarUrlInput) createServerAvatarUrlInput.value = '';
  if (serverNameInput) serverNameInput.value = '';
  updateCreateServerAvatarPreview();
}

function closeCreateServerModal() {
  const overlay = document.getElementById('create-server-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 350);
}

// --- Create Server Modal Avatar Upload & Preview Logic ---
const createServerAvatarPreviewDiv = document.getElementById('create-server-avatar-preview');
const createServerAvatarInput = document.getElementById('create-server-avatar-input');
const createServerAvatarUrlInput = document.getElementById('create-server-avatar-url');
const serverNameInput = document.getElementById('server-name');

function updateCreateServerAvatarPreview() {
  const url = createServerAvatarUrlInput.value;
  const name = serverNameInput.value.trim();
  if (url) {
    createServerAvatarPreviewDiv.className = 'server-avatar-upload-preview uploaded';
    createServerAvatarPreviewDiv.style.backgroundImage = `url('${url}')`;
    createServerAvatarPreviewDiv.innerHTML = `<span class='server-avatar-upload-plus'><i class='fa-solid fa-plus'></i></span>`;
  } else if (name) {
    createServerAvatarPreviewDiv.className = 'server-avatar-upload-preview letter';
    createServerAvatarPreviewDiv.style.backgroundImage = '';
    createServerAvatarPreviewDiv.textContent = name[0].toUpperCase();
  } else {
    createServerAvatarPreviewDiv.className = 'server-avatar-upload-preview';
    createServerAvatarPreviewDiv.style.backgroundImage = '';
    createServerAvatarPreviewDiv.innerHTML = `
      <span class='server-avatar-upload-icon'><i class='fa-solid fa-camera'></i></span>
      <span class='server-avatar-upload-text'>UPLOAD</span>
      <span class='server-avatar-upload-plus'><i class='fa-solid fa-plus'></i></span>
    `;
  }
}

if (createServerAvatarPreviewDiv && createServerAvatarInput) {
  createServerAvatarPreviewDiv.onclick = () => {
    createServerAvatarInput.value = '';
    createServerAvatarInput.click();
  };
}
if (serverNameInput) {
  serverNameInput.addEventListener('input', updateCreateServerAvatarPreview);
}
if (createServerAvatarInput) {
  createServerAvatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      serverIconCropArea.innerHTML = `<img id="server-icon-crop-img" src="${ev.target.result}" style="max-width:100%;max-height:100%;display:block;" />`;
      serverIconCropModal.style.display = 'flex';
      setTimeout(() => {
        const img = document.getElementById('server-icon-crop-img');
        if (createServerAvatarCropper) createServerAvatarCropper.destroy();
        createServerAvatarCropper = new window.Cropper(img, {
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
// After upload/crop, update preview
if (serverIconCropConfirm) {
  serverIconCropConfirm.onclick = async () => {
    if (!createServerAvatarCropper) return;
    serverIconCropModal.style.display = 'none';
    serverIconLoading.style.display = 'flex';
    createServerAvatarCropper.getCroppedCanvas({ width: 256, height: 256 }).toBlob(async (blob) => {
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
          createServerAvatarUrlInput.value = data.secure_url;
          updateCreateServerAvatarPreview();
        } else {
          alert('Upload failed.');
        }
      } catch (err) {
        alert('Upload error: ' + err.message);
      } finally {
        serverIconLoading.style.display = 'none';
        if (createServerAvatarCropper) { createServerAvatarCropper.destroy(); createServerAvatarCropper = null; }
      }
    }, 'image/jpeg', 0.95);
  };
}

// --- Create Server Modal Success Celebration ---
function showCreateServerSuccess(serverName) {
  const modalContent = document.getElementById('create-server-modal-content');
  const successDiv = document.getElementById('create-server-success');
  if (!modalContent || !successDiv) return;
  // Hide form
  const form = document.getElementById('create-server-form');
  if (form) form.style.display = 'none';
  // Show celebration
  successDiv.innerHTML = `
    <div class="celebration-animation" style="margin-bottom:1.5rem;">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="40" r="38" stroke="#43b581" stroke-width="4" fill="#23272a" />
        <path d="M25 42L36 53L56 33" stroke="#43b581" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h3 class="modal-title" style="color:#43b581;">Server Created!</h3>
    <div style="font-size:1.15rem;margin:0.7rem 0 1.2rem 0;color:var(--white);">Your server <b>${serverName}</b> is ready to go.</div>
    <button id="create-server-success-close" class="profile-btn" style="margin-top:0.7rem;">Let's Go!</button>
    <div class="confetti" id="create-server-confetti"></div>
  `;
  successDiv.style.display = 'flex';
  // Animate confetti
  launchConfetti('create-server-confetti');
  // Close on button click
  const closeBtn = document.getElementById('create-server-success-close');
  if (closeBtn) closeBtn.onclick = () => {
    closeCreateServerModal();
    setTimeout(() => {
      // Reset modal for next open
      if (form) form.style.display = '';
      successDiv.style.display = 'none';
      successDiv.innerHTML = '';
    }, 400);
  };
}
// Simple confetti animation (CSS/JS, can be improved)
function launchConfetti(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const conf = document.createElement('div');
    conf.className = 'confetti-piece';
    conf.style.left = Math.random() * 90 + '%';
    conf.style.background = `hsl(${Math.random()*360},90%,60%)`;
    conf.style.animationDelay = (Math.random()*0.7)+'s';
    container.appendChild(conf);
  }
}
// Confetti CSS
const confettiStyle = document.createElement('style');
confettiStyle.innerHTML = `
.confetti { position: absolute; left:0; right:0; top:0; bottom:0; pointer-events:none; z-index:2; }
.confetti-piece {
  position: absolute;
  width: 12px;
  height: 18px;
  border-radius: 3px;
  opacity: 0.85;
  animation: confetti-fall 1.2s cubic-bezier(.4,2,.6,1) forwards;
}
@keyframes confetti-fall {
  0% { transform: translateY(-40px) rotate(0deg) scale(1.1); opacity:1; }
  80% { opacity:1; }
  100% { transform: translateY(120px) rotate(360deg) scale(0.7); opacity:0; }
}
`;
document.head.appendChild(confettiStyle);

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

// --- Server Settings Modal Preview Update ---
function updateServerSettingsPreview(server) {
  // Banner
  const bannerDiv = document.getElementById('server-settings-banner-preview');
  if (bannerDiv) {
    if (server.banner_url) {
      bannerDiv.style.backgroundImage = `url('${server.banner_url}')`;
      bannerDiv.style.backgroundSize = 'cover';
      bannerDiv.style.backgroundPosition = 'center';
    } else {
      bannerDiv.style.backgroundImage = '';
      bannerDiv.style.backgroundColor = 'var(--primary-blue-dark)';
    }
  }
  // Avatar/Icon
  const iconImg = document.getElementById('server-settings-icon-preview-card');
  if (iconImg) {
    if (server.icon_url) {
      iconImg.style.display = '';
      iconImg.src = server.icon_url;
      iconImg.alt = server.name;
      // Remove any fallback initial if present
      if (iconImg.nextSibling && iconImg.nextSibling.classList && iconImg.nextSibling.classList.contains('user-avatar-initial')) {
        iconImg.nextSibling.remove();
      }
    } else {
      iconImg.style.display = 'none';
      // Add fallback initial if not present
      if (!iconImg.nextSibling || !iconImg.nextSibling.classList || !iconImg.nextSibling.classList.contains('user-avatar-initial')) {
        const span = document.createElement('span');
        span.className = 'user-avatar-initial';
        span.style.width = '72px';
        span.style.height = '72px';
        span.style.display = 'flex';
        span.style.alignItems = 'center';
        span.style.justifyContent = 'center';
        span.style.fontSize = '2.2rem';
        span.style.position = 'absolute';
        span.style.left = '0';
        span.style.top = '0';
        span.style.background = 'var(--primary-blue)';
        span.style.color = 'var(--white)';
        span.style.borderRadius = '50%';
        span.style.border = '4px solid var(--pure-black)';
        span.textContent = server.name && server.name[0] ? server.name[0].toUpperCase() : '?';
        iconImg.parentNode.appendChild(span);
      }
    }
  }
  // Name
  const nameDiv = document.getElementById('server-settings-name-preview');
  if (nameDiv) nameDiv.textContent = server.name || '';
  // ID
  const idSpan = document.getElementById('server-settings-id-preview');
  if (idSpan) idSpan.textContent = server.id || '';
  // Meta (optional, e.g. member count)
  // You can update #server-settings-meta-preview here if you want
}

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
      // Update preview card with current server details
      if (currentServer) updateServerSettingsPreview(currentServer);
    }, 10);
  }
}

// --- Helper to fetch user info by user_id (copied from app.js for use here) ---
async function getUserInfo(user_id) {
  const { data, error } = await supabaseClient.from('users').select('username,avatar_url').eq('user_id', user_id).single();
  if (error || !data) return { username: user_id, avatar_url: '' };
  return data;
}

// --- Real-time Updates for Server Memberships ---
function setupServerMembersRealtime() {
  if (!supabaseClient) return;
  if (serverMembersRealtimeSub) return;
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id) return;
  serverMembersRealtimeSub = supabaseClient.channel('server-members-rt')
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
  serverMembersRealtimeSubForServer = supabaseClient.channel('server-members-rt-server')
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
    supabaseClient.removeChannel(serverMembersRealtimeSub);
    serverMembersRealtimeSub = null;
  }
}

function cleanupServerMembersRealtimeForServer() {
  if (serverMembersRealtimeSubForServer) {
    supabaseClient.removeChannel(serverMembersRealtimeSubForServer);
    serverMembersRealtimeSubForServer = null;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setupServerMembersRealtime();
  const form = document.getElementById('create-server-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem('spice_user'));
      const name = document.getElementById('server-name').value.trim();
      const icon_url = document.getElementById('create-server-avatar-url').value.trim() || 'assets/server-default.png';
      if (!user || !user.user_id || !name) return;
      // Create server
      const { data: server, error } = await supabaseClient.from('servers').insert([
        { name, icon_url: icon_url || null, owner_id: user.user_id }
      ]).select().single();
      if (error || !server) return;
      // Add owner as member
      await supabaseClient.from('server_members').insert([
        { server_id: server.id, user_id: user.user_id, role: 'owner' }
      ]);
      // Create default channels
      const { data: textChannel } = await supabaseClient.from('channels').insert([
        { server_id: server.id, name: 'general', type: 'text' }
      ]).select().single();
      const { data: voiceChannel } = await supabaseClient.from('channels').insert([
        { server_id: server.id, name: 'General', type: 'voice' }
      ]).select().single();
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
      // Show celebration
      showCreateServerSuccess(name);
    };
  }
});

// --- Server Banner Upload Logic ---
let serverBannerCropper = null;
const serverBannerInput = document.getElementById('server-settings-banner-input');
const serverBannerCropModal = document.getElementById('server-settings-banner-crop-modal');
const serverBannerCropArea = document.getElementById('server-settings-banner-crop-area');
const serverBannerCropConfirm = document.getElementById('server-settings-banner-crop-confirm');
const serverBannerCropCancel = document.getElementById('server-settings-banner-crop-cancel');
const serverBannerLoading = document.getElementById('server-settings-banner-upload-loading');
const serverBannerChangeBtn = document.getElementById('server-settings-change-banner');

if (serverBannerChangeBtn && serverBannerInput) {
  serverBannerChangeBtn.onclick = (e) => {
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
    if (!serverBannerCropper) return;
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
          // Save to Supabase
          if (currentServer) {
            await supabaseClient.from('servers').update({ banner_url: data.secure_url }).eq('id', currentServer.id);
            currentServer.banner_url = data.secure_url;
            updateServerSettingsPreview(currentServer);
          }
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

// --- Wire up close button for create server modal ---
const closeCreateServerModalBtn = document.getElementById('close-create-server-modal');
if (closeCreateServerModalBtn) {
  closeCreateServerModalBtn.onclick = closeCreateServerModal;
} 