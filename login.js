import { loginUser, getPasswords } from './data.js';

export function setupEyeTracking() {
  const pupils = document.querySelectorAll('.pupil');
  const eyeSockets = document.querySelectorAll('.eye-socket');

  // We want to track mouse movement across the document
  window.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    pupils.forEach((pupil) => {
      // Find the parent eye socket or the pupil's center reference point
      const eyeSocket = pupil.closest('.eye') || pupil.parentElement;
      const rect = eyeSocket.getBoundingClientRect();
      
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;

      // Calculate angle and distance
      const dx = mouseX - eyeCenterX;
      const dy = mouseY - eyeCenterY;
      const angle = Math.atan2(dy, dx);
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Determine max distance the pupil can move within the eye
      // We can read it from data attributes or calculate a fraction of the eye's radius
      const maxDistance = parseFloat(pupil.getAttribute('data-max-move') || '8');
      
      // Calculate how far the pupil should move. 
      // Scale it so it moves gradually, reaching maxDistance when mouse is far away
      const moveDistance = Math.min(distance * 0.08, maxDistance);

      // Calculate target translations
      const tx = Math.cos(angle) * moveDistance;
      const ty = Math.sin(angle) * moveDistance;

      // Apply transform using requestAnimationFrame for performance
      requestAnimationFrame(() => {
        pupil.style.transform = `translate(${tx}px, ${ty}px)`;
      });
    });
  });
}

export function setupLoginForm(onLoginSuccess) {
  const loginForm = document.getElementById('login-form');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error');

  if (!loginForm) return;

  // Clear errors on typing to reduce user friction
  passwordInput.addEventListener('input', () => {
    passwordInput.classList.remove('invalid-input');
    errorMsg.textContent = '';
  });

  // Toggle password visibility
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      const icon = togglePasswordBtn.querySelector('svg');
      if (type === 'text') {
        icon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        icon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }

  // Handle submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    passwordInput.classList.remove('invalid-input');

    const password = passwordInput.value;

    if (!password) {
      errorMsg.textContent = 'Please enter the staff password.';
      passwordInput.classList.add('invalid-input');
      return;
    }

    const passwords = await getPasswords();
    let role = null;
    let username = '';

    // Check if password matches admin or moderator
    if (password === passwords.admin) {
      role = 'admin';
      username = 'Owner';
    } else if (password === passwords.moderator) {
      role = 'moderator';
      username = 'Moderator';
    } else {
      errorMsg.textContent = 'Invalid staff password.';
      passwordInput.classList.add('invalid-input');
      return;
    }

    // Save login state
    loginUser(username, role);
    
    // Trigger callback
    if (onLoginSuccess) {
      onLoginSuccess(role);
    }
  });
}
