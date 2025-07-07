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
  if (window.voiceWebRTC && window.channelSocket) {
    window.voiceWebRTC.handleVoiceSignal(window.channelSocket);
  }
  serversSidebar = document.querySelector('.servers-sidebar');
  channelsSidebar = document.querySelector('.channels-sidebar');
  serverChatSection = document.querySelector('.chat-section');
  setupServerMembersRealtime();
  if (serversSidebar) {
    renderServersList();
  }

  // --- Create Channel Modal Logic ---
  const createChannelModalOverlay = document.getElementById('create-channel-modal-overlay');
  const createChannelModal = document.getElementById('create-channel-modal');
  const openCreateChannelBtn = document.getElementById('create-channel-btn');
  const cancelCreateChannelBtn = document.getElementById('cancel-create-channel');
  const submitCreateChannelBtn = document.getElementById('submit-create-channel');
  const channelOptionText = document.getElementById('channel-option-text');
  const channelOptionVoice = document.getElementById('channel-option-voice');
  const channelOptions = [channelOptionText, channelOptionVoice];
  const channelNameInput = document.getElementById('new-channel-name');

  // Open modal
  if (openCreateChannelBtn && createChannelModalOverlay) {
    openCreateChannelBtn.onclick = () => {
      createChannelModalOverlay.style.display = 'flex';
      setTimeout(() => createChannelModalOverlay.classList.add('active'), 10);
      // Reset modal state
      channelOptions.forEach(opt => opt.classList.remove('selected'));
      channelOptionText.classList.add('selected');
      if (channelNameInput) channelNameInput.value = '';
    };
  }
  // Close modal (cancel button)
  if (cancelCreateChannelBtn && createChannelModalOverlay) {
    cancelCreateChannelBtn.onclick = () => {
      createChannelModalOverlay.classList.remove('active');
      setTimeout(() => createChannelModalOverlay.style.display = 'none', 300);
    };
  }
  // Close modal when clicking outside
  if (createChannelModalOverlay && createChannelModal) {
    createChannelModalOverlay.addEventListener('click', function(e) {
      if (e.target === createChannelModalOverlay) {
        createChannelModalOverlay.classList.remove('active');
        setTimeout(() => createChannelModalOverlay.style.display = 'none', 300);
      }
    });
  }
  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && createChannelModalOverlay && createChannelModalOverlay.classList.contains('active')) {
      createChannelModalOverlay.classList.remove('active');
      setTimeout(() => createChannelModalOverlay.style.display = 'none', 300);
    }
  });
  // Channel type selection
  channelOptions.forEach(option => {
    option.addEventListener('click', function() {
      channelOptions.forEach(opt => opt.classList.remove('selected'));
      this.classList.add('selected');
    });
  });
  // Create channel logic
  if (submitCreateChannelBtn) {
    submitCreateChannelBtn.onclick = async (e) => {
      e.preventDefault();
      if (!currentServer) {
        alert('No server selected.');
        return;
      }
      const name = channelNameInput ? channelNameInput.value.trim() : '';
      if (!name) {
        alert('Channel name required.');
        return;
      }
      const selectedType = channelOptionText.classList.contains('selected') ? 'text' : 'voice';
      // Insert channel into Supabase
      const { data, error } = await supabaseClient.from('channels').insert([
        { name, type: selectedType, server_id: currentServer.id }
      ]).select().single();
      if (error) {
        alert('Error creating channel: ' + error.message);
        return;
      }
      // Close modal and refresh channel list
      createChannelModalOverlay.classList.remove('active');
      setTimeout(() => createChannelModalOverlay.style.display = 'none', 300);
      await renderChannelsList(currentServer.id);
    };
  }

  // Server icon crop modal elements
  window.serverIconCropConfirm = document.getElementById('server-icon-crop-confirm');
  window.serverIconCropModal = document.getElementById('server-icon-crop-modal');
  window.serverIconCropArea = document.getElementById('server-icon-crop-area');
  window.serverIconCropCancel = document.getElementById('server-icon-crop-cancel');
  window.serverIconLoading = document.getElementById('server-icon-upload-loading');

  // Wire up close button for create server modal
  const closeCreateServerModalBtn = document.getElementById('close-create-server-modal');
  if (closeCreateServerModalBtn) {
    closeCreateServerModalBtn.onclick = closeCreateServerModal;
  }

  // If you have other modal event listeners, wire them here as well

  // Server ID copy logic
  const copyIdBtn = document.getElementById('server-settings-copy-id-btn');
  const idSpan = document.getElementById('server-settings-id-preview');
  const feedback = document.getElementById('server-settings-copy-id-feedback');
  if (copyIdBtn && idSpan && feedback) {
    copyIdBtn.onclick = () => {
      const id = idSpan.textContent;
      if (!id) return;
      navigator.clipboard.writeText(id).then(() => {
        feedback.style.display = '';
        feedback.textContent = 'Copied!';
        setTimeout(() => { feedback.style.display = 'none'; }, 1200);
      });
    };
  }

  // --- Modal Button Actions ---
  if (typeof window._msgOptModalWired === 'undefined') {
    window._msgOptModalWired = true;
    const modalOverlay = document.getElementById('message-options-modal-overlay');
    const modal = document.getElementById('message-options-modal');
    if (modal && modalOverlay) {
      // Copy
      modal.querySelector('.msg-opt-copy').onclick = async function() {
        closeMsgOptModal();
        const ts = modalOverlay.dataset.msgTimestamp;
        const msgDiv = document.querySelector(`.chat__conversation-board__message[data-timestamp="${ts}"]`);
        if (msgDiv) {
          const text = msgDiv.querySelector('.chat__conversation-board__message__bubble span')?.innerText || '';
          await navigator.clipboard.writeText(text);
        }
      };
      // Edit
      modal.querySelector('.msg-opt-edit').onclick = function() {
        closeMsgOptModal();
        const ts = modalOverlay.dataset.msgTimestamp;
        const msgDiv = document.querySelector(`.chat__conversation-board__message[data-timestamp="${ts}"]`);
        if (msgDiv) {
          const bubble = msgDiv.querySelector('.chat__conversation-board__message__bubble');
          const span = bubble.querySelector('span');
          const oldText = span.innerText;
          // Replace with input and send button
          const input = document.createElement('input');
          input.type = 'text';
          input.value = oldText;
          input.className = 'edit-message-input';
          input.style.width = '80%';
          const sendBtn = document.createElement('button');
          sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
          sendBtn.className = 'edit-message-send-btn';
          sendBtn.title = 'Save';
          sendBtn.style.marginLeft = '0.5em';
          sendBtn.style.background = 'none';
          sendBtn.style.border = 'none';
          sendBtn.style.color = '#22d3a7';
          sendBtn.style.fontSize = '1.2em';
          sendBtn.style.cursor = 'pointer';
          sendBtn.style.verticalAlign = 'middle';
          sendBtn.style.padding = '0.2em 0.5em';
          sendBtn.style.borderRadius = '0.5em';
          sendBtn.onmousedown = e => e.preventDefault();
          bubble.innerHTML = '';
          bubble.appendChild(input);
          bubble.appendChild(sendBtn);
          input.focus();
          // Save on Enter or button click
          async function saveEdit() {
            const newText = input.value.trim();
            if (newText && newText !== oldText) {
              const user = JSON.parse(localStorage.getItem('spice_user'));
              // Ensure we send the ISO string timestamp (created_at) for edits
              const msgDiv = document.querySelector(`.chat__conversation-board__message[data-timestamp="${ts}"]`);
              let isoTimestamp = ts;
              if (msgDiv) {
                // If the DOM element has the ISO string, use it
                isoTimestamp = msgDiv.getAttribute('data-timestamp');
              }
              channelSocket.emit('channel_message_edit', {
                channelId: currentChannel.id,
                serverId: currentServer.id,
                timestamp: isoTimestamp, // always ISO string
                userId: user.user_id,
                newContent: newText
              });
            }
            closeMsgOptModal();
          }
          input.onkeydown = async function(e) {
            if (e.key === 'Enter') {
              await saveEdit();
            } else if (e.key === 'Escape') {
              bubble.innerHTML = `<span>${oldText}</span>`;
              closeMsgOptModal();
            }
          };
          sendBtn.onclick = saveEdit;
        }
      };
      // Delete
      modal.querySelector('.msg-opt-delete').onclick = function() {
        closeMsgOptModal();
        if (!confirm('Delete this message for everyone?')) return;
        const ts = modalOverlay.dataset.msgTimestamp;
        const user = JSON.parse(localStorage.getItem('spice_user'));
        channelSocket.emit('channel_message_delete', {
          channelId: currentChannel.id,
          serverId: currentServer.id,
          timestamp: ts,
          userId: user.user_id
        });
      };
      // Reply
      modal.querySelector('.msg-opt-reply').onclick = function() {
        closeMsgOptModal();
        const ts = modalOverlay.dataset.msgTimestamp;
        const msgDiv = document.querySelector(`.chat__conversation-board__message[data-timestamp="${ts}"]`);
        if (msgDiv) {
          const bubble = msgDiv.querySelector('.chat__conversation-board__message__bubble span');
          const replyText = bubble?.innerText || '';
          // Set reply state in input
          const input = document.getElementById('messageInput');
          if (input) {
            input.focus();
            input.dataset.replyTo = ts;
            input.placeholder = `Replying: ${replyText.slice(0, 40)}...`;
          }
        }
      };
      function closeMsgOptModal() {
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.style.display = 'none', 180);
      }
    }
  }
});

