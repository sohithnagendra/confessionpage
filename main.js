import { 
  getAllConfessions, 
  submitConfession, 
  reactToConfession, 
  reportConfession, 
  approveConfession, 
  rejectConfession, 
  getConfessionsByStatus, 
  getRandomConfessionStarter, 
  getCurrentUser, 
  logoutUser,
  initializeData,
  getPasswords,
  savePasswords,
  getReportThreshold,
  saveReportThreshold,
  getUserReaction,
  hasUserReported,
  updateActiveSession,
  getActiveSessionCount,
  removeActiveSession,
  saveSupabaseConfig,
  disconnectSupabase,
  getSupabaseConfig,
  isSupabaseConnected,
  getChatSessionId,
  getChatMessages,
  sendChatMessage,
  getAllChatThreads
} from './data.js';

import { setupEyeTracking, setupLoginForm } from './login.js';

// Unique tab ID for tracking actual online counts in real-time across tabs
const tabId = 'tab_' + Math.random().toString(36).substr(2, 9);

// DOM Elements
const views = {
  login: document.getElementById('login-view'),
  feed: document.getElementById('feed-view'),
  post: document.getElementById('post-view'),
  chat: document.getElementById('chat-view'),
  admin: document.getElementById('admin-view'),
  flames: document.getElementById('flames-view')
};

const navBar = document.getElementById('main-nav');
const navLinks = document.querySelectorAll('.nav-link-btn');
const userInfoContainer = document.getElementById('user-info');
const navUsername = document.getElementById('nav-username');
const navUserAvatar = document.getElementById('nav-user-avatar');
const btnLogout = document.getElementById('btn-logout');
const btnLoginRedirect = document.getElementById('btn-login-redirect');
const linkGoToFeed = document.getElementById('link-go-to-feed');

