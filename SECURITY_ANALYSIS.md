# Security Analysis Report - ConfessOut (Secret Confessions App)

**Date:** 2026-10-27  
**Project:** Secret Confessions / ConfessOut  
**Type:** Client-side web application with Supabase backend  
**Severity Scale:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Executive Summary

This application has **multiple critical and high-severity security vulnerabilities** that could lead to:
- **Full administrative account takeover** (auth bypass)
- **Database credential exposure** (Supabase keys in source code)
- **Cross-Site Scripting (XSS)** in multiple locations
- **Authorization bypass** on admin panel
- **Data manipulation/integrity violations**
- **Sensitive data exposure** in client-side storage

---

## 🔴 CRITICAL Vulnerabilities

### 1. Hardcoded Supabase Credentials in Source Code (CVSS: 9.8)
**File:** `data.js` lines 21-24

```javascript
const SUPABASE_URL = "https://syppynfobjhgfafzcolo.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_3mpFRQNyq6TUQClw3l0XdQ_-d2gXXZ0";
```

**Impact:** 
- Attacker gains full read/write access to Supabase database
- Can read ALL confessions (including pending/rejected)
- Can read ALL admin chat messages
- Can modify system settings (passwords, report thresholds)
- Can delete or modify any data
- Credentials are committed to git history

**Remediation:** 
- Remove hardcoded credentials immediately
- Rotate the Supabase anon key in Supabase dashboard
- Use environment variables or secure configuration management
- Never commit credentials to version control

---

### 2. Client-Side Authentication Bypass (CVSS: 9.8)
**File:** `data.js` lines 347-359, `login.js` lines 82-118

```javascript
// data.js - loginUser function stores auth state in localStorage ONLY
export function loginUser(username, role) {
  const user = { username, role, isLoggedIn: true };
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  return user;
}

export function getCurrentUser() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) || { isLoggedIn: false };
}
```

**Impact:**
- Any user can open DevTools and execute: `localStorage.setItem('secret_confessions_user', '{"username":"Attacker","role":"admin","isLoggedIn":true}')`
- Immediate full admin panel access
- Can approve/reject confessions, read all chats, change passwords, disconnect database
- No server-side validation of admin role

**Remediation:**
- Implement proper JWT-based authentication with Supabase Auth
- Verify admin role server-side via RLS policies
- Never trust client-side role claims

---

### 3. Default Passwords Are Trivial and Exposed (CVSS: 9.0)
**File:** `data.js` lines 374-375

```javascript
let adminPass = localStorage.getItem('confess_admin_pass') || 'pass@123';
let modPass = localStorage.getItem('confess_mod_pass') || 'pass@123';
```

**Impact:**
- Default passwords are `pass@123` for BOTH admin and moderator
- Credentials visible in source code
- Any user can login as admin immediately
- Passwords synced to Supabase `system_settings` table (publicly readable via RLS policy)

**Remediation:**
- Remove default passwords entirely
- Force password setup on first run
- Use strong, randomly generated initial passwords
- Store only password hashes (bcrypt/argon2), never plaintext

---

### 4. Supabase RLS Policies Allow Full Public Write Access (CVSS: 9.8)
**File:** `setup_supabase.sql` lines 41-44, 100-103

```sql
-- confessions table - ANYONE can update ANY column on ANY row
CREATE POLICY "Allow public update reactions and reports" ON confessions
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- system_settings table - ANYONE can write ANY setting
CREATE POLICY "Allow public write settings" ON system_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

**Impact:**
- Any anonymous user can:
  - Modify `admin_password` and `moderator_password` in `system_settings`
  - Change `report_threshold` to disable moderation
  - Update any confession's status, reactions, reports
  - Escalate to admin by changing their own password in settings
- Complete database takeover via SQL injection through the API

**Remediation:**
- Restrict UPDATE policies to specific columns only
- Use service role key for admin operations (server-side only)
- Implement proper RLS with user identity checks
- Never allow public write to system configuration tables

---

### 5. Admin Panel Access Control Only in UI (CVSS: 9.1)
**File:** `main.js` lines 157-161, 439-461

```javascript
// Client-side check only - no server enforcement
if (user && user.isLoggedIn && (user.role === 'admin' || user.role === 'moderator')) {
  document.getElementById('btn-view-admin').classList.remove('hidden');
  await updateAdminBadge();
}

