// Import and initialize Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://qhbeexkqftbhjkeuruiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYmVleGtxZnRiaGprZXVydWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNzAxMTEsImV4cCI6MjA2NTg0NjExMX0.swpojIxW47IIPX097X45l3LYe5OiDZijGlAMXfCD30I';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;

// Modal logic for login/signup
const modalOverlay = document.getElementById('modal-overlay');
const authModal = document.getElementById('auth-modal');
const modalContent = document.getElementById('modal-content');
const openLoginBtn = document.getElementById('open-login');
const openSignupBtn = document.getElementById('open-signup');
const closeModalBtn = document.getElementById('close-modal');

// Profile modal open/close logic
const profileBtn = document.getElementById('sidebar-user-profile');
const profileModal = document.getElementById('profile-modal');
const closeProfileModalBtn = document.getElementById('close-profile-modal');

// Avatar upload, crop, and Cloudinary integration
let cropper = null;
const avatarInput = document.getElementById('avatar-upload-input');
const avatarCropModal = document.getElementById('avatar-crop-modal');
const avatarCropArea = document.getElementById('avatar-crop-area');
const avatarCropConfirm = document.getElementById('avatar-crop-confirm');
const avatarCropCancel = document.getElementById('avatar-crop-cancel');
const avatarLoading = document.getElementById('avatar-upload-loading');

// Banner upload, crop, and Cloudinary integration
let bannerCropper = null;
const bannerInput = document.getElementById('banner-upload-input');
const bannerCropModal = document.getElementById('banner-crop-modal');
const bannerCropArea = document.getElementById('banner-crop-area');
const bannerCropConfirm = document.getElementById('banner-crop-confirm');
const bannerCropCancel = document.getElementById('banner-crop-cancel');
const bannerLoading = document.getElementById('banner-upload-loading');

// Add Friend Modal open/close logic
const openAddFriendBtn = document.getElementById('open-add-friend-modal');
const addFriendModal = document.getElementById('add-friend-modal');
const closeAddFriendModalBtn = document.getElementById('close-add-friend-modal');

let friendsRealtimeSub = null;

// --- DM Chat UI Logic ---
let socket = null;
let currentDM = null;

// --- Define appendDMMessage globally ---
window.appendDMMessage = function(who, message, timestamp, media_url = null, media_type = null, file_name = null, reply = null) {
  const chat = document.querySelector('.dm-chat-messages');
  if (!chat) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = 'dm-message ' + who;
  msgDiv.dataset.timestamp = timestamp;
  let mediaHtml = '';
  if (media_url && media_type) {
    if (media_type.startsWith('image/')) {
      mediaHtml = `<img class=\"dm-message-media-img\" src=\"${media_url}\" alt=\"Image\" loading=\"lazy\" />`;
    } else if (media_type.startsWith('video/')) {
      mediaHtml = `<video class=\"dm-message-media-video\" src=\"${media_url}\" controls preload=\"metadata\"></video>`;
    } else {
      const name = file_name ? file_name : 'Download File';
      mediaHtml = `<a class=\"dm-message-media-file\" href=\"${media_url}\" download target=\"_blank\"><i class=\"fa-solid fa-file-arrow-down\"></i> ${name}</a>`;
    }
  }
  let replyHtml = '';
  if (reply && (reply.message || reply.media_url)) {
    replyHtml = `<div class='dm-reply-bubble'><span class='dm-reply-label'>Replying to:</span> <span class='dm-reply-msg'>${reply.message ? reply.message : '[media]'}</span></div>`;
  }
  // --- Mention highlighting logic ---
  let highlightedMessage = message;
  try {
    const user = JSON.parse(localStorage.getItem('spice_user'));
    const friend = window.currentDM;
    const mentionUsernames = [];
    if (user && user.username) mentionUsernames.push(user.username);
    if (friend && friend.username && friend.username !== user.username) mentionUsernames.push(friend.username);
    // Sort by length descending to avoid partial matches
    mentionUsernames.sort((a, b) => b.length - a.length);
    mentionUsernames.forEach(username => {
      const regex = new RegExp(`(^|\\s)@${username.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?=\\b)`, 'g');
      highlightedMessage = highlightedMessage.replace(regex, `$1<span class=\"mention\">@${username}</span>`);
    });
  } catch (e) {}
  msgDiv.innerHTML = `
    <div class=\"dm-message-bubble\">\n      ${replyHtml}
      ${mediaHtml}\n      ${highlightedMessage ? `<span class=\"dm-message-text\">${highlightedMessage}</span>` : ''}\n      <span class=\"dm-message-time\">${new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>\n    </div>\n  `;
  const dropdown = document.createElement('div');
  dropdown.className = 'dm-message-dropdown';
  dropdown.style.display = 'none';
  dropdown.innerHTML = `
    <button class=\"dm-msg-action\" data-action=\"reply\">Reply</button>\n    <button class=\"dm-msg-action\" data-action=\"copy\">Copy</button>\n    <button class=\"dm-msg-action\" data-action=\"delete\">Delete</button>\n    <button class=\"dm-msg-action\" data-action=\"pin\">Pin</button>\n  `;
  msgDiv.appendChild(dropdown);
  msgDiv.addEventListener('dblclick', (e) => {
    document.querySelectorAll('.dm-message-dropdown').forEach(el => {
      if (el !== dropdown) el.style.display = 'none';
    });
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    dropdown.style.position = 'absolute';
    dropdown.style.left = e.offsetX + 10 + 'px';
    dropdown.style.top = e.offsetY + 'px';
    e.stopPropagation();
  });
  document.addEventListener('click', (e) => {
    if (!msgDiv.contains(e.target)) dropdown.style.display = 'none';
  });
  dropdown.addEventListener('click', async (e) => {
    if (e.target.classList.contains('dm-msg-action')) {
      const action = e.target.getAttribute('data-action');
      if (action === 'copy') {
        let textToCopy = message;
        if (media_url && media_type && media_type.startsWith('image/')) textToCopy = media_url;
        navigator.clipboard.writeText(textToCopy || '').then(() => {
          e.target.textContent = 'Copied!';
          setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
        });
      } else if (action === 'delete') {
        if (socket && currentDM) {
          const user = JSON.parse(localStorage.getItem('spice_user'));
          const dm_id = [user.user_id, currentDM.user_id].sort().join('-');
          await supabase.from('messages').delete().eq('timestamp', timestamp).eq('sender_id', who === 'me' ? user.user_id : currentDM.user_id);
          socket.emit('delete', { dm_id, timestamp });
          msgDiv.remove();
        }
      }
      dropdown.style.display = 'none';
    }
  });
  chat.appendChild(msgDiv);
  void msgDiv.offsetWidth;
  msgDiv.classList.add('dm-message-animate-in');
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
};