// --- Server List UI ---
async function renderServersList() {
  if (!supabaseClient || !serversSidebar) return;
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id || !serversSidebar) return;
  const { data: memberships, error: memErr } = await supabaseClient
    .from('server_members')
    .select('server_id, role, servers!inner(id, name, icon_url, owner_id, banner_url, banner_color)')
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
      btn.innerHTML = `<img src="${server.icon_url}" alt="${server.name}" class="server-sidebar-avatar">`;
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
  // --- Add Create Channel Button ---
  const createBtn = document.createElement('button');
  createBtn.className = 'create-channel-btn';
  createBtn.id = 'create-channel-btn';
  createBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Create Channel';
  createBtn.style.marginBottom = '18px';
  channelsListDiv.appendChild(createBtn);
  // Re-attach open modal logic
  createBtn.onclick = () => {
    const overlay = document.getElementById('create-channel-modal-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      setTimeout(() => overlay.classList.add('active'), 10);
      // Reset modal state
      const channelOptionText = document.getElementById('channel-option-text');
      const channelOptionVoice = document.getElementById('channel-option-voice');
      const channelOptions = [channelOptionText, channelOptionVoice];
      channelOptions.forEach(opt => opt && opt.classList.remove('selected'));
      if (channelOptionText) channelOptionText.classList.add('selected');
      const channelNameInput = document.getElementById('new-channel-name');
      if (channelNameInput) channelNameInput.value = '';
    }
  };
  // --- End Create Channel Button ---
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

// --- Socket.IO for Channel/Voice Presence ---
if (!window.channelSocket) {
  const socketUrl = window.location.origin;
  window.channelSocket = window.io(socketUrl);
  }
window.channelSocket.off('voice_user_joined');
window.channelSocket.on('voice_user_joined', (users) => {
  console.log('[Client] Received users:', users.map(u => u.username));
  updateVoiceUserCards(users);
  });

// --- Premium Message Rendering ---
function highlightMentions(text, members) {
  if (!members || !Array.isArray(members)) return text;
  // Sort by username length descending to avoid partial matches
  const sorted = [...members].sort((a, b) => b.username.length - a.username.length);
  let result = text;
  sorted.forEach(member => {
    const regex = new RegExp(`(^|\s)@${member.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\b)`, 'gi');
    result = result.replace(regex, `$1<span class="mention">@${member.username}</span>`);
  });
  return result;
}

