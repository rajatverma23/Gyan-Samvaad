/**
 * YogaBot / Gyan Samvad - Chat UI
 * Theme toggle, language dropdown, chat with backend API
 */

const API = window.location.origin;
const STORAGE_KEY = 'yogabot_client_id';

document.addEventListener('DOMContentLoaded', function () {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  initThemeToggle();
  initButtonAnimations();
  initChat();
});

function clientId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

function escapeHtml(s) {
  if (s == null) return '';
  const el = document.createElement('div');
  el.textContent = s;
  return el.innerHTML;
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ---- Theme Toggle (Gyan Samvad) ----
function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') html.setAttribute('data-theme', 'dark');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      if (newTheme === 'dark') html.setAttribute('data-theme', 'dark');
      else html.removeAttribute('data-theme');
      localStorage.setItem('theme', newTheme);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }
}

// ---- Button click animation ----
function initButtonAnimations() {
  document.querySelectorAll('.btn-primary').forEach(btn => {
    btn.addEventListener('click', function () {
      if (this.disabled) return;
      this.style.transform = 'scale(0.97)';
      setTimeout(() => { this.style.transform = ''; }, 150);
    });
  });
}

// ---- Chat ----
function showPlaceholder(show) {
  const ph = document.getElementById('chatPlaceholder');
  const box = document.getElementById('chatDisplayBox');
  if (ph) ph.style.display = show ? 'flex' : 'none';
  if (box) box.classList.toggle('has-messages', !show);
}

function addMessage(text, who, products) {
  const wrap = document.getElementById('messages');
  const placeholder = document.getElementById('chatPlaceholder');
  if (wrap && placeholder) {
    placeholder.style.display = 'none';
    document.getElementById('chatDisplayBox').classList.add('has-messages');
  }

  const div = document.createElement('div');
  div.className = 'msg ' + who;
  const content = document.createElement('div');
  content.innerHTML = escapeHtml(text).replace(/\n/g, '<br>').replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  if (who === 'bot') content.classList.add('lang');
  div.appendChild(content);

  if (products && products.length) {
    products.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = (p.imageUrl ? `<img src="${escapeAttr(p.imageUrl)}" alt="${escapeAttr(p.name)}" onerror="this.style.display='none'">` : '') +
        '<div class="body">' +
        '<div class="name">' + escapeHtml(p.name) + '</div>' +
        '<div class="price">₹' + escapeHtml(p.price) + '</div>' +
        (p.link ? '<a href="' + escapeAttr(p.link) + '" target="_blank" rel="noopener">View</a>' : '') +
        '</div>';
      div.appendChild(card);
    });
  }
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function setTyping(on) {
  let el = document.getElementById('typing');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'typing';
    el.className = 'typing';
    el.textContent = 'YogaBot is typing…';
    document.getElementById('messages').appendChild(el);
    document.getElementById('messages').scrollTop = 1e9;
  }
  if (el) el.style.display = on ? 'block' : 'none';
}

function setError(msg) {
  let el = document.getElementById('error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'error';
    el.className = 'error';
    document.getElementById('messages').appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
}

function clearError() {
  const el = document.getElementById('error');
  if (el) el.style.display = 'none';
}

async function sendMessage(text, language) {
  clearError();
  addMessage(text, 'user');
  setTyping(true);
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const body = { message: text, client_id: clientId() };
    if (language) body.language = language;
    const r = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      if (r.status === 400 && data.detail) {
        const d = data.detail;
        const dropdown = document.getElementById('langDropdown');
        if (dropdown) dropdown.value = '';
        showPlaceholder(true);
        setError(d.message || 'Please select a language first.');
      } else {
        setError(data.detail?.message || data.detail || 'Request failed');
      }
      return;
    }

    addMessage(data.text, 'bot', data.products || null);
    if (data.audio_base64) {
      const audio = new Audio('data:audio/wav;base64,' + data.audio_base64);
      audio.play().catch(function () {});
    }
  } catch (e) {
    setError(e.message || 'Network error');
  } finally {
    setTyping(false);
    if (sendBtn) sendBtn.disabled = false;
  }
}

function initChat() {
  const langDropdown = document.getElementById('langDropdown');
  const sendBtn = document.getElementById('sendBtn');
  const input = document.getElementById('input');
  const langBadge = document.getElementById('langBadge');

  if (langDropdown) {
    langDropdown.addEventListener('change', function () {
      const val = this.value;
      if (val === 'eng' || val === 'hin') {
        langBadge.textContent = val === 'eng' ? 'EN' : 'HI';
        sendMessage(val, val);
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', function () {
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendMessage(text);
    });
  }

  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn && sendBtn.click();
      }
    });
  }

  async function init() {
    try {
      const r = await fetch(API + '/api/session/' + encodeURIComponent(clientId()));
      if (r.ok) {
        const s = await r.json();
        if (s.has_language && s.language) {
          if (langDropdown) langDropdown.value = s.language;
          if (langBadge) langBadge.textContent = s.language === 'eng' ? 'EN' : 'HI';
          showPlaceholder(false);
        }
      }
    } catch (_) {}
  }
  init();
}
