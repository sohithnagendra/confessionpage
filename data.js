// Local Storage Keys
const STORAGE_KEYS = {
  CONFESSIONS: 'secret_confessions_data',
  CURRENT_USER: 'secret_confessions_user'
};

// Seed/Mock Data is empty initially for real user experience
const SEED_CONFESSIONS = [];

// SECURITY: Allowed tags whitelist - prevents XSS via tag injection
const ALLOWED_TAGS = ['Funny', 'Love', 'Crush', 'Academic', 'Wholesome', 'General'];

// SECURITY: Maximum confession length
const MAX_CONFESSION_LENGTH = 300;

// SECURITY: Minimum confession length
const MIN_CONFESSION_LENGTH = 15;

// SECURITY: Rate limiting storage keys
const RATE_LIMIT_KEYS = {
  SUBMIT: 'confess_rate_submit',
  REACT: 'confess_rate_react',
  REPORT: 'confess_rate_report',
  CHAT: 'confess_rate_chat',
  LOGIN: 'confess_rate_login'
};

// SECURITY: Rate limit windows (ms) and max requests
const RATE_LIMITS = {
  SUBMIT: { window: 60000, max: 3 },      // 3 confessions per minute
  REACT: { window: 10000, max: 10 },      // 10 reactions per 10 seconds
  REPORT: { window: 300000, max: 5 },     // 5 reports per 5 minutes
  CHAT: { window: 10000, max: 5 },        // 5 messages per 10 seconds
  LOGIN: { window: 900000, max: 5 }       // 5 login attempts per 15 minutes
};

// SECURITY: Rate limiting helper
function checkRateLimit(key, limitConfig) {
  const now = Date.now();
  const storageKey = RATE_LIMIT_KEYS[key];
  const attempts = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const recentAttempts = attempts.filter(timestamp => now - timestamp < limitConfig.window);

  if (recentAttempts.length >= limitConfig.max) {
    const oldestAttempt = recentAttempts[0];
    const resetTime = oldestAttempt + limitConfig.window;
    const waitMs = resetTime - now;
    return { allowed: false, waitMs, resetTime };
  }

  recentAttempts.push(now);
  localStorage.setItem(storageKey, JSON.stringify(recentAttempts));
  return { allowed: true };
}

// SECURITY: Validate tag against whitelist
function validateTag(tag) {
  return ALLOWED_TAGS.includes(tag);
}

// SECURITY: Validate confession text
function validateConfessionText(text) {
  if (!text || typeof text !== 'string') return { valid: false, error: 'Invalid input' };
  const trimmed = text.trim();
  if (trimmed.length < MIN_CONFESSION_LENGTH) {
    return { valid: false, error: `Confessions must be at least ${MIN_CONFESSION_LENGTH} characters long.` };
  }
  if (trimmed.length > MAX_CONFESSION_LENGTH) {
    return { valid: false, error: `Confessions cannot exceed ${MAX_CONFESSION_LENGTH} characters.` };
  }
  // Check for suspicious patterns (basic XSS/Injection prevention)
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:/i,
    /vbscript:/i
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Confession contains invalid content.' };
    }
  }
  return { valid: true, text: trimmed };
}

const RANDOM_STARTERS = [
  "Study Hack: The computer lab on the 3rd floor of the engineering building is completely empty after 6 PM. The chairs are super comfortable and the Wi-Fi is twice as fast as the library.",
  "Food Hack: The cafeteria staff will give you double portions of fries on Fridays if you simply ask how their week is going. Small kindness gets you fed!",
  "Library Hack: You can rent graphing calculators, phone chargers, and even noise-cancelling headphones from the library front desk for up to 6 hours completely free. Don't buy a $150 calculator!",
  "Dorm Hack: Put a damp towel under the door gap if you are making noodles to prevent the highly sensitive smoke detectors from waking up the entire floor.",
  "Academic Hack: Before registering for a class, search the syllabus online for terms like 'late policy' or 'extra credit'. Some professors hide secret extra credit tasks worth up to 5% inside footnotes!",
  "Parking Hack: If you have an 8 AM class, parking in the gravel lot next to the athletic center is 3 minutes further, but you will save 15 minutes of circling the main lot.",
  "Textbook Hack: Never buy textbooks from the campus bookstore on day one. Search Library Genesis, check the library reserve desk, or rent them on Chegg. You will save hundreds.",
  "Coffee Hack: The Career center lobby has a free Keurig coffee machine that is open to any student who pretends to browse resume templates or internship flyers."
];