function setupSocketIO(userId) {
  if (!window.io) return;
  if (socket) socket.disconnect();
  const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
  socket = window.io(socketUrl);
  socket.on('connect', () => {
    socket.emit('join', userId);
  });
  socket.on('dm', (data) => {
    if (currentDM && data.from === currentDM.user_id) {
      window.appendDMMessage('them', data.message, data.timestamp, data.media_url, data.media_type, data.file_name, data.reply || null);
    }
  });
}

// --- Define openDMChat globally ---
window.openDMChat = async function(friend) {
  currentDM = friend;
  const sidebar = document.querySelector('.users-sidebar');
  if (!sidebar) return;
  sidebar.classList.add('dm-active');
  sidebar.innerHTML = `
    <button class="hide-users-sidebar-btn" title="Hide Sidebar"><i class="fa-solid fa-chevron-right"></i></button>
    <div class="dm-chat-header">
      <button class="dm-back-btn" title="Back">&#8592;</button>
      <img class="dm-chat-avatar" src="${friend.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar">
      <span class="dm-chat-username">${friend.username}</span>
    </div>
    <div class="dm-chat-messages"></div>
    <form class="dm-chat-input-area">
      <button type="button" class="dm-chat-attach-btn" title="Attach Media"><i class="fa-solid fa-paperclip"></i></button>
      <input type="file" class="dm-chat-file-input" style="display:none;" accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar,.7z,.mp3,.wav,.ogg" />
      <input type="text" class="dm-chat-input" placeholder="Type a message..." autocomplete="off" />
      <button type="submit" class="dm-chat-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  `;
  // --- Re-attach hide sidebar logic ---
  const mainApp = document.querySelector('.main-app-layout');
  const unhideWrapper = document.querySelector('.unhide-users-sidebar-btn-wrapper');
  const unhideBtn = document.querySelector('.unhide-users-sidebar-btn');
  const hideBtn = sidebar.querySelector('.hide-users-sidebar-btn');
  if (hideBtn && sidebar && mainApp && unhideWrapper && unhideBtn) {
    hideBtn.addEventListener('click', function() {
      sidebar.classList.add('sidebar-hidden');
      mainApp.classList.add('sidebar-hidden');
      setTimeout(() => {
        sidebar.style.display = 'none';
        unhideWrapper.style.display = 'block';
      }, 350);
    });
    unhideBtn.addEventListener('click', function() {
      sidebar.style.display = '';
      setTimeout(() => {
        sidebar.classList.remove('sidebar-hidden');
        mainApp.classList.remove('sidebar-hidden');
        unhideWrapper.style.display = 'none';
      }, 10);
    });
  }
  setTimeout(() => sidebar.classList.add('dm-animate-in'), 10);
  sidebar.querySelector('.dm-back-btn').onclick = () => {
    sidebar.classList.remove('dm-animate-in');
    setTimeout(() => {
      sidebar.classList.remove('dm-active');
      sidebar.innerHTML = '';
      const addBtn = document.createElement('button');
      addBtn.className = 'add-friend-btn';
      addBtn.id = 'open-add-friend-modal';
      addBtn.textContent = '+ Add Friends';
      addBtn.onclick = openAddFriendModal;
      sidebar.appendChild(addBtn);
      renderFriendsSidebar();
    }, 350);
  };
  const user = JSON.parse(localStorage.getItem('spice_user'));
  const chat = sidebar.querySelector('.dm-chat-messages');
  if (user && chat) {
    chat.innerHTML = '<div class=\"dm-loading\">Loading chat...</div>';
    try {
      const res = await fetch(`/messages?user1=${user.user_id}&user2=${friend.user_id}`);
      const messages = await res.json();
      chat.innerHTML = '';
      for (const msg of messages) {
        window.appendDMMessage(
          msg.sender_id === user.user_id ? 'me' : 'them',
          msg.content,
          msg.timestamp,
          msg.media_url,
          msg.media_type,
          msg.file_name,
          msg.reply || null
        );
      }
    } catch (err) {
      chat.innerHTML = '<div class=\"dm-error\">Failed to load messages.</div>';
    }
  }
  const form = sidebar.querySelector('.dm-chat-input-area');
  const attachBtn = form.querySelector('.dm-chat-attach-btn');
  const fileInput = form.querySelector('.dm-chat-file-input');
  let fileErrorMsg = form.querySelector('.dm-file-error-msg');
  if (!fileErrorMsg) {
    fileErrorMsg = document.createElement('div');
    fileErrorMsg.className = 'dm-file-error-msg';
    fileErrorMsg.style.display = 'none';
    form.appendChild(fileErrorMsg);
  }
  attachBtn.onclick = (e) => {
    e.preventDefault();
    fileInput.value = '';
    fileErrorMsg.style.display = 'none';
    fileInput.click();
  };
  fileInput.onchange = async (e) => {
    fileErrorMsg.style.display = 'none';
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      fileErrorMsg.textContent = 'File too large (max 20MB).';
      fileErrorMsg.style.display = 'block';
      fileErrorMsg.classList.add('show');
      setTimeout(() => { fileErrorMsg.classList.remove('show'); fileErrorMsg.style.display = 'none'; }, 2000);
      return;
    }
    let loading = form.querySelector('.dm-file-upload-loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.className = 'dm-file-upload-loading';
      loading.innerHTML = '<div class=\"spinner\"></div><span>Uploading...</span>';
      form.appendChild(loading);
    }
    loading.style.display = 'flex';
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'user_media');
      const res = await fetch('https://api.cloudinary.com/v1_1/dbriuheef/auto/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      loading.style.display = 'none';
      if (data.secure_url) {
        const type = file.type;
        const name = file.name;
        const timestamp = Date.now();
        window.appendDMMessage('me', '', timestamp, data.secure_url, type, name);
        if (socket) {
          socket.emit('dm', {
            to: friend.user_id,
            from: user.user_id,
            message: '',
            timestamp,
            media_url: data.secure_url,
            media_type: type,
            file_name: name
          });
        }
      } else {
        fileErrorMsg.textContent = 'Upload failed.';
        fileErrorMsg.style.display = 'block';
        fileErrorMsg.classList.add('show');
        setTimeout(() => { fileErrorMsg.classList.remove('show'); fileErrorMsg.style.display = 'none'; }, 2000);
      }
    } catch (err) {
      loading.style.display = 'none';
      fileErrorMsg.textContent = 'Upload error.';
      fileErrorMsg.style.display = 'block';
      fileErrorMsg.classList.add('show');
      setTimeout(() => { fileErrorMsg.classList.remove('show'); fileErrorMsg.style.display = 'none'; }, 2000);
    }
  };
  // Add reply to message send
  const input = form.querySelector('.dm-chat-input');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const user = JSON.parse(localStorage.getItem('spice_user'));
    const timestamp = Date.now();
    // Send message (no reply)
    window.appendDMMessage('me', text, timestamp, null, null, null, null);
    if (socket) {
      socket.emit('dm', {
        to: friend.user_id,
        from: user.user_id,
        message: text,
        timestamp
      });
    }
    input.value = '';
  };
};

