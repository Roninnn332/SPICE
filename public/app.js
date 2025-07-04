// Enhanced Spice Chat Application with Premium Features
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Supabase Configuration
const SUPABASE_URL = 'https://qhbeexkqftbhjkeuruiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYmVleGtxZnRiaGprZXVydWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNzAxMTEsImV4cCI6MjA2NTg0NjExMX0.swpojIxW47IIPX097X45l3LYe5OiDZijGlAMXfCD30I';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;

// Global Variables
let socket = null;
let currentDM = null;
let friendsRealtimeSub = null;
let joinRequestRealtimeSub = null;

// DOM Elements
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

// Enhanced Animation System
class AnimationController {
  static observeElements() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observe elements for animation
    document.querySelectorAll('.feature, .hero-content, .hero-visuals').forEach(el => {
      observer.observe(el);
    });
  }

  static staggeredAnimation(elements, baseDelay = 100) {
    elements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add('animate-fade-in-up');
      }, baseDelay * index);
    });
  }

  static slideInFromDirection(element, direction = 'left', duration = 600) {
    element.style.transform = `translateX(${direction === 'left' ? '-100%' : '100%'})`;
    element.style.opacity = '0';
    element.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;

    setTimeout(() => {
      element.style.transform = 'translateX(0)';
      element.style.opacity = '1';
    }, 50);
  }
}

// Enhanced Loading System
class LoadingManager {
  static show(message = 'Loading...') {
    const loader = document.getElementById('site-loader');
    const tagline = loader?.querySelector('.site-loader-tagline');

    if (loader) {
      if (tagline) tagline.textContent = message;
      loader.style.display = 'flex';
      loader.classList.remove('fade-out');
    }
  }

  static hide(delay = 0) {
    setTimeout(() => {
      const loader = document.getElementById('site-loader');
      if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
          loader.style.display = 'none';
        }, 500);
      }
    }, delay);
  }
}

// Enhanced Modal System
class ModalManager {
  static openModal(mode = 'login') {
    modalContent.classList.add('fade-slide');
    if (mode === 'login') this.renderLogin();
    else this.renderSignup();

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus management
    setTimeout(() => {
      const firstInput = modalContent.querySelector('input');
      if (firstInput) firstInput.focus();
    }, 300);
  }

  static closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  static renderLogin() {
    modalContent.innerHTML = `
      <h2 class="modal-title gradient-text">Welcome Back</h2>
      <form class="auth-form glass-effect" autocomplete="off" style="padding: 2rem; border-radius: var(--border-radius-lg); backdrop-filter: blur(20px);">
        <div class="input-group" style="margin-bottom: 1.5rem;">
          <label style="color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">Username</label>
          <input type="text" placeholder="Enter your username" required autofocus style="width: 100%; padding: 1rem; border: 1px solid var(--glass-border); border-radius: var(--border-radius-md); background: var(--glass-bg); color: var(--text-primary); backdrop-filter: blur(10px);" />
        </div>
        <div class="input-group" style="margin-bottom: 2rem;">
          <label style="color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">Password</label>
          <input type="password" placeholder="Enter your password" required style="width: 100%; padding: 1rem; border: 1px solid var(--glass-border); border-radius: var(--border-radius-md); background: var(--glass-bg); color: var(--text-primary); backdrop-filter: blur(10px);" />
        </div>
        <button type="submit" class="btn btn-primary hover-lift" style="width: 100%; margin-bottom: 1rem;">
          <i class="fas fa-sign-in-alt"></i>
          Sign In
        </button>
        <p class="switch-auth" style="text-align: center; color: var(--text-secondary);">
          Don't have an account? 
          <a href="#" id="switch-to-signup" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600;">Create one</a>
        </p>
      </form>
    `;

    document.getElementById('switch-to-signup').onclick = (e) => {
      e.preventDefault();
      this.animateFormSwitch(() => this.renderSignup());
    };
  }