async function appendChannelMessage(msg, who) {
  const chat = document.querySelector('.chat-messages');
  if (!chat) return;
  // --- Deduplication: skip if message with same timestamp and userId exists ---
  if (chat.querySelector(`.chat__conversation-board__message[data-timestamp="${msg.timestamp}"][data-userid="${msg.userId || msg.user_id}"]`)) {
    return;
  }
  // Get user info for avatar/username
  let username = msg.username || msg.userId || '';
  let avatar_url = msg.avatar_url || '';
  let role = msg.role || '';
  let reactions = msg.reactions || [];
  if (!username || !avatar_url) {
    const info = await getUserInfo(msg.userId);
    username = info.username;
    avatar_url = info.avatar_url;
  }
  // Get server members for mention highlighting
  let members = window.currentServerMembers || [];
  let content = msg.content || '';
  if (members.length) {
    content = highlightMentions(content, members);
  }
  // Role badge
  let roleBadge = '';
  if (role === 'admin') roleBadge = '<span class="role-badge">Admin</span>';
  else if (role === 'mod') roleBadge = '<span class="role-badge mod">Mod</span>';
  // Emoji reactions (not shown in new design, but keep for future)
  let emojiHtml = '';
  if (Array.isArray(reactions) && reactions.length) {
    emojiHtml = `<div class=\"emoji-reaction-container\">` +
      reactions.map(r => `<span class=\"emoji-reaction\">${r.emoji} ${r.count}</span>`).join('') +
      `</div>`;
  }
  // Alignment
  const reversed = who === 'me' ? 'reversed' : '';
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat__conversation-board__message ${reversed}`;
  msgDiv.setAttribute('data-timestamp', msg.timestamp);
  msgDiv.setAttribute('data-userid', msg.userId || msg.user_id);
  msgDiv.setAttribute('tabindex', '0');
  // --- Reply bubble ---
  let replyHtml = '';
  if (msg.reply && msg.reply.content) {
    replyHtml = `<div class="reply-bubble-pro" data-reply-to="${msg.reply.timestamp}">
      <span class="reply-content">${msg.reply.content.slice(0, 60)}</span>
    </div>`;
  }
  // --- Edited tag ---
  let editedHtml = '';
  if (msg.edited) {
    editedHtml = " <span class='edited-tag edited-tag-premium'>edited</span>";
  }
  msgDiv.innerHTML = `
    <div class="chat__conversation-board__message__person">
      <img class="chat__conversation-board__message__person__avatar" src="${avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar" width="35" height="35" />
      <span class="chat__conversation-board__message__person__nickname" style="display:none;">${username}</span>
      </div>
    <div class="chat__conversation-board__message__context">
      <div class="chat__conversation-board__message__bubble">
        ${replyHtml}<span>${content}</span>${editedHtml}
      </div>
    </div>
  `;
  // No JS for showing/hiding .more-button; CSS handles it now
  chat.appendChild(msgDiv);
  void msgDiv.offsetWidth;
  msgDiv.classList.add('dm-message-animate-in');
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

  // --- Message Options Context Menu ---
  msgDiv.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('spice_user'));
    const isOwn = String(msg.userId || msg.user_id) === String(user.user_id);
    const isOwner = user.role === 'owner';
    const modalOverlay = document.getElementById('message-options-modal-overlay');
    const modal = document.getElementById('message-options-modal');
    if (!modalOverlay || !modal) return;
    // Show/hide buttons based on permissions
    modal.querySelector('.msg-opt-edit').style.display = isOwn ? '' : 'none';
    modal.querySelector('.msg-opt-delete').style.display = (isOwn || isOwner) ? '' : 'none';
    // Store message info for later actions
    modalOverlay.dataset.msgTimestamp = msg.timestamp;
    modalOverlay.dataset.msgUserId = msg.userId || msg.user_id;
    // Position modal at cursor
    modal.style.left = e.clientX + 'px';
    modal.style.top = e.clientY + 'px';
    modalOverlay.style.display = 'flex';
    setTimeout(() => modalOverlay.classList.add('active'), 10);
  });
  // Close modal on click outside or Escape
  const modalOverlay = document.getElementById('message-options-modal-overlay');
  if (modalOverlay) {
    modalOverlay.onclick = function(e) {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.style.display = 'none', 180);
      }
    };
    document.addEventListener('keydown', function escClose(ev) {
      if (ev.key === 'Escape' && modalOverlay.classList.contains('active')) {
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.style.display = 'none', 180);
      }
    });
  }
  // Add click handler to reply bubble for scroll/highlight
  if (msg.reply && msg.reply.timestamp) {
    const replyBubble = msgDiv.querySelector('.reply-bubble-pro');
    if (replyBubble) {
      replyBubble.onclick = function() {
        const targetMsg = document.querySelector(`.chat__conversation-board__message[data-timestamp="${msg.reply.timestamp}"]`);
        if (targetMsg) {
          targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetMsg.classList.add('message-highlight');
          setTimeout(() => targetMsg.classList.remove('message-highlight'), 1200);
        }
      };
    }
  }
}

// --- Refactor openServerChannel for Real-time & Premium UI ---
async function openServerChannel(serverId, channelId) {
  // Fetch and set current server members for mentions
  await setCurrentServerMembers(serverId);
  if (!serverId || !channelId || !serverChatSection) return;
  // Always join the Socket.IO room for this channel FIRST
  if (window.channelSocket) {
    const user = JSON.parse(localStorage.getItem('spice_user'));
    window.channelSocket.emit('join_channel', { serverId, channelId, userId: user && user.user_id });
  }
  // Fetch channel info
  const channel = channelsList.find(c => c.id === channelId);
  // Render channel name in header
  const header = serverChatSection.querySelector('.chat-header');
  if (header) header.textContent = channel ? `# ${channel.name}` : '# Channel';
  const chat = serverChatSection.querySelector('.chat-messages');
  const footer = serverChatSection.querySelector('.chat-input-area');
  if (channel && channel.type === 'voice') {
    // --- NEW: If already in this voice channel, render active voice UI ---
    if (
      isInVoiceChannel &&
      currentVoiceServerId === serverId &&
      currentVoiceChannelId === channelId
    ) {
      // Render the active voice UI (user tiles and controls)
      if (chat) {
        chat.innerHTML = '<div class="voice-user-tiles"></div>';
        // Request current users from server (or rely on socket event)
        // Optionally, you could emit a request for the current user list here
        // For now, just call updateVoiceUserCards with your own user as fallback
        const user = JSON.parse(localStorage.getItem('spice_user'));
        updateVoiceUserCards([
          JSON.stringify({
            user_id: user.user_id,
            username: user.username,
            avatar_url: user.avatar_url,
            micOn: myMicOn,
            deafenOn: myDeafenOn
          })
        ]);
      }
      if (footer) {
        footer.innerHTML = `
          <div class="voice-controls animate-stagger">
            <button class="voice-control-btn mic-btn" title="Toggle Mic"><i class="fa-solid fa-microphone"></i></button>
            <button class="voice-control-btn deafen-btn" title="Toggle Deafen"><i class="fa-solid fa-headphones"></i></button>
            <button class="voice-control-btn leave-btn" title="Leave Voice"><i class="fa-solid fa-phone-slash"></i></button>
          </div>
        `;
        // Mic toggle
        const micBtn = footer.querySelector('.mic-btn');
        if (micBtn) {
          micBtn.onclick = function() {
            myMicOn = !myMicOn;
            micBtn.innerHTML = myMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
            micBtn.classList.toggle('off', !myMicOn);
            if (window.channelSocket) {
              window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
            }
            if (window.voiceWebRTC) {
              window.voiceWebRTC.setMute(!myMicOn);
            }
          };
        }
        // Deafen toggle
        const deafenBtn = footer.querySelector('.deafen-btn');
        if (deafenBtn) {
          const icon = deafenBtn.querySelector('i');
          deafenBtn.onclick = function() {
            myDeafenOn = !myDeafenOn;
            if (icon) {
              icon.className = 'fa-solid fa-headphones';
            }
            let slash = deafenBtn.querySelector('.deafen-slash-fallback');
            if (myDeafenOn) {
              if (!slash) {
                slash = document.createElement('span');
                slash.className = 'deafen-slash-fallback';
                deafenBtn.appendChild(slash);
              }
            } else {
              if (slash) slash.remove();
            }
            deafenBtn.classList.toggle('off', myDeafenOn);
            if (window.channelSocket) {
              window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
            }
            if (window.voiceWebRTC) {
              window.voiceWebRTC.setDeafen(myDeafenOn);
            }
          };
        }
        // Leave button
        const leaveBtn = footer.querySelector('.leave-btn');
        if (leaveBtn) {
          leaveBtn.onclick = function() {
            if (window.channelSocket) {
              window.channelSocket.emit('voice_leave');
            }
            if (window.voiceWebRTC) {
              window.voiceWebRTC.leaveVoiceChannel(window.channelSocket);
            }
            isInVoiceChannel = false;
            currentVoiceServerId = null;
            currentVoiceChannelId = null;
            myMicOn = true;
            myDeafenOn = false;
            openVoiceChannel(serverId, channelId);
          };
        }
      }
      return;
    }
    // --- END NEW ---
    // Do NOT join voice yet! Only show the welcome UI and set up the Join Voice button.
    isInVoiceChannel = false;
    currentVoiceServerId = null;
    currentVoiceChannelId = null;
    myMicOn = true;
    myDeafenOn = false;
    // Render the voice channel welcome UI
    if (chat) chat.innerHTML = `
      <div class="voice-channel-welcome">
        <div class="voice-channel-bg"></div>
        <div class="voice-channel-center">
          <div class="voice-channel-icon"><i class='fa-solid fa-volume-high'></i></div>
          <div class="voice-channel-title">${channel.name ? `<span class='voice-channel-title-text'>${channel.name}</span>` : ''}</div>
          <div class="voice-channel-desc">No one is currently in voice</div>
          <button class="voice-channel-join-btn">Join Voice</button>
        </div>
      </div>
    `;
    if (footer) footer.innerHTML = '';
    // Add event listener for Join Voice button
    const joinBtn = chat.querySelector('.voice-channel-join-btn');
    if (joinBtn) {
      joinBtn.onclick = function() {
        // Actually join voice now
        const user = JSON.parse(localStorage.getItem('spice_user'));
        if (window.channelSocket) {
          window.channelSocket.emit('voice_join', {
            serverId,
            channelId,
            user: {
              user_id: user.user_id,
              username: user.username,
              avatar_url: user.avatar_url,
              micOn: myMicOn,
              deafenOn: myDeafenOn
            }
          });
        }
        isInVoiceChannel = true;
        currentVoiceServerId = serverId;
        currentVoiceChannelId = channelId;
        // Start WebRTC voice streaming
        if (window.voiceWebRTC) {
          window.voiceWebRTC.joinVoiceChannel(serverId, channelId, user.user_id, window.channelSocket);
        }
        // Immediately show own user card (optimistic update)
        if (chat) {
          chat.innerHTML = '<div class="voice-user-tiles"></div>';
          updateVoiceUserCards([JSON.stringify({
            user_id: user.user_id,
            username: user.username,
            avatar_url: user.avatar_url,
            micOn: myMicOn,
            deafenOn: myDeafenOn
          })]);
        }
        if (footer) {
          footer.innerHTML = `
            <div class="voice-controls animate-stagger">
              <button class="voice-control-btn mic-btn" title="Toggle Mic"><i class="fa-solid fa-microphone"></i></button>
              <button class="voice-control-btn deafen-btn" title="Toggle Deafen"><i class="fa-solid fa-headphones"></i></button>
              <button class="voice-control-btn leave-btn" title="Leave Voice"><i class="fa-solid fa-phone-slash"></i></button>
            </div>
          `;
          // Mic toggle
          const micBtn = footer.querySelector('.mic-btn');
          if (micBtn) {
            micBtn.onclick = function() {
              myMicOn = !myMicOn;
              micBtn.innerHTML = myMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
              micBtn.classList.toggle('off', !myMicOn);
              // Emit state update
              if (window.channelSocket) {
                window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
              }
              // Mute/unmute actual audio stream
              if (window.voiceWebRTC) {
                window.voiceWebRTC.setMute(!myMicOn);
              }
            };
          }
          // Deafen toggle
          const deafenBtn = footer.querySelector('.deafen-btn');
          if (deafenBtn) {
            const icon = deafenBtn.querySelector('i');
            deafenBtn.onclick = function() {
              myDeafenOn = !myDeafenOn;
              if (icon) {
                icon.className = 'fa-solid fa-headphones';
              }
              // Add/remove slash overlay
              let slash = deafenBtn.querySelector('.deafen-slash-fallback');
              if (myDeafenOn) {
                if (!slash) {
                  slash = document.createElement('span');
                  slash.className = 'deafen-slash-fallback';
                  deafenBtn.appendChild(slash);
                }
              } else {
                if (slash) slash.remove();
              }
              deafenBtn.classList.toggle('off', myDeafenOn);
              // Emit state update
              if (window.channelSocket) {
                window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
              }
              // Mute/unmute all remote audio
              if (window.voiceWebRTC) {
                window.voiceWebRTC.setDeafen(myDeafenOn);
              }
            };
          }
          // Leave button
          const leaveBtn = footer.querySelector('.leave-btn');
          if (leaveBtn) {
            leaveBtn.onclick = function() {
              if (window.channelSocket) {
                window.channelSocket.emit('voice_leave');
              }
              // Stop WebRTC voice streaming
              if (window.voiceWebRTC) {
                window.voiceWebRTC.leaveVoiceChannel(window.channelSocket);
              }
              isInVoiceChannel = false;
              currentVoiceServerId = null;
              currentVoiceChannelId = null;
              myMicOn = true;
              myDeafenOn = false;
              openVoiceChannel(serverId, channelId);
            };
          }
        }
      };
    }
    return;
  }
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
      timestamp: msg.created_at,
      edited: msg.edited, // <-- Ensure edited status is passed
      ...(msg.reply_to && msg.reply_content ? { reply: { timestamp: msg.reply_to, content: msg.reply_content } } : {})
    }, isMe ? 'me' : 'them');
  }
  // Setup Socket.IO for real-time
  setupChannelSocketIO(serverId, channelId, user);
  // Render message input in footer ONLY for text channels
  if (footer) {
    if (channel && channel.type === 'text') {
      footer.innerHTML = `
        <form class="messageBox fade-in-up" autocomplete="off" style="width:100%;">
          <div class="fileUploadWrapper">
            <label for="file" title="Attach file">
              <svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-8"/><path d="M8 12h8"/></svg>
              <input id="file" type="file" style="display:none" />
              <span class="tooltip">Attach file</span>
            </label>
          </div>
          <input id="messageInput" type="text" autocomplete="off" placeholder="Message #${channel ? channel.name : ''}" required />
          <button type="submit" id="sendButton" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg></button>
        </form>
      `;
      const form = footer.querySelector('.messageBox');
      const input = form.querySelector('#messageInput');
      const sendBtn = form.querySelector('#sendButton');
      const fileInput = form.querySelector('#file');
      // Send message
      form.onsubmit = async (e) => {
        e.preventDefault();
        const content = input.value.trim();
        if (!user || !user.user_id || !content) return;
        const replyTo = input.dataset.replyTo;
        let reply = null;
        if (replyTo) {
          // Look up the original message content from the DOM
          const msgDiv = document.querySelector(`.chat__conversation-board__message[data-timestamp="${replyTo}"]`);
          let replyContent = '';
          if (msgDiv) {
            const bubble = msgDiv.querySelector('.chat__conversation-board__message__bubble span');
            replyContent = bubble?.innerText || '';
          }
          reply = { timestamp: replyTo, content: replyContent };
        }
        input.value = '';
        input.placeholder = `Message #${channel ? channel.name : ''}`;
        delete input.dataset.replyTo;
        // --- Optimistically render the message for sender ---
        const now = Date.now();
        appendChannelMessage({
          userId: Number(user.user_id),
          username: user.username,
          avatar_url: user.avatar_url,
          content,
          timestamp: now,
          ...(reply ? { reply } : {})
        }, 'me');
        // --- THEN emit to server as before ---
        if (reply) {
          channelSocket.emit('channel_message_reply', {
            serverId,
            channelId,
            userId: Number(user.user_id),
            username: user.username,
            avatar_url: user.avatar_url,
            content,
            timestamp: now,
            reply
          });
        } else {
          channelSocket.emit('channel_message', {
            serverId,
            channelId,
            userId: Number(user.user_id),
            username: user.username,
            avatar_url: user.avatar_url,
            content,
            timestamp: now
          });
        }
      };
      // ENTER key always sends unless mention dropdown is open
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const dropdown = document.getElementById('mention-autocomplete-dropdown');
          if (!dropdown || dropdown.style.display === 'none') {
            e.preventDefault();
            form.requestSubmit();
          }
        }
      });
      // File upload (optional: you can add your logic here)
      fileInput.onchange = async (e) => {
        // You can implement file upload logic here if needed
      };
      // Setup mention autocomplete
      setupMentionAutocomplete(input, window.currentServerMembers || []);
      // Setup mention highlighting
      setupMentionHighlighting(input, window.currentServerMembers || []);
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
const createServerForm = document.getElementById('create-server-form');
const createServerSubmitBtn = createServerForm ? createServerForm.querySelector('button[type="submit"]') : null;
let isServerAvatarUploading = false;

