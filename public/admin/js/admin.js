'use strict';

/**
 * Admin panel behaviour.
 *
 * Vanilla JS, no framework - the whole panel is server-rendered, so this
 * only needs to handle the interactive shell: sidebar, dropdowns,
 * toasts, confirmation dialogs and form-submit guards.
 *
 * Every fetch() sends the CSRF token from the page meta tag.
 */

(function admin() {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

  /* ---------------------------------------------------------- sidebar */

  const sidebar = document.querySelector('[data-sidebar]');
  const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  const sidebarBackdrop = document.querySelector('[data-sidebar-backdrop]');

  function closeSidebar() {
    sidebar?.classList.remove('is-open');
    sidebarBackdrop?.classList.remove('is-open');
  }

  sidebarToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('is-open');
    sidebarBackdrop?.classList.toggle('is-open');
  });

  sidebarBackdrop?.addEventListener('click', closeSidebar);

  /* ------------------------------------------------------- dropdowns */

  const dropdownTriggers = document.querySelectorAll('[data-dropdown-trigger]');

  dropdownTriggers.forEach((trigger) => {
    const menu = document.querySelector(`[data-dropdown="${trigger.dataset.dropdownTrigger}"]`);
    if (!menu) return;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const wasOpen = menu.classList.contains('is-open');
      // Only one dropdown open at a time.
      document.querySelectorAll('[data-dropdown].is-open').forEach((el) => el.classList.remove('is-open'));
      menu.classList.toggle('is-open', !wasOpen);
      trigger.setAttribute('aria-expanded', String(!wasOpen));
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('[data-dropdown].is-open').forEach((el) => el.classList.remove('is-open'));
    dropdownTriggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('[data-dropdown].is-open').forEach((el) => el.classList.remove('is-open'));
    closeSidebar();
    closeModal();
  });

  /* ----------------------------------------------------------- toasts */

  let toastStack = document.querySelector('[data-toast-stack]');

  function ensureToastStack() {
    if (toastStack) return toastStack;
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    toastStack.setAttribute('data-toast-stack', '');
    toastStack.setAttribute('role', 'status');
    toastStack.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastStack);
    return toastStack;
  }

  const TOAST_ICONS = {
    success: 'checkmark-circle-outline',
    error: 'alert-circle-outline',
    warning: 'warning-outline',
    info: 'information-circle-outline',
  };

  function toast(message, type = 'info', timeout = 4500) {
    const stack = ensureToastStack();

    const element = document.createElement('div');
    element.className = `toast is-${type}`;

    const icon = document.createElement('ion-icon');
    icon.setAttribute('name', TOAST_ICONS[type] || TOAST_ICONS.info);

    const text = document.createElement('div');
    // textContent, never innerHTML - message can contain server data.
    text.textContent = message;

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '<ion-icon name="close-outline"></ion-icon>';

    const dismiss = () => {
      element.classList.add('is-leaving');
      setTimeout(() => element.remove(), 200);
    };

    close.addEventListener('click', dismiss);
    element.append(icon, text, close);
    stack.appendChild(element);

    if (timeout) setTimeout(dismiss, timeout);
    return element;
  }

  /* ------------------------------------------------ confirm dialogs */

  const modalBackdrop = document.querySelector('[data-modal-backdrop]');
  let pendingConfirm = null;

  function closeModal() {
    modalBackdrop?.classList.remove('is-open');
    pendingConfirm = null;
  }

  /**
   * Any element with data-confirm="message" opens the dialog instead of
   * acting immediately. Works for links, buttons and form submits.
   */
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-confirm]');
    if (!trigger || !modalBackdrop) return;

    event.preventDefault();

    modalBackdrop.querySelector('[data-modal-title]').textContent =
      trigger.dataset.confirmTitle || 'Are you sure?';
    modalBackdrop.querySelector('[data-modal-text]').textContent = trigger.dataset.confirm;

    const confirmButton = modalBackdrop.querySelector('[data-modal-confirm]');
    confirmButton.textContent = trigger.dataset.confirmAction || 'Confirm';
    confirmButton.className = `btn ${trigger.dataset.confirmDanger === 'false' ? 'btn-primary' : 'btn-danger'}`;

    pendingConfirm = trigger;
    modalBackdrop.classList.add('is-open');
    confirmButton.focus();
  });

  modalBackdrop?.querySelector('[data-modal-confirm]')?.addEventListener('click', () => {
    if (!pendingConfirm) return;

    const trigger = pendingConfirm;
    pendingConfirm = null;
    modalBackdrop.classList.remove('is-open');

    const form = trigger.closest('form');
    if (trigger.tagName === 'A' && trigger.href) {
      window.location.href = trigger.href;
    } else if (form) {
      // Bypass the interceptor on the real submit.
      trigger.removeAttribute('data-confirm');
      if (trigger.type === 'submit') trigger.click();
      else form.submit();
    }
  });

  modalBackdrop?.querySelectorAll('[data-modal-cancel]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  modalBackdrop?.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) closeModal();
  });

  /* ------------------------------------------- double-submit guard */

  document.querySelectorAll('form[data-guard]').forEach((form) => {
    form.addEventListener('submit', () => {
      const button = form.querySelector('[type="submit"]');
      if (!button || button.disabled) return;

      button.disabled = true;
      button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = '<span class="spinner"></span><span>Working…</span>';

      // Re-enable if the navigation never happens (validation error, etc.)
      setTimeout(() => {
        if (!button.isConnected) return;
        button.disabled = false;
        if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      }, 10000);
    });
  });

  /* -------------------------------------------------- slug helpers */

  document.querySelectorAll('[data-slug-source]').forEach((source) => {
    const target = document.querySelector(`[data-slug-target="${source.dataset.slugSource}"]`);
    if (!target) return;

    source.addEventListener('input', () => {
      // Stop auto-filling once the slug has been edited by hand.
      if (target.dataset.touched === 'true') return;
      target.value = source.value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    });

    target.addEventListener('input', () => { target.dataset.touched = 'true'; });
  });

  /* ------------------------------------------ password visibility */

  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.querySelector('ion-icon')?.setAttribute('name', showing ? 'eye-outline' : 'eye-off-outline');
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  /* ------------------------------------------ password strength UI */

  const passwordInput = document.querySelector('[data-password-strength]');
  if (passwordInput) {
    const bars = document.querySelectorAll('[data-pw-bar]');

    passwordInput.addEventListener('input', () => {
      const value = passwordInput.value;
      let score = 0;
      if (value.length >= 12) score += 1;
      if (value.length >= 16) score += 1;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
      if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;

      const classes = ['is-weak', 'is-fair', 'is-good', 'is-strong'];
      bars.forEach((bar, index) => {
        bar.classList.remove(...classes);
        if (index < score) bar.classList.add(classes[Math.max(0, score - 1)]);
      });
    });
  }

  /* -------------------------------------------- search shortcut */

  const searchInput = document.querySelector('[data-admin-search]');
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      searchInput?.focus();
    }
  });

  /* ------------------------------------------------ fetch wrapper */

  /** JSON fetch that always carries the CSRF token. */
  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  /* ---------------------------------------------------- flash → toast */

  document.querySelectorAll('[data-flash]').forEach((element) => {
    toast(element.dataset.flashMessage, element.dataset.flashType || 'info');
    element.remove();
  });

  window.Admin = { toast, request, closeModal };
}());