// Helper for fade-slide animation with smooth height transition
function animateFormSwitch(renderFn) {
  // Get current height
  const modal = authModal;
  const startHeight = modal.offsetHeight;
  modal.style.height = startHeight + 'px';
  modalContent.classList.add('out');
  setTimeout(() => {
    renderFn();
    // After content changes, get new height
    const endHeight = modalContent.offsetHeight +
      parseFloat(window.getComputedStyle(modalContent).marginTop || 0) +
      parseFloat(window.getComputedStyle(modalContent).marginBottom || 0) + 40; // buffer for padding
    modal.style.height = endHeight + 'px';
    modalContent.classList.remove('out');
    modalContent.classList.add('in');
    setTimeout(() => {
      modalContent.classList.remove('in');
      modal.style.height = '';
    }, 350);
  }, 300);
}

// Helper to generate a 9-digit user ID
function generateUserId() {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

// Supabase signup function
async function supabaseSignup(username, password) {
  const user_id = generateUserId();
  const { data, error } = await supabase.from('users').insert([
    { user_id, username, password }
  ]);
  if (error) throw new Error(error.message);
  return { user_id, username };
}

// Supabase login function
async function supabaseLogin(username, password) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();
  if (error || !data) throw new Error('Invalid credentials');
  return { username: data.username, user_id: data.user_id };
}

// Render login form
function renderLogin(animated) {
  modalContent.innerHTML = `
    <h2 class="modal-title">Log In</h2>
    <form class="auth-form" autocomplete="off">
      <input type="text" placeholder="Username" required autofocus />
      <input type="password" placeholder="Password" required />
      <button type="submit" class="btn btn-primary" style="width:100%">Log In</button>
      <p class="switch-auth">Don't have an account? <a href="#" id="switch-to-signup">Sign up</a></p>
    </form>
  `;
  document.getElementById('switch-to-signup').onclick = (e) => {
    e.preventDefault();
    animateFormSwitch(() => renderSignup());
  };
}

