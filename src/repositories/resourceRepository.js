'use strict';

/**
 * One BaseRepository instance per declared resource, built from the
 * schemas in config/resources.js. Repositories are created once at module
 * load and reused, so the column allowlists are computed a single time.
 */

const BaseRepository = require('./BaseRepository');
const db = require('../config/database');
const { RESOURCES, columnsFor, fillableFor } = require('../config/resources');

const repositories = new Map();

for (const [key, resource] of Object.entries(RESOURCES)) {
  repositories.set(key, new BaseRepository({
    table: resource.table,
    columns: columnsFor(resource),
    fillable: fillableFor(resource),
    softDelete: Boolean(resource.softDelete),
    defaultOrder: resource.defaultOrder || 'id ASC',
  }));
}

function forResource(key) {
  const repository = repositories.get(key);
  if (!repository) throw new Error(`No repository registered for resource "${key}"`);
  return repository;
}

/**
 * Search + filter + paginate, driven by the resource's declared
 * searchColumns and filters. Column names come from the schema, never
 * from the request; values are always bound.
 */
async function search(resource, { page = 1, perPage = 25, q = '', filters = {}, orderBy } = {}) {
  const repository = forResource(resource.key);
  const clauses = [];
  const params = [];

  if (resource.softDelete) clauses.push('t.deleted_at IS NULL');

  if (q && resource.searchColumns?.length) {
    const term = `%${q}%`;
    const searchClause = resource.searchColumns
      .map((column) => {
        repository.assertColumn(column);
        return `t.\`${column}\` LIKE ?`;
      })
      .join(' OR ');
    clauses.push(`(${searchClause})`);
    params.push(...resource.searchColumns.map(() => term));
  }

  for (const filter of resource.filters || []) {
    const value = filters[filter.name];
    if (value === undefined || value === '' || value === null) continue;
    repository.assertColumn(filter.name);
    clauses.push(`t.\`${filter.name}\` = ?`);
    params.push(value);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePerPage = Math.max(1, Math.min(Number.parseInt(perPage, 10) || 25, 100));
  const offset = (safePage - 1) * safePerPage;

  // Built here rather than via repository.buildOrderBy so the columns can
  // carry the `t.` alias. Every column is still checked against the
  // repository's allowlist before it reaches the SQL string.
  const orderColumns = String(orderBy || resource.defaultOrder)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [column, direction = 'ASC'] = part.split(/\s+/);
      repository.assertColumn(column);
      return `t.\`${column}\` ${direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`;
    });
  const finalOrderSql = orderColumns.length ? `ORDER BY ${orderColumns.join(', ')}` : '';

  const [rows, total] = await Promise.all([
    db.query(
      `SELECT t.* FROM \`${resource.table}\` t ${whereSql} ${finalOrderSql} LIMIT ${safePerPage} OFFSET ${offset}`,
      params,
    ),
    db.queryValue(`SELECT COUNT(*) AS total FROM \`${resource.table}\` t ${whereSql}`, params),
  ]);

  return {
    rows,
    total: Number(total) || 0,
    page: safePage,
    perPage: safePerPage,
    pages: Math.max(1, Math.ceil((Number(total) || 0) / safePerPage)),
  };
}

/**
 * Loads option lists for any select field that pulls from another table.
 * @returns {Promise<Object<string, Array<{value: *, label: string}>>>}
 */
async function loadSelectOptions(resource) {
  const options = {};
  const sources = [...(resource.fields || []), ...(resource.filters || [])]
    .filter((field) => field.optionsFrom);

  for (const field of sources) {
    const { table, value, label } = field.optionsFrom;
    // Identifiers come from the schema file, never from a request.
    if (!/^[A-Za-z0-9_]+$/.test(table)) continue;

    const rows = await db.query(
      `SELECT \`${value}\` AS value, \`${label}\` AS label FROM \`${table}\` ORDER BY \`${label}\` ASC`,
    );
    options[field.name] = rows;
  }

  return options;
}

/** True when `slug` is already used by another row of this resource. */
async function slugTaken(resource, slug, exceptId = null) {
  const value = await db.queryValue(
    `SELECT COUNT(*) AS total FROM \`${resource.table}\` WHERE slug = ? AND (? IS NULL OR id <> ?)`,
    [slug, exceptId, exceptId],
  );
  return Number(value) > 0;
}

module.exports = { forResource, search, loadSelectOptions, slugTaken, repositories };
