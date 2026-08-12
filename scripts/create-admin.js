#!/usr/bin/env node
'use strict';

/**
 * Creates an admin account interactively.
 *
 *   npm run create-admin
 *
 * The password is never passed on the command line (it would land in
 * shell history), never echoed to the terminal, and never written to a
 * file - only its bcrypt hash reaches the database.
 */

const readline = require('node:readline');
const crypto = require('node:crypto');

const { config } = require('../src/config/env');
const db = require('../src/config/database');
const authService = require('../src/services/authService');
const userRepository = require('../src/repositories/userRepository');

const c = {
  reset: '\x1b[0m', dim: '\x1b[90m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

function log(message = '') { process.stdout.write(`${message}\n`); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, { defaultValue = '' } = {}) {
  const suffix = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => resolve(answer.trim() || defaultValue));
  });
}

/** Reads a line without echoing it back to the terminal. */
function askSecret(question) {
  return new Promise((resolve) => {
    const { output } = rl;
    let value = '';

    const onKeypress = (char) => {
      const code = char.charCodeAt(0);
      // Enter / Return
      if (code === 13 || code === 10) return;
      // Backspace / Delete
      if (code === 127 || code === 8) {
        value = value.slice(0, -1);
        return;
      }
      // Ctrl+C
      if (code === 3) {
        output.write('\n');
        process.exit(130);
      }
      value += char;
    };

    process.stdin.on('data', onKeypress);

    // Suppress echo while the answer is being typed.
    const originalWrite = output.write.bind(output);
    output.write = (chunk, ...rest) => {
      if (typeof chunk === 'string' && chunk.includes(question)) return originalWrite(chunk, ...rest);
      return true;
    };

    rl.question(`${question}: `, () => {
      process.stdin.removeListener('data', onKeypress);
      output.write = originalWrite;
      output.write('\n');
      resolve(value);
    });
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

async function main() {
  log(`\n${c.bold}Create an admin account${c.reset}`);
  log(`${c.dim}${config.db.database} on ${config.db.host}:${config.db.port}${c.reset}\n`);

  const health = await db.healthCheck();
  if (!health.connected) {
    log(`${c.red}Cannot reach the database (${health.error}).${c.reset}`);
    log(`${c.dim}Start MySQL in XAMPP, then run: npm run migrate${c.reset}\n`);
    process.exitCode = 1;
    return;
  }

  const roles = await db.query('SELECT id, slug, name, description FROM roles ORDER BY level DESC');
  if (!roles.length) {
    log(`${c.red}No roles found. Run: npm run migrate${c.reset}\n`);
    process.exitCode = 1;
    return;
  }

  const existingCount = await userRepository.countActive();
  const isFirstAccount = existingCount === 0;

  if (isFirstAccount) {
    log(`${c.cyan}No accounts exist yet - this one will be the Super Admin.${c.reset}\n`);
  } else {
    log(`${c.dim}${existingCount} account(s) already exist.${c.reset}\n`);
  }

  // ---- name
  let name = '';
  while (!name) {
    name = await ask('Full name');
    if (name.length < 2) {
      log(`${c.red}  Enter a name with at least 2 characters.${c.reset}`);
      name = '';
    }
  }

  // ---- email
  let email = '';
  while (!email) {
    const answer = (await ask('Email address')).toLowerCase();
    if (!isValidEmail(answer)) {
      log(`${c.red}  That does not look like a valid email address.${c.reset}`);
      continue;
    }
    if (await userRepository.emailTaken(answer)) {
      log(`${c.red}  An account with that email already exists.${c.reset}`);
      continue;
    }
    email = answer;
  }

  // ---- username (optional)
  let username = null;
  const usernameAnswer = await ask('Username (optional, press Enter to skip)');
  if (usernameAnswer) {
    if (!/^[a-zA-Z0-9._-]{3,60}$/.test(usernameAnswer)) {
      log(`${c.yellow}  Ignored - usernames may only contain letters, numbers, dot, dash and underscore.${c.reset}`);
    } else if (await userRepository.usernameTaken(usernameAnswer)) {
      log(`${c.yellow}  Ignored - that username is taken.${c.reset}`);
    } else {
      username = usernameAnswer;
    }
  }

  // ---- role
  let roleId;
  if (isFirstAccount) {
    roleId = roles.find((role) => role.slug === 'super_admin').id;
    log(`${c.dim}Role: Super Admin${c.reset}`);
  } else {
    log('\nAvailable roles:');
    roles.forEach((role, index) => {
      log(`  ${c.cyan}${index + 1}${c.reset}. ${role.name} ${c.dim}- ${role.description}${c.reset}`);
    });

    let choice = null;
    while (choice === null) {
      const answer = await ask('\nRole number', { defaultValue: '2' });
      const index = Number.parseInt(answer, 10) - 1;
      if (index >= 0 && index < roles.length) choice = roles[index];
      else log(`${c.red}  Choose a number between 1 and ${roles.length}.${c.reset}`);
    }
    roleId = choice.id;
  }

  // ---- password
  log(`\n${c.dim}Password: at least 12 characters, with a letter and a number.${c.reset}`);
  log(`${c.dim}Nothing you type below is displayed or saved to shell history.${c.reset}`);

  let password = '';
  while (!password) {
    const first = await askSecret('Password');
    const problems = authService.validatePasswordStrength(first, { email, name });

    if (problems.length) {
      problems.forEach((problem) => log(`${c.red}  ${problem}${c.reset}`));
      continue;
    }

    const second = await askSecret('Confirm password');
    if (first !== second) {
      log(`${c.red}  The two passwords do not match.${c.reset}`);
      continue;
    }

    password = first;
  }

  // ---- insert
  const passwordHash = await authService.hashPassword(password);

  const userId = await userRepository.create({
    uuid: crypto.randomUUID(),
    role_id: roleId,
    name,
    email,
    username,
    status: 'active',
    must_change_password: 0,
  });

  // password_hash is not in the repository's fillable list on purpose,
  // so it is set through the dedicated method.
  await userRepository.setPassword(userId, passwordHash);

  await db.query(
    `INSERT INTO activity_logs (user_id, user_name, action, entity, entity_id, description, severity)
     VALUES (?, ?, 'user.create', 'user', ?, ?, 'warning')`,
    [userId, name, userId, `Account created via create-admin script`],
  );

  const role = roles.find((r) => r.id === roleId);

  log(`\n${c.green}${c.bold}Account created.${c.reset}`);
  log(`${c.dim}  name   ${name}${c.reset}`);
  log(`${c.dim}  email  ${email}${c.reset}`);
  log(`${c.dim}  role   ${role.name}${c.reset}`);
  log(`\nSign in at ${c.cyan}${config.siteUrl}${config.security.adminPath}/login${c.reset}`);
  log(`${c.dim}Start the server with: npm run dev${c.reset}\n`);
}

main()
  .catch((err) => {
    log(`\n${c.red}Failed: ${err.message}${c.reset}`);
    if (config.isDevelopment) log(`${c.dim}${err.stack}${c.reset}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await db.closePool().catch(() => {});
  });