// SECURITY: Supabase credentials must be configured via Admin Panel only
// NEVER hardcode credentials in source code - they are committed to git history
// Configure via Admin Panel > Supabase Cloud Database Settings
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

// Initialize Supabase
let supabase = null;
const dbUrl = SUPABASE_URL.trim() || localStorage.getItem('confess_supabase_url');
const dbKey = SUPABASE_ANON_KEY.trim() || localStorage.getItem('confess_supabase_key');

if (dbUrl && dbKey) {
  // @ts-ignore
  if (window.supabase) {
    try {
      supabase = window.supabase.createClient(dbUrl, dbKey);
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }
}

export function isSupabaseConnected() {
  return !!supabase;
}

// Convert Database Row (from Supabase) to Frontend Model Object
function mapPost(dbRow) {
  return {
    id: dbRow.id,
    text: dbRow.text,
    tag: dbRow.tag,
    timestamp: new Date(dbRow.timestamp).getTime(),
    status: dbRow.status,
    reports: dbRow.reports || 0,
    reactions: {
      love: dbRow.react_love || 0,
      fire: dbRow.react_fire || 0,
      haha: dbRow.react_haha || 0,
      cry: dbRow.react_cry || 0,
      shocked: dbRow.react_shocked || 0
    }
  };
}

// Initialize Data for local mode
export function initializeData() {
  if (!localStorage.getItem(STORAGE_KEYS.CONFESSIONS)) {
    localStorage.setItem(STORAGE_KEYS.CONFESSIONS, JSON.stringify(SEED_CONFESSIONS));
  }
}

// Get all confessions (async)
export async function getAllConfessions() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('confessions')
        .select('*');
      if (error) throw error;
      return (data || []).map(mapPost);
    } catch (e) {
      console.error('Error fetching from Supabase, falling back to local storage:', e);
    }
  }
  initializeData();
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFESSIONS)) || [];
}

// Save all confessions back to local storage
function saveAllConfessions(confessions) {
  localStorage.setItem(STORAGE_KEYS.CONFESSIONS, JSON.stringify(confessions));
}

// Submit a new confession
export async function submitConfession(text, tag) {
  // SECURITY: Validate input
  const validation = validateConfessionText(text);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // SECURITY: Validate tag against whitelist
  const formattedTag = tag || 'General';
  if (!validateTag(formattedTag)) {
    throw new Error('Invalid tag selected');
  }

  // SECURITY: Rate limiting
  const rateLimit = checkRateLimit('SUBMIT', RATE_LIMITS.SUBMIT);
  if (!rateLimit.allowed) {
    const waitSec = Math.ceil(rateLimit.waitMs / 1000);
    throw new Error(`Rate limit exceeded. Please wait ${waitSec} seconds before submitting another confession.`);
  }

  if (supabase) {
    try {
      const newRow = {
        text: validation.text,
        tag: formattedTag,
        status: 'pending',
        reports: 0,
        react_love: 0,
        react_fire: 0,
        react_haha: 0,
        react_cry: 0,
        react_shocked: 0
      };
      const { data, error } = await supabase
        .from('confessions')
        .insert([newRow])
        .select();
      if (error) throw error;
      return data && data[0] ? mapPost(data[0]) : null;
    } catch (e) {
      console.error('Error saving to Supabase:', e);
      return null;
    }
  } else {
    const confessions = await getAllConfessions();
    const newConfession = {
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      text: validation.text,
      tag: formattedTag,
      timestamp: Date.now(),
      status: 'pending',
      reactions: { love: 0, fire: 0, haha: 0, cry: 0, shocked: 0 },
      reports: 0
    };
    confessions.unshift(newConfession);
    saveAllConfessions(confessions);
    return newConfession;
  }
}