// Render signup form
function renderSignup(animated) {
  modalContent.innerHTML = `
    <h2 class="modal-title">Sign Up</h2>
    <form class="auth-form" autocomplete="off">
      <input type="text" placeholder="Username" required autofocus />
      <input type="password" placeholder="Password" required />
      <button type="submit" class="btn btn-primary" style="width:100%">Sign Up</button>
      <p class="switch-auth">Already have an account? <a href="#" id="switch-to-login">Log in</a></p>
    </form>
  `;
  document.getElementById('switch-to-login').onclick = (e) => {
    e.preventDefault();
    animateFormSwitch(() => renderLogin());
  };
}

// Open modal with login or signup
function openModal(mode = 'login') {
  modalContent.classList.add('fade-slide');
  if (mode === 'login') renderLogin();
  else renderSignup();
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// Event listeners
openLoginBtn.onclick = () => openModal('login');
openSignupBtn.onclick = () => openModal('signup');
closeModalBtn.onclick = closeModal;

// Close on overlay click (not modal itself)
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Close on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
    closeModal();
  }
});

// Helper to render user profile in channels sidebar
function renderSidebarUserProfile(user) {
  const profileDiv = document.getElementById('sidebar-user-profile');
  if (!profileDiv || !user) return;
  const firstLetter = user.username ? user.username[0].toUpperCase() : '?';
  let avatarHTML = '';
  if (user.avatar_url) {
    avatarHTML = `<img class="user-avatar user-avatar-img" src="${user.avatar_url}" alt="User Avatar">`;
  } else {
    avatarHTML = `<span class="user-avatar user-avatar-initial">${firstLetter}</span>`;
  }
  profileDiv.innerHTML = `
    ${avatarHTML}
    <span class="user-name">${user.username}</span>
    <span class="user-status"><i class="fa-solid fa-circle"></i></span>
  `;
}

// Helper to show main app layout after login/signup
function showMainApp(user) {
  // Hide all landing/hero/welcome content
  document.body.querySelectorAll('.welcome-container, .header, .hero, .info, .site-footer').forEach(el => {
    if (el) el.style.display = 'none';
  });
  // Show main app layout
  const mainApp = document.querySelector('.main-app-layout');
  if (mainApp) mainApp.style.display = 'flex';
  renderSidebarUserProfile(user);
  // Close login/signup modal if open
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
    modalOverlay.style.display = 'none';
  }
  renderFriendsSidebar();
  setupSocketIO(user.user_id);
  if (typeof renderServersList === 'function') renderServersList();
  // Hide site loader overlay after at least 4 seconds
  const loader = document.getElementById('site-loader');
  setTimeout(() => {
    if (loader) loader.style.display = 'none';
    document.body.classList.remove('pre-auth');
  }, 4000);
}

// Helper to update profile preview card with real user data
function updateProfilePreview(user) {
  if (!user) return;
  // Display name
  document.querySelectorAll('.profile-displayname').forEach(el => {
    el.textContent = user.username || '';
  });
  // User ID with copy button
  document.querySelectorAll('.profile-username').forEach(el => {
    el.innerHTML = `
      <span class="profile-userid">${user.user_id}</span>
      <button class="profile-copy-id-btn" title="Copy User ID"><i class="fa-regular fa-copy"></i></button>
      <span class="profile-copy-feedback" style="display:none;">Copied!</span>
    `;
    const btn = el.querySelector('.profile-copy-id-btn');
    const feedback = el.querySelector('.profile-copy-feedback');
    if (btn) {
      btn.onclick = () => {
        navigator.clipboard.writeText(user.user_id);
        if (feedback) {
          feedback.style.display = 'inline-block';
          setTimeout(() => { feedback.style.display = 'none'; }, 1200);
        }
      };
    }
  });
  // Avatar in profile preview
  document.querySelectorAll('.profile-avatar-img').forEach(img => {
    if (user.avatar_url) {
      img.src = user.avatar_url;
    } else {
      img.src = 'https://randomuser.me/api/portraits/lego/1.jpg'; // fallback default
    }
  });
  // Banner in profile preview
  document.querySelectorAll('.profile-banner').forEach(div => {
    if (user.banner_url) {
      div.style.backgroundImage = `url('${user.banner_url}')`;
      div.style.backgroundSize = 'cover';
      div.style.backgroundPosition = 'center';
    } else {
      div.style.backgroundImage = '';
    }
  });
}