// Toast Notification Function
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-text">${message}</span>
    <button class="toast-close-btn">&times;</button>
  `;
  container.appendChild(toast);

  // Close button click
  toast.querySelector('.toast-close-btn').addEventListener('click', () => {
    toast.remove();
  });

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Router State Management
let currentView = 'login';
let currentFilterTag = 'all';
let currentSearchQuery = '';
let currentSortBy = 'latest'; // latest or trending

async function switchView(viewName) {
  // Hide all views
  Object.keys(views).forEach(name => {
    if (views[name]) views[name].classList.add('hidden');
  });

  // Show requested view
  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
    currentView = viewName;
  }

  // Update navigation items state
  navLinks.forEach(link => {
    const target = link.getAttribute('data-target');
    if (target === `${viewName}-view`) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Perform view specific loads
  if (viewName === 'feed') {
    await renderConfessionsFeed();
    await updateCampusStats();
  } else if (viewName === 'chat') {
    await renderUserChat();
  } else if (viewName === 'admin') {
    await renderAdminQueue();
    await renderAdminChatDashboard();
    await prefillPasswordPlaceholders();
    updateSupabaseUI();
  } else if (viewName === 'flames') {
    resetFlamesBoard();
  }

  // Navigation Visibility
  if (viewName === 'login') {
    navBar.classList.add('hidden');
  } else {
    navBar.classList.remove('hidden');
  }
  
  // Update browser title
  const viewTitles = {
    login: 'Login | ConfessOut',
    feed: 'Feed | ConfessOut',
    post: 'Tell a Secret | ConfessOut',
    chat: 'Support Chat | ConfessOut',
    flames: 'FLAMES Calculator | ConfessOut',
    admin: 'Moderator Control Panel | ConfessOut'
  };
  document.title = viewTitles[viewName] || 'ConfessOut';
  
  // Scroll to top
  window.scrollTo(0, 0);
}

// Check auth state on launch
async function checkAuth() {
  const user = getCurrentUser();
  if (user && user.isLoggedIn) {
    // Hide login redirects, show user details
    btnLoginRedirect.classList.add('hidden');
    userInfoContainer.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
    
    // Set text
    navUsername.textContent = user.username;
    navUserAvatar.textContent = user.username.charAt(0).toUpperCase();

    // Show moderator page button if staff
    if (user.role === 'admin' || user.role === 'moderator') {
      document.getElementById('btn-view-admin').classList.remove('hidden');
      await updateAdminBadge();
    }
  } else {
    btnLoginRedirect.classList.remove('hidden');
    userInfoContainer.classList.add('hidden');
    btnLogout.classList.add('hidden');
    document.getElementById('btn-view-admin').classList.add('hidden');
  }
}

// Update the review counts badge in header
async function updateAdminBadge() {
  const pending = await getConfessionsByStatus('pending');
  const badge = document.getElementById('pending-badge');
  if (badge) {
    badge.textContent = pending.length;
    if (pending.length > 0) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// RENDER PUBLIC FEED VIEW
async function renderConfessionsFeed() {
  const container = document.getElementById('confessions-list-container');
  const emptyState = document.getElementById('feed-empty-state');
  
  if (!container) return;

  let posts = await getConfessionsByStatus('approved');

  // Apply Tag Filtering
  if (currentFilterTag !== 'all') {
    posts = posts.filter(post => post.tag.toLowerCase() === currentFilterTag.toLowerCase());
  }

  // Apply Search Query
  if (currentSearchQuery.trim() !== '') {
    const query = currentSearchQuery.toLowerCase();
    posts = posts.filter(post => 
      post.text.toLowerCase().includes(query) || 
      post.tag.toLowerCase().includes(query)
    );
  }

  // Apply Sorting
  if (currentSortBy === 'latest') {
    posts.sort((a, b) => b.timestamp - a.timestamp);
  } else if (currentSortBy === 'trending') {
    // Sort by total sum of reactions
    posts.sort((a, b) => {
      const sumReactions = (post) => Object.values(post.reactions).reduce((acc, val) => acc + val, 0);
      return sumReactions(b) - sumReactions(a);
    });
  }

  // Toggle empty states
  if (posts.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  const user = getCurrentUser();
  const isStaff = user && user.isLoggedIn && (user.role === 'admin' || user.role === 'moderator');

  // SECURITY: Allowed tags whitelist (must match data.js ALLOWED_TAGS)
  const ALLOWED_TAGS = ['Funny', 'Love', 'Crush', 'Academic', 'Wholesome', 'General'];

  // SECURITY: Safe tag rendering - validates against whitelist
  function getSafeTag(tag) {
    const safeTag = ALLOWED_TAGS.find(t => t.toLowerCase() === tag.toLowerCase());
    return safeTag || 'General';
  }

  // Build items html
  container.innerHTML = posts.map(post => {
    const timeString = formatTimeAgo(post.timestamp);
    const activeReaction = getUserReaction(post.id);
    const hasReported = hasUserReported(post.id);
    const safeTag = getSafeTag(post.tag);

    return `
      <div class="confession-card" data-id="${post.id}">
        <div class="card-header">
          <span class="card-tag tag-${safeTag.toLowerCase()}">${escapeHtml(safeTag)}</span>
          <div class="card-header-actions">
            <span class="card-time">${timeString}</span>
            ${isStaff ? `
              <button class="delete-post-btn" title="Remove approved confession">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="card-body">
          <p class="confession-text">${escapeHtml(post.text)}</p>
        </div>
        <div class="card-footer">
          <div class="reaction-buttons-row">
            <button class="reaction-btn ${activeReaction === 'love' ? 'active' : ''}" data-reaction="love" title="Love it">
              <span class="emoji">❤️</span>
              <span class="reaction-count">${post.reactions.love || 0}</span>
            </button>
            <button class="reaction-btn ${activeReaction === 'fire' ? 'active' : ''}" data-reaction="fire" title="Hot gossip">
              <span class="emoji">🔥</span>
              <span class="reaction-count">${post.reactions.fire || 0}</span>
            </button>
            <button class="reaction-btn ${activeReaction === 'haha' ? 'active' : ''}" data-reaction="haha" title="Hilarious">
              <span class="emoji">😂</span>
              <span class="reaction-count">${post.reactions.haha || 0}</span>
            </button>
            <button class="reaction-btn ${activeReaction === 'cry' ? 'active' : ''}" data-reaction="cry" title="Emotional">
              <span class="emoji">😢</span>
              <span class="reaction-count">${post.reactions.cry || 0}</span>
            </button>
            <button class="reaction-btn ${activeReaction === 'shocked' ? 'active' : ''}" data-reaction="shocked" title="Shocked">
              <span class="emoji">😮</span>
              <span class="reaction-count">${post.reactions.shocked || 0}</span>
            </button>
          </div>
          <button class="report-btn ${hasReported ? 'active' : ''}" title="${hasReported ? 'You have already reported this confession' : 'Report post as inappropriate'}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Bind individual card reactions & report actions
  container.querySelectorAll('.confession-card').forEach(card => {
    const postId = card.getAttribute('data-id');
    let reactionLock = false;
    let reportLock = false;

    // Reactions click
    card.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (reactionLock) return;
        reactionLock = true;
        
        const reactionType = btn.getAttribute('data-reaction');
        
        // Bounce animation
        const emoji = btn.querySelector('.emoji');
        emoji.classList.add('pop-animation');
        setTimeout(() => emoji.classList.remove('pop-animation'), 400);

        try {
          // Update model and ui
          const updated = await reactToConfession(postId, reactionType);
          if (updated) {
            const activeReaction = getUserReaction(postId);
            card.querySelectorAll('.reaction-btn').forEach(rBtn => {
              const rType = rBtn.getAttribute('data-reaction');
              rBtn.querySelector('.reaction-count').textContent = updated.reactions[rType] || 0;
              if (rType === activeReaction) {
                rBtn.classList.add('active');
              } else {
                rBtn.classList.remove('active');
              }
            });
            await updateCampusStats();
          }
        } catch (err) {
          console.error("Error reacting to confession:", err);
        } finally {
          reactionLock = false;
        }
      });
    });

    // Report click
    const reportBtn = card.querySelector('.report-btn');
    reportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (reportLock || hasUserReported(postId)) {
        showToast('You have already reported this confession.', 'warning');
        return;
      }
      if (confirm('Are you sure you want to report this confession? Reported posts may be hidden for review.')) {
        reportLock = true;
        try {
          const updated = await reportConfession(postId);
          if (updated) {
            reportBtn.classList.add('active');
            reportBtn.title = 'You have already reported this confession';
            if (updated.status === 'pending') {
              showToast('This post has been reported multiple times and sent to moderation.', 'warning');
              await renderConfessionsFeed();
            } else {
              showToast('Thank you for reporting. Our moderation team will review this.', 'info');
            }
            await updateAdminBadge();
          } else {
            showToast('You have already reported this confession.', 'warning');
          }
        } catch (err) {
          console.error("Error reporting confession:", err);
        } finally {
          reportLock = false;
        }
      }
    });

    // Delete / Reject approved post click (Staff only)
    const deleteBtn = card.querySelector('.delete-post-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to remove this confession from the public feed? It will be moved back to the moderator rejected list.')) {
          card.style.transform = 'scale(0.95)';
          card.style.opacity = '0';
          card.style.transition = 'all 0.3s ease';
          
          setTimeout(async () => {
            await rejectConfession(postId);
            showToast('Confession removed from the feed.', 'warning');
            await renderConfessionsFeed();
            await updateAdminBadge();
          }, 300);
        }
      });
    }
  });
}

// RENDER ADMIN DASHBOARD QUEUE
async function renderAdminQueue() {
  const container = document.getElementById('admin-queue-list');
  const emptyState = document.getElementById('admin-empty-queue');
  
  if (!container) return;

  const pending = await getConfessionsByStatus('pending');
  const approved = await getConfessionsByStatus('approved');
  const rejected = await getConfessionsByStatus('rejected');

  // Update stat counters
  document.getElementById('admin-count-pending').textContent = pending.length;
  document.getElementById('admin-count-approved').textContent = approved.length;
  document.getElementById('admin-count-rejected').textContent = rejected.length;

  if (pending.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  // Populate list
  container.innerHTML = pending.map(post => {
    const timeString = new Date(post.timestamp).toLocaleString();
    const safeTag = getSafeTag(post.tag);
    return `
      <div class="admin-queue-card" data-id="${post.id}">
        <div class="queue-card-meta">
          <span class="card-tag tag-${safeTag.toLowerCase()}">${escapeHtml(safeTag)}</span>
          <span class="queue-card-time">${timeString}</span>
          ${post.reports > 0 ? `<span class="report-badge">${post.reports} Reports</span>` : ''}
        </div>
        <div class="queue-card-text">
          <p>${escapeHtml(post.text)}</p>
        </div>
        <div class="queue-card-actions">
          <button class="btn btn-success btn-sm btn-approve">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" class="margin-right-xs"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Approve & Publish
          </button>
          <button class="btn btn-danger btn-sm btn-reject">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" class="margin-right-xs"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            Reject & Trash
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Bind approve/reject events
  container.querySelectorAll('.admin-queue-card').forEach(card => {
    const postId = card.getAttribute('data-id');

    card.querySelector('.btn-approve').addEventListener('click', () => {
      card.classList.add('slide-out-right');
      setTimeout(async () => {
        await approveConfession(postId);
        await renderAdminQueue();
        await updateAdminBadge();
        showToast('Confession approved and published to public feed!');
      }, 300);
    });

    card.querySelector('.btn-reject').addEventListener('click', () => {
      card.classList.add('slide-out-left');
      setTimeout(async () => {
        await rejectConfession(postId);
        await renderAdminQueue();
        await updateAdminBadge();
        showToast('Confession rejected and removed.', 'danger');
      }, 300);
    });
  });
}