// React to a confession (supports toggle/switch to prevent double reacting)
export async function reactToConfession(id, reactionType) {
  // SECURITY: Validate reaction type
  const validReactions = ['love', 'fire', 'haha', 'cry', 'shocked'];
  if (!validReactions.includes(reactionType)) {
    throw new Error('Invalid reaction type');
  }

  // SECURITY: Rate limiting
  const rateLimit = checkRateLimit('REACT', RATE_LIMITS.REACT);
  if (!rateLimit.allowed) {
    const waitSec = Math.ceil(rateLimit.waitMs / 1000);
    throw new Error(`Rate limit exceeded. Please wait ${waitSec} seconds before reacting again.`);
  }

  const myReactions = JSON.parse(localStorage.getItem('confess_my_reactions') || '{}');
  const oldReaction = myReactions[id];

  if (supabase) {
    try {
      const { data: row, error: fetchErr } = await supabase
        .from('confessions')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !row) throw fetchErr || new Error("Row not found");

      const updates = {};

      if (oldReaction === reactionType) {
        // Toggle off active reaction
        const dbColName = `react_${reactionType}`;
        updates[dbColName] = Math.max(0, (row[dbColName] || 0) - 1);
        delete myReactions[id];
      } else if (oldReaction) {
        // Switch reaction
        const oldColName = `react_${oldReaction}`;
        const newColName = `react_${reactionType}`;
        updates[oldColName] = Math.max(0, (row[oldColName] || 0) - 1);
        updates[newColName] = (row[newColName] || 0) + 1;
        myReactions[id] = reactionType;
      } else {
        // Add new reaction
        const dbColName = `react_${reactionType}`;
        updates[dbColName] = (row[dbColName] || 0) + 1;
        myReactions[id] = reactionType;
      }

      const { data: updatedData, error: updateErr } = await supabase
        .from('confessions')
        .update(updates)
        .eq('id', id)
        .select();
      if (updateErr || !updatedData) throw updateErr;

      localStorage.setItem('confess_my_reactions', JSON.stringify(myReactions));
      return mapPost(updatedData[0]);
    } catch (e) {
      console.error('Error reacting in Supabase:', e);
      return null;
    }
  } else {
    const confessions = await getAllConfessions();
    const index = confessions.findIndex(c => c.id === id);
    if (index !== -1) {
      const reactions = confessions[index].reactions;

      if (oldReaction === reactionType) {
        reactions[reactionType] = Math.max(0, (reactions[reactionType] || 0) - 1);
        delete myReactions[id];
      } else if (oldReaction) {
        reactions[oldReaction] = Math.max(0, (reactions[oldReaction] || 0) - 1);
        reactions[reactionType] = (reactions[reactionType] || 0) + 1;
        myReactions[id] = reactionType;
      } else {
        reactions[reactionType] = (reactions[reactionType] || 0) + 1;
        myReactions[id] = reactionType;
      }

      saveAllConfessions(confessions);
      localStorage.setItem('confess_my_reactions', JSON.stringify(myReactions));
      return confessions[index];
    }
    return null;
  }
}

// Report a confession (tracks reports on device to prevent spamming)
export async function reportConfession(id) {
  // SECURITY: Rate limiting
  const rateLimit = checkRateLimit('REPORT', RATE_LIMITS.REPORT);
  if (!rateLimit.allowed) {
    const waitSec = Math.ceil(rateLimit.waitMs / 1000);
    throw new Error(`Rate limit exceeded. Please wait ${waitSec} seconds before reporting again.`);
  }

  const myReports = JSON.parse(localStorage.getItem('confess_my_reports') || '[]');
  if (myReports.includes(id)) {
    return null;
  }

  const limit = await getReportThreshold();
  if (supabase) {
    try {
      const { data: row, error: fetchErr } = await supabase
        .from('confessions')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !row) throw fetchErr;

      const newReports = (row.reports || 0) + 1;
      const updates = { reports: newReports };
      if (newReports >= limit) {
        updates.status = 'pending';
      }

      const { data: updatedData, error: updateErr } = await supabase
        .from('confessions')
        .update(updates)
        .eq('id', id)
        .select();
      if (updateErr || !updatedData) throw updateErr;

      myReports.push(id);
      localStorage.setItem('confess_my_reports', JSON.stringify(myReports));
      return mapPost(updatedData[0]);
    } catch (e) {
      console.error('Error reporting in Supabase:', e);
      return null;
    }
  } else {
    const confessions = await getAllConfessions();
    const index = confessions.findIndex(c => c.id === id);
    if (index !== -1) {
      confessions[index].reports = (confessions[index].reports || 0) + 1;
      if (confessions[index].reports >= limit) {
        confessions[index].status = 'pending';
      }
      saveAllConfessions(confessions);

      myReports.push(id);
      localStorage.setItem('confess_my_reports', JSON.stringify(myReports));
      return confessions[index];
    }
    return null;
  }
}

