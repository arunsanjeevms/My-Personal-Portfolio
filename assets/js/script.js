'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
if (sidebarBtn) sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });



// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

if (select) select.addEventListener("click", function () { elementToggleFunc(this); });

// add event in all select items
for (let i = 0; i < selectItems.length; i++) {
  selectItems[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    elementToggleFunc(select);
    filterFunc(selectedValue);

  });
}

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterFunc = function (selectedValue) {

  for (let i = 0; i < filterItems.length; i++) {

    if (selectedValue === "all") {
      filterItems[i].classList.add("active");
    } else if (selectedValue === filterItems[i].dataset.category) {
      filterItems[i].classList.add("active");
    } else {
      filterItems[i].classList.remove("active");
    }

  }

}

// add event in all filter button items for large screen
let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {

  filterBtn[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;

  });

}



// contact form variables
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");

// add event to all form input field
for (let i = 0; i < formInputs.length; i++) {
  formInputs[i].addEventListener("input", function () {

    // check form validation
    if (!form) return;

    if (form.checkValidity()) {
      formBtn.removeAttribute("disabled");
    } else {
      formBtn.setAttribute("disabled", "");
    }

  });
}



// dynamic medium blog variables
const blogPostsList = document.querySelector("[data-blog-posts-list]");
const mediumProfileUrl = "https://medium.com/@msarunsanjeev";
const mediumFeedUrl = "https://medium.com/feed/@msarunsanjeev";
const mediumFeedApiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(mediumFeedUrl)}`;

const getPlainTextFromHtml = function (htmlContent) {
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = htmlContent || "";
  return tempContainer.textContent.replace(/\s+/g, " ").trim();
}

const getMediumPostImage = function (post) {
  if (post.thumbnail) return post.thumbnail;

  const imageMatch = (post.description || post.content || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imageMatch && imageMatch[1]) return imageMatch[1];

  return "./assets/images/blog-1.jpg";
}

const formatMediumDate = function (dateValue) {
  if (!dateValue) return "";

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "";

  return parsedDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

const createBlogCard = function (post, isLatest = false) {
  const postItem = document.createElement("li");
  postItem.className = "blog-post-item";

  const postLink = document.createElement("a");
  postLink.href = post.link || mediumProfileUrl;
  postLink.target = "_blank";
  postLink.rel = "noopener noreferrer";

  const bannerBox = document.createElement("figure");
  bannerBox.className = "blog-banner-box";

  const bannerImage = document.createElement("img");
  bannerImage.src = getMediumPostImage(post);
  bannerImage.alt = post.title || "Medium post";
  bannerImage.loading = "lazy";
  bannerBox.appendChild(bannerImage);

  const contentBox = document.createElement("div");
  contentBox.className = "blog-content";

  const metaRow = document.createElement("div");
  metaRow.className = "blog-meta";

  const category = document.createElement("p");
  category.className = "blog-category";
  category.textContent = "Medium";

  metaRow.appendChild(category);

  if (isLatest) {
    const latestBadge = document.createElement("span");
    latestBadge.className = "blog-badge";
    latestBadge.textContent = "Latest";
    metaRow.appendChild(latestBadge);
  }

  const formattedDate = formatMediumDate(post.pubDate);
  if (formattedDate) {
    const dot = document.createElement("span");
    dot.className = "dot";

    const publishDate = document.createElement("time");
    publishDate.dateTime = post.pubDate || "";
    publishDate.textContent = formattedDate;

    metaRow.append(dot, publishDate);
  }

  const title = document.createElement("h3");
  title.className = "h3 blog-item-title";
  title.textContent = post.title || "Read on Medium";

  const excerpt = document.createElement("p");
  excerpt.className = "blog-text";
  const excerptText = getPlainTextFromHtml(post.description || post.content || "");
  excerpt.textContent = excerptText.length > 170
    ? `${excerptText.slice(0, 167)}...`
    : (excerptText || "Open this article on Medium to read more.");

  contentBox.append(title, excerpt, metaRow);
  postLink.append(bannerBox, contentBox);
  postItem.appendChild(postLink);

  return postItem;
}

const renderBlogFallback = function () {
  if (!blogPostsList) return;

  blogPostsList.innerHTML = "";
  blogPostsList.appendChild(createBlogCard({
    title: "See all latest posts on Medium",
    link: mediumProfileUrl,
    pubDate: "",
    thumbnail: "./assets/images/blog-2.jpg",
    description: "Automatic sync is temporarily unavailable. Open my Medium profile to view every new article."
  }));
}

const loadMediumPosts = async function () {
  if (!blogPostsList) return;

  try {
    const response = await fetch(mediumFeedApiUrl);
    if (!response.ok) throw new Error("Unable to fetch Medium feed");

    const feedData = await response.json();
    const posts = Array.isArray(feedData.items) ? feedData.items.slice(0, 6) : [];

    if (!posts.length) {
      renderBlogFallback();
      return;
    }

    blogPostsList.innerHTML = "";
    for (let i = 0; i < posts.length; i++) {
      blogPostsList.appendChild(createBlogCard(posts[i], i === 0));
    }
  } catch (error) {
    console.error("Medium sync error:", error);
    renderBlogFallback();
  }
}

loadMediumPosts();


// mobile marquee for "What i'm Pursuing" service cards
const setupMobileServiceMarquee = function () {
  const serviceList = document.querySelector(".about .service-list");
  if (!serviceList) return;

  const mobileQuery = window.matchMedia("(max-width: 768px)");

  const removeMarqueeClones = function () {
    const clones = serviceList.querySelectorAll(".service-item[data-marquee-clone='true']");
    for (let i = 0; i < clones.length; i++) {
      clones[i].remove();
    }

    serviceList.dataset.marqueeCloned = "false";
  }

  const applyMarqueeState = function () {
    if (mobileQuery.matches) {
      if (serviceList.dataset.marqueeCloned !== "true") {
        const originalItems = serviceList.querySelectorAll(".service-item:not([data-marquee-clone='true'])");

        for (let i = 0; i < originalItems.length; i++) {
          const clone = originalItems[i].cloneNode(true);
          clone.dataset.marqueeClone = "true";
          clone.setAttribute("aria-hidden", "true");
          serviceList.appendChild(clone);
        }

        serviceList.dataset.marqueeCloned = "true";
      }

      serviceList.classList.add("service-marquee-active");
      return;
    }

    serviceList.classList.remove("service-marquee-active");
    removeMarqueeClones();
  }

  applyMarqueeState();

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", applyMarqueeState);
  } else {
    mobileQuery.addListener(applyMarqueeState);
  }
}

setupMobileServiceMarquee();



// lazy text reveal for resume, projects and blog
const setupLazyReveal = function (pageSelector, targetSelector, watchDynamic = false) {
  const page = document.querySelector(pageSelector);
  if (!page) return;

  let observer = null;

  const bindRevealTargets = function () {
    const revealTargets = page.querySelectorAll(targetSelector);

    for (let i = 0; i < revealTargets.length; i++) {
      const target = revealTargets[i];

      if (target.dataset.revealInit === "true") continue;

      target.dataset.revealInit = "true";
      target.classList.add("scroll-reveal");
      target.style.setProperty("--reveal-delay", `${(i % 4) * 0.06}s`);

      if (observer) {
        observer.observe(target);
      }
    }
  }

  const revealVisibleTargets = function () {
    if (!page.classList.contains("active")) return;

    const revealTargets = page.querySelectorAll(".scroll-reveal");

    for (let i = 0; i < revealTargets.length; i++) {
      if (revealTargets[i].classList.contains("is-visible")) continue;

      const itemRect = revealTargets[i].getBoundingClientRect();
      if (itemRect.top <= window.innerHeight * 0.9) {
        revealTargets[i].classList.add("is-visible");
      }
    }
  }

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(function (entries, observerInstance) {
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting && page.classList.contains("active")) {
          entries[i].target.classList.add("is-visible");
          observerInstance.unobserve(entries[i].target);
        }
      }
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px"
    });
  }

  const pageObserver = new MutationObserver(function () {
    requestAnimationFrame(function () {
      bindRevealTargets();
      revealVisibleTargets();
    });
  });

  pageObserver.observe(page, {
    attributes: true,
    attributeFilter: ["class"],
    childList: watchDynamic,
    subtree: watchDynamic
  });

  window.addEventListener("scroll", revealVisibleTargets, { passive: true });
  window.addEventListener("resize", revealVisibleTargets);

  bindRevealTargets();
  revealVisibleTargets();
}

setupLazyReveal(".resume[data-page='resume']", ".timeline-item, .skills-title, .skills-item");
setupLazyReveal(".projects[data-page='projects']", ".project-item.active", true);
setupLazyReveal(".blog[data-page='blog']", ".blog-post-item", true);



// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

// activate one top-level page and sync the navbar state
const showPage = function (pageName) {
  let matched = false;

  for (let i = 0; i < pages.length; i++) {
    const isTarget = pages[i].dataset.page === pageName;
    pages[i].classList.toggle("active", isTarget);
    if (isTarget) matched = true;
  }

  if (!matched) return false;

  for (let i = 0; i < navigationLinks.length; i++) {
    const isTarget = navigationLinks[i].textContent.trim().toLowerCase() === pageName;
    navigationLinks[i].classList.toggle("active", isTarget);

    if (isTarget) {
      navigationLinks[i].setAttribute("aria-current", "page");
    } else {
      navigationLinks[i].removeAttribute("aria-current");
    }
  }

  return true;
}

// resolve a fragment to either a page ("projects") or a section inside one ("certifications")
const openTarget = function (targetId) {
  if (!targetId) return false;

  if (showPage(targetId)) {
    window.scrollTo(0, 0);
    return true;
  }

  const section = document.getElementById(targetId);
  if (!section) return false;

  const parentPage = section.closest("[data-page]");
  if (parentPage) showPage(parentPage.dataset.page);

  requestAnimationFrame(function () { section.scrollIntoView({ block: "start" }); });

  return true;
}

const updateHash = function (targetId) {
  if (window.history && typeof history.pushState === "function") {
    history.pushState(null, "", "#" + targetId);
  } else {
    window.location.hash = targetId;
  }
}

// add event to all nav link
for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function (event) {
    const pageName = this.textContent.trim().toLowerCase();
    if (!showPage(pageName)) return;

    event.preventDefault();
    window.scrollTo(0, 0);
    updateHash(pageName);
  });
}

// in-page links (About -> Projects, Experience, Certifications, ...)
const inPageLinks = document.querySelectorAll("a[href^='#']:not([data-nav-link])");

for (let i = 0; i < inPageLinks.length; i++) {
  inPageLinks[i].addEventListener("click", function (event) {
    const targetId = (this.getAttribute("href") || "").slice(1);
    if (!targetId) return;

    if (openTarget(targetId)) {
      event.preventDefault();
      updateHash(targetId);
    }
  });
}

// deep links such as https://arunsanjeev.dev/#projects
const openFromHash = function () {
  const targetId = decodeURIComponent(window.location.hash.replace("#", "")).trim();
  if (targetId) openTarget(targetId);
}

window.addEventListener("hashchange", openFromHash);
window.addEventListener("popstate", openFromHash);

openFromHash();