// Call updateProfilePreview after login/signup and after avatar upload
window.addEventListener('DOMContentLoaded', function() {
  const usersSidebar = document.querySelector('.users-sidebar');
  const mainApp = document.querySelector('.main-app-layout');
  const hideBtn = document.querySelector('.hide-users-sidebar-btn');
  const unhideWrapper = document.querySelector('.unhide-users-sidebar-btn-wrapper');
  const unhideBtn = document.querySelector('.unhide-users-sidebar-btn');
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (user && user.username && user.user_id) {
    showMainApp(user);
    renderSidebarUserProfile(user);
    updateProfilePreview(user);
  }

  // Footer animation
  const footer = document.getElementById('site-footer');
  if (footer) {
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            footer.classList.add('visible');
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(footer);
  }

  // Setup avatar upload
  setupAvatarUpload();

  // Setup banner upload
  setupBannerUpload();

  // On page load, load Socket.IO client
  if (!window.io) {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    script.onload = () => {
      if (user) setupSocketIO(user.user_id);
    };
    document.head.appendChild(script);
  }

  // Profile Modal Tab Switch Logic
  const navLinks = document.querySelectorAll('#profile-modal .profile-settings-nav .nav-link');
  const myAccountSection = document.getElementById('profile-section-my-account');
  const joinServersSection = document.getElementById('profile-section-join-servers');
  const modalTitle = document.getElementById('profile-modal-title');
  if (navLinks.length && myAccountSection && joinServersSection && modalTitle) {
    // Always show My Account by default
    myAccountSection.style.display = '';
    joinServersSection.style.display = 'none';
    modalTitle.textContent = 'My Account';
    navLinks.forEach(link => {
      link.onclick = () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        if (link.textContent.trim().toLowerCase().includes('join')) {
          myAccountSection.style.display = 'none';
          joinServersSection.style.display = '';
          modalTitle.textContent = 'Join Servers';
        } else {
          myAccountSection.style.display = '';
          joinServersSection.style.display = 'none';
          modalTitle.textContent = 'My Account';
        }
      };
    });
  }
  // When opening the modal, always reset to My Account
  if (profileBtn) {
    profileBtn.onclick = () => {
      const profileModal = document.getElementById('profile-modal');
      if (!profileModal) return;
      profileModal.style.display = 'flex';
      setTimeout(() => {
        profileModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        profileModal.focus();
        // Reset to My Account tab/section
        navLinks.forEach(l => l.classList.remove('active'));
        navLinks[0].classList.add('active');
        myAccountSection.style.display = '';
        joinServersSection.style.display = 'none';
        modalTitle.textContent = 'My Account';
      }, 10);
    };
  }

  // Animate main app layout sections on load
  const serversSidebar = document.querySelector('.servers-sidebar');
  const channelsSidebar = document.querySelector('.channels-sidebar');
  const chatSection = document.querySelector('.chat-section');
  if (serversSidebar) serversSidebar.classList.add('layout-animate-in-left');
  if (channelsSidebar) channelsSidebar.classList.add('layout-animate-in-left');
  if (chatSection) chatSection.classList.add('layout-animate-in-up');
  if (usersSidebar) usersSidebar.classList.add('layout-animate-in-right');

  // --- Hide/Unhide Users Sidebar Logic ---
  if (hideBtn && usersSidebar && mainApp && unhideWrapper && unhideBtn) {
    hideBtn.addEventListener('click', function() {
      usersSidebar.classList.add('sidebar-hidden');
      mainApp.classList.add('sidebar-hidden');
      setTimeout(() => {
        usersSidebar.style.display = 'none';
        unhideWrapper.style.display = 'block';
      }, 350);
    });
    unhideBtn.addEventListener('click', function() {
      usersSidebar.style.display = '';
      setTimeout(() => {
        usersSidebar.classList.remove('sidebar-hidden');
        mainApp.classList.remove('sidebar-hidden');
        unhideWrapper.style.display = 'none';
      }, 10);
    });
  }
});

// Optional: Prevent form submission (for now)
document.addEventListener('submit', async (e) => {
  if (e.target.classList.contains('auth-form')) {
    e.preventDefault();
    const form = e.target;
    const username = form.querySelector('input[type="text"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;
    if (form.querySelector('button[type="submit"]').textContent.includes('Sign Up')) {
      // Signup
      try {
        const user = await supabaseSignup(username, password);
        localStorage.setItem('spice_user', JSON.stringify(user));
        showMainApp(user);
        renderSidebarUserProfile(user);
        updateProfilePreview(user);
      } catch (err) {
        alert('Signup failed: ' + err.message);
      }
    } else {
      // Login
      try {
        const user = await supabaseLogin(username, password);
        localStorage.setItem('spice_user', JSON.stringify(user));
        showMainApp(user);
        renderSidebarUserProfile(user);
        updateProfilePreview(user);
      } catch (err) {
        alert('Invalid credentials');
      }
    }
  }
});

function openProfileModal() {
  if (!profileModal) return;
  profileModal.style.display = 'flex';
  setTimeout(() => {
    profileModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    profileModal.focus();
  }, 10);
}

function closeProfileModal() {
  if (!profileModal) return;
  profileModal.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => {
    profileModal.style.display = 'none';
  }, 400);
}

if (profileBtn) {
  profileBtn.onclick = openProfileModal;
}
if (closeProfileModalBtn) {
  closeProfileModalBtn.onclick = closeProfileModal;
}
// Close on overlay click (not modal content)
if (profileModal) {
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) closeProfileModal();
  });
}
// Close on ESC key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && profileModal && profileModal.classList.contains('active')) {
    closeProfileModal();
  }
});

// Open file input when Change Avatar is clicked
function setupAvatarUpload() {
  document.querySelectorAll('.profile-btn').forEach(btn => {
    if (btn.textContent.includes('Change Avatar')) {
      btn.onclick = (e) => {
        e.preventDefault();
        avatarInput.value = '';
        avatarInput.click();
      };
    }
  });
}