// Admin operations: Approve
export async function approveConfession(id) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('confessions')
        .update({ status: 'approved', reports: 0 })
        .eq('id', id)
        .select();
      if (error || !data) throw error;
      return mapPost(data[0]);
    } catch (e) {
      console.error('Error approving in Supabase:', e);
      return null;
    }
  } else {
    const confessions = await getAllConfessions();
    const index = confessions.findIndex(c => c.id === id);
    if (index !== -1) {
      confessions[index].status = 'approved';
      confessions[index].reports = 0;
      saveAllConfessions(confessions);
      return confessions[index];
    }
    return null;
  }
}

// Admin operations: Reject
export async function rejectConfession(id) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('confessions')
        .update({ status: 'rejected' })
        .eq('id', id)
        .select();
      if (error || !data) throw error;
      return mapPost(data[0]);
    } catch (e) {
      console.error('Error rejecting in Supabase:', e);
      return null;
    }
  } else {
    const confessions = await getAllConfessions();
    const index = confessions.findIndex(c => c.id === id);
    if (index !== -1) {
      confessions[index].status = 'rejected';
      saveAllConfessions(confessions);
      return confessions[index];
    }
    return null;
  }
}

// Get confessions by status
export async function getConfessionsByStatus(status) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('confessions')
        .select('*')
        .eq('status', status);
      if (error) throw error;
      return (data || []).map(mapPost);
    } catch (e) {
      console.error('Error querying status in Supabase:', e);
      return [];
    }
  }
  const confessions = await getAllConfessions();
  return confessions.filter(c => c.status === status);
}

// Generate random confession text starter
export function getRandomConfessionStarter() {
  const index = Math.floor(Math.random() * RANDOM_STARTERS.length);
  return RANDOM_STARTERS[index];
}

// Auth simulation helpers
export function loginUser(username, role) {
  const user = { username, role, isLoggedIn: true };
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  return user;
}

export function logoutUser() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

export function getCurrentUser() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) || { isLoggedIn: false };
}

// User local activity check helpers
export function getUserReaction(id) {
  const myReactions = JSON.parse(localStorage.getItem('confess_my_reactions') || '{}');
  return myReactions[id] || null;
}

export function hasUserReported(id) {
  const myReports = JSON.parse(localStorage.getItem('confess_my_reports') || '[]');
  return myReports.includes(id);
}

// Password management in localStorage/Supabase
// SECURITY: No default passwords - must be configured via Admin Panel on first run
// Passwords should be hashed server-side (bcrypt/argon2) - this is a client-side fallback only
export async function getPasswords() {
  let adminPass = localStorage.getItem('confess_admin_pass');
  let modPass = localStorage.getItem('confess_mod_pass');

  // SECURITY: No default passwords - return null if not configured
  // This forces admin setup on first run
  if (!adminPass || !modPass) {
    console.warn('SECURITY: Admin/moderator passwords not configured. Please set them in Admin Panel.');
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .in('key', ['admin_password', 'moderator_password']);
      if (error) {
        if (error.code === '42P01') {
          console.warn('Supabase Alert: "system_settings" table is missing. Run the setup_supabase.sql script in your Supabase SQL Editor to enable multi-device sync.');
        } else {
          throw error;
        }
      } else if (data) {
        const adminRow = data.find(r => r.key === 'admin_password');
        const modRow = data.find(r => r.key === 'moderator_password');

        let needSync = false;
        const localAdmin = localStorage.getItem('confess_admin_pass');
        const localMod = localStorage.getItem('confess_mod_pass');

        if (adminRow) {
          adminPass = adminRow.value;
          localStorage.setItem('confess_admin_pass', adminPass);
        } else if (localAdmin) {
          needSync = true;
        }

        if (modRow) {
          modPass = modRow.value;
          localStorage.setItem('confess_mod_pass', modPass);
        } else if (localMod) {
          needSync = true;
        }

        // Auto sync local custom passwords to Supabase if database has no record yet
        if (needSync) {
          console.log('Supabase: Auto-syncing local custom passwords to database...');
          if (localAdmin && !adminRow) {
            await supabase.from('system_settings').upsert({ key: 'admin_password', value: localAdmin });
            adminPass = localAdmin;
          }
          if (localMod && !modRow) {
            await supabase.from('system_settings').upsert({ key: 'moderator_password', value: localMod });
            modPass = localMod;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching passwords from Supabase:', e);
    }
  }

  return {
    admin: adminPass || null,
    moderator: modPass || null
  };
}

export async function savePasswords(adminPass, modPass) {
  // SECURITY: Passwords should be managed via Supabase Auth (server-side hashed)
  // This localStorage-only fallback is for demo/local mode only
  // The new RLS policies prevent public write to password keys in Supabase

  if (adminPass) {
    const trimmed = adminPass.trim();
    if (trimmed.length < 8) {
      throw new Error('Admin password must be at least 8 characters long');
    }
    localStorage.setItem('confess_admin_pass', trimmed);
    if (supabase) {
      console.warn('SECURITY: Admin password stored locally only. For production, use Supabase Auth with proper password hashing.');
    }
  }
  if (modPass) {
    const trimmed = modPass.trim();
    if (trimmed.length < 8) {
      throw new Error('Moderator password must be at least 8 characters long');
    }
    localStorage.setItem('confess_mod_pass', trimmed);
    if (supabase) {
      console.warn('SECURITY: Moderator password stored locally only. For production, use Supabase Auth with proper password hashing.');
    }
  }
}

// Fetch auto-hide report limit configuration
export async function getReportThreshold() {
  let limit = parseInt(localStorage.getItem('confess_report_threshold')) || 5;
  if (isNaN(limit)) limit = 5;
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'report_threshold')
        .single();
      if (error) {
        if (error.code === '42P01') {
          console.warn('Supabase Alert: "system_settings" table is missing. Run setup_supabase.sql.');
        } else if (error.code === 'PGRST116') {
          // No row found: check if we have a custom local limit to auto-sync
          const localVal = parseInt(localStorage.getItem('confess_report_threshold'));
          if (!isNaN(localVal) && localVal !== 5) {
            console.log('Supabase: Auto-syncing local report limit to database...');
            await supabase.from('system_settings').upsert({ key: 'report_threshold', value: localVal.toString() });
            limit = localVal;
          }
        } else {
          throw error;
        }
      } else if (data) {
        const val = parseInt(data.value);
        if (!isNaN(val)) {
          limit = val;
          localStorage.setItem('confess_report_threshold', limit.toString());
        }
      }
    } catch (e) {
      console.error('Error fetching report threshold from Supabase:', e);
    }
  }
  
  return limit;
}

