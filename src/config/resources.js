'use strict';

/**
 * Declarative resource definitions.
 *
 * Each entry describes a content type completely enough that the generic
 * controller (controllers/resourceController.js) and the shared list/form
 * views can render and persist it without bespoke code.
 *
 * Adding a content type = adding an entry here. No new controller, no new
 * route, no new template.
 *
 * Field types understood by views/admin/resource/form.ejs:
 *   text · textarea · richtext · number · select · checkbox · date
 *   url · email · slug · media · level · tags · color · hidden
 */

const LEVEL_OPTIONS = [
  { value: 1, label: '1 - Familiar' },
  { value: 2, label: '2 - Working knowledge' },
  { value: 3, label: '3 - Competent' },
  { value: 4, label: '4 - Strong' },
  { value: 5, label: '5 - Expert' },
];

const EMPLOYMENT_TYPES = [
  'full-time', 'part-time', 'internship', 'freelance', 'volunteer', 'contract', 'other',
].map((value) => ({ value, label: value.replace(/(^|-)([a-z])/g, (m, p, c) => (p ? ' ' : '') + c.toUpperCase()) }));

/** Shared trailing fields most resources carry. */
const activeAndOrder = [
  { name: 'is_active', label: 'Visible on the site', type: 'checkbox', default: true, group: 'Visibility' },
  { name: 'sort_order', label: 'Display order', type: 'number', omitWhenEmpty: true, group: 'Visibility', hint: 'Lower numbers appear first. Use the arrows on the list to reorder.' },
];