// --- Add: Server Avatar Crop Modal Elements ---
let createServerAvatarCropper = null;
let createServerAvatarCropModal = document.getElementById('server-icon-crop-modal');
let createServerAvatarCropArea = document.getElementById('server-icon-crop-area');
let createServerAvatarCropConfirm = document.getElementById('server-icon-crop-confirm');
let createServerAvatarCropCancel = document.getElementById('server-icon-crop-cancel');
let createServerAvatarLoading = document.getElementById('server-icon-upload-loading');

function updateCreateServerAvatarPreview() {
  const url = createServerAvatarUrlInput.value;
  const name = serverNameInput.value.trim();
  if (url) {
    createServerAvatarPreviewDiv.className = 'server-avatar-upload-preview uploaded';
    createServerAvatarPreviewDiv.innerHTML = `<img src="${url}" class="server-avatar-cropped-preview" alt="Avatar" />`;
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
    // Show crop modal
    const reader = new FileReader();
    reader.onload = function (ev) {
      createServerAvatarCropArea.innerHTML = `<img id="server-avatar-crop-img" src="${ev.target.result}" style="max-width:100%;max-height:100%;display:block;" />`;
      createServerAvatarCropModal.style.display = 'flex';
      setTimeout(() => {
        const img = document.getElementById('server-avatar-crop-img');
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
if (createServerAvatarCropCancel) {
  createServerAvatarCropCancel.onclick = () => {
    createServerAvatarCropModal.style.display = 'none';
    if (createServerAvatarCropper) { createServerAvatarCropper.destroy(); createServerAvatarCropper = null; }
    isServerAvatarUploading = false;
    if (createServerSubmitBtn) {
      createServerSubmitBtn.disabled = false;
      createServerSubmitBtn.textContent = 'Create Server';
    }
  };
}
if (createServerAvatarCropConfirm) {
  createServerAvatarCropConfirm.onclick = async () => {
    if (!createServerAvatarCropper) return;
    createServerAvatarCropModal.style.display = 'none';
    createServerAvatarLoading.style.display = 'flex';
    isServerAvatarUploading = true;
    if (createServerSubmitBtn) {
      createServerSubmitBtn.disabled = true;
      createServerSubmitBtn.textContent = 'Uploading Avatar...';
    }
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
          alert('Avatar upload failed.');
          createServerAvatarUrlInput.value = '';
        }
      } catch (err) {
        alert('Avatar upload error.');
        createServerAvatarUrlInput.value = '';
      } finally {
        createServerAvatarLoading.style.display = 'none';
        isServerAvatarUploading = false;
        if (createServerSubmitBtn) {
          createServerSubmitBtn.disabled = false;
          createServerSubmitBtn.textContent = 'Create Server';
        }
        if (createServerAvatarCropper) { createServerAvatarCropper.destroy(); createServerAvatarCropper = null; }
      }
    }, 'image/webp', 0.95);
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
        if (key === 'invites') {
          fetchServerInvites();
          setupServerInvitesRealtime();
        } else {
          cleanupServerInvitesRealtime();
        }
        if (key === 'members') fetchServerMembers();
      }
    };
  });
  // Clean up on modal close
  const closeBtn = document.getElementById('close-server-settings-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', cleanupServerInvitesRealtime);
  }
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
      bannerDiv.style.backgroundColor = '';
    } else if (server.banner_color) {
      bannerDiv.style.backgroundImage = '';
      bannerDiv.style.backgroundColor = server.banner_color;
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
      if (isServerAvatarUploading) {
        e.preventDefault();
        alert('Please wait for the avatar upload to finish.');
        return;
      }
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem('spice_user'));
      const name = document.getElementById('server-name').value.trim();
      const icon_url = document.getElementById('create-server-avatar-url').value.trim() || null;
      if (!user || !user.user_id || !name) return;
      // Create server
      const { data: server, error } = await supabaseClient.from('servers').insert([
        { name, icon_url, owner_id: user.user_id }
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

// --- Advanced Server Invites (Join Requests) ---
let serverInvitesRealtimeSub = null;

async function fetchServerInvites() {
  if (!currentServer) return;
  const invitesList = document.getElementById('server-invites-list');
  if (!invitesList) return;
  invitesList.innerHTML = '<div>Loading...</div>';
  // Fetch pending invites for this server
  const { data: invites, error } = await supabaseClient
    .from('server_invites')
    .select('*')
    .eq('server_id', currentServer.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    invitesList.innerHTML = '<div>Error loading invites.</div>';
    return;
  }
  if (!invites || !invites.length) {
    invitesList.innerHTML = '<div>No pending join requests.</div>';
    return;
  }
  // Fetch user info for all invitees
  const userIds = invites.map(i => i.user_id);
  const { data: users } = await supabaseClient
    .from('users')
    .select('user_id,username,avatar_url')
    .in('user_id', userIds);
  // Render invites
  invitesList.innerHTML = '';
  for (const invite of invites) {
    const user = users.find(u => u.user_id === invite.user_id) || {};
    invitesList.innerHTML += `
      <div class="friend-request-item">
        <img class="friend-request-avatar" src="${user.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar">
        <span class="friend-request-username">${user.username || invite.user_id}</span>
        <span class="friend-request-status">Pending</span>
        <button class="friend-request-accept" data-id="${invite.id}">Accept</button>
        <button class="friend-request-reject" data-id="${invite.id}">Reject</button>
      </div>
    `;
  }
  // Add Accept/Reject handlers
  invitesList.querySelectorAll('.friend-request-accept').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      // Get invite info to know user_id and server_id
      const { data: invite, error: inviteErr } = await supabaseClient.from('server_invites').select('*').eq('id', id).single();
      if (!invite || inviteErr) return;
      await supabaseClient.from('server_invites').update({ status: 'accepted' }).eq('id', id);
      // Add to server_members if not already present
      const { data: existingMember } = await supabaseClient.from('server_members').select('*').eq('server_id', invite.server_id).eq('user_id', invite.user_id).maybeSingle();
      if (!existingMember) {
        await supabaseClient.from('server_members').insert([{ server_id: invite.server_id, user_id: invite.user_id, role: 'member' }]);
      }
      fetchServerInvites();
    };
  });
  invitesList.querySelectorAll('.friend-request-reject').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      await supabaseClient.from('server_invites').update({ status: 'rejected' }).eq('id', id);
      fetchServerInvites();
    };
  });
}