  static renderSignup() {
    modalContent.innerHTML = `
      <h2 class="modal-title gradient-text">Join Spice</h2>
      <form class="auth-form glass-effect" autocomplete="off" style="padding: 2rem; border-radius: var(--border-radius-lg); backdrop-filter: blur(20px);">
        <div class="input-group" style="margin-bottom: 1.5rem;">
          <label style="color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">Username</label>
          <input type="text" placeholder="Choose a username" required autofocus style="width: 100%; padding: 1rem; border: 1px solid var(--glass-border); border-radius: var(--border-radius-md); background: var(--glass-bg); color: var(--text-primary); backdrop-filter: blur(10px);" />
        </div>
        <div class="input-group" style="margin-bottom: 2rem;">
          <label style="color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">Password</label>
          <input type="password" placeholder="Create a password" required style="width: 100%; padding: 1rem; border: 1px solid var(--glass-border); border-radius: var(--border-radius-md); background: var(--glass-bg); color: var(--text-primary); backdrop-filter: blur(10px);" />
        </div>
        <button type="submit" class="btn btn-primary hover-lift" style="width: 100%; margin-bottom: 1rem;">
          <i class="fas fa-user-plus"></i>
          Create Account
        </button>
        <p class="switch-auth" style="text-align: center; color: var(--text-secondary);">
          Already have an account? 
          <a href="#" id="switch-to-login" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600;">Sign in</a>
        </p>
      </form>
    `;

    document.getElementById('switch-to-login').onclick = (e) => {
      e.preventDefault();
      this.animateFormSwitch(() => this.renderLogin());
    };
  }

  static animateFormSwitch(renderFn) {
    const modal = authModal;
    const startHeight = modal.offsetHeight;
    modal.style.height = startHeight + 'px';
    modalContent.style.opacity = '0';
    modalContent.style.transform = 'translateY(20px)';

    setTimeout(() => {
      renderFn();
      const endHeight = modalContent.offsetHeight + 80;
      modal.style.height = endHeight + 'px';
      modalContent.style.opacity = '1';
      modalContent.style.transform = 'translateY(0)';

      setTimeout(() => {
        modal.style.height = '';
      }, 300);
    }, 200);
  }
}

