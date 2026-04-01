'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });



// testimonials variables
const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
const modalContainer = document.querySelector("[data-modal-container]");
const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
const overlay = document.querySelector("[data-overlay]");

// modal variable
const modalImg = document.querySelector("[data-modal-img]");
const modalTitle = document.querySelector("[data-modal-title]");
const modalText = document.querySelector("[data-modal-text]");

// modal toggle function
const testimonialsModalFunc = function () {
  modalContainer.classList.toggle("active");
  overlay.classList.toggle("active");
}

// add click event to all modal items
for (let i = 0; i < testimonialsItem.length; i++) {

  testimonialsItem[i].addEventListener("click", function () {

    modalImg.src = this.querySelector("[data-testimonials-avatar]").src;
    modalImg.alt = this.querySelector("[data-testimonials-avatar]").alt;
    modalTitle.innerHTML = this.querySelector("[data-testimonials-title]").innerHTML;
    modalText.innerHTML = this.querySelector("[data-testimonials-text]").innerHTML;

    testimonialsModalFunc();

  });

}

// add click event to modal close button
modalCloseBtn.addEventListener("click", testimonialsModalFunc);
overlay.addEventListener("click", testimonialsModalFunc);



// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

select.addEventListener("click", function () { elementToggleFunc(this); });

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

// add event to all nav link
for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {

    for (let i = 0; i < pages.length; i++) {
      if (this.innerHTML.toLowerCase() === pages[i].dataset.page) {
        pages[i].classList.add("active");
        navigationLinks[i].classList.add("active");
        window.scrollTo(0, 0);
      } else {
        pages[i].classList.remove("active");
        navigationLinks[i].classList.remove("active");
      }
    }

  });
}