// CAMPUS STATS CALCULATOR
async function updateCampusStats() {
  const confessions = await getAllConfessions();
  const approved = confessions.filter(c => c.status === 'approved').length;
  
  // Set total stats to actual approved count
  const totalLabel = document.getElementById('stat-total-secrets');
  if (totalLabel) {
    totalLabel.textContent = approved.toLocaleString();
  }
  
  // Set active readers exactly to the number of active browser tabs
  const readersLabel = document.getElementById('stat-active-readers');
  if (readersLabel) {
    const count = getActiveSessionCount(tabId);
    readersLabel.textContent = count.toString();
  }
}



// Helper: Escape strings to avoid XSS injections
function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// Helper: Simple Time Formatting
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Routing Clicks & Setup
function initializeApp() {
  initializeData();
  checkAuth();

  // Navigation Links Routing
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const target = link.getAttribute('data-target');
      const viewName = target.replace('-view', '');
      switchView(viewName);
    });
  });

  // Login View Redirect triggers
  btnLoginRedirect.addEventListener('click', () => {
    switchView('login');
  });

  linkGoToFeed.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('feed');
  });

  // Quick Write Banner Trigger
  const triggerPostBanner = document.getElementById('trigger-post-banner');
  if (triggerPostBanner) {
    triggerPostBanner.addEventListener('click', () => {
      switchView('post');
    });
  }

  const btnEmptyWrite = document.getElementById('btn-empty-write');
  if (btnEmptyWrite) {
    btnEmptyWrite.addEventListener('click', () => {
      switchView('post');
    });
  }

  // Form setups
  setupEyeTracking();
  setupLoginForm(async (role) => {
    showToast(`Welcome back! Successfully logged in as ${role === 'admin' ? 'Administrator' : 'Moderator'}.`);
    await checkAuth();
    // Redirect to Admin panel
    await switchView('admin');
  });

  // Logout Actions
  btnLogout.addEventListener('click', async () => {
    logoutUser();
    await checkAuth();
    showToast('Logged out successfully.', 'info');
    await switchView('feed');
  });

  // Search input handler
  const searchInput = document.getElementById('feed-search');
  if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
      currentSearchQuery = e.target.value;
      await renderConfessionsFeed();
    });
  }

  // Tags filter clicks
  const tagFilters = document.querySelectorAll('.tag-filter-btn');
  tagFilters.forEach(btn => {
    btn.addEventListener('click', async () => {
      tagFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilterTag = btn.getAttribute('data-tag');
      await renderConfessionsFeed();
    });
  });

  // Sort buttons clicks
  const sortLatest = document.getElementById('sort-latest');
  const sortTrending = document.getElementById('sort-trending');

  if (sortLatest && sortTrending) {
    sortLatest.addEventListener('click', async () => {
      sortLatest.classList.add('active');
      sortTrending.classList.remove('active');
      currentSortBy = 'latest';
      await renderConfessionsFeed();
    });

    sortTrending.addEventListener('click', async () => {
      sortTrending.classList.add('active');
      sortLatest.classList.remove('active');
      currentSortBy = 'trending';
      await renderConfessionsFeed();
    });
  }

  // POST SECRET SUBMISSION
  const postForm = document.getElementById('post-secret-form');
  const confessionText = document.getElementById('confession-text');
  const charCounter = document.getElementById('char-count');
  
  if (confessionText && charCounter) {
    confessionText.addEventListener('input', (e) => {
      charCounter.textContent = e.target.value.length;
    });
  }

  if (postForm) {
    // Fill Random button
    const fillRandom = document.getElementById('btn-fill-random');
    if (fillRandom) {
      fillRandom.addEventListener('click', () => {
        confessionText.value = getRandomConfessionStarter();
        charCounter.textContent = confessionText.value.length;
      });
    }

    // Cancel posting
    const cancelPost = document.getElementById('btn-post-cancel');
    if (cancelPost) {
      cancelPost.addEventListener('click', () => {
        postForm.reset();
        charCounter.textContent = '0';
        switchView('feed');
      });
    }

    // Form Submission
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = confessionText.value.trim();
      const tagRadio = document.querySelector('input[name="confession-tag"]:checked');
      const tag = tagRadio ? tagRadio.value : 'General';

      if (!text) {
        showToast('Please type a secret confession before posting.', 'warning');
        return;
      }

      if (text.length < 15) {
        showToast('Confessions must be at least 15 characters long.', 'warning');
        return;
      }

      const res = await submitConfession(text, tag);
      if (res) {
        showToast('Confession submitted anonymously! It is pending review by our mods.', 'success');
      } else {
        showToast('Successfully submitted to your feed queue!', 'success');
      }
      
      // Reset & redirect
      postForm.reset();
      charCounter.textContent = '0';
      await updateAdminBadge();
      await switchView('feed');
    });
  }



  // Refresh Admin Queue
  const refreshAdmin = document.getElementById('btn-admin-refresh');
  if (refreshAdmin) {
    refreshAdmin.addEventListener('click', async () => {
      await renderAdminQueue();
      showToast('Queue refreshed.', 'info');
    });
  }

  // Password/Settings Save Form Event
  const passwordsForm = document.getElementById('settings-passwords-form');
  if (passwordsForm) {
    passwordsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const adminPassInput = document.getElementById('settings-admin-password');
      const modPassInput = document.getElementById('settings-mod-password');
      const reportLimitInput = document.getElementById('settings-report-limit');
      
      const adminPass = adminPassInput.value;
      const modPass = modPassInput.value;
      const reportLimit = reportLimitInput.value;

      if (!adminPass.trim() && !modPass.trim() && !reportLimit.trim()) {
        showToast('Please enter new settings to save.', 'warning');
        return;
      }

      let changesMade = false;

      if (adminPass.trim() || modPass.trim()) {
        await savePasswords(adminPass, modPass);
        changesMade = true;
      }

      if (reportLimit.trim()) {
        const limitVal = parseInt(reportLimit);
        if (isNaN(limitVal) || limitVal < 1) {
          showToast('Please enter a valid report limit (minimum 1).', 'warning');
          return;
        }
        await saveReportThreshold(limitVal);
        changesMade = true;
      }

      if (changesMade) {
        showToast('System settings updated successfully!');
      }
      
      adminPassInput.value = '';
      modPassInput.value = '';
      reportLimitInput.value = '';
      await prefillPasswordPlaceholders();
    });
  }

  // Supabase Sync Connection Setup
  const supabaseForm = document.getElementById('settings-supabase-form');
  const disconnectBtn = document.getElementById('btn-db-disconnect');
  if (supabaseForm) {
    supabaseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('settings-db-url').value.trim();
      const key = document.getElementById('settings-db-key').value.trim();

      if (!url || !key) {
        showToast('Please input both the Supabase URL and public Anon Key.', 'warning');
        return;
      }

      saveSupabaseConfig(url, key);
      showToast('Supabase settings saved! Reloading application to connect...', 'info');
      setTimeout(() => location.reload(), 1500);
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      if (confirm('Disconnect from Supabase and fall back to local storage?')) {
        disconnectSupabase();
        showToast('Disconnected from cloud database. Reloading...', 'warning');
        setTimeout(() => location.reload(), 1500);
      }
    });
  }

  // FLAMES Form Submit Listener
  const flamesForm = document.getElementById('flames-form');
  if (flamesForm) {
    flamesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name1 = document.getElementById('flames-name-1').value.trim();
      const name2 = document.getElementById('flames-name-2').value.trim();

      if (!name1 || !name2) {
        showToast('Please fill in both names to calculate!', 'warning');
        return;
      }

      runFlamesAnimation(name1, name2);
    });
  }

  // USER SUPPORT CHAT SUBMISSION
  const chatSendForm = document.getElementById('chat-send-form');
  const chatMessageInput = document.getElementById('chat-message-input');
  if (chatSendForm && chatMessageInput) {
    chatSendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatMessageInput.value.trim();
      if (!text) return;

      const sessionId = getChatSessionId();
      const alias = getAnonymousAlias(sessionId);
      
      chatMessageInput.value = '';
      
      const newMsg = await sendChatMessage(sessionId, text, 'user', alias.name);
      if (newMsg) {
        await loadAndDisplayUserMessages(sessionId);
      }
    });
  }

  // ADMIN CHAT REPLY SUBMISSION
  const adminChatReplyForm = document.getElementById('admin-chat-reply-form');
  const adminChatReplyInput = document.getElementById('admin-chat-reply-input');
  if (adminChatReplyForm && adminChatReplyInput) {
    adminChatReplyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = adminChatReplyInput.value.trim();
      if (!text || !selectedAdminThreadId) return;

      const user = getCurrentUser();
      const senderName = user && user.isLoggedIn ? user.username : 'Moderator';
      
      adminChatReplyInput.value = '';
      
      const newMsg = await sendChatMessage(selectedAdminThreadId, text, 'staff', senderName);
      if (newMsg) {
        await openAdminActiveThread(selectedAdminThreadId);
        await renderAdminChatDashboard(); // refresh snippet list
      }
    });
  }

  // Admin Refresh Chats Button
  const btnRefreshChats = document.getElementById('btn-admin-chats-refresh');
  if (btnRefreshChats) {
    btnRefreshChats.addEventListener('click', async () => {
      await renderAdminChatDashboard();
      showToast('Support conversations list updated.', 'info');
    });
  }

  // Set up real-time session updates
  updateActiveSession(tabId);
  setInterval(async () => {
    updateActiveSession(tabId);
    if (currentView === 'feed') {
      await updateCampusStats();
    } else if (currentView === 'chat') {
      const sessionId = getChatSessionId();
      await loadAndDisplayUserMessages(sessionId);
    } else if (currentView === 'admin') {
      await renderAdminChatDashboard();
    }
  }, 2500);

  // Clean up session on window unload
  window.addEventListener('beforeunload', () => {
    removeActiveSession(tabId);
  });

  // Start at the public feed instead of login by default for a good initial experience!
  // The user can login using "Staff Login" to moderate.
  switchView('feed');
}

