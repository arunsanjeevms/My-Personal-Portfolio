'use strict';

/**
 * Settings search, colour mirroring and character counters.
 * Each block no-ops when its markup is not on the page.
 */

(function settings() {
  const adminPath = document.body.dataset.adminPath || '/admin';

  /* ------------------------------------------------- settings search */
  const searchInput = document.querySelector('[data-settings-search]');
  const resultsBox = document.querySelector('[data-settings-results]');

  if (searchInput && resultsBox) {
    // Built from the tabs plus the fields rendered on the current tab, so
    // searching finds a setting on another tab and links straight to it.
    const index = [];

    document.querySelectorAll('[data-settings-tab]').forEach((tab) => {
      index.push({
        type: 'group',
        key: tab.dataset.settingsTab,
        label: tab.querySelector('span').textContent.trim(),
        group: tab.querySelector('span').textContent.trim(),
        url: tab.getAttribute('href'),
      });
    });

    document.querySelectorAll('[data-setting-key]').forEach((row) => {
      const activeTab = document.querySelector('.settings-tab.is-active');
      index.push({
        type: 'setting',
        key: row.dataset.settingKey,
        label: row.dataset.settingLabel,
        group: activeTab ? activeTab.querySelector('span').textContent.trim() : '',
        element: row,
      });
    });

    // Well-known aliases so plain-language searches land somewhere useful.
    const aliases = {
      favicon: 'branding', logo: 'branding', icon: 'branding',
      title: 'titles', seo: 'meta', description: 'meta', keywords: 'meta',
      smtp: 'mail', email: 'mail', mail: 'mail',
      analytics: 'analytics', privacy: 'privacy', cookie: 'privacy',
      maintenance: 'status', offline: 'status',
      password: 'security', login: 'security', '2fa': 'security',
      medium: 'blog', blog: 'blog',
      phone: 'contact', address: 'contact', map: 'contact',
    };

    function render(term) {
      const query = term.trim().toLowerCase();

      if (query.length < 2) {
        resultsBox.classList.add('u-hidden');
        resultsBox.innerHTML = '';
        return;
      }

      const matches = index.filter((item) =>
        item.label.toLowerCase().includes(query) || item.key.toLowerCase().includes(query));

      // Alias hit adds the matching group even if its name does not match.
      Object.keys(aliases).forEach((alias) => {
        if (!alias.includes(query) && !query.includes(alias)) return;
        const group = index.find((item) => item.type === 'group' && item.key === aliases[alias]);
        if (group && !matches.includes(group)) matches.unshift(group);
      });

      resultsBox.innerHTML = '';
      resultsBox.classList.remove('u-hidden');

      if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'u-small u-muted';
        empty.style.padding = '8px 10px';
        empty.textContent = 'Nothing matched "' + term + '".';
        resultsBox.appendChild(empty);
        return;
      }

      matches.slice(0, 8).forEach((item) => {
        const node = document.createElement(item.url ? 'a' : 'button');
        node.className = 'settings-result';
        if (item.url) node.href = item.url;
        else node.type = 'button';

        const icon = document.createElement('ion-icon');
        icon.setAttribute('name', item.type === 'group' ? 'folder-outline' : 'options-outline');

        const label = document.createElement('span');
        label.textContent = item.label;

        const group = document.createElement('span');
        group.className = 'group';
        group.textContent = item.type === 'group' ? 'section' : item.group;

        node.append(icon, label, group);

        if (item.element) {
          node.addEventListener('click', () => {
            item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            item.element.classList.add('is-highlighted');
            setTimeout(() => item.element.classList.remove('is-highlighted'), 2200);
            const field = item.element.querySelector('input, textarea, select');
            if (field) setTimeout(() => field.focus(), 400);
          });
        }

        resultsBox.appendChild(node);
      });
    }

    let timer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => render(searchInput.value), 150);
    });
  }

  /* --------------------------------------------------- colour mirror */
  document.querySelectorAll('[data-color-mirror]').forEach((textInput) => {
    const picker = document.getElementById(textInput.dataset.colorMirror);
    if (!picker) return;

    picker.addEventListener('input', () => { textInput.value = picker.value; });
    textInput.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(textInput.value)) picker.value = textInput.value;
    });
  });

  /* -------------------------------------------- theme swatch preview */
  document.querySelectorAll('[data-theme-var]').forEach((input) => {
    const swatch = input.parentElement.querySelector('.theme-swatch');
    if (!swatch) return;

    input.addEventListener('input', () => {
      // Let the browser decide whether the value is a usable colour; an
      // invalid one simply leaves the swatch unchanged.
      const probe = new Option().style;
      probe.background = input.value;
      if (probe.background) swatch.style.background = input.value;
    });
  });

  /* ------------------------------------------------ character counters */
  document.querySelectorAll('[data-counter]').forEach((field) => {
    const ideal = Number.parseInt(field.dataset.counter, 10);

    const counter = document.createElement('p');
    counter.className = 'char-counter';
    field.parentElement.appendChild(counter);

    const update = () => {
      const length = field.value.length;
      counter.textContent = length + ' / ' + ideal + ' recommended';
      counter.classList.toggle('is-over', length > ideal);
    };

    field.addEventListener('input', update);
    update();
  });
}());