// Admin functions called directly from UI
card.querySelector('.btn-approve').addEventListener('click', () => {
  await approveConfession(postId);  // No server-side auth check
});
```

**Impact:**
- Hidden admin button can be unhidden via DevTools
- Admin API functions (`approveConfession`, `rejectConfession`, `savePasswords`, etc.) called directly
- No server-side authorization verification
- Any authenticated (or spoofed) user can perform admin actions

---

## 🟠 HIGH Vulnerabilities

### 6. Cross-Site Scripting (XSS) - Stored via Confession Text (CVSS: 7.2)
**File:** `main.js` line 253, 423 - Uses `escapeHtml` but...

```javascript
// main.js line 253
<p class="confession-text">${escapeHtml(post.text)}</p>

// main.js line 423 - admin queue
<p>${escapeHtml(post.text)}</p>
```

**escapeHtml implementation (line 487-491):**
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}
```

**Issue:** The `escapeHtml` function is **actually secure** for text content. However, there are other XSS vectors:

**XSS Vector 1 - Chat Messages (lines 1091, 1183):**
```javascript
<p class="message-text-content">${escapeHtml(msg.message)}</p>
```
Uses same escapeHtml - OK for text content.

**XSS Vector 2 - Sender Name in Chat (line 1092, 1184):**
```javascript
<span class="message-meta">${isUser ? 'You' : 'Admin'} • ${timeStr}</span>
// And line 1184:
<span class="message-meta">${msg.sender === 'user' ? alias.name : 'You (Staff)'} • ${timeStr}</span>
```
`alias.name` comes from `getAnonymousAlias()` which uses hardcoded arrays - SAFE.

**XSS Vector 3 - Tag in confession cards (line 239):**
```javascript
<span class="card-tag tag-${post.tag.toLowerCase()}">${post.tag}</span>
```
**VULNERABLE:** `post.tag` is directly interpolated into class attribute AND text content. If tag contains `" onclick="alert(1)"`, it breaks out of attribute context.

**XSS Vector 4 - Session ID display (line 1172):**
```javascript
if (threadSession) threadSession.textContent = `Session: ${sessionId}`;
```
Uses `textContent` - SAFE.

**XSS Vector 5 - Username in nav (line 154):**
```javascript
navUsername.textContent = user.username;
```
Uses `textContent` - SAFE.

**Remediation:** 
- Sanitize `post.tag` against a whitelist of allowed tags
- Use `textContent` for all user-controlled data
- Implement Content Security Policy (CSP)

---

### 7. No Rate Limiting / Abuse Protection (CVSS: 7.5)
**Files:** `data.js` - all mutation functions

**Impact:**
- Unlimited confession submission (spam/flood)
- Unlimited reaction toggling (counter manipulation)
- Unlimited reporting (denial of service via auto-hide)
- Unlimited chat messages (storage exhaustion)
- Unlimited password change attempts (brute force)
- No CAPTCHA, no IP tracking, no exponential backoff

**Remediation:**
- Implement rate limiting at Supabase level (pg_cron + functions)
- Add client-side cooldowns with server enforcement
- Use CAPTCHA for sensitive operations
- Implement abuse detection alerts

---

### 8. Passwords Stored in Plaintext (CVSS: 7.5)
**File:** `data.js` lines 374-375, 397-422, 435-471

```javascript
// Stored in localStorage AND Supabase in PLAINTEXT
localStorage.setItem('confess_admin_pass', trimmed);
await supabase.from('system_settings').upsert({ key: 'admin_password', value: trimmed });
```

**Impact:**
- Any XSS steals admin passwords
- Supabase `system_settings` table readable by anyone (RLS: `USING (true)`)
- Password reuse across systems compromised
- No password hashing whatsoever

**Remediation:**
- Use bcrypt/argon2 for password hashing
- Never store plaintext passwords
- Implement Supabase Auth for proper authentication

---