async function prefillPasswordPlaceholders() {
  const adminPassInput = document.getElementById('settings-admin-password');
  const modPassInput = document.getElementById('settings-mod-password');
  const reportLimitInput = document.getElementById('settings-report-limit');
  
  const passwords = await getPasswords();
  if (adminPassInput) adminPassInput.placeholder = `Current: ${passwords.admin}`;
  if (modPassInput) modPassInput.placeholder = `Current: ${passwords.moderator}`;
  
  if (reportLimitInput) {
    const threshold = await getReportThreshold();
    reportLimitInput.placeholder = `Current: ${threshold}`;
  }
}

// Prefill and update Supabase Connection Settings UI cards
function updateSupabaseUI() {
  const badge = document.getElementById('db-status-badge');
  const disconnectBtn = document.getElementById('btn-db-disconnect');
  const urlInput = document.getElementById('settings-db-url');
  const keyInput = document.getElementById('settings-db-key');
  
  if (isSupabaseConnected()) {
    if (badge) {
      badge.textContent = "Cloud Mode";
      badge.className = "badge text-success";
      badge.style.backgroundColor = "rgba(38, 222, 129, 0.12)";
    }
    if (disconnectBtn) disconnectBtn.classList.remove('hidden');
    
    const config = getSupabaseConfig();
    if (urlInput) urlInput.value = config.url;
    if (keyInput) keyInput.value = config.key;
  } else {
    if (badge) {
      badge.textContent = "Local Mode";
      badge.className = "badge";
      badge.style.backgroundColor = "";
    }
    if (disconnectBtn) disconnectBtn.classList.add('hidden');
    if (urlInput) urlInput.value = '';
    if (keyInput) urlInput.placeholder = 'https://your-project.supabase.co';
    if (keyInput) keyInput.value = '';
  }
}