// Show crop modal and initialize Cropper.js
avatarInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    avatarCropArea.innerHTML = `<img id="avatar-crop-img" src="${ev.target.result}" style="max-width:100%;max-height:100%;display:block;" />`;
    avatarCropModal.style.display = 'flex';
    setTimeout(() => {
      const img = document.getElementById('avatar-crop-img');
      if (cropper) cropper.destroy();
      cropper = new window.Cropper(img, {
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

// Cancel crop
avatarCropCancel.onclick = () => {
  avatarCropModal.style.display = 'none';
  if (cropper) { cropper.destroy(); cropper = null; }
};

// Confirm crop and upload to Cloudinary
avatarCropConfirm.onclick = async () => {
  if (!cropper) return;
  avatarCropModal.style.display = 'none';
  avatarLoading.style.display = 'flex';
  cropper.getCroppedCanvas({ width: 256, height: 256 }).toBlob(async (blob) => {
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
        // Update avatar in UI
        document.querySelectorAll('.profile-avatar-img, .profile-preview-avatar-img').forEach(img => {
          img.src = data.secure_url;
        });
        // Save to Supabase
        const user = JSON.parse(localStorage.getItem('spice_user'));
        if (user) {
          await supabase.from('users').update({ avatar_url: data.secure_url }).eq('user_id', user.user_id);
          user.avatar_url = data.secure_url;
          localStorage.setItem('spice_user', JSON.stringify(user));
          updateProfilePreview(user);
        }
      } else {
        alert('Upload failed.');
      }
    } catch (err) {
      alert('Upload error: ' + err.message);
    } finally {
      avatarLoading.style.display = 'none';
      if (cropper) { cropper.destroy(); cropper = null; }
    }
  }, 'image/jpeg', 0.95);
};

// Open file input when Change Banner is clicked
function setupBannerUpload() {
  document.querySelectorAll('.profile-change-banner-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      bannerInput.value = '';
      bannerInput.click();
    };
  });
}

// Show crop modal and initialize Cropper.js for banner
bannerInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    bannerCropArea.innerHTML = `<img id="banner-crop-img" src="${ev.target.result}" style="max-width:100%;max-height:100%;display:block;" />`;
    bannerCropModal.style.display = 'flex';
    setTimeout(() => {
      const img = document.getElementById('banner-crop-img');
      if (bannerCropper) bannerCropper.destroy();
      bannerCropper = new window.Cropper(img, {
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

// Cancel crop
bannerCropCancel.onclick = () => {
  bannerCropModal.style.display = 'none';
  if (bannerCropper) { bannerCropper.destroy(); bannerCropper = null; }
};

// Confirm crop and upload to Cloudinary
bannerCropConfirm.onclick = async () => {
  if (!bannerCropper) return;
  bannerCropModal.style.display = 'none';
  bannerLoading.style.display = 'flex';
  bannerCropper.getCroppedCanvas({ width: 1200, height: 300 }).toBlob(async (blob) => {
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
        document.querySelectorAll('.profile-banner').forEach(div => {
          div.style.backgroundImage = `url('${data.secure_url}')`;
          div.style.backgroundSize = 'cover';
          div.style.backgroundPosition = 'center';
        });
        // Save to Supabase
        const user = JSON.parse(localStorage.getItem('spice_user'));
        if (user) {
          await supabase.from('users').update({ banner_url: data.secure_url }).eq('user_id', user.user_id);
          user.banner_url = data.secure_url;
          localStorage.setItem('spice_user', JSON.stringify(user));
        }
      } else {
        alert('Upload failed.');
      }
    } catch (err) {
      alert('Upload error: ' + err.message);
    } finally {
      bannerLoading.style.display = 'none';
      if (bannerCropper) { bannerCropper.destroy(); bannerCropper = null; }
    }
  }, 'image/jpeg', 0.95);
};

function openAddFriendModal() {
  if (!addFriendModal) return;
  addFriendModal.style.display = 'flex';
  setTimeout(() => {
    addFriendModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    addFriendModal.focus();
  }, 10);
  fetchFriendRequests();
  renderFriendsSidebar();
  // Setup realtime subscription
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (user && !friendsRealtimeSub) {
    friendsRealtimeSub = supabase.channel('friends-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friends',
        filter: `requester_id=eq.${user.user_id},receiver_id=eq.${user.user_id}`
      }, payload => {
        fetchFriendRequests();
        renderFriendsSidebar();
      })
      .subscribe();
  }
}

function closeAddFriendModal() {
  if (!addFriendModal) return;
  addFriendModal.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => {
    addFriendModal.style.display = 'none';
  }, 400);
  // Remove realtime subscription
  if (friendsRealtimeSub) {
    supabase.removeChannel(friendsRealtimeSub);
    friendsRealtimeSub = null;
  }
}

if (openAddFriendBtn) openAddFriendBtn.onclick = openAddFriendModal;
if (closeAddFriendModalBtn) closeAddFriendModalBtn.onclick = closeAddFriendModal;
// Close on overlay click (not modal content)
if (addFriendModal) {
  addFriendModal.addEventListener('click', (e) => {
    if (e.target === addFriendModal) closeAddFriendModal();
  });
}
// Close on ESC key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && addFriendModal && addFriendModal.classList.contains('active')) {
    closeAddFriendModal();
  }
});