### 9. Insecure Direct Object References (IDOR) (CVSS: 7.0)
**Files:** `main.js` - `approveConfession`, `rejectConfession`, `reactToConfession`, `reportConfession`

**Impact:**
- Users can approve/reject any confession by ID (if they access admin panel)
- Users can manipulate reactions on any confession
- No ownership/authorization checks on data operations
- Sequential UUIDs (if not using random) allow enumeration

---

### 10. Client-Side Report Threshold Enforcement (CVSS: 6.8)
**File:** `data.js` lines 218-232

```javascript
const limit = await getReportThreshold();  // Fetched from client-controllable storage
if (newReports >= limit) {
  updates.status = 'pending';  // Client decides when to hide
}
```

**Impact:**
- Attacker can modify `confess_report_threshold` in localStorage to `999999`
- Reports never trigger auto-moderation
- Or set to `1` to auto-hide all confessions (DoS)
- Client controls moderation logic

---

## 🟡 MEDIUM Vulnerabilities

### 11. No Content Security Policy (CSP)
**File:** `index.html` - No CSP header/meta tag

**Impact:**
- XSS impact amplified (inline scripts execute)
- Data exfiltration via script injection
- Mixed content risks

---

### 12. Sensitive Data in localStorage (CVSS: 6.5)
**File:** `data.js` - Multiple keys

```javascript
STORAGE_KEYS = {
  CONFESSIONS: 'secret_confessions_data',
  CURRENT_USER: 'secret_confessions_user'
}
// Plus: confess_my_reactions, confess_my_reports, confess_active_sessions,
// confess_admin_pass, confess_mod_pass, confess_report_threshold,
// confess_supabase_url, confess_supabase_key, secret_confessions_chat_session_id,
// secret_confessions_chats_data
```

**Impact:**
- All user data, passwords, sessions accessible via XSS
- No encryption at rest
- Persists across sessions
- Accessible by any script on the page

---

### 13. Supabase Anon Key Used for Admin Operations (CVSS: 6.5)
**File:** `data.js` - All Supabase operations use `supabase` client (anon key)

**Impact:**
- Anon key exposed in client
- Admin operations (password changes, settings) use same credentials as public
- No privilege separation
- Service role key should be used server-side only

---

### 14. No Input Validation/Sanitization on Confession Text (CVSS: 6.0)
**File:** `main.js` line 635, `data.js` line 100

```javascript
// main.js - only checks length
const text = confessionText.value.trim();
if (text.length < 15) { ... }

// data.js - no validation
text: text.trim(),  // Direct insert
```

**Impact:**
- Extremely long texts (DoS via storage)
- Unicode/control character injection
- No profanity/illegal content filtering
- Database bloat attacks

---

### 15. Session ID Generation Not Cryptographically Secure (CVSS: 5.5)
**File:** `data.js` line 584

```javascript
sessId = 'chat_sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
```

**Impact:**
- `Math.random()` is predictable
- Session IDs can be guessed/brute-forced
- Chat history accessible to other users
- Should use `crypto.randomUUID()` or `crypto.getRandomValues()`

---

### 16. Debug/Console Logging of Sensitive Operations (CVSS: 5.0)
**File:** `data.js` - Multiple console.error with full error objects

```javascript
console.error('Error saving admin password to Supabase:', e);
// May leak stack traces, SQL errors, internal structure
```

**Impact:**
- Information disclosure in production
- Attackers can trigger errors to map database schema

---

## 🟢 LOW Vulnerabilities

### 17. Missing Security Headers
- No `X-Frame-Options` (clickjacking)
- No `X-Content-Type-Options: nosniff`
- No `Referrer-Policy`
- No `Permissions-Policy`

### 18. Autocomplete on Password Fields
**File:** `index.html` line 177, 586
```html
<input type="password" id="login-password" placeholder="Enter password..." autocomplete="current-password" required>
<input type="password" id="settings-db-key" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
```
Should use `autocomplete="new-password"` for new password fields, or `off` for sensitive fields.

