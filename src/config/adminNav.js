'use strict';

/**
 * Admin navigation definition.
 *
 * Single source of truth for the sidebar, the global search index and
 * the settings search. `ready: false` marks a section whose route is not
 * built yet - it renders greyed out with a phase badge rather than as a
 * dead link, so the panel never lies about what works.
 *
 * As each phase lands, flip `ready` to true.
 */

const NAV = [
  {
    group: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'grid-outline', ready: true },
      { key: 'analytics', label: 'Analytics', path: '/analytics', icon: 'bar-chart-outline', permission: 'manage_analytics', ready: true },
      { key: 'notifications', label: 'Notifications', path: '/notifications', icon: 'notifications-outline', ready: true },
    ],
  },
  {
    group: 'Content',
    items: [
      { key: 'profile', label: 'Profile', path: '/profile', icon: 'person-outline', permission: 'manage_profile', ready: true },
      { key: 'projects', label: 'Projects', path: '/projects', icon: 'cube-outline', permission: 'manage_projects', ready: true },
      { key: 'experience', label: 'Experience', path: '/experience', icon: 'briefcase-outline', permission: 'manage_experience', ready: true },
      { key: 'education', label: 'Education', path: '/education', icon: 'book-outline', permission: 'manage_education', ready: true },
      { key: 'skills', label: 'Skills', path: '/skills', icon: 'bulb-outline', permission: 'manage_skills', ready: true },
      { key: 'certifications', label: 'Certifications', path: '/certifications', icon: 'ribbon-outline', permission: 'manage_certifications', ready: true },
      { key: 'achievements', label: 'Achievements', path: '/achievements', icon: 'trophy-outline', permission: 'manage_achievements', ready: true },
      { key: 'services', label: 'Services', path: '/services', icon: 'construct-outline', permission: 'manage_services', ready: true },
      { key: 'blog', label: 'Blog', path: '/blog', icon: 'document-text-outline', permission: 'manage_blog', ready: true },
    ],
  },
  {
    group: 'Site',
    items: [
      { key: 'media', label: 'Media library', path: '/media', icon: 'images-outline', permission: 'manage_media', ready: true },
      { key: 'navigation', label: 'Navigation', path: '/navigation', icon: 'menu-outline', permission: 'manage_navigation', ready: true },
      { key: 'social-links', label: 'Social links', path: '/social-links', icon: 'share-social-outline', permission: 'manage_social', ready: true },
      { key: 'sections', label: 'Page sections', path: '/sections', icon: 'layers-outline', permission: 'manage_sections', ready: true },
      { key: 'resume', label: 'Resume', path: '/resume', icon: 'document-attach-outline', permission: 'manage_profile', ready: true },
      { key: 'theme', label: 'Theme', path: '/theme', icon: 'color-palette-outline', permission: 'manage_theme', ready: true },
      { key: 'seo', label: 'SEO', path: '/seo', icon: 'search-outline', permission: 'manage_seo', ready: true },
      { key: 'settings', label: 'Settings', path: '/settings', icon: 'settings-outline', permission: 'manage_settings', ready: true },
      { key: 'redirects', label: 'Redirects', path: '/redirects', icon: 'git-branch-outline', permission: 'manage_redirects', ready: true },
    ],
  },
  {
    group: 'Inbox',
    items: [
      { key: 'messages', label: 'Messages', path: '/messages', icon: 'mail-outline', permission: 'view_messages', ready: true, badge: 'messages_unread' },
      { key: 'subscribers', label: 'Subscribers', path: '/subscribers', icon: 'people-outline', permission: 'manage_subscribers', ready: true },
    ],
  },
  {
    group: 'Operations',
    items: [
      { key: 'domain', label: 'Domains & SSL', path: '/domain', icon: 'globe-outline', permission: 'manage_domains', ready: true },
      { key: 'backups', label: 'Backups', path: '/backups', icon: 'save-outline', permission: 'manage_backups', ready: true },
      { key: 'system', label: 'System health', path: '/system', icon: 'pulse-outline', permission: 'manage_settings', ready: true },
      { key: 'activity-logs', label: 'Activity logs', path: '/activity-logs', icon: 'list-outline', permission: 'view_activity_logs', ready: true },
    ],
  },
  {
    group: 'Security',
    items: [
      { key: 'users', label: 'Users & roles', path: '/users', icon: 'shield-outline', permission: 'manage_users', ready: true },
      { key: 'security', label: 'Security', path: '/security', icon: 'lock-closed-outline', permission: 'manage_security', ready: true },
      { key: 'custom-code', label: 'Custom code', path: '/custom-code', icon: 'code-slash-outline', permission: 'manage_custom_code', ready: true, danger: true },
    ],
  },
];

/**
 * Navigation filtered to what this user may see.
 * @param {(permission: string) => boolean} can
 */
function visibleNav(can) {
  return NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Flat list for the global search box. */
function searchableItems() {
  return NAV.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.group })));
}

module.exports = { NAV, visibleNav, searchableItems };