// Helper to show animated feedback in add friend modal
function showAddFriendFeedback(message, type = 'success') {
  const feedback = document.getElementById('add-friend-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = 'add-friend-feedback ' + type;
  feedback.style.opacity = '1';
  setTimeout(() => {
    feedback.style.opacity = '0';
  }, 1500);
}

// Helper to fetch user info by user_id
async function getUserInfo(user_id) {
  const { data, error } = await supabase.from('users').select('username,avatar_url').eq('user_id', user_id).single();
  if (error || !data) return { username: user_id, avatar_url: '' };
  return data;
}

// Fetch and display friend requests
async function fetchFriendRequests() {
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id) return;
  // Received requests
  const { data: received, error: recErr } = await supabase
    .from('friends')
    .select('*')
    .eq('receiver_id', user.user_id)
    .order('created_at', { ascending: false });
  // Sent requests
  const { data: sent, error: sentErr } = await supabase
    .from('friends')
    .select('*')
    .eq('requester_id', user.user_id)
    .order('created_at', { ascending: false });
  // Render received
  const receivedList = document.getElementById('received-requests-list');
  if (receivedList) {
    receivedList.innerHTML = '';
    if (recErr) {
      receivedList.innerHTML = '<div class="friend-request-item">Error loading requests</div>';
    } else if (received && received.length) {
      for (const req of received) {
        const info = await getUserInfo(req.requester_id);
        receivedList.innerHTML += `
          <div class="friend-request-item">
            <img class="friend-request-avatar" src="${info.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar">
            <span class="friend-request-username">${info.username}</span>
            <span class="friend-request-status">${req.status}</span>
            ${req.status === 'pending' ? `
              <button class="friend-request-accept" data-id="${req.id}">Accept</button>
              <button class="friend-request-reject" data-id="${req.id}">Reject</button>
            ` : ''}
          </div>
        `;
      }
    } else {
      receivedList.innerHTML = '<div class="friend-request-item">No received requests</div>';
    }
  }
  // Render sent
  const sentList = document.getElementById('sent-requests-list');
  if (sentList) {
    sentList.innerHTML = '';
    if (sentErr) {
      sentList.innerHTML = '<div class="friend-request-item">Error loading requests</div>';
    } else if (sent && sent.length) {
      for (const req of sent) {
        const info = await getUserInfo(req.receiver_id);
        sentList.innerHTML += `
          <div class="friend-request-item">
            <img class="friend-request-avatar" src="${info.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar">
            <span class="friend-request-username">${info.username}</span>
            <span class="friend-request-status">${req.status}</span>
          </div>
        `;
      }
    } else {
      sentList.innerHTML = '<div class="friend-request-item">No sent requests</div>';
    }
  }
  // Add Accept/Reject handlers
  document.querySelectorAll('.friend-request-accept').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      await supabase.from('friends').update({ status: 'accepted' }).eq('id', id);
      showAddFriendFeedback('Friend request accepted!', 'success');
      fetchFriendRequests();
      renderFriendsSidebar();
    };
  });
  document.querySelectorAll('.friend-request-reject').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      await supabase.from('friends').update({ status: 'rejected' }).eq('id', id);
      showAddFriendFeedback('Friend request rejected.', 'error');
      fetchFriendRequests();
      renderFriendsSidebar();
    };
  });
}

// Add Friend form submission logic
const addFriendForm = document.querySelector('.add-friend-form');
if (addFriendForm) {
  addFriendForm.onsubmit = async (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('spice_user'));
    if (!user || !user.user_id) {
      showAddFriendFeedback('You must be logged in to send friend requests.', 'error');
      return;
    }
    const input = document.getElementById('add-friend-userid');
    const receiverId = input.value.trim();
    if (!receiverId || receiverId === user.user_id) {
      showAddFriendFeedback('Please enter a valid User ID (not your own).', 'error');
      return;
    }
    try {
      const { data, error } = await supabase.from('friends').insert([
        { requester_id: user.user_id, receiver_id: receiverId, status: 'pending' }
      ]);
      if (error) throw error;
      input.value = '';
      showAddFriendFeedback('Friend request sent!', 'success');
      fetchFriendRequests();
    } catch (err) {
      showAddFriendFeedback('Error sending request: ' + (err.message || err), 'error');
    }
  };
}

// Fetch requests when modal opens
if (openAddFriendBtn) openAddFriendBtn.addEventListener('click', fetchFriendRequests);

