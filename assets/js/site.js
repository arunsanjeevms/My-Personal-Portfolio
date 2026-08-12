'use strict';

/**
 * Front-end behaviour for the CMS-rendered portfolio.
 *
 * This is the original assets/js/script.js with four changes required by
 * database-driven content. The original file is left untouched because
 * the static fallback snapshot (index.html) still uses it.
 *
 *   1. Navigation now matches on an explicit data-nav-target attribute
 *      instead of comparing the button's visible text to data-page, and
 *      indexes the nav links correctly. The original loop used the pages
 *      counter to index navigationLinks, which only worked while there
 *      were exactly five links in the same order as the five panels -
 *      renaming or adding a menu item from the admin would have broken it.
 *
 *   2. Tab switches update the address bar with history.pushState, so
 *      /resume and /projects are real, shareable URLs.
 *
 *   3. The Medium fetch is gone. Posts are synced server-side and
 *      rendered into the page, so there is no third-party request at
 *      page load and no "Loading latest blog posts..." flash.
 *
 *   4. The testimonials modal code is gone (no testimonial items exist),
 *      and the contact form's validation selector is fixed - the original
 *      queried [data-form], which no element had, so it threw a
 *      TypeError on every keystroke in the contact form.
 *
 * The sidebar toggle, project filter, service marquee and scroll-reveal
 * behaviour are unchanged.
 */

const elementToggleFunc = function (elem) { elem.classList.toggle('active'); };

/* -------------------------------------------------------------- sidebar */

const sidebar = document.querySelector('[data-sidebar]');
const sidebarBtn = document.querySelector('[data-sidebar-btn]');

if (sidebar && sidebarBtn) {
  sidebarBtn.addEventListener('click', function () { elementToggleFunc(sidebar); });
}

/* ------------------------------------------------------- project filter */

const select = document.querySelector('[data-select]');
const selectItems = document.querySelectorAll('[data-select-item]');
const selectValue = document.querySelector('[data-selecct-value]');
const filterBtn = document.querySelectorAll('[data-filter-btn]');
const filterItems = document.querySelectorAll('[data-filter-item]');

const filterFunc = function (selectedValue) {
  for (let i = 0; i < filterItems.length; i += 1) {
    if (selectedValue === 'all') {
      filterItems[i].classList.add('active');
    } else if (selectedValue === filterItems[i].dataset.category) {
      filterItems[i].classList.add('active');
    } else {
      filterItems[i].classList.remove('active');
    }
  }
};

if (select) {
  select.addEventListener('click', function () { elementToggleFunc(this); });
}

for (let i = 0; i < selectItems.length; i += 1) {
  selectItems[i].addEventListener('click', function () {
    const selectedValue = this.innerText.toLowerCase();
    if (selectValue) selectValue.innerText = this.innerText;
    elementToggleFunc(select);
    filterFunc(selectedValue);
  });
}

let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i += 1) {
  filterBtn[i].addEventListener('click', function () {
    const selectedValue = this.innerText.toLowerCase();
    if (selectValue) selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    if (lastClickedBtn) lastClickedBtn.classList.remove('active');
    this.classList.add('active');
    lastClickedBtn = this;
  });
}

/* --------------------------------------------------------- contact form */

// The original selected [data-form], which matched nothing, so `form` was
// null and form.checkValidity() threw on every input event.
const form = document.querySelector('#contact-form');
const formInputs = document.querySelectorAll('[data-form-input]');
const formBtn = document.querySelector('[data-form-btn]');

if (form && formBtn) {
  const syncSubmitState = function () {
    if (form.checkValidity()) formBtn.removeAttribute('disabled');
    else formBtn.setAttribute('disabled', '');
  };

  for (let i = 0; i < formInputs.length; i += 1) {
    formInputs[i].addEventListener('input', syncSubmitState);
  }

  syncSubmitState();
}

/* ---------------------------------------------- mobile service marquee */

const setupMobileServiceMarquee = function () {
  const serviceList = document.querySelector('.about .service-list');
  if (!serviceList) return;

  const mobileQuery = window.matchMedia('(max-width: 768px)');

  const removeMarqueeClones = function () {
    const clones = serviceList.querySelectorAll(".service-item[data-marquee-clone='true']");
    for (let i = 0; i < clones.length; i += 1) clones[i].remove();
    serviceList.dataset.marqueeCloned = 'false';
  };

  const applyMarqueeState = function () {
    if (mobileQuery.matches) {
      if (serviceList.dataset.marqueeCloned !== 'true') {
        const originalItems = serviceList.querySelectorAll(".service-item:not([data-marquee-clone='true'])");

        for (let i = 0; i < originalItems.length; i += 1) {
          const clone = originalItems[i].cloneNode(true);
          clone.dataset.marqueeClone = 'true';
          clone.setAttribute('aria-hidden', 'true');
          serviceList.appendChild(clone);
        }

        serviceList.dataset.marqueeCloned = 'true';
      }

      serviceList.classList.add('service-marquee-active');
      return;
    }

    serviceList.classList.remove('service-marquee-active');
    removeMarqueeClones();
  };

  applyMarqueeState();

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', applyMarqueeState);
  } else {
    mobileQuery.addListener(applyMarqueeState);
  }
};