// Initialise everything when window loads
window.addEventListener('DOMContentLoaded', initializeApp);

function resetFlamesBoard() {
  const board = document.getElementById('flames-board');
  const resultBox = document.getElementById('flames-result-box');
  const form = document.getElementById('flames-form');
  
  if (board) board.classList.add('hidden');
  if (resultBox) resultBox.classList.add('hidden');
  if (form) form.reset();
}

async function runFlamesAnimation(name1, name2) {
  // Clean names to calculate FLAMES result
  let n1 = name1.toLowerCase().replace(/[^a-z]/g, "").split("");
  let n2 = name2.toLowerCase().replace(/[^a-z]/g, "").split("");

  // Remove common letters
  for (let i = 0; i < n1.length; i++) {
    const char = n1[i];
    const idx = n2.indexOf(char);
    if (idx !== -1) {
      n1.splice(i, 1);
      n2.splice(idx, 1);
      i--;
    }
  }

  const count = n1.length + n2.length;
  const statusLabel = document.getElementById('flames-status');
  const resultBox = document.getElementById('flames-result-box');
  const board = document.getElementById('flames-board');
  
  if (!board || !resultBox || !statusLabel) return;
  
  board.classList.remove('hidden');
  resultBox.classList.add('hidden');
  statusLabel.textContent = `Analyzing letters... Letter Count: ${count}`;

  // Reset UI classes of letter nodes
  const letterNodes = {};
  document.querySelectorAll('.flames-letter').forEach(node => {
    node.className = 'flames-letter';
    const letter = node.getAttribute('data-letter');
    letterNodes[letter] = node;
  });

  if (count === 0) {
    statusLabel.textContent = "Oops! Names are too similar. Try adding full names!";
    return;
  }

  // Active letters array
  let letters = ['F', 'L', 'A', 'M', 'E', 'S'];
  let currentIdx = 0; // Starts at 'F'

  // Helper to sleep
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Visual elimination cycle
  while (letters.length > 1) {
    statusLabel.textContent = `Counting to ${count}...`;
    
    // Highlight step-by-step
    for (let step = 1; step <= count; step++) {
      const activeLetter = letters[currentIdx];
      const node = letterNodes[activeLetter];
      
      if (node) {
        node.classList.add('active-evaluating');
        await sleep(150);
        node.classList.remove('active-evaluating');
      }
      
      // Move to next index (wrap around active letters)
      if (step < count) {
        currentIdx = (currentIdx + 1) % letters.length;
      }
    }
    
    // Eliminate current letter
    const eliminatedLetter = letters[currentIdx];
    const node = letterNodes[eliminatedLetter];
    if (node) {
      node.classList.add('eliminated');
    }
    
    statusLabel.textContent = `Eliminated: ${node ? node.querySelector('.letter-label').textContent : eliminatedLetter}`;
    await sleep(600);
    
    // Remove the letter from array
    letters.splice(currentIdx, 1);
    
    // Set next start index (safely wrap around new length)
    if (letters.length > 0) {
      currentIdx = currentIdx % letters.length;
    }
  }

  // Winner!
  const winner = letters[0];
  const winnerNode = letterNodes[winner];
  if (winnerNode) {
    winnerNode.classList.add('winner');
  }
  statusLabel.textContent = "Destiny determined!";

  await sleep(400);

  // Pop up result card
  const RELATION_DETAILS = {
    F: {
      title: "Friendship 🤝",
      desc: "Best friends forever! You two are partners-in-crime for study sessions, gossiping, and campus lunch raids."
    },
    L: {
      title: "Love ❤️",
      desc: "Sparks are flying! Write an anonymous confession on our feed to make your move, or just go ask them out!"
    },
    A: {
      title: "Affection 🥰",
      desc: "Cute vibes alert! There is definitely mutual fondness here. They secretly smile when you walk into class."
    },
    M: {
      title: "Marriage 💍",
      desc: "Put a ring on it! Start planning your graduation outfits and dorm rooms. You two are a perfect match."
    },
    E: {
      title: "Enemy ⚡",
      desc: "Rivals! You two can't agree on a team project to save your lives. Maybe it's just tension masking secret feelings?"
    },
    S: {
      title: "Siblings 👥",
      desc: "Practically family! You are in the sibling zone. Good news is you get free homework answers and zero drama."
    }
  };

  const relation = RELATION_DETAILS[winner];
  resultBox.innerHTML = `
    <div class="result-relation-title">${relation.title}</div>
    <p class="result-relation-desc">${relation.desc}</p>
  `;
  resultBox.classList.remove('hidden');
}