function setupServerInvitesRealtime() {
  if (!currentServer) return;
  cleanupServerInvitesRealtime();
  serverInvitesRealtimeSub = supabaseClient.channel('server-invites-rt')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'server_invites',
      filter: `server_id=eq.${currentServer.id}`
    }, payload => {
      fetchServerInvites();
    })
    .subscribe();
}
function cleanupServerInvitesRealtime() {
  if (serverInvitesRealtimeSub) {
    supabaseClient.removeChannel(serverInvitesRealtimeSub);
    serverInvitesRealtimeSub = null;
  }
}

function closeServerSettingsModal() {
  const modal = document.getElementById('server-settings-modal-overlay');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 350);
    cleanupServerInvitesRealtime();
    // Add any other cleanup if needed
  }
}

// Wire up close button for server settings modal
window.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-server-settings-modal');
  if (closeBtn) {
    closeBtn.onclick = closeServerSettingsModal;
  }
});

// --- Server Banner Color Selection Logic ---
const bannerColorsRow = document.getElementById('server-settings-banner-colors');
if (bannerColorsRow) {
  bannerColorsRow.querySelectorAll('.profile-btn').forEach(btn => {
    btn.onclick = async () => {
      const color = btn.style.backgroundColor || btn.getAttribute('style').split(':')[1];
      if (!currentServer) return;
      await supabaseClient.from('servers').update({ banner_color: color }).eq('id', currentServer.id);
      currentServer.banner_color = color;
      updateServerSettingsPreview(currentServer);
      // Mark selected
      bannerColorsRow.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
}

// --- Fetch and Render Server Members (for server settings modal) ---
async function fetchServerMembers() {
  if (!currentServer) return;
  const membersSection = document.getElementById('server-settings-section-members');
  if (!membersSection) return;
  membersSection.innerHTML = '<div>Loading...</div>';
  const { data: members, error } = await supabaseClient
    .from('server_members')
    .select('user_id, role, users!inner(username, avatar_url)')
    .eq('server_id', currentServer.id);
  if (error || !members) {
    membersSection.innerHTML = '<div>Error loading members.</div>';
    return;
  }
  membersSection.innerHTML = '';
  // Group members by role
  const grouped = { owner: [], admin: [], mod: [], member: [], other: [] };
  members.forEach(m => {
    if (m.role === 'owner') grouped.owner.push(m);
    else if (m.role === 'admin') grouped.admin.push(m);
    else if (m.role === 'mod') grouped.mod.push(m);
    else if (m.role === 'member') grouped.member.push(m);
    else grouped.other.push(m);
  });
  // Helper for role tag
  function roleTag(role) {
    let color = '#43b581', label = role;
    if (role === 'owner') { color = '#FFD700'; label = 'Owner'; }
    else if (role === 'admin') { color = '#2563eb'; label = 'Admin'; }
    else if (role === 'mod') { color = '#00b894'; label = 'Mod'; }
    else if (role === 'member') { color = '#43b581'; label = 'Member'; }
    else { color = '#888'; label = role; }
    return `<span class="server-role-tag${role === 'owner' ? ' owner-gold-tag' : ''}" style="background:${color};color:${role==='owner'?'#222':'#fff'};">${label}</span>`;
  }
  // Render group
  function renderGroup(arr, role) {
    arr.forEach(m => {
      const isOwner = m.role === 'owner';
    const div = document.createElement('div');
      div.className = 'server-member-row fade-in-up' + (isOwner ? ' server-owner-row' : '');
    div.innerHTML = `
        <img class="server-member-avatar" src="${m.users.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar">
        <div class="server-member-info">
          <span class="server-member-username">${m.users.username || m.user_id}</span>
          <span class="server-member-id">${m.user_id}</span>
        </div>
        ${roleTag(m.role)}
    `;
    membersSection.appendChild(div);
  });
  }
  if (grouped.owner.length) renderGroup(grouped.owner, 'owner');
  if (grouped.admin.length) renderGroup(grouped.admin, 'admin');
  if (grouped.mod.length) renderGroup(grouped.mod, 'mod');
  if (grouped.member.length) renderGroup(grouped.member, 'member');
  if (grouped.other.length) renderGroup(grouped.other, 'other');
}

// --- Server Settings Modal: Change Server Icon ---
const serverSettingsChangeIconBtn = document.getElementById('server-settings-change-icon');
const serverSettingsIconInput = document.getElementById('server-settings-icon');
const serverSettingsIconPreview = document.getElementById('server-settings-icon-preview');
if (serverSettingsChangeIconBtn && serverSettingsIconInput) {
  serverSettingsChangeIconBtn.onclick = () => {
    serverSettingsIconInput.value = '';
    serverSettingsIconInput.click();
  };
  serverSettingsIconInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentServer) return;
    // Show loading spinner (optional)
    serverSettingsChangeIconBtn.disabled = true;
    serverSettingsChangeIconBtn.textContent = 'Uploading...';
    // Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'user_media');
    try {
      const res = await fetch('https://api.cloudinary.com/v1_1/dbriuheef/image/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.secure_url) {
        await supabaseClient.from('servers').update({ icon_url: data.secure_url }).eq('id', currentServer.id);
        currentServer.icon_url = data.secure_url;
        updateServerSettingsPreview(currentServer);
        serverSettingsIconPreview.src = data.secure_url;
        serverSettingsIconPreview.style.display = '';
      } else {
        alert('Upload failed.');
      }
    } catch (err) {
      alert('Upload error.');
    } finally {
      serverSettingsChangeIconBtn.disabled = false;
      serverSettingsChangeIconBtn.textContent = 'Change Server Icon';
    }
  };
}

// --- Server Settings Modal: Edit Server Name ---
const serverSettingsEditNameBtn = document.getElementById('server-settings-edit-name-btn');
const serverSettingsNameText = document.getElementById('server-settings-name-text');
const serverSettingsNameInput = document.getElementById('server-settings-name-input');
const serverSettingsSaveNameBtn = document.getElementById('server-settings-save-name-btn');
const serverSettingsCancelNameBtn = document.getElementById('server-settings-cancel-name-btn');
if (serverSettingsEditNameBtn && serverSettingsNameText && serverSettingsNameInput && serverSettingsSaveNameBtn && serverSettingsCancelNameBtn) {
  serverSettingsEditNameBtn.onclick = () => {
    serverSettingsNameInput.value = serverSettingsNameText.textContent;
    serverSettingsNameText.style.display = 'none';
    serverSettingsEditNameBtn.style.display = 'none';
    serverSettingsNameInput.style.display = '';
    serverSettingsSaveNameBtn.style.display = '';
    serverSettingsCancelNameBtn.style.display = '';
    serverSettingsNameInput.focus();
  };
  serverSettingsCancelNameBtn.onclick = () => {
    serverSettingsNameInput.style.display = 'none';
    serverSettingsSaveNameBtn.style.display = 'none';
    serverSettingsCancelNameBtn.style.display = 'none';
    serverSettingsNameText.style.display = '';
    serverSettingsEditNameBtn.style.display = '';
  };
  serverSettingsSaveNameBtn.onclick = async () => {
    const newName = serverSettingsNameInput.value.trim();
    if (!newName || !currentServer) return;
    await supabaseClient.from('servers').update({ name: newName }).eq('id', currentServer.id);
    currentServer.name = newName;
    updateServerSettingsPreview(currentServer);
    serverSettingsNameText.textContent = newName;
    serverSettingsNameInput.style.display = 'none';
    serverSettingsSaveNameBtn.style.display = 'none';
    serverSettingsCancelNameBtn.style.display = 'none';
    serverSettingsNameText.style.display = '';
    serverSettingsEditNameBtn.style.display = '';
  };
} 

function playVoiceSfx(type) {
  // type: 'join' | 'left'
  let src = '';
  if (type === 'join') src = '/assets/audios/user_join.mp3';
  else if (type === 'left') src = '/assets/audios/user_left.mp3';
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.7;
  audio.play().catch(() => {});
}

function updateVoiceUserCards(users) {
  if (!isInVoiceChannel) return; // Only update if user is in voice
  const chat = document.querySelector('.chat-messages');
  if (!chat) return;

  // Use or create the container
  let container = chat.querySelector('.voice-user-tiles');
  if (!container) {
    chat.innerHTML = '<div class="voice-user-tiles"></div>';
    container = chat.querySelector('.voice-user-tiles');
  }

  // Build a map of current user cards
  const currentCards = {};
  container.querySelectorAll('.user-card').forEach(card => {
    const userId = card.getAttribute('data-user-id');
    if (userId) currentCards[userId] = card;
  });

  // Parse new users and build a set
  const newUserIds = new Set();
  let playedJoin = false;
  users.forEach(userObj => {
    // Accept both stringified and object user (for backward compat)
    const user = typeof userObj === 'string' ? JSON.parse(userObj) : userObj;
    newUserIds.add(String(user.user_id));
    if (!currentCards[user.user_id]) {
      // Color palette for user cards
      const userCardColors = [
        '#4a6cff', '#00b894', '#fdcb6e', '#e17055', '#00b8d4', '#6c5ce7', '#fd79a8', '#00cec9', '#fab1a0', '#6366f1', '#f59e42', '#43b581', '#f14668', '#fbbf24', '#10b981', '#3b82f6', '#ef4444', '#a21caf', '#f472b6', '#14b8a6'
      ];
      function pickColor(id) {
        let hash = 0;
        for (let i = 0; i < String(id).length; i++) hash = String(id).charCodeAt(i) + ((hash << 5) - hash);
        return userCardColors[Math.abs(hash) % userCardColors.length];
      }
      const cardColor = pickColor(user.user_id);
      // Add new card with entrance animation and compact design (no 'info' div)
      const tile = document.createElement('div');
      tile.className = 'user-card fade-in-up fade-slide';
      tile.setAttribute('data-user-id', user.user_id);
      tile.style.background = cardColor;
      tile.innerHTML = `
        <div class="avatar" style="width:48px;height:48px;min-width:48px;">
          <img src="${user.avatar_url}" alt="${user.username}" style="width:48px;height:48px;">
        </div>
        <div class="user-main" style="display:flex;flex-direction:column;justify-content:center;flex:1;min-width:0;">
          <span class="user-name" style="color:#fff;font-size:16px;font-weight:600;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.username}</span>
          <span class="user-status" style="color:#fff;font-size:13px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.status || ''}</span>
          <div class="status-icons" style="display:flex;flex-direction:row;gap:12px;margin-top:8px;">
            <i class="fas fa-microphone${user.micOn === false ? '' : ' active'}" title="${user.micOn === false ? 'Mic Off' : 'Mic On'}" style="font-size:16px;"></i>
            <i class="fas fa-volume-up${user.deafenOn ? '' : ' active'}" title="${user.deafenOn ? 'Deafened' : 'Speaker On'}" style="font-size:16px;"></i>
          </div>
        </div>
        <div class="menu-button" title="Options" style="font-size:16px;margin-left:8px;align-self:center;">
          <i class="fas fa-ellipsis-v"></i>
        </div>
      `;
      container.appendChild(tile);
      playedJoin = true;
    } else {
      // Update icons if user already exists
      const card = currentCards[user.user_id];
      // Avatar and username
      const avatarImg = card.querySelector('.avatar img');
      if (avatarImg) avatarImg.src = user.avatar_url;
      const name = card.querySelector('.user-name');
      if (name) name.textContent = user.username;
      const status = card.querySelector('.user-status');
      if (status) status.textContent = user.status || '';
      // Mic icon
      const micIcon = card.querySelector('.status-icons .fa-microphone');
      if (micIcon) {
        micIcon.className = `fas fa-microphone${user.micOn === false ? '' : ' active'}`;
        micIcon.title = user.micOn === false ? 'Mic Off' : 'Mic On';
      }
      // Speaker/Deafen icon
      const volIcon = card.querySelector('.status-icons .fa-volume-up');
      if (volIcon) {
        volIcon.className = `fas fa-volume-up${user.deafenOn ? '' : ' active'}`;
        volIcon.title = user.deafenOn ? 'Deafened' : 'Speaker On';
      }
      // Update card color if user_id changes (shouldn't happen, but for safety)
      if (card && card.getAttribute('data-user-id')) {
        const userCardColors = [
          '#4a6cff', '#00b894', '#fdcb6e', '#e17055', '#00b8d4', '#6c5ce7', '#fd79a8', '#00cec9', '#fab1a0', '#6366f1', '#f59e42', '#43b581', '#f14668', '#fbbf24', '#10b981', '#3b82f6', '#ef4444', '#a21caf', '#f472b6', '#14b8a6'
        ];
        function pickColor(id) {
          let hash = 0;
          for (let i = 0; i < String(id).length; i++) hash = String(id).charCodeAt(i) + ((hash << 5) - hash);
          return userCardColors[Math.abs(hash) % userCardColors.length];
        }
        card.style.background = pickColor(card.getAttribute('data-user-id'));
      }
    }
  });
  if (playedJoin) playVoiceSfx('join');

  // Remove cards for users who left
  let playedLeft = false;
  Object.keys(currentCards).forEach(userId => {
    if (!newUserIds.has(userId)) {
      const card = currentCards[userId];
      card.classList.add('fade-slide', 'out');
      let removed = false;
      const removeCard = () => {
        if (!removed) {
          card.remove();
          removed = true;
        }
      };
      card.addEventListener('transitionend', removeCard, { once: true });
      setTimeout(removeCard, 400); // Fallback in case transitionend doesn't fire
      playedLeft = true;
    }
  });
  if (playedLeft) playVoiceSfx('left');
}

// --- Socket.IO for Voice Channel ---
function setupVoiceChannelSocketIO(serverId, channelId, user) {
  if (!window.io) return;
  if (!channelSocket) {
    const socketUrl = window.location.origin;
    channelSocket = window.io(socketUrl);
  }
  // Leave previous room
  if (currentChannelRoom) {
    channelSocket.emit('leave_channel', currentChannelRoom);
    channelSocket.off('voice_user_joined');
  }
  // Join new room
  currentChannelRoom = { serverId, channelId };
  channelSocket.emit('join_channel', { serverId, channelId });
  // Listen for new messages
  channelSocket.on('voice_user_joined', (users) => {
    console.log('[Client] Received users:', users.map(u => u.username));
    updateVoiceUserCards(users);
  });
}

// --- Voice Channel State ---
let isInVoiceChannel = false;
let currentVoiceServerId = null;
let currentVoiceChannelId = null;
let myMicOn = true;
let myDeafenOn = false;

// --- openVoiceChannel ---
async function openVoiceChannel(serverId, channelId) {
  if (!serverId || !channelId || !serverChatSection) return;
  // Fetch channel info
  const channel = channelsList.find(c => c.id === channelId);
  // Render channel name in header
  const header = serverChatSection.querySelector('.chat-header');
  if (header) header.textContent = channel ? `# ${channel.name}` : '# Channel';
  const chat = serverChatSection.querySelector('.chat-messages');
  const footer = serverChatSection.querySelector('.chat-input-area');
  if (channel && channel.type === 'voice') {
    // --- NEW: If already in this voice channel, render active voice UI ---
    if (
      isInVoiceChannel &&
      currentVoiceServerId === serverId &&
      currentVoiceChannelId === channelId
    ) {
      // Render the active voice UI (user tiles and controls)
      if (chat) {
        chat.innerHTML = '<div class="voice-user-tiles"></div>';
        // Request current users from server (or rely on socket event)
        // Optionally, you could emit a request for the current user list here
        // For now, just call updateVoiceUserCards with your own user as fallback
        const user = JSON.parse(localStorage.getItem('spice_user'));
        updateVoiceUserCards([
          JSON.stringify({
            user_id: user.user_id,
            username: user.username,
            avatar_url: user.avatar_url,
            micOn: myMicOn,
            deafenOn: myDeafenOn
          })
        ]);
      }
      if (footer) {
        footer.innerHTML = `
          <div class="voice-controls animate-stagger">
            <button class="voice-control-btn mic-btn" title="Toggle Mic"><i class="fa-solid fa-microphone"></i></button>
            <button class="voice-control-btn deafen-btn" title="Toggle Deafen"><i class="fa-solid fa-headphones"></i></button>
            <button class="voice-control-btn leave-btn" title="Leave Voice"><i class="fa-solid fa-phone-slash"></i></button>
          </div>
        `;
        // Mic toggle
        const micBtn = footer.querySelector('.mic-btn');
        if (micBtn) {
          micBtn.onclick = function() {
            myMicOn = !myMicOn;
            micBtn.innerHTML = myMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
            micBtn.classList.toggle('off', !myMicOn);
            if (window.channelSocket) {
              window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
            }
            if (window.voiceWebRTC) {
              window.voiceWebRTC.setMute(!myMicOn);
            }
          };
        }
        // Deafen toggle
        const deafenBtn = footer.querySelector('.deafen-btn');
        if (deafenBtn) {
          const icon = deafenBtn.querySelector('i');
          deafenBtn.onclick = function() {
            myDeafenOn = !myDeafenOn;
            if (icon) {
              icon.className = 'fa-solid fa-headphones';
            }
            let slash = deafenBtn.querySelector('.deafen-slash-fallback');
            if (myDeafenOn) {
              if (!slash) {
                slash = document.createElement('span');
                slash.className = 'deafen-slash-fallback';
                deafenBtn.appendChild(slash);
              }
            } else {
              if (slash) slash.remove();
            }
            deafenBtn.classList.toggle('off', myDeafenOn);
            if (window.channelSocket) {
              window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
            }
            if (window.voiceWebRTC) {
              window.voiceWebRTC.setDeafen(myDeafenOn);
            }
          };
        }
        // Leave button
        const leaveBtn = footer.querySelector('.leave-btn');
        if (leaveBtn) {
          leaveBtn.onclick = function() {
            if (window.channelSocket) {
              window.channelSocket.emit('voice_leave');
            }
            if (window.voiceWebRTC) {
              window.voiceWebRTC.leaveVoiceChannel(window.channelSocket);
            }
            isInVoiceChannel = false;
            currentVoiceServerId = null;
            currentVoiceChannelId = null;
            myMicOn = true;
            myDeafenOn = false;
            openVoiceChannel(serverId, channelId);
          };
        }
      }
      return;
    }
    // --- END NEW ---
    // Do NOT join voice yet! Only show the welcome UI and set up the Join Voice button.
    isInVoiceChannel = false;
    currentVoiceServerId = null;
    currentVoiceChannelId = null;
    myMicOn = true;
    myDeafenOn = false;
    // Render the voice channel welcome UI
    if (chat) chat.innerHTML = `
      <div class="voice-channel-welcome">
        <div class="voice-channel-bg"></div>
        <div class="voice-channel-center">
          <div class="voice-channel-icon"><i class='fa-solid fa-volume-high'></i></div>
          <div class="voice-channel-title">${channel.name ? `<span class='voice-channel-title-text'>${channel.name}</span>` : ''}</div>
          <div class="voice-channel-desc">No one is currently in voice</div>
          <button class="voice-channel-join-btn">Join Voice</button>
        </div>
      </div>
    `;
    if (footer) footer.innerHTML = '';
    // Add event listener for Join Voice button
    const joinBtn = chat.querySelector('.voice-channel-join-btn');
    if (joinBtn) {
      joinBtn.onclick = function() {
        // Actually join voice now
        const user = JSON.parse(localStorage.getItem('spice_user'));
        if (window.channelSocket) {
          window.channelSocket.emit('voice_join', {
            serverId,
            channelId,
            user: {
              user_id: user.user_id,
              username: user.username,
              avatar_url: user.avatar_url,
              micOn: myMicOn,
              deafenOn: myDeafenOn
            }
          });
        }
        isInVoiceChannel = true;
        currentVoiceServerId = serverId;
        currentVoiceChannelId = channelId;
        // Start WebRTC voice streaming
        if (window.voiceWebRTC) {
          window.voiceWebRTC.joinVoiceChannel(serverId, channelId, user.user_id, window.channelSocket);
        }
        // Immediately show own user card (optimistic update)
        if (chat) {
          chat.innerHTML = '<div class="voice-user-tiles"></div>';
          updateVoiceUserCards([JSON.stringify({
            user_id: user.user_id,
            username: user.username,
            avatar_url: user.avatar_url,
            micOn: myMicOn,
            deafenOn: myDeafenOn
          })]);
        }
        if (footer) {
          footer.innerHTML = `
            <div class="voice-controls animate-stagger">
              <button class="voice-control-btn mic-btn" title="Toggle Mic"><i class="fa-solid fa-microphone"></i></button>
              <button class="voice-control-btn deafen-btn" title="Toggle Deafen"><i class="fa-solid fa-headphones"></i></button>
              <button class="voice-control-btn leave-btn" title="Leave Voice"><i class="fa-solid fa-phone-slash"></i></button>
            </div>
          `;
          // Mic toggle
          const micBtn = footer.querySelector('.mic-btn');
          if (micBtn) {
            micBtn.onclick = function() {
              myMicOn = !myMicOn;
              micBtn.innerHTML = myMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
              micBtn.classList.toggle('off', !myMicOn);
              // Emit state update
              if (window.channelSocket) {
                window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
              }
              // Mute/unmute actual audio stream
              if (window.voiceWebRTC) {
                window.voiceWebRTC.setMute(!myMicOn);
              }
            };
          }
          // Deafen toggle
          const deafenBtn = footer.querySelector('.deafen-btn');
          if (deafenBtn) {
            const icon = deafenBtn.querySelector('i');
            deafenBtn.onclick = function() {
              myDeafenOn = !myDeafenOn;
              if (icon) {
                icon.className = 'fa-solid fa-headphones';
              }
              // Add/remove slash overlay
              let slash = deafenBtn.querySelector('.deafen-slash-fallback');
              if (myDeafenOn) {
                if (!slash) {
                  slash = document.createElement('span');
                  slash.className = 'deafen-slash-fallback';
                  deafenBtn.appendChild(slash);
                }
              } else {
                if (slash) slash.remove();
              }
              deafenBtn.classList.toggle('off', myDeafenOn);
              // Emit state update
              if (window.channelSocket) {
                window.channelSocket.emit('voice_state_update', { micOn: myMicOn, deafenOn: myDeafenOn });
              }
              // Mute/unmute all remote audio
              if (window.voiceWebRTC) {
                window.voiceWebRTC.setDeafen(myDeafenOn);
              }
            };
          }
          // Leave button
          const leaveBtn = footer.querySelector('.leave-btn');
          if (leaveBtn) {
            leaveBtn.onclick = function() {
              if (window.channelSocket) {
                window.channelSocket.emit('voice_leave');
              }
              // Stop WebRTC voice streaming
              if (window.voiceWebRTC) {
                window.voiceWebRTC.leaveVoiceChannel(window.channelSocket);
              }
              isInVoiceChannel = false;
              currentVoiceServerId = null;
              currentVoiceChannelId = null;
              myMicOn = true;
              myDeafenOn = false;
              openVoiceChannel(serverId, channelId);
            };
          }
        }
      };
    }
    return;
  }
  // If not a voice channel, do not leave voice! Just render text input.
  if (footer) {
    footer.innerHTML = `
      <form class="messageBox fade-in-up" autocomplete="off" style="width:100%;">
        <div class="fileUploadWrapper">
          <label for="file" title="Attach file">
            <svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-8"/><path d="M8 12h8"/></svg>
            <input id="file" type="file" style="display:none" />
            <span class="tooltip">Attach file</span>
          </label>
        </div>
        <input id="messageInput" type="text" autocomplete="off" placeholder="Message #${channel ? channel.name : ''}" required />
        <button type="submit" id="sendButton" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg></button>
      </form>
    `;
    const form = footer.querySelector('.messageBox');
    const input = form.querySelector('#messageInput');
    const sendBtn = form.querySelector('#sendButton');
    const fileInput = form.querySelector('#file');
    // Send message
    form.onsubmit = async (e) => {
      e.preventDefault();
      const content = input.value.trim();
      if (!user || !user.user_id || !content) return;
      input.value = '';
      // --- Optimistically render the message for sender ---
      const now = Date.now();
      appendChannelMessage({
        userId: Number(user.user_id),
        username: user.username,
        avatar_url: user.avatar_url,
        content,
        timestamp: now
      }, 'me');
      // --- THEN emit to server as before ---
      channelSocket.emit('channel_message', {
        serverId,
        channelId,
        userId: Number(user.user_id),
        username: user.username,
        avatar_url: user.avatar_url,
        content,
        timestamp: now
      });
    };
    // ENTER key always sends unless mention dropdown is open
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const dropdown = document.getElementById('mention-autocomplete-dropdown');
        if (!dropdown || dropdown.style.display === 'none') {
          e.preventDefault();
          form.requestSubmit();
        }
      }
    });
    // File upload (optional: you can add your logic here)
    fileInput.onchange = async (e) => {
      // You can implement file upload logic here if needed
    };
    // Setup mention autocomplete
    setupMentionAutocomplete(input, window.currentServerMembers || []);
    // Setup mention highlighting
    setupMentionHighlighting(input, window.currentServerMembers || []);
  }
}