// Render friends list in users-sidebar
async function renderFriendsSidebar() {
  const user = JSON.parse(localStorage.getItem('spice_user'));
  if (!user || !user.user_id) return;
  const sidebar = document.querySelector('.users-sidebar');
  if (!sidebar) return;
  // Remove old friends list if exists
  const old = sidebar.querySelector('.friends-list-section');
  if (old) old.remove();
  // Fetch accepted friends
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .or(`requester_id.eq.${user.user_id},receiver_id.eq.${user.user_id}`)
    .eq('status', 'accepted');
  if (error || !data || !data.length) return;
  // Get friend user IDs (not self)
  const friendIds = data.map(f => f.requester_id === user.user_id ? f.receiver_id : f.requester_id);
  // Fetch user info for all friends
  const { data: usersData } = await supabase
    .from('users')
    .select('user_id,username,avatar_url')
    .in('user_id', friendIds);
  // Build friends list HTML
  let html = `<div class="friends-list-section"><h3 class="friends-list-heading">Friends</h3><div class="friends-list">`;
  for (const friend of usersData) {
    html += `
      <div class="friend-list-item">
        <img class="friend-list-avatar" src="${friend.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar" data-user-id="${friend.user_id}">
        <span class="friend-list-username">${friend.username}</span>
      </div>
    `;
  }
  html += '</div></div>';
  // Insert after the +Add Friends button
  const addBtn = sidebar.querySelector('.add-friend-btn');
  if (addBtn) addBtn.insertAdjacentHTML('afterend', html);

  setTimeout(() => {
    document.querySelectorAll('.friend-list-item').forEach(item => {
      item.onclick = async () => {
        const userId = item.querySelector('.friend-list-avatar').getAttribute('data-user-id');
        const { data: friendData } = await supabase.from('users').select('user_id,username,avatar_url').eq('user_id', userId).single();
        if (friendData) {
          window.openDMChat(friendData);
        } else {
          alert('Could not load friend data. Please try again.');
        }
      };
    });
  }, 100);
}

let joinRequestRealtimeSub = null;

function setupJoinRequestRealtime(serverId, userId) {
  if (joinRequestRealtimeSub) return;
  joinRequestRealtimeSub = supabase.channel('join-request-rt')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'server_invites',
      filter: `server_id=eq.${serverId},user_id=eq.${userId}`
    }, payload => {
      checkJoinRequestStatus(serverId, userId);
    })
    .subscribe();
}

function cleanupJoinRequestRealtime() {
  if (joinRequestRealtimeSub) {
    supabase.removeChannel(joinRequestRealtimeSub);
    joinRequestRealtimeSub = null;
  }
}

async function checkJoinRequestStatus(serverId, userId) {
  const statusDiv = document.getElementById('join-server-status');
  const { data: existing } = await supabase.from('server_invites')
    .select('*')
    .eq('server_id', serverId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && statusDiv) {
    statusDiv.textContent = 'Status: ' + (existing.status.charAt(0).toUpperCase() + existing.status.slice(1));
    statusDiv.className = 'add-friend-feedback ' + (existing.status === 'accepted' ? 'success' : existing.status === 'rejected' ? 'error' : '');
  }
}

// Join Server Request Logic
const joinServerForm = document.getElementById('join-server-form');
if (joinServerForm) {
  joinServerForm.onsubmit = async (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('spice_user'));
    const feedback = document.getElementById('join-server-feedback');
    const statusDiv = document.getElementById('join-server-status');
    if (!user || !user.user_id) {
      feedback.textContent = 'You must be logged in to join a server.';
      feedback.className = 'add-friend-feedback error';
      if (statusDiv) statusDiv.textContent = '';
      cleanupJoinRequestRealtime();
      return;
    }
    const input = document.getElementById('join-server-code');
    const serverId = input.value.trim();
    if (!serverId) {
      feedback.textContent = 'Please enter a valid Server ID.';
      feedback.className = 'add-friend-feedback error';
      if (statusDiv) statusDiv.textContent = '';
      cleanupJoinRequestRealtime();
      return;
    }
    // Prevent owner from sending join request to their own server
    const { data: ownedServer, error: ownerErr } = await supabase
      .from('servers')
      .select('id')
      .eq('id', serverId)
      .eq('owner_id', user.user_id)
      .maybeSingle();
    if (ownedServer) {
      feedback.textContent = 'You are the owner of this server. You cannot send a join request to your own server.';
      feedback.className = 'add-friend-feedback error';
      if (statusDiv) statusDiv.textContent = '';
      cleanupJoinRequestRealtime();
      return;
    }
    // Check for existing request
    const { data: existing, error: fetchErr } = await supabase.from('server_invites')
      .select('*')
      .eq('server_id', serverId)
      .eq('user_id', user.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchErr) {
      feedback.textContent = 'Error: ' + fetchErr.message;
      feedback.className = 'add-friend-feedback error';
      if (statusDiv) statusDiv.textContent = '';
      cleanupJoinRequestRealtime();
      return;
    }
    if (existing) {
      feedback.textContent = 'You already have a request for this server.';
      feedback.className = 'add-friend-feedback';
      if (statusDiv) {
        statusDiv.textContent = 'Status: ' + (existing.status.charAt(0).toUpperCase() + existing.status.slice(1));
        statusDiv.className = 'add-friend-feedback ' + (existing.status === 'accepted' ? 'success' : existing.status === 'rejected' ? 'error' : '');
      }
      setupJoinRequestRealtime(serverId, user.user_id);
      return;
    }
    // Insert join request
    const { data, error } = await supabase.from('server_invites').insert([
      { server_id: serverId, user_id: user.user_id, status: 'pending' }
    ]);
    if (error) {
      feedback.textContent = 'Error: ' + error.message;
      feedback.className = 'add-friend-feedback error';
      if (statusDiv) statusDiv.textContent = '';
      cleanupJoinRequestRealtime();
    } else {
      feedback.textContent = 'Request sent! Waiting for approval.';
      feedback.className = 'add-friend-feedback success';
      input.value = '';
      if (statusDiv) {
        statusDiv.textContent = 'Status: Pending';
        statusDiv.className = 'add-friend-feedback';
      }
      setupJoinRequestRealtime(serverId, user.user_id);
    }
  };
} 