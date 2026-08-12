#!/usr/bin/env node
'use strict';

/**
 * One-command first-time setup.
 *
 *   npm run setup
 *
 * Creates .env with freshly generated secrets, checks the database
 * connection, runs the migrations and points you at create-admin.
 * Safe to re-run: an existing .env is never overwritten.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');

const c = {
  reset: '\x1b[0m', dim: '\x1b[90m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

function log(message = '') { process.stdout.write(`${message}\n`); }
function step(number, text) { log(`\n${c.cyan}[${number}/4]${c.reset} ${c.bold}${text}${c.reset}`); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question, defaultValue = '') => new Promise((resolve) => {
  const suffix = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : '';
  rl.question(`  ${question}${suffix}: `, (answer) => resolve(answer.trim() || defaultValue));
});

function setEnvValue(contents, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(contents)
    ? contents.replace(pattern, `${key}=${value}`)
    : `${contents}\n${key}=${value}`;
}

async function main() {
  log(`\n${c.bold}Portfolio CMS - setup${c.reset}`);
  log(`${c.dim}${ROOT}${c.reset}`);

  // ---------------------------------------------------------- 1. .env
  step(1, 'Environment file');

  if (fs.existsSync(ENV_PATH)) {
    log(`  ${c.green}.env already exists - leaving it untouched.${c.reset}`);
  } else {
    if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
      throw new Error('.env.example is missing - cannot generate .env.');
    }

    log('  Answer a few questions (press Enter to accept the default).\n');

    const dbHost = await ask('Database host', '127.0.0.1');
    const dbPort = await ask('Database port', '3306');
    const dbName = await ask('Database name', 'portfolio_cms');
    const dbUser = await ask('Database user', 'root');
    const dbPassword = await ask('Database password (blank is the XAMPP default)', '');
    const port = await ask('Application port', '3000');
    const siteUrl = await ask('Site URL', `http://localhost:${port}`);

    let contents = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    contents = setEnvValue(contents, 'DB_HOST', dbHost);
    contents = setEnvValue(contents, 'DB_PORT', dbPort);
    contents = setEnvValue(contents, 'DB_NAME', dbName);
    contents = setEnvValue(contents, 'DB_USER', dbUser);
    contents = setEnvValue(contents, 'DB_PASSWORD', dbPassword);
    contents = setEnvValue(contents, 'PORT', port);
    contents = setEnvValue(contents, 'SITE_URL', siteUrl);

    // Secrets are generated here so no default value ever ships in git.
    contents = setEnvValue(contents, 'SESSION_SECRET', crypto.randomBytes(48).toString('hex'));
    contents = setEnvValue(contents, 'ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
    contents = setEnvValue(contents, 'ANALYTICS_SALT', crypto.randomBytes(24).toString('hex'));

    fs.writeFileSync(ENV_PATH, contents, { mode: 0o600 });
    log(`\n  ${c.green}Created .env with freshly generated secrets.${c.reset}`);
    log(`  ${c.dim}It is git-ignored. Never commit it.${c.reset}`);
  }

  // ------------------------------------------------------ 2. database
  step(2, 'Database connection');

  // Loaded after .env exists so the values are picked up.
  delete require.cache[require.resolve('../src/config/env')];
  const { config } = require('../src/config/env');

  try {
    const connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      connectTimeout: 8000,
    });
    const [[row]] = await connection.query('SELECT VERSION() AS version');
    await connection.end();

    log(`  ${c.green}Connected.${c.reset} ${c.dim}${row.version}${c.reset}`);
    if (/mariadb/i.test(row.version)) {
      log(`  ${c.dim}MariaDB detected (XAMPP). The schema is written to be compatible.${c.reset}`);
    }
  } catch (err) {
    log(`  ${c.red}Could not connect: ${err.code || err.message}${c.reset}`);
    log(`\n  ${c.yellow}If you use XAMPP, open the Control Panel and start MySQL,${c.reset}`);
    log(`  ${c.yellow}then run npm run setup again.${c.reset}\n`);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------- 3. migrations
  step(3, 'Database schema');
  rl.close();

  try {
    execFileSync(process.execPath, [path.join(__dirname, 'migrate.js')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
  } catch {
    log(`\n  ${c.red}Migrations failed. Fix the error above and re-run npm run migrate.${c.reset}\n`);
    process.exitCode = 1;
    return;
  }

  // --------------------------------------------------- 4. admin user
  step(4, 'Admin account');
  log(`  Run ${c.cyan}npm run create-admin${c.reset} to create your sign-in.`);
  log(`  ${c.dim}It asks for the password interactively so it never enters shell history.${c.reset}`);

  log(`\n${c.green}${c.bold}Setup complete.${c.reset}\n`);
  log('Next steps:');
  log(`  ${c.cyan}npm run create-admin${c.reset}   create your account`);
  log(`  ${c.cyan}npm run dev${c.reset}            start the development server`);
  log('');
}

main()
  .catch((err) => {
    log(`\n${c.red}Setup failed: ${err.message}${c.reset}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