// --- Minimal Socket.IO setup for text channels ---
function setupChannelSocketIO(serverId, channelId, user) {
  if (!window.channelSocket) return;
  // Remove previous listener for this channel
  window.channelSocket.off('channel_message');
  window.channelSocket.off('channel_message_reply');
  window.channelSocket.off('channel_message_edit');
  // Listen for new messages for this channel
  window.channelSocket.on('channel_message', (msg) => {
    if (!msg || msg.channelId !== channelId) return;
    const isMe = String(msg.userId) === String(user.user_id);
    appendChannelMessage(msg, isMe ? 'me' : 'them');
  });
  // Listen for reply messages for this channel
  window.channelSocket.on('channel_message_reply', (msg) => {
    if (!msg || msg.channelId !== channelId) return;
    const isMe = String(msg.userId) === String(user.user_id);
    appendChannelMessage(msg, isMe ? 'me' : 'them');
  });
  // Listen for edit messages for this channel
  window.channelSocket.on('channel_message_edit', (msg) => {
    if (!msg || msg.channelId !== channelId) return;
    // Find the message div and update its content and show (edited) tag
    const chat = document.querySelector('.chat-messages');
    if (!chat) return;
    const msgDiv = chat.querySelector(`.chat__conversation-board__message[data-timestamp="${msg.timestamp}"][data-userid="${msg.userId}"]`);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.chat__conversation-board__message__bubble');
      if (bubble) {
        // Keep reply bubble if present
        let replyHtml = '';
        const replyDiv = bubble.querySelector('.reply-bubble');
        if (replyDiv) replyHtml = replyDiv.outerHTML;
        bubble.innerHTML = `${replyHtml}<span>${msg.newContent}</span> <span class='edited-tag edited-tag-premium'>edited</span>`;
      }
    }
  });
}