// Nickname lists for anonymous users
const ANONYMOUS_ADJECTIVES = ["Secret", "Silent", "Sneaky", "Mysterious", "Clever", "Playful", "Quiet", "Shy", "Curious", "Bright", "Candid", "Wild", "Cuddly", "Spunky", "Gentle"];
const ANONYMOUS_ANIMALS = ["Koala", "Panda", "Owl", "Fox", "Squirrel", "Dolphin", "Otter", "Rabbit", "Hedgehog", "Badger", "Pingu", "Cat", "Puppy", "Sloth", "Beaver"];
const ANONYMOUS_EMOJIS = ["🐨", "🐼", "🦉", "🦊", "🐿️", "🐬", "🦦", "🐰", "🦔", "🦡", "🐧", "🐱", "🐶", "🦥", "🦫"];

export function getAnonymousAlias(sessionId) {
  if (!sessionId) {
    return { name: "Anonymous Guest", emoji: "👤" };
  }
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const adjIdx = Math.abs(hash) % ANONYMOUS_ADJECTIVES.length;
  const animIdx = Math.abs(hash >> 2) % ANONYMOUS_ANIMALS.length;
  const emojiIdx = Math.abs(hash >> 4) % ANONYMOUS_EMOJIS.length;
  
  return {
    name: `${ANONYMOUS_ADJECTIVES[adjIdx]} ${ANONYMOUS_ANIMALS[animIdx]}`,
    emoji: ANONYMOUS_EMOJIS[emojiIdx] || "👤"
  };
}

