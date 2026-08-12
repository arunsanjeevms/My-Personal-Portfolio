'use strict';

/**
 * Media picker, media form fields, and clipboard helpers.
 *
 * Loaded on every admin page. Each block no-ops when its markup is
 * absent, so pages without media fields pay nothing for it.
 */

(function media() {
  const adminPath = document.body.dataset.adminPath || '/admin';

  /* ------------------------------------------------- copy to clipboard */
  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-copy]');
    if (!trigger) return;

    try {
      await navigator.clipboard.writeText(trigger.dataset.copy);
      window.Admin?.toast('URL copied to clipboard.', 'success', 2000);
    } catch {
      window.Admin?.toast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  });

  /* ----------------------------------------------------- media picker */
  const picker = document.querySelector('[data-media-picker]');

  if (picker) {
    const grid = picker.querySelector('[data-media-picker-grid]');
    const searchInput = picker.querySelector('[data-media-picker-search]');
    const pageLabel = picker.querySelector('[data-media-picker-page]');
    const prevButton = picker.querySelector('[data-media-picker-prev]');
    const nextButton = picker.querySelector('[data-media-picker-next]');

    let activeField = null;
    let currentPage = 1;
    let totalPages = 1;
    let currentKind = '';
    let searchTimer = null;

    const spinnerMarkup = '<div class="u-center u-muted" style="padding:32px;grid-column:1/-1">'
      + '<span class="spinner" style="margin:0 auto"></span></div>';

    async function load() {
      grid.innerHTML = spinnerMarkup;

      const params = new URLSearchParams({ page: String(currentPage) });
      if (searchInput.value) params.set('q', searchInput.value);
      // A field accepting several kinds sends them comma-separated; only
      // a single kind is worth filtering the server query by.
      if (currentKind && currentKind.indexOf(',') === -1) params.set('kind', currentKind);

      try {
        const response = await fetch(adminPath + '/media/browse?' + params.toString(), {
          credentials: 'same-origin',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!response.ok) throw new Error('Could not load the media library.');

        const data = await response.json();
        totalPages = data.pages;
        pageLabel.textContent = 'Page ' + data.page + ' of ' + data.pages;
        prevButton.disabled = data.page <= 1;
        nextButton.disabled = data.page >= data.pages;

        if (!data.items.length) {
          grid.innerHTML = '<p class="u-center u-muted" style="padding:32px;grid-column:1/-1">'
            + 'No files found. Upload some from the media library.</p>';
          return;
        }

        grid.innerHTML = '';

        data.items.forEach((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'media-picker-item';

          const thumb = document.createElement('span');
          thumb.className = 'thumb';

          if (item.kind === 'image') {
            const img = document.createElement('img');
            img.src = item.thumb;
            img.alt = item.alt || item.name;
            img.loading = 'lazy';
            thumb.appendChild(img);
          } else {
            const icon = document.createElement('ion-icon');
            icon.setAttribute('name', 'document-text-outline');
            icon.style.fontSize = '26px';
            icon.style.color = 'var(--light-gray-70)';
            thumb.appendChild(icon);
          }

          const name = document.createElement('span');
          name.className = 'name';
          // textContent, not innerHTML: filenames are user-supplied.
          name.textContent = item.name;

          button.append(thumb, name);
          button.addEventListener('click', () => choose(item));
          grid.appendChild(button);
        });
      } catch (err) {
        grid.innerHTML = '';
        const message = document.createElement('p');
        message.className = 'u-center';
        message.style.cssText = 'padding:32px;grid-column:1/-1;color:var(--admin-danger)';
        message.textContent = err.message;
        grid.appendChild(message);
      }
    }

    function choose(item) {
      if (!activeField) return;

      activeField.querySelector('[data-media-input]').value = item.id;

      const preview = activeField.querySelector('[data-media-preview]');
      preview.innerHTML = '';

      if (item.kind === 'image') {
        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = item.alt || '';
        preview.appendChild(img);
      } else {
        const wrapper = document.createElement('span');
        wrapper.className = 'media-placeholder';
        const icon = document.createElement('ion-icon');
        icon.setAttribute('name', 'document-text-outline');
        wrapper.appendChild(icon);
        preview.appendChild(wrapper);
      }

      const clearButton = activeField.querySelector('[data-media-clear]');
      if (clearButton) clearButton.removeAttribute('hidden');

      close();
    }

    function open(field, accept) {
      activeField = field;
      currentKind = accept || 'image';
      currentPage = 1;
      searchInput.value = '';
      picker.classList.add('is-open');
      load();
      searchInput.focus();
    }

    function close() {
      picker.classList.remove('is-open');
      activeField = null;
    }

    const closeButton = picker.querySelector('[data-media-picker-close]');
    if (closeButton) closeButton.addEventListener('click', close);

    picker.addEventListener('click', (event) => {
      if (event.target === picker) close();
    });

    prevButton.addEventListener('click', () => {
      if (currentPage > 1) { currentPage -= 1; load(); }
    });
    nextButton.addEventListener('click', () => {
      if (currentPage < totalPages) { currentPage += 1; load(); }
    });

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { currentPage = 1; load(); }, 300);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && picker.classList.contains('is-open')) close();
    });

    document.querySelectorAll('[data-media-field]').forEach((field) => {
      const pickButton = field.querySelector('[data-media-pick]');
      if (pickButton) {
        pickButton.addEventListener('click', (event) => {
          open(field, event.currentTarget.dataset.accept);
        });
      }

      const clearButton = field.querySelector('[data-media-clear]');
      if (clearButton) {
        clearButton.addEventListener('click', () => {
          field.querySelector('[data-media-input]').value = '';

          const preview = field.querySelector('[data-media-preview]');
          preview.innerHTML = '';
          const wrapper = document.createElement('span');
          wrapper.className = 'media-placeholder';
          const icon = document.createElement('ion-icon');
          icon.setAttribute('name', 'image-outline');
          wrapper.appendChild(icon);
          preview.appendChild(wrapper);

          clearButton.setAttribute('hidden', '');
        });
      }
    });
  }

  /* --------------------------------------------- media details modal */
  const editModal = document.querySelector('[data-media-edit-modal]');

  if (editModal) {
    const form = editModal.querySelector('[data-media-edit-form]');

    document.querySelectorAll('[data-media-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        form.action = adminPath + '/media/' + button.dataset.mediaEdit;
        form.querySelector('#edit-alt').value = button.dataset.alt || '';
        form.querySelector('#edit-title').value = button.dataset.titleText || '';
        form.querySelector('#edit-caption').value = button.dataset.caption || '';
        form.querySelector('#edit-folder').value = button.dataset.folder || 'general';
        editModal.classList.add('is-open');
        form.querySelector('#edit-alt').focus();
      });
    });

    const cancelButton = editModal.querySelector('[data-media-edit-cancel]');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => editModal.classList.remove('is-open'));
    }

    editModal.addEventListener('click', (event) => {
      if (event.target === editModal) editModal.classList.remove('is-open');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') editModal.classList.remove('is-open');
    });
  }
}());