### 19. No Subresource Integrity (SRI) for CDN Scripts
**File:** `index.html` line 14
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```
No integrity hash - CDN compromise = full app compromise.

---

## Attack Scenarios

### Scenario 1: Complete Admin Takeover (2 minutes)
1. Visit the site
2. Open DevTools Console
3. Run: `localStorage.setItem('secret_confessions_user', '{"username":"Hacker","role":"admin","isLoggedIn":true}')`
4. Refresh page → Full admin panel access
5. Change admin password, disconnect Supabase, delete all data

### Scenario 2: Database Credential Theft (Immediate)
1. View page source / `data.js`
2. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Connect to Supabase dashboard → Full database access

### Scenario 3: Privilege Escalation via RLS (5 minutes)
1. Use anon key to query `system_settings` table
2. Update `admin_password` to known value
3. Login as admin
4. Full control

### Scenario 4: Stored XSS via Tag Field (If exploitable)
1. Submit confession with tag: `Funny" onmouseover="alert(1)" x="`
2. When rendered in feed, breaks attribute context
3. Execute arbitrary JS in victim's browser

### Scenario 5: Denial of Service via Report Threshold
1. Set `localStorage.setItem('confess_report_threshold', '1')`
2. All confessions auto-hidden after 1 report
3. Feed becomes empty for all users

---

## Remediation Priority Order

| Priority | Vulnerability | Effort | Risk Reduction |
|----------|--------------|--------|----------------|
| 1 | Remove hardcoded Supabase credentials | Low | 🔴 Critical |
| 2 | Rotate Supabase anon key | Low | 🔴 Critical |
| 3 | Implement Supabase Auth (server-side auth) | High | 🔴 Critical |
| 4 | Fix RLS policies (restrict writes) | Medium | 🔴 Critical |
| 5 | Hash passwords (bcrypt) | Medium | 🟠 High |
| 6 | Remove default passwords | Low | 🟠 High |
| 7 | Add server-side authorization checks | High | 🟠 High |
| 8 | Sanitize tag field (whitelist) | Low | 🟡 Medium |
| 9 | Implement rate limiting | Medium | 🟡 Medium |
| 10 | Add CSP header | Low | 🟡 Medium |
| 11 | Use crypto.randomUUID() for sessions | Low | 🟢 Low |
| 12 | Add security headers | Low | 🟢 Low |
| 13 | Add SRI for CDN scripts | Low | 🟢 Low |

---

## Secure Architecture Recommendations

### 1. Move to Supabase Auth
- Use Supabase Auth with email/password or OAuth
- Enable Row Level Security with `auth.uid()` checks
- Use `supabase.auth.getUser()` server-side

### 2. Implement Backend-for-Frontend (BFF)
- Create Supabase Edge Functions for admin operations
- Use service role key ONLY in Edge Functions
- Validate all admin actions server-side

### 3. Proper RLS Policies
```sql
-- Example: Only admins can update system_settings
CREATE POLICY "Admin write settings" ON system_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
    )
  );
```

### 4. Password Security
```javascript
// In Edge Function (server-side)
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 12);
// Store hash, verify with bcrypt.compare()
```

### 5. Input Validation
```javascript
// Whitelist tags
const ALLOWED_TAGS = ['Funny', 'Love', 'Crush', 'Academic', 'Wholesome', 'General'];
if (!ALLOWED_TAGS.includes(tag)) throw new Error('Invalid tag');
```

---

## Files Requiring Immediate Changes

1. **`data.js`** - Remove hardcoded credentials (lines 21-24), implement proper auth
2. **`setup_supabase.sql`** - Fix RLS policies (lines 41-44, 100-103)
3. **`main.js`** - Add server-side auth checks for all admin functions
4. **`login.js`** - Integrate with Supabase Auth
5. **`index.html`** - Add CSP meta tag, SRI for CDN

---

## Compliance Notes

This application in its current state **violates**:
- OWASP Top 10: A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, A07 Identification and Authentication Failures
- GDPR: No data protection by design, plaintext passwords
- Basic security hygiene: Hardcoded secrets, client-side auth

---

**Recommendation:** Do NOT deploy this application to production without addressing all 🔴 Critical and 🟠 High vulnerabilities. The authentication and authorization model is fundamentally broken and requires architectural changes, not just patches.