// USER SUPPORT CHAT CONTROLLER
async function renderUserChat() {
  const sessionId = getChatSessionId();
  const alias = getAnonymousAlias(sessionId);
  
  const aliasBadge = document.getElementById('chat-user-alias');
  if (aliasBadge) {
    aliasBadge.innerHTML = `Alias: ${alias.emoji} ${alias.name}`;
  }

  await loadAndDisplayUserMessages(sessionId);
}

async function loadAndDisplayUserMessages(sessionId) {
  const messagesBox = document.getElementById('chat-messages-box');
  if (!messagesBox) return;

  const messages = await getChatMessages(sessionId);
  
  // Check if messages list changed (prevent unnecessary re-renders)
  const currentCount = messagesBox.querySelectorAll('.message-row').length;
  if (currentCount === messages.length) {
    return; // No new messages
  }

  messagesBox.innerHTML = messages.map(msg => {
    const isUser = msg.sender === 'user';
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="message-row ${isUser ? 'row-user' : 'row-admin'}">
        <div class="message-bubble">
          <p class="message-text-content">${escapeHtml(msg.message)}</p>
          <span class="message-meta">${isUser ? 'You' : 'Admin'} • ${timeStr}</span>
        </div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

// ADMIN CHAT CONTROLLER
let selectedAdminThreadId = null;

async function renderAdminChatDashboard() {
  const threadsContainer = document.getElementById('admin-chats-threads');
  if (!threadsContainer) return;

  const threads = await getAllChatThreads();

  if (threads.length === 0) {
    threadsContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No support conversations yet.</div>';
    return;
  }

  threadsContainer.innerHTML = threads.map(thread => {
    const alias = getAnonymousAlias(thread.sessionId);
    const isActive = selectedAdminThreadId === thread.sessionId;
    const timeStr = new Date(thread.lastTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
                    new Date(thread.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div class="chat-thread-card ${isActive ? 'active' : ''}" data-session-id="${thread.sessionId}">
        <div class="thread-avatar">${alias.emoji}</div>
        <div class="thread-details">
          <div class="thread-header-row">
            <span class="thread-name">${alias.name}</span>
            <span class="thread-time">${timeStr}</span>
          </div>
          <p class="thread-snippet">${escapeHtml(thread.lastMessage)}</p>
        </div>
      </div>
    `;
  }).join('');

  // Bind click listeners on thread cards
  threadsContainer.querySelectorAll('.chat-thread-card').forEach(card => {
    card.addEventListener('click', async () => {
      const sId = card.getAttribute('data-session-id');
      selectedAdminThreadId = sId;
      
      // Update active styling
      threadsContainer.querySelectorAll('.chat-thread-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      await openAdminActiveThread(sId);
    });
  });

  // Keep selected thread messages refreshed if one is open
  if (selectedAdminThreadId) {
    await openAdminActiveThread(selectedAdminThreadId);
  }
}

async function openAdminActiveThread(sessionId) {
  const placeholder = document.getElementById('admin-chat-placeholder');
  const activeBox = document.getElementById('admin-chat-active-box');
  const messagesBox = document.getElementById('admin-chat-messages-box');
  const threadTitle = document.getElementById('active-thread-title');
  const threadSession = document.getElementById('active-thread-session');
  const threadAvatar = document.getElementById('active-thread-avatar');

  if (!placeholder || !activeBox || !messagesBox) return;

  placeholder.classList.add('hidden');
  activeBox.classList.remove('hidden');

  const alias = getAnonymousAlias(sessionId);
  if (threadTitle) threadTitle.textContent = alias.name;
  if (threadAvatar) threadAvatar.textContent = alias.emoji;
  if (threadSession) threadSession.textContent = `Session: ${sessionId}`;

  const messages = await getChatMessages(sessionId);
  
  // Render thread messages
  messagesBox.innerHTML = messages.map(msg => {
    const isUser = msg.sender === 'user';
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="message-row ${isUser ? 'row-admin' : 'row-user'}">
        <div class="message-bubble">
          <p class="message-text-content">${escapeHtml(msg.message)}</p>
          <span class="message-meta">${msg.sender === 'user' ? alias.name : 'You (Staff)'} • ${timeStr}</span>
        </div>
      </div>
    `;
  }).join('');

  messagesBox.scrollTop = messagesBox.scrollHeight;
}