// --- Mention Autocomplete Dropdown for Text Channel Input ---
function setupMentionAutocomplete(input, members) {
  // Remove any existing dropdown
  let dropdown = document.getElementById('mention-autocomplete-dropdown');
  if (dropdown) dropdown.remove();
  // Create dropdown
  dropdown = document.createElement('div');
  dropdown.id = 'mention-autocomplete-dropdown';
  dropdown.style.position = 'absolute';
  dropdown.style.zIndex = 9999;
  dropdown.style.background = '#23272f';
  dropdown.style.borderRadius = '0.7em';
  dropdown.style.boxShadow = '0 4px 24px 0 rgba(37,99,235,0.13)';
  dropdown.style.padding = '0.3em 0';
  dropdown.style.minWidth = input.offsetWidth + 'px';
  dropdown.style.maxHeight = '220px';
  dropdown.style.overflowY = 'auto';
  dropdown.style.display = 'none';
  dropdown.style.fontFamily = 'Montserrat,Roboto,sans-serif';
  dropdown.style.fontSize = '1.05rem';
  // Position below the input
  function positionDropdown() {
    const rect = input.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = (rect.bottom + scrollTop + 4) + 'px';
    dropdown.style.minWidth = rect.width + 'px';
  }
  positionDropdown();
  window.addEventListener('resize', positionDropdown);
  input.parentNode.appendChild(dropdown);

  let filtered = [];
  let selectedIdx = 0;

  function renderDropdown() {
    dropdown.innerHTML = '';
    if (!filtered.length) {
      dropdown.style.display = 'none';
      return;
    }
    filtered.forEach((member, idx) => {
      const item = document.createElement('div');
      item.className = 'mention-autocomplete-item' + (idx === selectedIdx ? ' selected' : '');
      item.style.padding = '0.4em 1em';
      item.style.cursor = 'pointer';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '0.7em';
      item.style.background = idx === selectedIdx ? '#2563eb' : 'transparent';
      item.style.color = idx === selectedIdx ? '#fff' : '#fff';
      item.innerHTML = `<img src="${member.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;"> <span>@${member.username}</span>`;
      item.onmousedown = (e) => {
        e.preventDefault();
        selectMember(idx);
      };
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
    positionDropdown();
  }

  function selectMember(idx) {
    const member = filtered[idx];
    if (!member) return;
    // Insert @username at caret position
    const value = input.value;
    const caret = input.selectionStart;
    // Find the last @... before caret
    const beforeCaret = value.slice(0, caret);
    const afterCaret = value.slice(caret);
    const match = beforeCaret.match(/@([\w\d_]*)$/);
    if (match) {
      const before = beforeCaret.slice(0, match.index);
      const after = afterCaret;
      const mentionText = `@${member.username} `;
      input.value = before + mentionText + after;
      // Move caret to after inserted mention
      const newCaret = (before + mentionText).length;
      input.setSelectionRange(newCaret, newCaret);
      dropdown.style.display = 'none';
      filtered = [];
    }
    input.focus();
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 120); });

  function onInput(e) {
    const value = input.value;
    const caret = input.selectionStart;
    const beforeCaret = value.slice(0, caret);
    // Find @mention being typed before caret
    const match = beforeCaret.match(/@([\w\d_]*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      filtered = members.filter(m => m.username.toLowerCase().startsWith(query));
      selectedIdx = 0;
      renderDropdown();
    } else {
      dropdown.style.display = 'none';
      filtered = [];
    }
  }
  function onKeyDown(e) {
    if (!filtered.length || dropdown.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      selectedIdx = (selectedIdx + 1) % filtered.length;
      renderDropdown();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      selectedIdx = (selectedIdx - 1 + filtered.length) % filtered.length;
      renderDropdown();
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      selectMember(selectedIdx);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      filtered = [];
    }
  }
}

// Helper: fetch and set currentServerMembers for mention autocomplete
async function setCurrentServerMembers(serverId) {
  if (!serverId) { window.currentServerMembers = []; return; }
  const { data: members, error } = await supabaseClient
    .from('server_members')
    .select('user_id, users!inner(username, avatar_url)')
    .eq('server_id', serverId);
  if (error || !members) { window.currentServerMembers = []; return; }
  window.currentServerMembers = members.map(m => ({
    user_id: m.user_id,
    username: m.users.username,
    avatar_url: m.users.avatar_url
  }));
}

function setupMentionHighlighting(input, members) {
  // Save caret as character offset
  function saveCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(input);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }
  // Restore caret by walking the DOM to the offset
  function restoreCaret(offset) {
    input.focus();
    let chars = offset;
    function set(node) {
      if (chars === 0) return true;
      if (node.nodeType === 3) { // text node
        if (node.length >= chars) {
          const range = document.createRange();
          range.setStart(node, chars);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          chars = 0;
          return true;
        } else {
          chars -= node.length;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          if (set(node.childNodes[i])) return true;
        }
      }
      return false;
    }
    set(input);
  }
  function highlight() {
    const caretOffset = saveCaret();
    let html = input.innerText;
    if (!html) {
      input.innerHTML = '';
      restoreCaret(0);
      return;
    }
    // Sort by username length descending to avoid partial matches
    const sorted = [...members].sort((a, b) => b.username.length - a.username.length);
    sorted.forEach(member => {
      // Only match @username as a word
      const regex = new RegExp(`(^|\\s)@${member.username}(?=\\b)`, 'g');
      html = html.replace(regex, `$1<span class=\"mention\">@${member.username}</span>`);
    });
    // Only update if changed (avoid breaking IME/emoji input)
    if (input.innerHTML !== html) {
      input.innerHTML = html;
      restoreCaret(caretOffset);
    }
  }
  input.addEventListener('input', highlight);
}

// Add this at the end of the file to handle the placeholder effect for all .server-chat-input elements:
document.addEventListener('input', function(e) {
  if (e.target.classList && e.target.classList.contains('server-chat-input')) {
    if (e.target.innerText.trim() === '') {
      e.target.classList.remove('has-content');
    } else {
      e.target.classList.add('has-content');
    }
  }
});
document.addEventListener('focusin', function(e) {
  if (e.target.classList && e.target.classList.contains('server-chat-input')) {
    if (e.target.innerText.trim() === '') {
      e.target.classList.remove('has-content');
    }
  }
});