// Save auto-hide report limit configuration
export async function saveReportThreshold(limit) {
  const limitStr = limit.toString();
  localStorage.setItem('confess_report_threshold', limitStr);
  if (supabase) {
    try {
      const { error } = await supabase.from('system_settings').upsert({ key: 'report_threshold', value: limitStr });
      if (error) {
        if (error.code === '42P01') {
          console.error('Supabase Error: "system_settings" table is missing. Report threshold NOT synced to the cloud. Run setup_supabase.sql.');
        } else {
          throw error;
        }
      }
    } catch (e) {
      console.error('Error saving report threshold to Supabase:', e);
    }
  }
}

// Active tab sessions tracking
export function updateActiveSession(tabId) {
  const sessions = JSON.parse(localStorage.getItem('confess_active_sessions')) || {};
  sessions[tabId] = Date.now();
  const now = Date.now();
  Object.keys(sessions).forEach(id => {
    if (now - sessions[id] > 6000) {
      delete sessions[id];
    }
  });
  localStorage.setItem('confess_active_sessions', JSON.stringify(sessions));
}

export function getActiveSessionCount(tabId) {
  updateActiveSession(tabId);
  const sessions = JSON.parse(localStorage.getItem('confess_active_sessions')) || {};
  return Object.keys(sessions).length;
}

export function removeActiveSession(tabId) {
  const sessions = JSON.parse(localStorage.getItem('confess_active_sessions')) || {};
  delete sessions[tabId];
  localStorage.setItem('confess_active_sessions', JSON.stringify(sessions));
}

// Supabase Cloud Configuration Saves
export function saveSupabaseConfig(url, key) {
  if (url && key) {
    localStorage.setItem('confess_supabase_url', url.trim());
    localStorage.setItem('confess_supabase_key', key.trim());
  }
}

export function disconnectSupabase() {
  localStorage.removeItem('confess_supabase_url');
  localStorage.removeItem('confess_supabase_key');
}

export function getSupabaseConfig() {
  return {
    url: localStorage.getItem('confess_supabase_url') || '',
    key: localStorage.getItem('confess_supabase_key') || ''
  };
}