setupMobileServiceMarquee();

/* ------------------------------------------------------- scroll reveal */

const setupLazyReveal = function (pageSelector, targetSelector, watchDynamic = false) {
  const page = document.querySelector(pageSelector);
  if (!page) return;

  let observer = null;

  const bindRevealTargets = function () {
    const revealTargets = page.querySelectorAll(targetSelector);

    for (let i = 0; i < revealTargets.length; i += 1) {
      const target = revealTargets[i];
      if (target.dataset.revealInit === 'true') continue;

      target.dataset.revealInit = 'true';
      target.classList.add('scroll-reveal');
      target.style.setProperty('--reveal-delay', `${(i % 4) * 0.06}s`);

      if (observer) observer.observe(target);
    }
  };

  const revealVisibleTargets = function () {
    if (!page.classList.contains('active')) return;

    const revealTargets = page.querySelectorAll('.scroll-reveal');

    for (let i = 0; i < revealTargets.length; i += 1) {
      if (revealTargets[i].classList.contains('is-visible')) continue;

      const itemRect = revealTargets[i].getBoundingClientRect();
      if (itemRect.top <= window.innerHeight * 0.9) {
        revealTargets[i].classList.add('is-visible');
      }
    }
  };

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries, observerInstance) {
      for (let i = 0; i < entries.length; i += 1) {
        if (entries[i].isIntersecting && page.classList.contains('active')) {
          entries[i].target.classList.add('is-visible');
          observerInstance.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  }

  const pageObserver = new MutationObserver(function () {
    requestAnimationFrame(function () {
      bindRevealTargets();
      revealVisibleTargets();
    });
  });

  pageObserver.observe(page, {
    attributes: true,
    attributeFilter: ['class'],
    childList: watchDynamic,
    subtree: watchDynamic,
  });

  window.addEventListener('scroll', revealVisibleTargets, { passive: true });
  window.addEventListener('resize', revealVisibleTargets);

  bindRevealTargets();
  revealVisibleTargets();
};

setupLazyReveal(".resume[data-page='resume']", '.timeline-item, .skills-title, .skills-item');
setupLazyReveal(".projects[data-page='projects']", '.project-item.active', true);
setupLazyReveal(".blog[data-page='blog']", '.blog-post-item', true);

/* ----------------------------------------------------------- navigation */

const navigationLinks = document.querySelectorAll('[data-nav-link]');
const pages = document.querySelectorAll('[data-page]');

/**
 * Activates a tab by its data-page key.
 * @param {string} targetPage
 * @param {boolean} updateHistory push a new history entry for this tab
 */
const activatePage = function (targetPage, updateHistory) {
  let matched = false;

  for (let i = 0; i < pages.length; i += 1) {
    const isTarget = pages[i].dataset.page === targetPage;
    pages[i].classList.toggle('active', isTarget);
    if (isTarget) matched = true;
  }

  if (!matched) return false;

  // Nav links are toggled in their own loop, indexed by themselves - the
  // original code indexed this array with the pages counter.
  for (let i = 0; i < navigationLinks.length; i += 1) {
    navigationLinks[i].classList.toggle('active', navigationLinks[i].dataset.navTarget === targetPage);
  }

  if (updateHistory) {
    const link = document.querySelector(`[data-nav-link][data-nav-target="${targetPage}"]`);
    const url = link ? link.dataset.navUrl : null;
    if (url && window.location.pathname !== url) {
      window.history.pushState({ page: targetPage }, '', url);
    }
  }

  window.scrollTo(0, 0);
  return true;
};

for (let i = 0; i < navigationLinks.length; i += 1) {
  navigationLinks[i].addEventListener('click', function () {
    activatePage(this.dataset.navTarget, true);
  });
}

// Back and forward buttons move between tabs.
window.addEventListener('popstate', function (event) {
  const targetPage = (event.state && event.state.page)
    || (document.querySelector(`[data-nav-link][data-nav-url="${window.location.pathname}"]`) || {}).dataset?.navTarget;

  if (targetPage) activatePage(targetPage, false);
});

/* ------------------------------------------------- lazy CSRF token */

/**
 * The contact form sits in the DOM of every page. Rendering its CSRF
 * token server-side on all of them would create a session for every
 * anonymous visitor and make every response unique, which defeats HTTP
 * caching. Instead the token is fetched the first time someone actually
 * interacts with the form.
 *
 * On /contact the token is already present and this does nothing.
 */
const lazyCsrfForm = document.querySelector('form[data-csrf-lazy]');

if (lazyCsrfForm) {
  let tokenRequested = false;

  const fetchToken = async function () {
    if (tokenRequested) return;
    tokenRequested = true;

    try {
      const response = await fetch('/api/csrf', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not prepare the form');

      const data = await response.json();
      lazyCsrfForm.querySelector('input[name="_csrf"]').value = data.token;
      lazyCsrfForm.removeAttribute('data-csrf-lazy');
    } catch (error) {
      tokenRequested = false;   // allow a retry on the next interaction
      console.error('contact form:', error.message);
    }
  };

  // Any sign of intent is enough to prepare the form.
  lazyCsrfForm.addEventListener('focusin', fetchToken, { once: false });
  lazyCsrfForm.addEventListener('input', fetchToken, { once: false });
}