// Enhanced Chat System
class ChatManager {
  static appendMessage(content, sender = 'system', isMe = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chat__conversation-board__message ${isMe ? 'reversed' : ''}`;

    const avatarColor = isMe ? 'var(--gradient-primary)' : 'var(--gradient-accent)';
    const senderInitial = sender.charAt(0).toUpperCase();

    messageEl.innerHTML = `
      <div class="chat__conversation-board__message__person">
        <div class="chat__conversation-board__message__person__avatar" style="background: ${avatarColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
          ${senderInitial}
        </div>
      </div>
      <div class="chat__conversation-board__message__bubble">
        <p>${content}</p>
        <small style="opacity: 0.7; font-size: 0.8rem; margin-top: 0.5rem; display: block;">
          ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </small>
      </div>
    `;

    // Add entrance animation
    messageEl.style.opacity = '0';
    messageEl.style.transform = 'translateY(20px) scale(0.95)';

    chatMessages.appendChild(messageEl);

    // Trigger animation
    setTimeout(() => {
      messageEl.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      messageEl.style.opacity = '1';
      messageEl.style.transform = 'translateY(0) scale(1)';
    }, 50);

    // Smooth scroll to bottom
    chatMessages.scrollTo({
      top: chatMessages.scrollHeight,
      behavior: 'smooth'
    });
  }

  static setupMessageInput() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    if (!messageInput || !sendButton) return;

    const sendMessage = () => {
      const message = messageInput.value.trim();
      if (!message) return;

      // Add message to chat
      this.appendMessage(message, 'You', true);

      // Clear input with animation
      messageInput.style.transform = 'scale(0.98)';
      setTimeout(() => {
        messageInput.value = '';
        messageInput.style.transform = 'scale(1)';
      }, 100);

      // Demo response after delay
      setTimeout(() => {
        const responses = [
          "That's interesting! 🤔",
          "I totally agree! 👍",
          "Thanks for sharing! ✨",
          "Great point! 🎯",
          "Amazing! 🚀"
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        this.appendMessage(randomResponse, 'Friend');
      }, 1000 + Math.random() * 2000);
    };

    // Enter key to send
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Click to send
    sendButton.addEventListener('click', sendMessage);

    // Enhanced input focus effects
    messageInput.addEventListener('focus', () => {
      messageInput.parentElement.style.borderColor = 'var(--accent-cyan)';
      messageInput.parentElement.style.boxShadow = 'var(--glow-accent)';
    });

    messageInput.addEventListener('blur', () => {
      messageInput.parentElement.style.borderColor = 'var(--glass-border)';
      messageInput.parentElement.style.boxShadow = 'none';
    });
  }
}

// Authentication System
class AuthManager {
  static generateUserId() {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
  }

  static async signup(username, password) {
    const user_id = this.generateUserId();
    const { data, error } = await supabase.from('users').insert([
      { user_id, username, password }
    ]);
    if (error) throw new Error(error.message);
    return { user_id, username };
  }

  static async login(username, password) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();
    if (error || !data) throw new Error('Invalid credentials');
    return { username: data.username, user_id: data.user_id };
  }

  static showMainApp(user) {
    // Hide landing elements with animation
    document.querySelectorAll('.header, .hero, .info, .site-footer').forEach(el => {
      if (el) {
        el.style.transition = 'all 0.5s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-20px)';
        setTimeout(() => {
          el.style.display = 'none';
        }, 500);
      }
    });

    // Show main app with animation
    const mainApp = document.querySelector('.main-app-layout');
    if (mainApp) {
      setTimeout(() => {
        mainApp.style.display = 'flex';
        mainApp.style.opacity = '0';
        setTimeout(() => {
          mainApp.style.transition = 'opacity 0.6s ease';
          mainApp.style.opacity = '1';

          // Animate sidebars
          const sidebars = mainApp.querySelectorAll('.sidebar');
          sidebars.forEach((sidebar, index) => {
            setTimeout(() => {
              AnimationController.slideInFromDirection(sidebar, index % 2 === 0 ? 'left' : 'right');
            }, index * 200);
          });
        }, 100);
      }, 300);
    }

    // Close modal
    ModalManager.closeModal();

    // Setup chat
    ChatManager.setupMessageInput();

    // Welcome message
    setTimeout(() => {
      ChatManager.appendMessage(`Welcome to Spice, ${user.username}! 🎉`);
    }, 1500);
  }

  static logout() {
    localStorage.removeItem('spice_user');

    // Animate out main app
    const mainApp = document.querySelector('.main-app-layout');
    if (mainApp) {
      mainApp.style.transition = 'all 0.5s ease';
      mainApp.style.opacity = '0';
      mainApp.style.transform = 'scale(0.95)';
      setTimeout(() => {
        mainApp.style.display = 'none';
      }, 500);
    }

    // Show landing page
    setTimeout(() => {
      document.querySelectorAll('.header, .hero, .info, .site-footer').forEach(el => {
        if (el) {
          el.style.display = '';
          el.style.opacity = '0';
          el.style.transform = 'translateY(20px)';
          setTimeout(() => {
            el.style.transition = 'all 0.6s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          }, 100);
        }
      });
    }, 300);

    // Disconnect socket
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  LoadingManager.show('Initializing Spice Chat...');

  // Check for existing user
  const user = JSON.parse(localStorage.getItem('spice_user') || 'null');

  if (user && user.username && user.user_id) {
    LoadingManager.show('Loading your dashboard...');
    setTimeout(() => {
      AuthManager.showMainApp(user);
      LoadingManager.hide(1000);
    }, 1500);
  } else {
    LoadingManager.hide(2000);
    setTimeout(() => {
      AnimationController.observeElements();
    }, 2500);
  }

  // Modal event listeners
  openLoginBtn?.addEventListener('click', () => ModalManager.openModal('login'));
  openSignupBtn?.addEventListener('click', () => ModalManager.openModal('signup'));
  closeModalBtn?.addEventListener('click', () => ModalManager.closeModal());

  // Close modal on overlay click
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) ModalManager.closeModal();
  });

  // Close modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay?.classList.contains('active')) {
      ModalManager.closeModal();
    }
  });

  // Enhanced smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

    // Setup logout button functionality
    function setupLogoutButton() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();

                // Confirm logout
                if (confirm('Are you sure you want to log out?')) {
                    AuthManager.logout();
                }
            });
        }
    }

    setupLogoutButton();

});

// Form submission handler
document.addEventListener('submit', async (e) => {
  if (e.target.classList.contains('auth-form')) {
    e.preventDefault();

    const form = e.target;
    const username = form.querySelector('input[type="text"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    submitBtn.disabled = true;

    try {
      let user;
      if (submitBtn.textContent.includes('Create Account')) {
        user = await AuthManager.signup(username, password);
      } else {
        user = await AuthManager.login(username, password);
      }

      localStorage.setItem('spice_user', JSON.stringify(user));
      AuthManager.showMainApp(user);

    } catch (err) {
      // Error animation
      form.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => {
        form.style.animation = '';
      }, 500);

      alert(err.message || 'Authentication failed');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }
});

// Add shake animation to CSS
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
`;
document.head.appendChild(shakeStyle);

// Enhanced performance optimizations
window.addEventListener('load', () => {
  // Preload critical images
  const criticalImages = ['assets/hero.png', 'assets/logo.png'];
  criticalImages.forEach(src => {
    const img = new Image();
    img.src = src;
  });
});

// Export for global access
window.AuthManager = AuthManager;
window.ChatManager = ChatManager;
window.AnimationController = AnimationController;
window.LoadingManager = LoadingManager;

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
            showAddFriendFeedback('Friend request sent! Waiting for approval.', 'success');
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
    if (old) {
        old.style.transform = 'translateX(20px)';
        old.style.opacity = '0';
        setTimeout(() => old.remove(), 200);
    }
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
    let html = `<div class="friends-list-section" style="opacity:0;transform:translateY(20px);transition:all 0.6s cubic-bezier(.4,2,.6,1);"><h3 class="friends-list-heading">Friends</h3><div class="friends-list">`;
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
    if (addBtn) {
        addBtn.insertAdjacentHTML('afterend', html);
        // Trigger entrance animation
        setTimeout(() => {
            const newFriendsList = sidebar.querySelector('.friends-list-section');
            if (newFriendsList) {
                newFriendsList.style.opacity = '1';
                newFriendsList.style.transform = 'translateY(0)';
            }
        }, 100);
    }

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
            const regex = new RegExp(`(^|\\s)@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\b)`, 'g');
            highlightedMessage = highlightedMessage.replace(regex, `$1<span class=\"mention\">@${username}</span>`);
        });
    } catch (e) { }
    msgDiv.innerHTML = `
    <div class=\"dm-message-bubble\">\n      ${replyHtml}
      ${mediaHtml}\n      ${highlightedMessage ? `<span class=\"dm-message-text\">${highlightedMessage}</span>` : ''}\n      <span class=\"dm-message-time\">${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}</span>\n    </div>\n  `;
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
window.openDMChat = async function (friend) {
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
        hideBtn.addEventListener('click', function () {
            sidebar.classList.add('sidebar-hidden');
            mainApp.classList.add('sidebar-hidden');
            setTimeout(() => {
                sidebar.style.display = 'none';
                unhideWrapper.style.display = 'block';
            }, 350);
        });
        unhideBtn.addEventListener('click', function () {
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
            // Restore hide button and add friend button
            const hideBtn = document.createElement('button');
            hideBtn.className = 'hide-users-sidebar-btn';
            hideBtn.title = 'Hide Sidebar';
            hideBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
            sidebar.appendChild(hideBtn);
            const addBtn = document.createElement('button');
            addBtn.className = 'add-friend-btn';
            addBtn.id = 'open-add-friend-modal';
            addBtn.textContent = '+ Add Friends';
            addBtn.onclick = openAddFriendModal;
            sidebar.appendChild(addBtn);
            renderFriendsSidebar();
            // Re-attach hide/unhide logic
            const mainApp = document.querySelector('.main-app-layout');
            const unhideWrapper = document.querySelector('.unhide-users-sidebar-btn-wrapper');
            const unhideBtn = document.querySelector('.unhide-users-sidebar-btn');
            if (hideBtn && sidebar && mainApp && unhideWrapper && unhideBtn) {
                hideBtn.addEventListener('click', function () {
                    sidebar.classList.add('sidebar-hidden');
                    mainApp.classList.add('sidebar-hidden');
                    setTimeout(() => {
                        sidebar.style.display = 'none';
                        unhideWrapper.style.display = 'block';
                    }, 350);
                });
                unhideBtn.addEventListener('click', function () {
                    sidebar.style.display = '';
                    setTimeout(() => {
                        sidebar.classList.remove('sidebar-hidden');
                        mainApp.classList.remove('sidebar-hidden');
                        unhideWrapper.style.display = 'none';
                    }, 10);
                });
            }
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

// Enhanced page load animations
function triggerPageLoadAnimations() {
    // Header animations with staggered timing
    const header = document.getElementById('main-header');
    if (header) {
        const logo = header.querySelector('.logo');
        const nav = header.querySelector('.main-nav');
        const loginBtn = header.querySelector('.btn-login');

        if (logo) {
            logo.classList.add('rotate-slide-in');
            logo.style.animationDelay = '0.1s';
        }
        if (nav) nav.classList.add('animate-nav');
        if (loginBtn) {
            loginBtn.classList.add('zoom-fade-in');
            loginBtn.style.animationDelay = '0.5s';
        }
    }

    // Hero section animations
    const heroSection = document.getElementById('hero-section');
    if (heroSection) {
        const heroContent = heroSection.querySelector('.hero-content');
        const heroVisuals = heroSection.querySelector('.hero-visuals');

        if (heroContent) heroContent.classList.add('animate-hero-content');
        if (heroVisuals) {
            heroVisuals.classList.add('scale-in');
            heroVisuals.style.animationDelay = '0.8s';
        }
    }

    // Info section with intersection observer for delayed trigger
    const infoSection = document.getElementById('info-section');
    if (infoSection) {
        const observerOptions = {
            threshold: 0.3,
            rootMargin: '0px 0px -100px 0px'
        };

        const infoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const title = entry.target.querySelector('h2');
                    const features = entry.target.querySelector('.info-features');

                    if (title) {
                        title.classList.add('slide-up-bounce');
                        title.style.animationDelay = '0.2s';
                    }
                    if (features) features.classList.add('animate-features');

                    infoObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);

        infoObserver.observe(infoSection);
    }

    // Footer animation with intersection observer
    const footer = document.getElementById('site-footer');
    if (footer) {
        const footerObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('slide-in-from-bottom');
                    footerObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        footerObserver.observe(footer);
    }
}

// On page load, load Socket.IO client
    if (!window.io) {
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
        script.onload = () => {
            const user = JSON.parse(localStorage.getItem('spice_user'));
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

    // Enhanced main app layout sections animations on load
    const serversSidebar = document.querySelector('.servers-sidebar');
    const channelsSidebar = document.querySelector('.channels-sidebar');
    const chatSection = document.querySelector('.chat-section');

    // Trigger animations with staggered timing for better visual flow
    setTimeout(() => {
        if (serversSidebar) serversSidebar.classList.add('layout-animate-in-left');
    }, 100);

    setTimeout(() => {
        if (channelsSidebar) channelsSidebar.classList.add('layout-animate-in-left');
    }, 200);

    setTimeout(() => {
        if (chatSection) chatSection.classList.add('layout-animate-in-up');
    }, 300);

    const usersSidebar = document.querySelector('.users-sidebar');
    setTimeout(() => {
        if (usersSidebar) usersSidebar.classList.add('layout-animate-in-right');
    }, 400);

    // Animate chat messages area when it's visible
    setTimeout(() => {
        const chatMessages = document.querySelector('.chat-messages');
        if (chatMessages) chatMessages.classList.add('chat-messages-animate');
    }, 600);

    // Animate sidebar elements
    setTimeout(() => {
        const sidebarProfile = document.querySelector('.sidebar-user-profile');
        if (sidebarProfile) sidebarProfile.classList.add('sidebar-profile-animate');
    }, 800);

    // --- Hide/Unhide Users Sidebar Logic ---
    const hideBtn = document.querySelector('.hide-users-sidebar-btn');
    const unhideWrapper = document.querySelector('.unhide-users-sidebar-btn-wrapper');
    const unhideBtn = document.querySelector('.unhide-users-sidebar-btn');
    if (hideBtn && usersSidebar && mainApp && unhideWrapper && unhideBtn) {
        hideBtn.addEventListener('click', function () {
            usersSidebar.classList.add('sidebar-hidden');
            mainApp.classList.add('sidebar-hidden');
            setTimeout(() => {
                usersSidebar.style.display = 'none';
                unhideWrapper.style.display = 'block';
            }, 350);
        });
        unhideBtn.addEventListener('click', function () {
            usersSidebar.style.display = '';
            setTimeout(() => {
                usersSidebar.classList.remove('sidebar-hidden');
                mainApp.classList.remove('sidebar-hidden');
                unhideWrapper.style.display = 'none';
            }, 10);
        });
    }

setupAvatarUpload();

// Setup banner upload
setupBannerUpload();