const RESOURCES = {
  // ------------------------------------------------------------ projects
  projects: {
    key: 'projects',
    table: 'projects',
    label: 'Projects',
    singular: 'Project',
    permission: 'manage_projects',
    icon: 'cube-outline',
    softDelete: true,
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['title', 'short_description', 'category_label'],
    filters: [
      { name: 'category_id', label: 'Category', optionsFrom: { table: 'project_categories', value: 'id', label: 'name' } },
      { name: 'status', label: 'Status', options: [{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }] },
    ],
    listColumns: [
      { key: 'featured_media_id', label: '', type: 'thumb' },
      { key: 'title', label: 'Title', primary: true },
      { key: 'category_label', label: 'Category', muted: true },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'is_featured', label: 'Featured', type: 'boolean' },
    ],
    fields: [
      { name: 'title', label: 'Project title', type: 'text', required: true, group: 'Basics', slugSource: true },
      { name: 'slug', label: 'Slug', type: 'slug', required: true, group: 'Basics', hint: 'Used in the URL: /projects/your-slug' },
      { name: 'category_id', label: 'Category', type: 'select', group: 'Basics', optionsFrom: { table: 'project_categories', value: 'id', label: 'name' } },
      {
        name: 'category_label',
        label: 'Card subtitle',
        type: 'text',
        group: 'Basics',
        hint: 'The exact line shown under the project title, e.g. "Applications - Full Stack (Live)".',
      },
      { name: 'short_description', label: 'Short description', type: 'textarea', group: 'Basics', maxLength: 300 },
      { name: 'full_description', label: 'Full description', type: 'richtext', group: 'Basics' },

      { name: 'featured_media_id', label: 'Featured image', type: 'media', group: 'Media' },
      { name: 'image_alt', label: 'Image alt text', type: 'text', group: 'Media', hint: 'Describe the image for screen readers and search engines.' },

      { name: 'primary_url', label: 'Card link', type: 'url', group: 'Links', hint: 'Where the project card links to.' },
      { name: 'github_url', label: 'GitHub URL', type: 'url', group: 'Links' },
      { name: 'live_url', label: 'Live demo URL', type: 'url', group: 'Links' },
      { name: 'docs_url', label: 'Documentation URL', type: 'url', group: 'Links' },
      { name: 'video_url', label: 'Video URL', type: 'url', group: 'Links' },
      { name: 'open_in_new_tab', label: 'Open links in a new tab', type: 'checkbox', default: true, group: 'Links' },

      { name: 'start_date', label: 'Start date', type: 'date', group: 'Details' },
      { name: 'end_date', label: 'End date', type: 'date', group: 'Details' },
      { name: 'client', label: 'Client', type: 'text', group: 'Details' },
      { name: 'role', label: 'My role', type: 'text', group: 'Details' },
      { name: 'team_size', label: 'Team size', type: 'number', group: 'Details' },

      { name: 'status', label: 'Status', type: 'select', group: 'Visibility', default: 'published', options: [{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }] },
      { name: 'is_featured', label: 'Feature this project', type: 'checkbox', group: 'Visibility' },
      { name: 'sort_order', label: 'Display order', type: 'number', omitWhenEmpty: true, group: 'Visibility' },

      { name: 'seo_title', label: 'SEO title', type: 'text', group: 'SEO', maxLength: 200 },
      { name: 'seo_description', label: 'SEO description', type: 'textarea', group: 'SEO', maxLength: 320 },
      { name: 'seo_keywords', label: 'SEO keywords', type: 'text', group: 'SEO' },
      { name: 'og_media_id', label: 'Social share image', type: 'media', group: 'SEO' },
    ],
  },

  // -------------------------------------------------- project categories
  'project-categories': {
    key: 'project-categories',
    table: 'project_categories',
    label: 'Project categories',
    singular: 'Category',
    permission: 'manage_projects',
    icon: 'pricetags-outline',
    parent: 'projects',
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['name'],
    listColumns: [
      { key: 'name', label: 'Name', primary: true },
      { key: 'slug', label: 'Filter value', mono: true },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'name', label: 'Category name', type: 'text', required: true, slugSource: true, group: 'Basics' },
      {
        name: 'slug',
        label: 'Filter value',
        type: 'slug',
        required: true,
        group: 'Basics',
        hint: 'Must match the project filter value used by the front-end, e.g. "web development".',
      },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Basics' },
      ...activeAndOrder,
    ],
  },

  // ---------------------------------------------------------- experience
  experience: {
    key: 'experience',
    table: 'experience',
    label: 'Experience',
    singular: 'Experience entry',
    permission: 'manage_experience',
    icon: 'briefcase-outline',
    softDelete: true,
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['company', 'position', 'description'],
    listColumns: [
      { key: 'position', label: 'Position', primary: true },
      { key: 'company', label: 'Organisation' },
      { key: 'date_label', label: 'Period', muted: true },
      { key: 'is_current', label: 'Current', type: 'boolean' },
    ],
    fields: [
      { name: 'position', label: 'Position', type: 'text', required: true, group: 'Basics' },
      { name: 'company', label: 'Organisation', type: 'text', required: true, group: 'Basics' },
      { name: 'employment_type', label: 'Employment type', type: 'select', group: 'Basics', default: 'other', options: EMPLOYMENT_TYPES },
      { name: 'location', label: 'Location', type: 'text', group: 'Basics' },
      {
        name: 'date_label',
        label: 'Period label',
        type: 'text',
        group: 'Dates',
        hint: 'Shown verbatim on the site, e.g. "Apr 2026 - Present" or "2024".',
      },
      { name: 'start_date', label: 'Start date', type: 'date', group: 'Dates', hint: 'Used for sorting. Optional if the period label is set.' },
      { name: 'end_date', label: 'End date', type: 'date', group: 'Dates' },
      { name: 'is_current', label: 'Currently here', type: 'checkbox', group: 'Dates' },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Details', rows: 5 },
      { name: 'company_url', label: 'Organisation website', type: 'url', group: 'Details' },
      { name: 'company_logo_media_id', label: 'Organisation logo', type: 'media', group: 'Details' },
      ...activeAndOrder,
    ],
  },

  // ----------------------------------------------------------- education
  education: {
    key: 'education',
    table: 'education',
    label: 'Education',
    singular: 'Education entry',
    permission: 'manage_education',
    icon: 'book-outline',
    softDelete: true,
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['institution', 'degree', 'field'],
    listColumns: [
      { key: 'institution', label: 'Institution', primary: true },
      { key: 'degree', label: 'Qualification', muted: true },
      { key: 'date_label', label: 'Period', muted: true },
    ],
    fields: [
      { name: 'institution', label: 'Institution', type: 'text', required: true, group: 'Basics' },
      { name: 'degree', label: 'Qualification', type: 'text', group: 'Basics' },
      { name: 'field', label: 'Field of study', type: 'text', group: 'Basics' },
      { name: 'grade', label: 'Grade / CGPA', type: 'text', group: 'Basics' },
      { name: 'date_label', label: 'Period label', type: 'text', group: 'Dates', hint: 'Shown verbatim, e.g. "2023-2027".' },
      { name: 'start_year', label: 'Start year', type: 'number', group: 'Dates' },
      { name: 'end_year', label: 'End year', type: 'number', group: 'Dates' },
      { name: 'is_current', label: 'Currently studying', type: 'checkbox', group: 'Dates' },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Details', rows: 4 },
      { name: 'location', label: 'Location', type: 'text', group: 'Details' },
      { name: 'website', label: 'Website', type: 'url', group: 'Details' },
      { name: 'logo_media_id', label: 'Institution logo', type: 'media', group: 'Details' },
      ...activeAndOrder,
    ],
  },

  // ------------------------------------------------------------- skills
  skills: {
    key: 'skills',
    table: 'skills',
    label: 'Skills',
    singular: 'Skill',
    permission: 'manage_skills',
    icon: 'bulb-outline',
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['name'],
    filters: [
      { name: 'category_id', label: 'Category', optionsFrom: { table: 'skill_categories', value: 'id', label: 'name' } },
    ],
    listColumns: [
      { key: 'name', label: 'Skill', primary: true },
      { key: 'level', label: 'Level', type: 'level' },
      { key: 'is_featured', label: 'Featured', type: 'boolean' },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'name', label: 'Skill name', type: 'text', required: true, slugSource: true, group: 'Basics' },
      { name: 'slug', label: 'Slug', type: 'slug', required: true, group: 'Basics' },
      { name: 'category_id', label: 'Category', type: 'select', group: 'Basics', optionsFrom: { table: 'skill_categories', value: 'id', label: 'name' } },
      {
        name: 'level',
        label: 'Proficiency',
        type: 'level',
        default: 4,
        group: 'Basics',
        options: LEVEL_OPTIONS,
        hint: 'Renders as the existing 1-5 bar. The site does not use percentages.',
      },
      { name: 'aria_label', label: 'Accessible label', type: 'text', group: 'Basics', hint: 'Read by screen readers, e.g. "Fullstack proficiency level".' },
      { name: 'years_experience', label: 'Years of experience', type: 'number', step: '0.5', group: 'Details' },
      { name: 'icon_name', label: 'Ionicon name', type: 'text', group: 'Details' },
      { name: 'logo_media_id', label: 'Logo', type: 'media', group: 'Details' },
      { name: 'is_featured', label: 'Featured', type: 'checkbox', group: 'Visibility' },
      ...activeAndOrder,
    ],
  },

  'skill-categories': {
    key: 'skill-categories',
    table: 'skill_categories',
    label: 'Skill categories',
    singular: 'Skill category',
    permission: 'manage_skills',
    icon: 'pricetags-outline',
    parent: 'skills',
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['name'],
    listColumns: [
      { key: 'name', label: 'Name', primary: true },
      { key: 'slug', label: 'Slug', mono: true },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'name', label: 'Category name', type: 'text', required: true, slugSource: true, group: 'Basics' },
      { name: 'slug', label: 'Slug', type: 'slug', required: true, group: 'Basics' },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Basics' },
      { name: 'icon_name', label: 'Ionicon name', type: 'text', group: 'Basics' },
      ...activeAndOrder,
    ],
  },

  // ----------------------------------------------------- certifications
  certifications: {
    key: 'certifications',
    table: 'certifications',
    label: 'Certifications',
    singular: 'Certification',
    permission: 'manage_certifications',
    icon: 'ribbon-outline',
    softDelete: true,
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['name', 'issuer', 'description'],
    listColumns: [
      { key: 'name', label: 'Certification', primary: true },
      { key: 'issuer', label: 'Issuer', muted: true },
      { key: 'date_label', label: 'Date', muted: true },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'name', label: 'Certification name', type: 'text', required: true, group: 'Basics' },
      { name: 'issuer', label: 'Issuing organisation', type: 'text', group: 'Basics' },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Basics', rows: 4 },
      { name: 'date_label', label: 'Date label', type: 'text', group: 'Dates', hint: 'Shown verbatim, e.g. "2025" or "NPTEL".' },
      { name: 'issue_date', label: 'Issue date', type: 'date', group: 'Dates' },
      { name: 'expiry_date', label: 'Expiry date', type: 'date', group: 'Dates', hint: 'Leave empty if it does not expire.' },
      { name: 'credential_id', label: 'Credential ID', type: 'text', group: 'Credential' },
      { name: 'credential_url', label: 'Credential URL', type: 'url', group: 'Credential' },
      { name: 'certificate_media_id', label: 'Certificate file', type: 'media', group: 'Credential', accept: 'image,document' },
      { name: 'logo_media_id', label: 'Issuer logo', type: 'media', group: 'Credential' },
      { name: 'is_featured', label: 'Featured', type: 'checkbox', group: 'Visibility' },
      ...activeAndOrder,
    ],
  },

  // ------------------------------------------------------- achievements
  achievements: {
    key: 'achievements',
    table: 'achievements',
    label: 'Achievements',
    singular: 'Achievement',
    permission: 'manage_achievements',
    icon: 'trophy-outline',
    softDelete: true,
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['title', 'organization', 'description'],
    listColumns: [
      { key: 'title', label: 'Achievement', primary: true },
      { key: 'organization', label: 'Organisation', muted: true },
      { key: 'date_label', label: 'Date', muted: true },
      { key: 'is_featured', label: 'Featured', type: 'boolean' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, group: 'Basics' },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Basics', rows: 4 },
      { name: 'organization', label: 'Organisation', type: 'text', group: 'Basics' },
      { name: 'category', label: 'Category', type: 'text', group: 'Basics', hint: 'e.g. Hackathon, Competition, Recognition.' },
      { name: 'date_label', label: 'Date label', type: 'text', group: 'Dates', hint: 'Shown verbatim, e.g. "Mar 2026".' },
      { name: 'achieved_on', label: 'Date achieved', type: 'date', group: 'Dates' },
      { name: 'external_url', label: 'External link', type: 'url', group: 'Media' },
      { name: 'image_media_id', label: 'Image', type: 'media', group: 'Media' },
      { name: 'certificate_media_id', label: 'Certificate', type: 'media', group: 'Media', accept: 'image,document' },
      { name: 'is_featured', label: 'Featured', type: 'checkbox', group: 'Visibility' },
      ...activeAndOrder,
    ],
  },

  // ----------------------------------------------------------- services
  services: {
    key: 'services',
    table: 'services',
    label: 'Services',
    singular: 'Service',
    permission: 'manage_services',
    icon: 'construct-outline',
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['title', 'description'],
    listColumns: [
      { key: 'title', label: 'Service', primary: true },
      { key: 'icon_name', label: 'Icon', muted: true, mono: true },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'title', label: 'Service title', type: 'text', required: true, group: 'Basics' },
      { name: 'description', label: 'Description', type: 'textarea', group: 'Basics', rows: 4 },
      {
        name: 'icon_type',
        label: 'Icon source',
        type: 'select',
        default: 'ionicon',
        group: 'Icon',
        options: [{ value: 'ionicon', label: 'Ionicon (icon name)' }, { value: 'image', label: 'Uploaded image' }],
      },
      { name: 'icon_name', label: 'Ionicon name', type: 'text', group: 'Icon', hint: 'e.g. cloud-upload-outline, lock-closed-outline.' },
      { name: 'icon_media_id', label: 'Icon image', type: 'media', group: 'Icon' },
      { name: 'icon_alt', label: 'Icon alt text', type: 'text', group: 'Icon' },
      { name: 'features', label: 'Features', type: 'tags', group: 'Details', hint: 'One per line.' },
      { name: 'starting_price', label: 'Starting price', type: 'text', group: 'Details' },
      { name: 'cta_label', label: 'Call-to-action label', type: 'text', group: 'Details' },
      { name: 'cta_url', label: 'Call-to-action URL', type: 'url', group: 'Details' },
      ...activeAndOrder,
    ],
  },

  // ------------------------------------------------------- social links
  'social-links': {
    key: 'social-links',
    table: 'social_links',
    label: 'Social links',
    singular: 'Social link',
    permission: 'manage_social',
    icon: 'share-social-outline',
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['platform', 'url', 'username'],
    listColumns: [
      { key: 'platform', label: 'Platform', primary: true },
      { key: 'url', label: 'URL', muted: true, truncate: 46 },
      { key: 'icon_name', label: 'Icon', mono: true, muted: true },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'platform', label: 'Platform', type: 'text', required: true, group: 'Basics', hint: 'e.g. LinkedIn, GitHub, WhatsApp.' },
      { name: 'url', label: 'URL', type: 'url', required: true, group: 'Basics' },
      { name: 'icon_name', label: 'Ionicon name', type: 'text', group: 'Basics', hint: 'e.g. logo-linkedin, logo-github.' },
      { name: 'username', label: 'Username / handle', type: 'text', group: 'Basics' },
      { name: 'label', label: 'Accessible label', type: 'text', group: 'Basics' },
      { name: 'show_in_sidebar', label: 'Show in the sidebar', type: 'checkbox', default: true, group: 'Placement' },
      { name: 'show_in_footer', label: 'Show in the footer', type: 'checkbox', group: 'Placement' },
      { name: 'open_in_new_tab', label: 'Open in a new tab', type: 'checkbox', default: true, group: 'Placement' },
      {
        name: 'include_in_jsonld',
        label: 'Include in structured data',
        type: 'checkbox',
        default: true,
        group: 'Placement',
        hint: 'Adds this profile to the schema.org sameAs list, which helps search engines connect your profiles.',
      },
      ...activeAndOrder,
    ],
  },

  // --------------------------------------------------------- navigation
  navigation: {
    key: 'navigation',
    table: 'navigation',
    label: 'Navigation',
    singular: 'Menu item',
    permission: 'manage_navigation',
    icon: 'menu-outline',
    defaultOrder: 'sort_order ASC, id ASC',
    searchColumns: ['label', 'url'],
    listColumns: [
      { key: 'label', label: 'Label', primary: true },
      { key: 'target_page', label: 'Page', mono: true, muted: true },
      { key: 'link_type', label: 'Type', muted: true },
      { key: 'is_active', label: 'Active', type: 'boolean' },
    ],
    fields: [
      { name: 'label', label: 'Menu label', type: 'text', required: true, group: 'Basics' },
      {
        name: 'link_type',
        label: 'Link type',
        type: 'select',
        default: 'page',
        group: 'Basics',
        options: [
          { value: 'page', label: 'Portfolio tab' },
          { value: 'internal', label: 'Internal URL' },
          { value: 'external', label: 'External URL' },
        ],
      },
      {
        name: 'target_page',
        label: 'Portfolio tab',
        type: 'select',
        group: 'Basics',
        options: [
          { value: 'about', label: 'About' },
          { value: 'resume', label: 'Resume' },
          { value: 'projects', label: 'Projects' },
          { value: 'blog', label: 'Blog' },
          { value: 'contact', label: 'Contact' },
        ],
        hint: 'Used when the link type is "Portfolio tab".',
      },
      { name: 'url', label: 'URL', type: 'text', group: 'Basics', hint: 'Used for internal or external links.' },
      { name: 'icon_name', label: 'Ionicon name', type: 'text', group: 'Basics' },
      { name: 'open_in_new_tab', label: 'Open in a new tab', type: 'checkbox', group: 'Placement' },
      ...activeAndOrder,
    ],
  },
};

/** @returns {object} the resource descriptor, or undefined */
function getResource(key) {
  return RESOURCES[key];
}

function listResources() {
  return Object.values(RESOURCES);
}

/** Column names a resource may write, derived from its field list. */
function fillableFor(resource) {
  return resource.fields.map((field) => field.name);
}

/**
 * Every column the generic repository is allowed to read, filter or sort.
 * Field names plus the housekeeping columns every table has.
 */
function columnsFor(resource) {
  const base = ['id', 'created_at', 'updated_at'];
  if (resource.softDelete) base.push('deleted_at');
  return [...new Set([...base, ...fillableFor(resource)])];
}

module.exports = { RESOURCES, getResource, listResources, fillableFor, columnsFor, LEVEL_OPTIONS };
