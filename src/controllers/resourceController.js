'use strict';

/**
 * Generic CRUD controller.
 *
 * One instance per declared resource. Every handler is permission-guarded
 * by the router, writes an audit record, and invalidates the public cache
 * so a content change appears on the site immediately.
 */

const resourceRepository = require('../repositories/resourceRepository');
const resourceService = require('../services/resourceService');
const activityService = require('../services/activityService');
const cache = require('../utils/cache');
const { asyncHandler, NotFoundError, ValidationError } = require('../utils/errors');
const { getResource } = require('../config/resources');

/** Public page caches are keyed "public:*"; any content write drops them. */
function invalidatePublicCache() {
  cache.invalidatePrefix('public:');
}

/** Human-readable label for a row, used in flash messages and the log. */
function titleOf(resource, row) {
  if (!row) return '';
  const candidates = ['title', 'name', 'label', 'position', 'institution', 'platform'];
  for (const key of candidates) if (row[key]) return String(row[key]);
  return `#${row.id}`;
}

function buildController(resourceKey) {
  const resource = getResource(resourceKey);
  if (!resource) throw new Error(`Unknown resource: ${resourceKey}`);

  const repository = resourceRepository.forResource(resourceKey);
  const basePath = (res) => `${res.locals.adminPath}/${resource.key}`;

  /** GET /admin/:resource */
  const index = asyncHandler(async (req, res) => {
    const filters = {};
    for (const filter of resource.filters || []) filters[filter.name] = req.query[filter.name];

    const [result, selectOptions] = await Promise.all([
      resourceRepository.search(resource, {
        page: req.query.page,
        perPage: req.query.perPage || 25,
        q: req.query.q || '',
        filters,
      }),
      resourceRepository.loadSelectOptions(resource),
    ]);

    res.render('admin/resource/list', {
      title: resource.label,
      activeNav: resource.parent || resource.key,
      breadcrumbs: [
        { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
        ...(resource.parent
          ? [{ label: getResource(resource.parent).label, url: `${res.locals.adminPath}/${resource.parent}` }]
          : []),
        { label: resource.label },
      ],
      resource,
      result,
      selectOptions,
      searchTerm: req.query.q || '',
      activeFilters: filters,
    });
  });

  /** GET /admin/:resource/new */
  const create = asyncHandler(async (req, res) => {
    const selectOptions = await resourceRepository.loadSelectOptions(resource);
    const values = resourceService.defaultValues(resource);
    values.sort_order = await repository.nextSortOrder().catch(() => 0);

    res.render('admin/resource/form', {
      title: `New ${resource.singular.toLowerCase()}`,
      activeNav: resource.parent || resource.key,
      breadcrumbs: [
        { label: resource.label, url: basePath(res) },
        { label: `New ${resource.singular.toLowerCase()}` },
      ],
      resource,
      groups: resourceService.groupFields(resource),
      values,
      formErrors: {},
      selectOptions,
      isEdit: false,
      row: null,
    });
  });

  /** POST /admin/:resource */
  const store = asyncHandler(async (req, res) => {
    const { values, errors } = await resourceService.buildPayload(resource, req.body);

    if (Object.keys(errors).length) {
      const selectOptions = await resourceRepository.loadSelectOptions(resource);
      return res.status(400).render('admin/resource/form', {
        title: `New ${resource.singular.toLowerCase()}`,
        activeNav: resource.parent || resource.key,
        breadcrumbs: [{ label: resource.label, url: basePath(res) }, { label: `New ${resource.singular.toLowerCase()}` }],
        resource,
        groups: resourceService.groupFields(resource),
        values: { ...values, ...req.body },
        formErrors: errors,
        selectOptions,
        isEdit: false,
        row: null,
      });
    }

    const id = await repository.create(values);
    const row = await repository.findById(id);

    await activityService.record({
      req,
      action: `${resource.key}.create`,
      entity: resource.key,
      entityId: id,
      description: `Created ${resource.singular.toLowerCase()} "${titleOf(resource, row)}"`,
      after: row,
    });

    invalidatePublicCache();
    req.flash('success', `${resource.singular} created.`);
    return res.redirect(basePath(res));
  });

  /** GET /admin/:resource/:id/edit */
  const edit = asyncHandler(async (req, res) => {
    const row = await repository.findById(req.params.id);
    if (!row) throw new NotFoundError(`That ${resource.singular.toLowerCase()} no longer exists.`);

    const selectOptions = await resourceRepository.loadSelectOptions(resource);

    res.render('admin/resource/form', {
      title: `Edit ${resource.singular.toLowerCase()}`,
      activeNav: resource.parent || resource.key,
      breadcrumbs: [
        { label: resource.label, url: basePath(res) },
        { label: titleOf(resource, row) },
      ],
      resource,
      groups: resourceService.groupFields(resource),
      values: resourceService.toFormValues(resource, row),
      formErrors: {},
      selectOptions,
      isEdit: true,
      row,
    });
  });

  /** POST /admin/:resource/:id */
  const update = asyncHandler(async (req, res) => {
    const before = await repository.findById(req.params.id);
    if (!before) throw new NotFoundError(`That ${resource.singular.toLowerCase()} no longer exists.`);

    const { values, errors } = await resourceService.buildPayload(resource, req.body, {
      existingId: before.id,
    });

    if (Object.keys(errors).length) {
      const selectOptions = await resourceRepository.loadSelectOptions(resource);
      return res.status(400).render('admin/resource/form', {
        title: `Edit ${resource.singular.toLowerCase()}`,
        activeNav: resource.parent || resource.key,
        breadcrumbs: [{ label: resource.label, url: basePath(res) }, { label: titleOf(resource, before) }],
        resource,
        groups: resourceService.groupFields(resource),
        values: { ...resourceService.toFormValues(resource, before), ...req.body },
        formErrors: errors,
        selectOptions,
        isEdit: true,
        row: before,
      });
    }

    await repository.update(before.id, values);
    const after = await repository.findById(before.id);

    await activityService.record({
      req,
      action: `${resource.key}.update`,
      entity: resource.key,
      entityId: before.id,
      description: `Updated ${resource.singular.toLowerCase()} "${titleOf(resource, after)}"`,
      before,
      after,
    });

    invalidatePublicCache();
    req.flash('success', `${resource.singular} saved.`);
    return res.redirect(basePath(res));
  });

  /** POST /admin/:resource/:id/delete */
  const destroy = asyncHandler(async (req, res) => {
    const row = await repository.findById(req.params.id);
    if (!row) throw new NotFoundError(`That ${resource.singular.toLowerCase()} no longer exists.`);

    await repository.remove(row.id);

    await activityService.record({
      req,
      action: `${resource.key}.delete`,
      entity: resource.key,
      entityId: row.id,
      description: `Deleted ${resource.singular.toLowerCase()} "${titleOf(resource, row)}"`,
      before: row,
      severity: 'warning',
    });

    invalidatePublicCache();
    req.flash('success', resource.softDelete
      ? `${resource.singular} moved to trash.`
      : `${resource.singular} deleted.`);
    return res.redirect(basePath(res));
  });

  /** POST /admin/:resource/:id/toggle - flips is_active or status. */
  const toggle = asyncHandler(async (req, res) => {
    const row = await repository.findById(req.params.id);
    if (!row) throw new NotFoundError('That item no longer exists.');

    let update;
    let label;

    if ('is_active' in row) {
      update = { is_active: row.is_active ? 0 : 1 };
      label = row.is_active ? 'hidden' : 'made visible';
    } else if ('status' in row) {
      const next = row.status === 'published' ? 'draft' : 'published';
      update = { status: next };
      label = next === 'published' ? 'published' : 'moved to draft';
    } else {
      throw new ValidationError('This item cannot be toggled.');
    }

    await repository.update(row.id, update);

    await activityService.record({
      req,
      action: `${resource.key}.toggle`,
      entity: resource.key,
      entityId: row.id,
      description: `${titleOf(resource, row)} ${label}`,
      before: row,
      after: { ...row, ...update },
    });

    invalidatePublicCache();
    req.flash('success', `${titleOf(resource, row)} ${label}.`);
    return res.redirect(req.get('referer') || basePath(res));
  });

  /**
   * POST /admin/:resource/:id/move - single-step reorder.
   * Swaps sort_order with the adjacent row so ordering works without
   * drag-and-drop and keeps working without JavaScript.
   */
  const move = asyncHandler(async (req, res) => {
    const direction = req.body.direction === 'up' ? 'up' : 'down';
    const row = await repository.findById(req.params.id);
    if (!row) throw new NotFoundError('That item no longer exists.');

    const all = await repository.findAll({ orderBy: resource.defaultOrder });
    const index = all.findIndex((item) => item.id === row.id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;

    if (swapIndex >= 0 && swapIndex < all.length) {
      const ordered = [...all];
      [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
      await repository.reorder(ordered.map((item) => item.id));
      invalidatePublicCache();
    }

    return res.redirect(req.get('referer') || basePath(res));
  });

  /** POST /admin/:resource/reorder - bulk order from drag-and-drop. */
  const reorder = asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) throw new ValidationError('No order supplied.');

    await repository.reorder(ids);

    await activityService.record({
      req,
      action: `${resource.key}.reorder`,
      entity: resource.key,
      description: `Reordered ${resource.label.toLowerCase()}`,
    });

    invalidatePublicCache();
    return res.json({ ok: true, count: ids.length });
  });

  return { resource, index, create, store, edit, update, destroy, toggle, move, reorder };
}

module.exports = { buildController, invalidatePublicCache };