// Get or generate user's persistent chat session ID
// SECURITY: Use crypto.randomUUID() for cryptographically secure session IDs
export function getChatSessionId() {
  let sessId = localStorage.getItem('secret_confessions_chat_session_id');
  if (!sessId) {
    // Use crypto.randomUUID() for secure random generation
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessId = 'chat_sess_' + crypto.randomUUID();
    } else {
      // Fallback for older browsers (shouldn't happen in modern browsers)
      const array = new Uint32Array(4);
      crypto.getRandomValues(array);
      sessId = 'chat_sess_' + Array.from(array, n => n.toString(16).padStart(8, '0')).join('-');
    }
    localStorage.setItem('secret_confessions_chat_session_id', sessId);
  }
  return sessId;
}

// Fetch chat messages for a specific session ID
export async function getChatMessages(sessionId) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('admin_chats')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Error fetching chat messages from Supabase, falling back to local storage:', e);
    }
  }

  // Local storage fallback
  const chats = JSON.parse(localStorage.getItem('secret_confessions_chats_data')) || [];
  return chats.filter(msg => msg.session_id === sessionId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// Send a chat message
export async function sendChatMessage(sessionId, messageText, sender, senderName) {
  // SECURITY: Validate message
  if (!messageText || typeof messageText !== 'string') {
    throw new Error('Invalid message');
  }
  const trimmed = messageText.trim();
  if (trimmed.length === 0) {
    throw new Error('Message cannot be empty');
  }
  if (trimmed.length > 400) {
    throw new Error('Message cannot exceed 400 characters');
  }

  // SECURITY: Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:/i,
    /vbscript:/i
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmed)) {
      throw new Error('Message contains invalid content');
    }
  }

  // SECURITY: Validate sender
  if (sender !== 'user' && sender !== 'staff') {
    throw new Error('Invalid sender type');
  }

  // SECURITY: Validate sender name
  if (!senderName || typeof senderName !== 'string' || senderName.trim().length === 0) {
    throw new Error('Invalid sender name');
  }
  if (senderName.length > 50) {
    throw new Error('Sender name too long');
  }

  // SECURITY: Rate limiting (only for user messages, not staff replies)
  if (sender === 'user') {
    const rateLimit = checkRateLimit('CHAT', RATE_LIMITS.CHAT);
    if (!rateLimit.allowed) {
      const waitSec = Math.ceil(rateLimit.waitMs / 1000);
      throw new Error(`Rate limit exceeded. Please wait ${waitSec} seconds before sending another message.`);
    }
  }

  const messageData = {
    session_id: sessionId,
    message: trimmed,
    sender: sender,
    sender_name: senderName.trim(),
    timestamp: new Date().toISOString()
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('admin_chats')
        .insert([messageData])
        .select();
      if (error) throw error;
      return data && data[0] ? data[0] : messageData;
    } catch (e) {
      console.error('Error sending chat message in Supabase, saving to local storage:', e);
    }
  }

  // Local storage fallback
  const chats = JSON.parse(localStorage.getItem('secret_confessions_chats_data')) || [];
  chats.push(messageData);
  localStorage.setItem('secret_confessions_chats_data', JSON.stringify(chats));
  return messageData;
}

// Get all chat threads (for admin dashboard)
export async function getAllChatThreads() {
  let allMessages = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('admin_chats')
        .select('*')
        .order('timestamp', { ascending: true });
      if (error) throw error;
      allMessages = data || [];
    } catch (e) {
      console.error('Error fetching all chat threads from Supabase, falling back to local storage:', e);
      allMessages = JSON.parse(localStorage.getItem('secret_confessions_chats_data')) || [];
    }
  } else {
    allMessages = JSON.parse(localStorage.getItem('secret_confessions_chats_data')) || [];
  }

  // Group messages by session_id
  const threadsMap = {};
  allMessages.forEach(msg => {
    const sId = msg.session_id;
    if (!threadsMap[sId]) {
      threadsMap[sId] = {
        sessionId: sId,
        lastMessage: '',
        lastTimestamp: '',
        userNickname: msg.sender === 'user' ? msg.sender_name : '',
        messages: []
      };
    }
    threadsMap[sId].messages.push(msg);
    threadsMap[sId].lastMessage = msg.message;
    threadsMap[sId].lastTimestamp = msg.timestamp;
    if (msg.sender === 'user' && !threadsMap[sId].userNickname) {
      threadsMap[sId].userNickname = msg.sender_name;
    }
  });

  // Convert map to array and sort by latest message timestamp desc
  return Object.values(threadsMap).sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
}
