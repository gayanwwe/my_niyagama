import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import knex from 'knex';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { calculateAttendanceStatus, timeToMins } from './src/lib/attendanceUtils';
import type { Officer } from './types';

dotenv.config();

console.log(`DEBUG: Process Current Working Directory: ${process.cwd()}`);
console.log(`DEBUG: Node.js Version: ${process.version}`);
console.log(`DEBUG: NODE_ENV: ${process.env.NODE_ENV}`);

// Safe debugging logs for Database environment variables
console.log("DEBUG: Database Environment Variables:");
console.log(`  - DB_HOST: ${process.env.DB_HOST || '(not set)'}`);
console.log(`  - DB_PORT: ${process.env.DB_PORT || '(not set)'}`);
console.log(`  - DB_USER: ${process.env.DB_USER || '(not set)'}`);
console.log(`  - DB_USERNAME: ${process.env.DB_USERNAME || '(not set)'}`);
console.log(`  - DB_NAME: ${process.env.DB_NAME || '(not set)'}`);
console.log(`  - DB_DATABASE: ${process.env.DB_DATABASE || '(not set)'}`);
console.log(`  - DB_CONNECTION: ${process.env.DB_CONNECTION || '(not set)'}`);
console.log(`  - DB_CLIENT: ${process.env.DB_CLIENT || '(not set)'}`);

process.on('uncaughtException', (err) => {
  // Do not keep serving after an uncaught throw: state (open transactions,
  // leaked handles) is undefined at this point. Exit and let the platform
  // restart the process cleanly.
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});


// A hardcoded fallback secret meant anyone reading this file could forge an SA
// token if JWT_SECRET was ever unset. Refuse to start in production instead;
// in development, use a random per-process secret (tokens die on restart).
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET is not set. Refusing to start in production.');
    process.exit(1);
  }
  console.warn('[Auth] JWT_SECRET not set - generating an ephemeral development secret. Sessions will not survive a restart.');
  return crypto.randomBytes(32).toString('hex');
})();

// MySQL is the only supported database. SQLite support was removed: the two
// drivers disagreed on date types, enum enforcement and several SQL dialects,
// so behaviour differed between a developer's machine and the deployment.
const dbName = process.env.DB_NAME || process.env.DB_DATABASE;
const dbHost = process.env.DB_HOST;

if (!dbHost || !dbName) {
  console.error(
    'FATAL: MySQL is not configured. Set DB_HOST and DB_NAME (plus DB_USER, ' +
    'DB_PASSWORD and optionally DB_PORT) in the environment. See .env.example.',
  );
  process.exit(1);
}

const dbConfig = {
  client: 'mysql2',
  connection: {
    host: dbHost,
    user: process.env.DB_USER || process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    port: Number(process.env.DB_PORT) || 3306,
    // Hand DATE and DATETIME back as strings. mysql2 otherwise builds JS Date
    // objects in the server's timezone, which shifts a date by a day whenever
    // the server and the division are not in the same zone.
    dateStrings: true,
  },
  pool: { min: 2, max: Number(process.env.DB_POOL_MAX) || 10 },
};

console.log(`DEBUG: MySQL => ${dbConfig.connection.user}@${dbConfig.connection.host}:${dbConfig.connection.port} db=${dbConfig.connection.database}`);

const db = knex(dbConfig);

async function executeSeedSql() {
  const seedFilePath = path.join(process.cwd(), 'seed_officers.sql');
  if (fs.existsSync(seedFilePath)) {
    console.log('Database Seeder: Found seed_officers.sql, starting parsing...');
    try {
      const sqlContent = fs.readFileSync(seedFilePath, 'utf8');
      const rawQueries = sqlContent.split(';');
      
      const queries = rawQueries
        .map(q => q.trim())
        .filter(q => q.length > 0 && !q.startsWith('--'));

      console.log(`Database Seeder: Running ${queries.length} seed statements...`);
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        
        const cleanQuery = query
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();

        if (cleanQuery.length > 0) {
          try {
            await db.raw(cleanQuery);
          } catch (err: any) {
            console.error(`Database Seeder Error at query ${i}: ${err.message}\nQuery: ${cleanQuery}`);
          }
        }
      }
      console.log('Database Seeder: Seeding from seed_officers.sql finished successfully!');
      return true;
    } catch (err: any) {
      console.error('Database Seeder Global Error:', err);
    }
  } else {
    console.log('Database Seeder: seed_officers.sql not found at ' + seedFilePath);
  }
  return false;
}

async function startServer() {
  console.log('Server Version: 1.0.3');
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const apiRouter = express.Router();

  // Restrict CORS to the app's own origin(s). CORS_ORIGIN accepts a
  // comma-separated list; with none set we assume same-origin deployment.
  const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors(corsOrigins.length ? { origin: corsOrigins, credentials: true } : { origin: false }));

  // A 5gb body limit let a single request exhaust the server's memory, since
  // express buffers the whole body before the handler runs. Uploads are
  // base64 JSON, so they need headroom, but nowhere near that much.
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));
  app.use(express.urlencoded({ limit: process.env.JSON_BODY_LIMIT || '25mb', extended: true }));
  app.use(express.static(path.join(process.cwd(), 'public')));

  // --- RATE LIMITERS ---
  // PINs are short, so an unthrottled /login is brute-forceable in minutes.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many login attempts. Please try again later.' },
  });

  // The AI proxy spends real money per call; cap per-user usage.
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => String(req.user?.id || req.ip),
    message: { status: 'error', message: 'Too many AI requests. Please slow down.' },
  });
  
  // Request Logging Middleware
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- AUTH MIDDLEWARE ---
  // Declared before any route registration so that routes defined earlier in
  // this file (e.g. /setup-db) can reference it without hitting the TDZ.
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization || req.headers['x-authorization'];
    if (!authHeader) {
      console.log(`[Auth] Missing auth header for ${req.method} ${req.url}`);
      return res.status(401).json({ status: 'error', message: 'Unauthenticated' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        console.log(`[Auth] Token verification failed: ${err.message}`);
        return res.status(401).json({ status: 'error', message: 'Invalid token' });
      }
      req.user = decoded;
      next();
    });
  };

  // Roles permitted to administer staff records and system configuration.
  const ADMIN_ROLES = ['SA', 'ADMIN', 'IT'];

  // Roles permitted to action someone else's leave or resource request. Mirrors
  // the `isManagement` set the frontend uses to show the approvals screen; the
  // server is the enforcement point, since the client check is only a UI hint.
  const APPROVER_ROLES = ['SA', 'ADMIN', 'EXECUTIVE', 'EX', 'CHIEF_CLERK', 'LEAVE_OFFICER', 'IT'];

  // Sunday = 0 ... Saturday = 6. Sri Lankan divisional secretariats work
  // Monday to Friday; override with the `non_working_weekdays` setting (a
  // comma-separated list, or an empty string to treat every day as working).
  // Who may change the public holiday calendar. A holiday reduces the leave
  // deducted from every officer, so this is deliberately narrower than the
  // general approver set. SA is included as the system-administrator superset
  // (the seeded administrator account holds SA, not ADMIN).
  const HOLIDAY_MANAGER_ROLES = ['LEAVE_OFFICER', 'ADMIN', 'SA'];

  // Who may publish to the screen in the public lobby. The control page was
  // only ever hidden from other roles in the UI; every write behind it was
  // gated on "any valid token", so any officer could post an emergency alert
  // to a public government display or mark the Divisional Secretary as out.
  const DISPLAY_MANAGER_ROLES = ['SA', 'ADMIN', 'IT', 'OPERATOR'];

  const DEFAULT_NON_WORKING_WEEKDAYS = [0, 6];

  /**
   * Normalises a date to 'YYYY-MM-DD'. With dateStrings enabled mysql2 hands
   * DATE columns back as strings, but rows can still arrive as Date objects
   * from code paths that construct them, so both are handled.
   */
  const toDateKey = (value: any): string => {
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
  };


  // Columns on `officers` that an administrator may set through the staff API.
  // `pin`, `username` and `biometric_id` are handled separately (hashing and
  // uniqueness checks); `id` and timestamps are never writable.
  const OFFICER_WRITABLE_FIELDS = [
    'name', 'post', 'department', 'role', 'work_type', 'is_field_officer',
    'official_phone', 'profile_pic', 'address', 'bio', 'birthday', 'join_date',
    'dashboard_status', 'eta',
  ];

  /**
   * Copies only the named fields out of a request body. Spreading req.body
   * straight into an insert lets a caller write any column the table happens to
   * have, and any column it does not have takes the whole request down with a
   * raw SQL error.
   */
  const pickFields = (body: any, fields: string[]) => {
    const out: any = {};
    if (!body || typeof body !== 'object') return out;
    for (const key of fields) {
      if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
  };

  const pickOfficerFields = (body: any) => {
    const out: any = {};
    for (const key of OFFICER_WRITABLE_FIELDS) {
      if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
  };

  // Role gate. Always mount after `authenticate`, which populates req.user.
  const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.log(`[Auth] Role '${req.user?.role}' denied for ${req.method} ${req.url}`);
      return res.status(403).json({ status: 'error', message: 'Forbidden: insufficient privileges' });
    }
    next();
  };


  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  console.log("DB USER:", process.env.DB_USER);
  
  // NOTE: schema upgrades used to run here, before ensureTables() had created
  // the tables, so on a fresh database every one failed with "no such table"
  // and was swallowed as non-critical. They now run in ensureSchemaUpgrades(),
  // which is invoked immediately after ensureTables().

  // --- DATABASE SETUP ROUTE ---
  apiRouter.post('/setup-db', authenticate, requireRole('SA'), async (req, res) => {
    try {
      console.log('Initializing Database...');
      
      // Disable foreign key checks for dropping
      // MySQL-only syntax. On SQLite this threw and aborted the whole route
      // before a single table was dropped.
      await db.raw('SET FOREIGN_KEY_CHECKS = 0');
      
      // Drop existing tables
      await db.schema.dropTableIfExists('biometric_logs');
      await db.schema.dropTableIfExists('task_updates');
      await db.schema.dropTableIfExists('tasks');
      await db.schema.dropTableIfExists('projects');
      await db.schema.dropTableIfExists('circles');
      await db.schema.dropTableIfExists('photos');
      await db.schema.dropTableIfExists('albums');
      await db.schema.dropTableIfExists('community_comments');
      await db.schema.dropTableIfExists('community_posts');
      await db.schema.dropTableIfExists('dashboard_notices');
      await db.schema.dropTableIfExists('dashboard_events');
      await db.schema.dropTableIfExists('dashboard_videos');
      await db.schema.dropTableIfExists('dashboard_alerts');
      await db.schema.dropTableIfExists('journal_entries');
      await db.schema.dropTableIfExists('leaves');
      await db.schema.dropTableIfExists('attendance');
      await db.schema.dropTableIfExists('officers');
      await db.schema.dropTableIfExists('departments');
      await db.schema.dropTableIfExists('designations');
      await db.schema.dropTableIfExists('audit_logs');
      await db.schema.dropTableIfExists('dashboard_settings');
      await db.schema.dropTableIfExists('circulars');
      await db.schema.dropTableIfExists('unavailability');
      await db.schema.dropTableIfExists('notifications');
      await db.schema.dropTableIfExists('holidays');
      await db.schema.dropTableIfExists('resources');
      await db.schema.dropTableIfExists('resource_bookings');
      await db.schema.dropTableIfExists('dashboard_status');
      await db.schema.dropTableIfExists('layout_mapping');

      // Recreate every table from the single definition in ensureTables().
      // This route used to carry its own full copy of the schema, which drifted
      // from the one that actually runs on boot: new columns and indexes were
      // added here and never appeared in any database.
      await ensureTables();
      // Same upgrades the boot path applies, so a reinitialised database is
      // identical to one the server just created - indexes included.
      await ensureSchemaUpgrades();

      // ensureTables() already seeds the administrator account, runs the SQL
      // seeder, and fills the dashboard slots, so only the reference data it
      // does not cover is seeded here.
      if ((await db('departments').count('id as c').first())?.c === 0) {
        await db('departments').insert([
          { name: 'Administration' },
          { name: 'Finance' },
          { name: 'IT' },
          { name: 'Field Operations' }
        ]);
      }

      if ((await db('designations').count('id as c').first())?.c === 0) {
        await db('designations').insert([
          { name: 'Divisional Secretary' },
          { name: 'Assistant Divisional Secretary' },
          { name: 'Chief Clerk' },
          { name: 'IT Officer' }
        ]);
      }

      // Re-enable foreign key checks
      await db.raw('SET FOREIGN_KEY_CHECKS = 1');

      res.json({ status: 'success', message: 'Database initialized successfully' });
    } catch (error: any) {
      // Ensure foreign key checks are re-enabled even on error
      await db.raw('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
      console.error('Database Setup Error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Ensure tables exist on startup
  const ensureTables = async () => {
    const hasBiometricLogs = await db.schema.hasTable('biometric_logs');
    if (!hasBiometricLogs) {
      console.log('Creating missing biometric_logs table...');
      await db.schema.createTable('biometric_logs', (table) => {
        table.increments('id');
        table.string('hardware_id');
        table.date('scan_date');
        table.time('scan_time');
        table.string('terminal_id').defaultTo('T-01');
        table.enum('status', ['SYNCED', 'UNMAPPED', 'DUPLICATE', 'ERROR']).defaultTo('UNMAPPED');
        table.timestamps(true, true);
      });
    }
    
    const hasOfficers = await db.schema.hasTable('officers');
    if (!hasOfficers) {
       console.log('Creating missing officers table...');
       await db.schema.createTable('officers', (table) => {
        table.bigIncrements('id');
        table.string('username').unique().nullable();
        table.string('biometric_id').unique().nullable();
        table.string('pin');
        table.string('name');
        table.string('post');
        table.string('department');
        table.string('role');
        table.enum('work_type', ['OFFICE', 'FIELD']).defaultTo('OFFICE');
        table.boolean('is_field_officer').defaultTo(false);
        table.string('official_phone').nullable();
        table.string('profile_pic').nullable();
        table.string('pending_profile_pic').nullable();
        table.string('address').nullable();
        table.text('bio').nullable();
        table.date('birthday').nullable();
        table.date('join_date').nullable();
        table.string('dashboard_status').defaultTo('OFFLINE');
        table.string('eta').nullable();
        table.boolean('is_deleted').defaultTo(false);
        table.timestamp('deleted_at').nullable();
        table.timestamps(true, true);
      });
    }

    // Dynamic schema validation/migration for existing officers table columns
    const officersColumnsToEnsure = [
      { name: 'username', create: (t: any) => t.string('username').unique().nullable() },
      { name: 'biometric_id', create: (t: any) => t.string('biometric_id').unique().nullable() },
      { name: 'official_phone', create: (t: any) => t.string('official_phone').nullable() },
      { name: 'profile_pic', create: (t: any) => t.string('profile_pic').nullable() },
      { name: 'pending_profile_pic', create: (t: any) => t.string('pending_profile_pic').nullable() },
      { name: 'address', create: (t: any) => t.string('address').nullable() },
      { name: 'bio', create: (t: any) => t.text('bio').nullable() },
      { name: 'birthday', create: (t: any) => t.date('birthday').nullable() },
      { name: 'join_date', create: (t: any) => t.date('join_date').nullable() },
      { name: 'dashboard_status', create: (t: any) => t.string('dashboard_status').defaultTo('OFFLINE') },
      { name: 'eta', create: (t: any) => t.string('eta').nullable() }
    ];

    for (const col of officersColumnsToEnsure) {
      const hasCol = await db.schema.hasColumn('officers', col.name);
      if (!hasCol) {
        console.log(`Migration: Adding missing column "${col.name}" to officers table...`);
        try {
          await db.schema.alterTable('officers', (table) => {
            col.create(table);
          });
        } catch (err) {
          console.error(`Non-critical failure adding column ${col.name} to officers:`, err);
        }
      }
    }

    // Key/value application settings. `dashboard_settings` is a single-row
    // columnar table for the public display; GET /settings read it as if it
    // were key/value, so it could only ever return its hardcoded defaults.
    const hasAppSettings = await db.schema.hasTable('app_settings');
    if (!hasAppSettings) {
      await db.schema.createTable('app_settings', (table) => {
        table.bigIncrements('id');
        table.string('key').unique();
        table.text('value').nullable();
        table.timestamps(true, true);
      });
    }

    const hasUnavailability = await db.schema.hasTable('unavailability');
    if (!hasUnavailability) {
      await db.schema.createTable('unavailability', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('CASCADE');
        table.date('date');
        table.enum('slot', ['FULL', 'AM', 'PM']).defaultTo('FULL');
        table.string('reason').nullable();
        table.timestamps(true, true);
      });
    }

    const hasNotifications = await db.schema.hasTable('notifications');
    if (!hasNotifications) {
      await db.schema.createTable('notifications', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('CASCADE').nullable();
        table.string('title');
        table.text('message');
        table.string('type').defaultTo('INFO');
        table.boolean('is_read').defaultTo(false);
        table.timestamps(true, true);
      });
    }

    const hasPostsTable = await db.schema.hasTable('posts');
    if (!hasPostsTable) {
      await db.schema.createTable('posts', (table) => {
        table.bigIncrements('id');
        table.string('name').unique();
        table.timestamps(true, true);
      });
    }

    const hasActivityLogs = await db.schema.hasTable('activity_logs');
    if (!hasActivityLogs) {
      await db.schema.createTable('activity_logs', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('CASCADE');
        table.string('type');
        table.string('title');
        table.text('description');
        table.string('link').nullable();
        table.timestamps(true, true);
      });
    }

    const hasResources = await db.schema.hasTable('resources');
    if (!hasResources) {
      await db.schema.createTable('resources', (table) => {
        table.bigIncrements('id');
        table.string('name');
        table.string('type');
        table.text('description').nullable();
        table.text('specs').nullable();
        table.string('status').defaultTo('AVAILABLE');
        table.timestamps(true, true);
      });
    }

    const hasResourceBookings = await db.schema.hasTable('resource_bookings');
    if (!hasResourceBookings) {
      await db.schema.createTable('resource_bookings', (table) => {
        table.bigIncrements('id');
        table.bigInteger('resource_id').unsigned().references('id').inTable('resources').onDelete('CASCADE');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('CASCADE');
        table.datetime('start_time');
        table.datetime('end_time');
        table.string('purpose').nullable();
        table.string('destination').nullable();
        table.enum('status', ['PENDING', 'APPROVED', 'REJECTED']).defaultTo('PENDING');
        table.timestamps(true, true);
      });
    }

    const hasLayoutMapping = await db.schema.hasTable('layout_mapping');
    if (hasLayoutMapping) {
      const hasElementsJson = await db.schema.hasColumn('layout_mapping', 'elements_json');
      if (!hasElementsJson) {
        await db.schema.dropTableIfExists('layout_mapping');
        await db.schema.createTable('layout_mapping', (table) => {
          table.bigIncrements('id');
          table.string('section_id');
          table.string('officer_id').nullable();
          table.integer('x');
          table.integer('y');
          table.text('elements_json').nullable();
          table.timestamps(true, true);
        });
      }
    } else {
      await db.schema.createTable('layout_mapping', (table) => {
        table.bigIncrements('id');
        table.string('section_id');
        table.string('officer_id').nullable();
        table.integer('x');
        table.integer('y');
        table.text('elements_json').nullable();
        table.timestamps(true, true);
      });
    }

    const hasDashboardStatus = await db.schema.hasTable('dashboard_status');
    if (!hasDashboardStatus) {
      await db.schema.createTable('dashboard_status', (table) => {
        table.string('slot_id').primary();
        table.bigInteger('officer_id').unsigned().nullable().references('id').inTable('officers').onDelete('SET NULL');
        table.string('status').defaultTo('AVAILABLE');
        table.string('eta').nullable();
        table.text('remarks').nullable();
        table.timestamps(true, true);
      });
      const slots = ['ds', 'ads', 'acc', 'ao', 'adp', 'agn'];
      await db('dashboard_status').insert(
        slots.map(slot => ({
          slot_id: slot,
          status: 'OFFLINE'
        }))
      );
    }

    const hasDepartments = await db.schema.hasTable('departments');
    if (!hasDepartments) {
      await db.schema.createTable('departments', (table) => {
        table.bigIncrements('id');
        table.string('name').unique();
        table.timestamps(true, true);
      });
    }

    const hasDesignations = await db.schema.hasTable('designations');
    if (!hasDesignations) {
      await db.schema.createTable('designations', (table) => {
        table.bigIncrements('id');
        table.string('name').unique();
        table.timestamps(true, true);
      });
    }

    const hasLeaves = await db.schema.hasTable('leaves');
    if (!hasLeaves) {
      await db.schema.createTable('leaves', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('CASCADE');
        table.string('type', 50);
        table.date('start_date');
        table.date('end_date');
        table.string('sub_type').nullable(); // AM/PM for SHORT_LEAVE / HALF_DAY
        table.text('reason');
        table.string('status', 50).defaultTo('PENDING');
        table.boolean('is_deleted').defaultTo(false);
        table.timestamp('deleted_at').nullable();
        table.timestamps(true, true);
      });
    }

    const hasAttendance = await db.schema.hasTable('attendance');
    if (!hasAttendance) {
      await db.schema.createTable('attendance', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('CASCADE');
        table.date('date');
        table.time('time_in').nullable();
        table.time('time_out').nullable();
        table.string('status', 50).defaultTo('PRESENT');
        table.boolean('is_temporary').defaultTo(false);
        table.integer('short_leave_minutes').defaultTo(0);
        table.boolean('grace_day_used').defaultTo(false);
        table.enum('is_half_day', ['AM', 'PM']).nullable();
        table.string('leave_type').nullable(); // CASUAL | SICK | VACATION | DUTY - clarifies LEAVE type
        table.boolean('is_deleted').defaultTo(false);
        table.timestamp('deleted_at').nullable();
        table.timestamps(true, true);
      });
    }

    const hasCircles = await db.schema.hasTable('circles');
    if (!hasCircles) {
      await db.schema.createTable('circles', (table) => {
        table.bigIncrements('id');
        table.string('name');
        table.string('description');
        table.string('color').nullable();
        table.string('logo').nullable();
        table.bigInteger('leader_id').unsigned().references('id').inTable('officers');
        table.timestamps(true, true);
      });
    } else {
      const hasColor = await db.schema.hasColumn('circles', 'color');
      if (!hasColor) {
        await db.schema.table('circles', (table) => {
          table.string('color').nullable();
        });
      }
      const hasLogo = await db.schema.hasColumn('circles', 'logo');
      if (!hasLogo) {
        await db.schema.table('circles', (table) => {
          table.string('logo').nullable();
        });
      }
    }

    const hasProjects = await db.schema.hasTable('projects');
    if (!hasProjects) {
      await db.schema.createTable('projects', (table) => {
        table.bigIncrements('id');
        table.string('title');
        table.string('description');
        table.text('goal').nullable();
        table.text('mission').nullable();
        table.text('vision').nullable();
        table.string('status');
        table.bigInteger('circle_id').unsigned().references('id').inTable('circles').onDelete('SET NULL');
        table.timestamps(true, true);
      });
    } else {
      const hasCircleId = await db.schema.hasColumn('projects', 'circle_id');
      if (!hasCircleId) {
        await db.schema.alterTable('projects', (table) => {
          table.bigInteger('circle_id').unsigned().references('id').inTable('circles').onDelete('SET NULL');
        });
      }
      const hasTitle = await db.schema.hasColumn('projects', 'title');
      if (!hasTitle) {
        await db.schema.alterTable('projects', (table) => {
          table.string('title').nullable();
        });
      }
      const hasGoal = await db.schema.hasColumn('projects', 'goal');
      if (!hasGoal) {
        await db.schema.alterTable('projects', (table) => {
          table.text('goal').nullable();
          table.text('mission').nullable();
          table.text('vision').nullable();
        });
      }
    }

    const hasTasks = await db.schema.hasTable('tasks');
    if (!hasTasks) {
      await db.schema.createTable('tasks', (table) => {
        table.bigIncrements('id');
        table.bigInteger('project_id').unsigned().references('id').inTable('projects').onDelete('CASCADE');
        table.string('title');
        table.text('description');
        table.bigInteger('assigned_officer_id').unsigned().references('id').inTable('officers');
        table.date('due_date');
        table.string('priority');
        table.string('status');
        table.timestamps(true, true);
      });
    } else {
      const hasAssignedOfficerId = await db.schema.hasColumn('tasks', 'assigned_officer_id');
      if (!hasAssignedOfficerId) {
        await db.schema.alterTable('tasks', (table) => {
          table.bigInteger('assigned_officer_id').unsigned().references('id').inTable('officers');
        });
      }
    }

    const hasAlbums = await db.schema.hasTable('albums');
    if (!hasAlbums) {
      await db.schema.createTable('albums', (table) => {
        table.bigIncrements('id');
        table.string('name');
        table.string('description');
        table.boolean('is_restricted').defaultTo(false);
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('SET NULL');
        table.text('allowed_roles').nullable();
        table.text('allowed_departments').nullable();
        table.timestamps(true, true);
      });
    } else {
      const hasOfficerId = await db.schema.hasColumn('albums', 'officer_id');
      if (!hasOfficerId) {
        await db.schema.alterTable('albums', (table) => {
          table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('SET NULL');
        });
      }
      const hasAllowedRoles = await db.schema.hasColumn('albums', 'allowed_roles');
      if (!hasAllowedRoles) {
        await db.schema.alterTable('albums', (table) => {
          table.text('allowed_roles').nullable();
          table.text('allowed_departments').nullable();
        });
      }
      const hasName = await db.schema.hasColumn('albums', 'name');
      if (!hasName) {
        await db.schema.alterTable('albums', (table) => {
          table.string('name').nullable();
          table.boolean('is_restricted').defaultTo(false);
        });
      }
    }

    const hasPhotos = await db.schema.hasTable('photos');
    if (!hasPhotos) {
      await db.schema.createTable('photos', (table) => {
        table.bigIncrements('id');
        table.bigInteger('album_id').unsigned().references('id').inTable('albums').onDelete('CASCADE');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('SET NULL');
        table.string('url');
        table.string('caption');
        table.timestamps(true, true);
      });
    } else {
      const hasOfficerId = await db.schema.hasColumn('photos', 'officer_id');
      if (!hasOfficerId) {
        await db.schema.alterTable('photos', (table) => {
          table.bigInteger('officer_id').unsigned().references('id').inTable('officers').onDelete('SET NULL');
        });
      }
    }

    const hasDashboardNotices = await db.schema.hasTable('dashboard_notices');
    if (!hasDashboardNotices) {
      await db.schema.createTable('dashboard_notices', (table) => {
        table.bigIncrements('id');
        table.string('title');
        table.text('content');
        table.string('priority');
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
      });
    } else {
      const hasIsActive = await db.schema.hasColumn('dashboard_notices', 'is_active');
      if (!hasIsActive) {
        await db.schema.alterTable('dashboard_notices', (table) => {
          table.boolean('is_active').defaultTo(true);
        });
      }
    }

    const hasDashboardEvents = await db.schema.hasTable('dashboard_events');
    if (!hasDashboardEvents) {
      await db.schema.createTable('dashboard_events', (table) => {
        table.bigIncrements('id');
        table.string('title').nullable();
        table.date('event_date').nullable();
        table.string('event_time').nullable();
        table.string('location').nullable();
        table.text('image_url').nullable();
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
      });
    } else {
      // Ensure columns are nullable
      await db.schema.alterTable('dashboard_events', (table) => {
        table.string('title').nullable().alter();
        table.date('event_date').nullable().alter();
        table.string('event_time').nullable().alter();
        table.string('location').nullable().alter();
      });
      const hasIsActive = await db.schema.hasColumn('dashboard_events', 'is_active');
      if (!hasIsActive) {
        await db.schema.alterTable('dashboard_events', (table) => {
          table.boolean('is_active').defaultTo(true);
        });
      }
      const hasEventDate = await db.schema.hasColumn('dashboard_events', 'event_date');
      if (!hasEventDate) {
        await db.schema.alterTable('dashboard_events', (table) => {
          table.date('event_date');
          table.string('event_time');
        });
      }
      const hasImageUrl = await db.schema.hasColumn('dashboard_events', 'image_url');
      if (!hasImageUrl) {
        await db.schema.alterTable('dashboard_events', (table) => {
          table.text('image_url').nullable();
        });
      }
    }

    const hasDashboardVideos = await db.schema.hasTable('dashboard_videos');
    if (!hasDashboardVideos) {
      await db.schema.createTable('dashboard_videos', (table) => {
        table.bigIncrements('id');
        table.string('title');
        table.string('video_url');
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
      });
    } else {
      const hasIsActive = await db.schema.hasColumn('dashboard_videos', 'is_active');
      if (!hasIsActive) {
        await db.schema.alterTable('dashboard_videos', (table) => {
          table.boolean('is_active').defaultTo(true);
        });
      }
      const hasVideoUrl = await db.schema.hasColumn('dashboard_videos', 'video_url');
      if (!hasVideoUrl) {
        await db.schema.alterTable('dashboard_videos', (table) => {
          table.string('video_url').nullable();
        });
      }
    }

    const hasDashboardAlerts = await db.schema.hasTable('dashboard_alerts');
    if (!hasDashboardAlerts) {
      await db.schema.createTable('dashboard_alerts', (table) => {
        table.bigIncrements('id');
        table.string('message');
        table.text('instructions').nullable();
        table.string('type');
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
      });
    } else {
      const hasIsActive = await db.schema.hasColumn('dashboard_alerts', 'is_active');
      if (!hasIsActive) {
        await db.schema.alterTable('dashboard_alerts', (table) => {
          table.boolean('is_active').defaultTo(true);
        });
      }
      const hasInstructions = await db.schema.hasColumn('dashboard_alerts', 'instructions');
      if (!hasInstructions) {
        await db.schema.alterTable('dashboard_alerts', (table) => {
          table.text('instructions').nullable();
        });
      }
    }

    const hasDashboardSettings = await db.schema.hasTable('dashboard_settings');
    if (!hasDashboardSettings) {
      await db.schema.createTable('dashboard_settings', (table) => {
        table.bigIncrements('id');
        table.integer('refresh_interval').defaultTo(30);
        table.integer('scrolling_speed').defaultTo(2);
        table.string('video_source').defaultTo('URL');
        table.text('birthday_image_url').nullable();
        table.string('video_playlist_skip').nullable();
        table.timestamps(true, true);
      });
      await db('dashboard_settings').insert({
        refresh_interval: 30,
        scrolling_speed: 2,
        video_source: 'URL'
      });
    } else {
      const hasVideoSource = await db.schema.hasColumn('dashboard_settings', 'video_source');
      if (!hasVideoSource) {
        await db.schema.alterTable('dashboard_settings', (table) => {
          table.string('video_source').defaultTo('URL');
          table.text('birthday_image_url').nullable();
        });
      }

      const hasSkip = await db.schema.hasColumn('dashboard_settings', 'video_playlist_skip');
      if (!hasSkip) {
        await db.schema.alterTable('dashboard_settings', (table) => {
          table.string('video_playlist_skip').nullable();
        });
      }

      const hasDefaultCover = await db.schema.hasColumn('dashboard_settings', 'default_cover_pic');
      if (!hasDefaultCover) {
        await db.schema.alterTable('dashboard_settings', (table) => {
          table.text('default_cover_pic').nullable();
        });
      }
      // Check for old key/value columns and drop them if they exist and we have the new ones
      const hasKey = await db.schema.hasColumn('dashboard_settings', 'key');
      if (hasKey) {
        // This is a migration from key/value to columns
        // For simplicity in this environment, we might just drop and recreate or ignore
        // But let's try to add the columns if they are missing
        const hasRefresh = await db.schema.hasColumn('dashboard_settings', 'refresh_interval');
        if (!hasRefresh) {
          await db.schema.alterTable('dashboard_settings', (table) => {
            table.integer('refresh_interval').defaultTo(30);
            table.integer('scrolling_speed').defaultTo(2);
          });
        }
      }
    }

    const hasQueue = await db.schema.hasTable('queue');
    if (!hasQueue) {
      await db.schema.createTable('queue', (table) => {
        table.bigIncrements('id');
        table.string('current_token');
        table.string('next_token');
        table.string('counter_number');
        table.boolean('is_visible').defaultTo(true);
        table.timestamps(true, true);
      });
      await db('queue').insert({
        current_token: 'A-000',
        next_token: 'A-001',
        counter_number: '01',
        is_visible: true
      });
    }

    const hasCirculars = await db.schema.hasTable('circulars');
    if (!hasCirculars) {
      await db.schema.createTable('circulars', (table) => {
        table.bigIncrements('id');
        table.string('reference').unique();
        table.string('title');
        table.string('category');
        table.text('summary');
        table.text('content').nullable();
        table.string('document_number').nullable();
        table.date('issued_date').nullable();
        table.string('file_url');
        table.timestamps(true, true);
      });
    }

    const hasTaskUpdates = await db.schema.hasTable('task_updates');
    if (!hasTaskUpdates) {
      await db.schema.createTable('task_updates', (table) => {
        table.bigIncrements('id');
        table.bigInteger('task_id').unsigned().references('id').inTable('tasks').onDelete('CASCADE');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers');
        table.text('comment');
        table.integer('progress');
        table.timestamps(true, true);
      });
    }

    const hasCommunityPosts = await db.schema.hasTable('community_posts');
    if (!hasCommunityPosts) {
      await db.schema.createTable('community_posts', (table) => {
        table.bigIncrements('id');
        table.bigInteger('author_id').unsigned().references('id').inTable('officers');
        table.text('content');
        table.string('image_url').nullable();
        table.integer('likes').defaultTo(0);
        table.timestamps(true, true);
      });
    }

    const hasCommunityComments = await db.schema.hasTable('community_comments');
    if (!hasCommunityComments) {
      await db.schema.createTable('community_comments', (table) => {
        table.bigIncrements('id');
        table.bigInteger('post_id').unsigned().references('id').inTable('community_posts').onDelete('CASCADE');
        table.bigInteger('author_id').unsigned().references('id').inTable('officers');
        table.text('content');
        table.timestamps(true, true);
      });
    }

    const hasJournalEntries = await db.schema.hasTable('journal_entries');
    if (!hasJournalEntries) {
      await db.schema.createTable('journal_entries', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers');
        table.string('title').nullable();
        table.string('category').nullable();
        table.text('content');
        table.text('outcomes').nullable();
        table.text('challenges').nullable();
        table.date('date');
        table.timestamps(true, true);
      });
    }

    const hasAuditLogs = await db.schema.hasTable('audit_logs');
    if (!hasAuditLogs) {
      await db.schema.createTable('audit_logs', (table) => {
        table.bigIncrements('id');
        table.bigInteger('officer_id').unsigned().references('id').inTable('officers');
        table.string('action');
        table.string('resource');
        table.text('details');
        table.timestamps(true, true);
      });
    }

    const hasHolidays = await db.schema.hasTable('holidays');
    if (!hasHolidays) {
      await db.schema.createTable('holidays', (table) => {
        table.bigIncrements('id');
        table.date('date');
        table.string('name');
        table.timestamps(true, true);
      });
    }

    const officerCount = await db('officers').count('id as count').first();
    if (!officerCount || (officerCount.count as number) === 0) {
      console.log('Seeding default admin user...');
      const hashedPin = await bcrypt.hash('1234', 10);
      await db('officers').insert({
        username: 'admin',
        biometric_id: '1001',
        pin: hashedPin,
        name: 'System Administrator',
        post: 'IT Admin',
        department: 'IT',
        role: 'SA',
        work_type: 'OFFICE'
      });
      // Automatically run SQL seed if empty on start
      await executeSeedSql();
    }

    const holidayCount = await db('holidays').count('id as count').first() as any;
    if (!holidayCount || (holidayCount.count as number) === 0) {
      console.log('Seeding sample holidays...');
      const year = new Date().getFullYear();
      await db('holidays').insert([
        { date: `${year}-01-01`, name: 'New Year Day' },
        { date: `${year}-01-14`, name: 'Tamil Thai Pongal Day' },
        { date: `${year}-02-04`, name: 'Independence Day' },
        { date: `${year}-04-13`, name: 'Sinhala & Tamil New Year Eve' },
        { date: `${year}-04-14`, name: 'Sinhala & Tamil New Year Day' },
        { date: `${year}-05-01`, name: 'May Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' }
      ]);
    }

    // Ensure dynamic schema alignment (migrations for existing installations)
    try {
      if (await db.schema.hasTable('resources')) {
        const hasResourcesSpecs = await db.schema.hasColumn('resources', 'specs');
        if (!hasResourcesSpecs) {
          await db.schema.table('resources', (table) => {
            table.text('specs').nullable();
          });
          console.log("Migration: Added 'specs' column to 'resources' table.");
        }
      }
    } catch (migErr: any) {
      console.error("Migration Error 'resources.specs':", migErr.message);
    }

    try {
      if (await db.schema.hasTable('circulars')) {
        const hasCircularsContent = await db.schema.hasColumn('circulars', 'content');
        if (!hasCircularsContent) {
          await db.schema.table('circulars', (table) => {
            table.text('content').nullable();
          });
          console.log("Migration: Added 'content' column to 'circulars' table.");
        }
        const hasCircularsDocNum = await db.schema.hasColumn('circulars', 'document_number');
        if (!hasCircularsDocNum) {
          await db.schema.table('circulars', (table) => {
            table.string('document_number').nullable();
          });
          console.log("Migration: Added 'document_number' column to 'circulars' table.");
        }
        const hasCircularsIssuedDate = await db.schema.hasColumn('circulars', 'issued_date');
        if (!hasCircularsIssuedDate) {
          await db.schema.table('circulars', (table) => {
            table.date('issued_date').nullable();
          });
          console.log("Migration: Added 'issued_date' column to 'circulars' table.");
        }
      }
    } catch (migErr: any) {
      console.error("Migration Error 'circulars':", migErr.message);
    }

    try {
      if (await db.schema.hasTable('journal_entries')) {
        const hasJournalCategory = await db.schema.hasColumn('journal_entries', 'category');
        if (!hasJournalCategory) {
          await db.schema.table('journal_entries', (table) => {
            table.string('category').nullable();
          });
          console.log("Migration: Added 'category' column to 'journal_entries' table.");
        }
      }
    } catch (migErr: any) {
      console.error("Migration Error 'journal_entries.category':", migErr.message);
    }

    try {
      if (await db.schema.hasTable('resource_bookings')) {
        const hasDestination = await db.schema.hasColumn('resource_bookings', 'destination');
        if (!hasDestination) {
          await db.schema.table('resource_bookings', (table) => {
            table.string('destination').nullable();
          });
          console.log("Migration: Added 'destination' column to 'resource_bookings' table.");
        }
      }
    } catch (migErr: any) {
      console.error("Migration Error 'resource_bookings.destination':", migErr.message);
    }
  };

  await ensureTables();

  /**
   * Idempotent schema upgrades. Runs AFTER ensureTables(), so every table it
   * touches is guaranteed to exist — the previous versions of these migrations
   * ran before table creation and silently failed on any fresh database.
   *
   * Covers databases created by either schema path (/setup-db or ensureTables),
   * plus existing production databases that predate these columns.
   */
  const ensureSchemaUpgrades = async () => {
    const columns: { table: string; column: string; create: (t: any) => void }[] = [
      // Without this column every attendance insert in /attendance/import fails.
      { table: 'attendance', column: 'grace_day_used', create: (t) => t.boolean('grace_day_used').defaultTo(false) },
      { table: 'attendance', column: 'leave_type', create: (t) => t.string('leave_type').nullable() },
      // The leave form submits sub_type on every application; without the
      // column the insert fails and no leave can be applied for at all.
      { table: 'leaves', column: 'sub_type', create: (t) => t.string('sub_type').nullable() },
      { table: 'albums', column: 'cover_url', create: (t) => t.string('cover_url').nullable() },
      // The journal form collects outcomes and challenges; the table never had
      // columns for them, so they had nowhere to be stored.
      { table: 'journal_entries', column: 'outcomes', create: (t) => t.text('outcomes').nullable() },
      { table: 'journal_entries', column: 'challenges', create: (t) => t.text('challenges').nullable() },
      { table: 'community_posts', column: 'images', create: (t) => t.text('images').nullable() },
      // Soft-delete columns, mirrored from the /setup-db schema so both paths agree.
      { table: 'officers', column: 'is_deleted', create: (t) => t.boolean('is_deleted').defaultTo(false) },
      { table: 'officers', column: 'deleted_at', create: (t) => t.timestamp('deleted_at').nullable() },
      { table: 'attendance', column: 'is_deleted', create: (t) => t.boolean('is_deleted').defaultTo(false) },
      { table: 'attendance', column: 'deleted_at', create: (t) => t.timestamp('deleted_at').nullable() },
      { table: 'leaves', column: 'is_deleted', create: (t) => t.boolean('is_deleted').defaultTo(false) },
      { table: 'leaves', column: 'deleted_at', create: (t) => t.timestamp('deleted_at').nullable() },
    ];

    for (const { table, column, create } of columns) {
      try {
        if (!(await db.schema.hasTable(table))) continue;
        if (await db.schema.hasColumn(table, column)) continue;
        await db.schema.alterTable(table, (t) => create(t));
        console.log(`[Schema] Added ${table}.${column}`);
      } catch (err: any) {
        console.error(`[Schema] FAILED to add ${table}.${column}:`, err.message);
      }
    }

    // Widen columns that hold the longer status/type names the app now uses.
    {
      const widenings = [
        'ALTER TABLE attendance MODIFY COLUMN status VARCHAR(50) DEFAULT "PRESENT"',
        // The leave form offers SHORT_LEAVE and HALF_DAY, which do not fit the
        // original ENUM('CASUAL','SICK','VACATION','DUTY').
        'ALTER TABLE leaves MODIFY COLUMN type VARCHAR(50)',
        'ALTER TABLE leaves MODIFY COLUMN status VARCHAR(50) DEFAULT "PENDING"',
      ];
      for (const sql of widenings) {
        try {
          await db.raw(sql);
          console.log(`[Schema] ${sql}`);
        } catch (err: any) {
          console.error(`[Schema] FAILED: ${sql} -`, err.message);
        }
      }
    }

    // Indexes for the hottest query patterns. These were previously declared
    // only inside the /setup-db createTable calls, which almost never run, so
    // no database ever received them. Creating an existing index throws, which
    // is the idempotency check.
    const indexes: { table: string; cols: string[]; name: string }[] = [
      { table: 'attendance', cols: ['officer_id', 'date'], name: 'attendance_officer_date_idx' },
      { table: 'attendance', cols: ['date'], name: 'attendance_date_idx' },
      { table: 'attendance', cols: ['status'], name: 'attendance_status_idx' },
      { table: 'biometric_logs', cols: ['hardware_id', 'scan_date'], name: 'biometric_logs_hw_date_idx' },
      { table: 'biometric_logs', cols: ['scan_date'], name: 'biometric_logs_scan_date_idx' },
      { table: 'leaves', cols: ['officer_id', 'status'], name: 'leaves_officer_status_idx' },
      { table: 'leaves', cols: ['start_date', 'end_date'], name: 'leaves_date_range_idx' },
      { table: 'officers', cols: ['department'], name: 'officers_department_idx' },
      { table: 'officers', cols: ['role'], name: 'officers_role_idx' },
      { table: 'activity_logs', cols: ['officer_id'], name: 'activity_logs_officer_idx' },
      { table: 'notifications', cols: ['officer_id'], name: 'notifications_officer_idx' },
    ];

    for (const { table, cols, name } of indexes) {
      try {
        if (!(await db.schema.hasTable(table))) continue;
        let missing = false;
        for (const c of cols) {
          if (!(await db.schema.hasColumn(table, c))) { missing = true; break; }
        }
        if (missing) continue;
        await db.schema.alterTable(table, (t) => t.index(cols, name));
        console.log(`[Schema] Created index ${name}`);
      } catch {
        // Already exists (the common case) — nothing to do.
      }
    }
  };

  await ensureSchemaUpgrades();



  // --- AUTH ROUTES ---
  apiRouter.post('/login', loginLimiter, async (req, res) => {
    const { username, pin } = req.body;
    try {
      const officer = await db('officers')
        .where('username', username)
        .orWhere('biometric_id', username) // Fallback to biometric_id if username not found
        .first();
        
      if (!officer || !(await bcrypt.compare(pin, officer.pin))) {
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      }

      // Tokens previously never expired, so a stolen one was valid forever.
      const token = jwt.sign(
        { id: officer.id, username: officer.username, role: officer.role },
        JWT_SECRET,
        { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'] }
      );
      
      // Remove pin from response
      const { pin: _, ...userWithoutPin } = officer;
      
      res.json({ status: 'success', data: { user: userWithoutPin, token } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Generic Upload Endpoint (Images and Videos)
  // Extensions that may be written into the publicly served uploads directory.
  // The extension used to come straight from the caller-supplied filename, so an
  // attacker could store .html/.svg/.js under our own origin and get stored XSS.
  const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ALLOWED_VIDEO_EXT = ['.mp4', '.webm', '.mov'];
  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

  apiRouter.post('/upload', authenticate, async (req, res) => {
    try {
      const { image, video, filename } = req.body;
      const data = image || video;
      
      if (!data) {
        return res.status(400).json({ status: 'error', message: 'No data provided' });
      }

      // Remove header from base64 string
      const base64Data = data.replace(/^data:[\w/]+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ status: 'error', message: 'File exceeds the 20MB upload limit' });
      }

      const allowed = image ? ALLOWED_IMAGE_EXT : ALLOWED_VIDEO_EXT;
      const requestedExt = filename ? path.extname(String(filename)).toLowerCase() : '';
      if (requestedExt && !allowed.includes(requestedExt)) {
        return res.status(400).json({
          status: 'error',
          message: `Unsupported file type '${requestedExt}'. Allowed: ${allowed.join(', ')}`,
        });
      }
      const ext = requestedExt || (image ? '.jpg' : '.mp4');

      const uniqueFilename = `upload_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
      const filePath = path.join(process.cwd(), 'public', 'uploads', uniqueFilename);
      
      fs.writeFileSync(filePath, buffer);
      
      const url = `/uploads/${uniqueFilename}`;
      res.json({ status: 'success', data: { url } });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // --- AI PROXY ---
  // The Gemini API key stays on the server. It used to be inlined into the
  // client bundle by vite's `define`, which handed it to anyone who opened
  // DevTools on the deployed site.
  const ALLOWED_AI_MODELS = ['gemini-1.5-flash', 'gemini-3-flash-preview', 'gemini-3-pro-preview'];
  const AI_CONFIG_FIELDS = [
    'temperature', 'topK', 'topP', 'maxOutputTokens',
    'thinkingConfig', 'responseMimeType', 'responseSchema', 'systemInstruction',
  ];
  const MAX_AI_PROMPT_CHARS = 32000;

  apiRouter.post('/ai/generate', authenticate, aiLimiter, async (req: any, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ status: 'error', message: 'AI service is not configured on the server' });
    }

    const { model, contents, config } = req.body || {};

    if (typeof contents !== 'string' || !contents.trim()) {
      return res.status(400).json({ status: 'error', message: 'A non-empty `contents` string is required' });
    }
    if (contents.length > MAX_AI_PROMPT_CHARS) {
      return res.status(413).json({ status: 'error', message: 'Prompt is too long' });
    }

    // Never pass a caller-supplied model straight through: allowlist it.
    const chosenModel = ALLOWED_AI_MODELS.includes(model) ? model : ALLOWED_AI_MODELS[0];

    const safeConfig: any = {};
    if (config && typeof config === 'object') {
      for (const key of AI_CONFIG_FIELDS) {
        if (config[key] !== undefined) safeConfig[key] = config[key];
      }
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const result = await ai.models.generateContent({
        model: chosenModel,
        contents,
        ...(Object.keys(safeConfig).length ? { config: safeConfig } : {}),
      });
      res.json({ status: 'success', data: { text: result.text || '' } });
    } catch (error: any) {
      // Log server-side; do not leak provider error detail (or key state) to the client.
      console.error(`[AI] generateContent failed for officer ${req.user?.id}:`, error.message);
      res.status(502).json({ status: 'error', message: 'The AI service could not complete this request.' });
    }
  });

  // Helper to log activities
  async function logActivity(officerId: number | string, type: string, title: string, description: string, link: string | null = null) {
    try {
      await db('activity_logs').insert({
        officer_id: officerId,
        type,
        title,
        description,
        link
      });
    } catch (error) {
      console.error('[ActivityLog] Error logging activity:', error);
    }
  }

  apiRouter.get('/me', authenticate, async (req: any, res) => {
    try {
      const officer = await db('officers').where('id', req.user.id).first();
      if (!officer) return res.status(404).json({ status: 'error', message: 'User not found' });
      const { pin: _, ...userWithoutPin } = officer;
      res.json({ status: 'success', data: userWithoutPin });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.put('/me', authenticate, async (req: any, res) => {
    try {
      const { username, name, birthday, official_phone, address, bio } = req.body;
      const updateData: any = { official_phone, address, bio };
      
      if (name) updateData.name = name;
      if (birthday) updateData.birthday = birthday;

      if (username) {
        const existing = await db('officers').where('username', username).whereNot('id', req.user.id).first();
        if (existing) {
          return res.status(400).json({ status: 'error', message: 'Username already taken' });
        }
        updateData.username = username;
      }

      await db('officers').where('id', req.user.id).update(updateData);
      const officer = await db('officers').where('id', req.user.id).first();
      const { pin: _, ...userWithoutPin } = officer;
      
      await logActivity(req.user.id, 'PROFILE_UPDATE', 'Profile Updated', 'You updated your profile details.');
      
      res.json({ status: 'success', data: userWithoutPin });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/me/change-password', authenticate, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ status: 'error', message: 'Current and new password are required' });
      }

      const officer = await db('officers').where('id', req.user.id).first();
      if (!officer) return res.status(404).json({ status: 'error', message: 'User not found' });

      const isValid = await bcrypt.compare(currentPassword, officer.pin);
      if (!isValid) {
        return res.status(400).json({ status: 'error', message: 'Current password is incorrect' });
      }

      const hashedPin = await bcrypt.hash(newPassword, 10);
      await db('officers').where('id', req.user.id).update({ pin: hashedPin });

      await logActivity(req.user.id, 'PASSWORD_CHANGE', 'Password Changed', 'You successfully changed your security PIN.');

      res.json({ status: 'success', message: 'Password updated successfully' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/me/profile-pic', authenticate, async (req: any, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ status: 'error', message: 'No image URL provided' });

      await db('officers').where('id', req.user.id).update({ pending_profile_pic: imageUrl });
      
      // Notify Admin/IT
      const admins = await db('officers').whereIn('role', ['SA', 'IT']).select('id');
      for (const admin of admins) {
        await db('notifications').insert({
          officer_id: admin.id,
          title: 'Profile Picture Approval Required',
          message: `Officer ${req.user.id} has uploaded a new profile picture that requires approval.`,
          type: 'APPROVAL'
        });
      }

      await logActivity(req.user.id, 'PROFILE_PIC_UPLOAD', 'Profile Picture Uploaded', 'You uploaded a new profile picture for approval.');

      res.json({ status: 'success', message: 'Profile picture submitted for approval' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/me/activities', authenticate, async (req: any, res) => {
    try {
      const activities = await db('activity_logs')
        .where('officer_id', req.user.id)
        .orderBy('created_at', 'desc')
        .limit(50);
      res.json({ status: 'success', data: activities });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/admin/pending-profile-pics', authenticate, async (req: any, res) => {
    try {
      if (!['SA', 'IT', 'ADMIN'].includes(req.user.role)) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized' });
      }
      const pending = await db('officers').whereNotNull('pending_profile_pic').select('id', 'name', 'username', 'post', 'department', 'profile_pic', 'pending_profile_pic');
      res.json({ status: 'success', data: pending });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/admin/approve-profile-pic/:id', authenticate, async (req: any, res) => {
    try {
      if (!['SA', 'IT', 'ADMIN'].includes(req.user.role)) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized' });
      }
      const { approve } = req.body;
      const officer = await db('officers').where('id', req.params.id).first();
      if (!officer) return res.status(404).json({ status: 'error', message: 'Officer not found' });

      if (approve) {
        await db('officers').where('id', req.params.id).update({
          profile_pic: officer.pending_profile_pic,
          pending_profile_pic: null
        });
        await db('notifications').insert({
          officer_id: officer.id,
          title: 'Profile Picture Approved',
          message: 'Your new profile picture has been approved.',
          type: 'SUCCESS'
        });
      } else {
        await db('officers').where('id', req.params.id).update({
          pending_profile_pic: null
        });
        await db('notifications').insert({
          officer_id: officer.id,
          title: 'Profile Picture Rejected',
          message: 'Your new profile picture was rejected and removed.',
          type: 'ERROR'
        });
      }

      res.json({ status: 'success', message: approve ? 'Approved' : 'Rejected' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // --- OTHER API ROUTES ---
  apiRouter.get('/notifications', authenticate, async (req: any, res) => {
    try {
      const notifications = await db('notifications')
        .where(function() {
          this.where('officer_id', req.user.id).orWhereNull('officer_id');
        })
        .orderBy('created_at', 'desc')
        .limit(50);
      res.json({ status: 'success', data: notifications });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/notifications/read-all', authenticate, async (req: any, res) => {
    try {
      await db('notifications')
        .where('officer_id', req.user.id)
        .update({ is_read: true });
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.get('/attendance', authenticate, async (req: any, res) => {
    try {
      const date = req.query.date || new Date().toLocaleDateString('en-CA');
      const attendance = await db('attendance')
        .where({ officer_id: req.user.id, date })
        .first();
      res.json({ status: 'success', data: attendance || null });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/division-attendance', authenticate, async (req, res) => {
    try {
      const { date } = req.query;
      const d = (date as string) || new Date().toLocaleDateString('en-CA');
      
      const raw_scans = await db('biometric_logs')
        .where('scan_date', d)
        .select('*');

      res.json({ 
        status: 'success', 
        data: {
          raw_scans: raw_scans.map(s => ({
            id: s.id,
            hardware_id: s.hardware_id,
            scan_date: s.scan_date,
            scan_time: s.scan_time,
            terminal_id: s.terminal_id,
            status: s.status
          }))
        } 
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * Imports biometric punches.
   *
   * Rewritten to work in bulk. It previously ran about six queries per log row,
   * all awaited in sequence - an officer lookup, a duplicate check, an insert,
   * an attendance lookup, a monthly-stats aggregate and a write - so a month of
   * data for a modest division meant tens of thousands of sequential
   * round-trips. It now issues three reads up front, computes everything in
   * memory, and writes in batches inside a transaction.
   */
  apiRouter.post('/attendance/import', authenticate, async (req, res) => {
    try {
      const { logs } = req.body;

      if (!Array.isArray(logs)) {
        return res.status(400).json({ status: 'error', message: 'Invalid logs format' });
      }
      if (logs.length === 0) {
        return res.json({ status: 'success', message: 'No logs supplied.' });
      }

      const startedAt = Date.now();
      console.log(`[AttendanceImport] Starting import of ${logs.length} logs`);

      const chunk = <T>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const timeToSeconds = (t: any): number => {
        const [h, m, sec] = String(t).split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
        return h * 3600 + m * 60 + (Number.isFinite(sec) ? sec : 0);
      };

      const normalizeDate = (raw: any): string | null => {
        if (raw === null || raw === undefined) return null;
        const parts = String(raw).trim().split(/[-/]/);
        if (parts.length !== 3) return null;
        let y: string, m: string, d: string;
        if (parts[0].length === 4) [y, m, d] = parts;            // YYYY-MM-DD
        else if (parts[2].length === 4) [d, m, y] = parts;       // DD-MM-YYYY
        else return null;
        const key = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
      };

      // --- 1. Normalise and validate every row in memory ---
      interface Punch { bioId: string; date: string; time: string }
      const punches: Punch[] = [];
      const failures: string[] = [];

      for (const log of logs) {
        const bioId = log?.bioId === null || log?.bioId === undefined ? '' : String(log.bioId).trim();
        const date = normalizeDate(log?.date);
        const time = log?.timeIn === null || log?.timeIn === undefined ? '' : String(log.timeIn).trim();
        if (!bioId || !date || !time || Number.isNaN(timeToSeconds(time))) {
          failures.push(`bioId=${bioId || '?'} date=${log?.date ?? '?'} time=${log?.timeIn ?? '?'}`);
          continue;
        }
        punches.push({ bioId, date, time });
      }

      if (punches.length === 0) {
        return res.status(422).json({
          status: 'error',
          message: `None of the ${logs.length} rows could be read.`,
          failures: failures.slice(0, 20),
        });
      }

      const bioIds = [...new Set(punches.map((p) => p.bioId))];
      const sortedDates = punches.map((p) => p.date).sort();
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];

      // --- 2. Two reads: every officer and every existing log in range ---
      const [officerRows, existingLogRows] = await Promise.all([
        db('officers').whereIn('biometric_id', bioIds),
        db('biometric_logs')
          .whereIn('hardware_id', bioIds)
          .whereBetween('scan_date', [minDate, maxDate])
          .select('id', 'hardware_id', 'scan_date', 'scan_time', 'status'),
      ]);

      const officerByBio = new Map<string, any>();
      for (const o of officerRows) officerByBio.set(String(o.biometric_id).trim(), o);

      const logKey = (hw: any, date: any, time: any) => `${String(hw).trim()}|${toDateKey(date)}|${String(time).trim()}`;
      const existingLogMap = new Map<string, any>();
      for (const r of existingLogRows) existingLogMap.set(logKey(r.hardware_id, r.scan_date, r.scan_time), r);

      // --- 3. Work out the biometric_logs writes ---
      const logsToInsert: any[] = [];
      const logIdsToPromote: any[] = [];
      const seenInPayload = new Set<string>();
      const unmappedBioIds = new Set<string>();

      for (const p of punches) {
        const key = logKey(p.bioId, p.date, p.time);
        if (seenInPayload.has(key)) continue; // the same punch repeated in one file
        seenInPayload.add(key);

        const officer = officerByBio.get(p.bioId);
        if (!officer) unmappedBioIds.add(p.bioId);

        const existing = existingLogMap.get(key);
        if (!existing) {
          logsToInsert.push({
            hardware_id: p.bioId,
            scan_date: p.date,
            scan_time: p.time,
            status: officer ? 'SYNCED' : 'UNMAPPED',
          });
        } else if (officer && existing.status === 'UNMAPPED') {
          logIdsToPromote.push(existing.id);
        }
      }

      // --- 4. Group every punch by officer and day ---
      const byOfficerDay = new Map<string, { officer: any; date: string; times: string[] }>();
      for (const p of punches) {
        const officer = officerByBio.get(p.bioId);
        if (!officer) continue; // unmapped: the raw log is kept, no attendance row
        const key = `${officer.id}|${p.date}`;
        let entry = byOfficerDay.get(key);
        if (!entry) {
          entry = { officer, date: p.date, times: [] };
          byOfficerDay.set(key, entry);
        }
        entry.times.push(p.time);
      }

      // --- 5. One read for existing attendance, over the whole affected months ---
      const affectedOfficerIds = [...new Set([...byOfficerDay.values()].map((e) => e.officer.id))];
      const monthStart = `${minDate.slice(0, 7)}-01`;
      // Real last day of the month. The old code built `YYYY-MM-31`, which is
      // not a valid date for February or any 30-day month; MySQL could not
      // compare against it, so the monthly grace / short-leave limits silently
      // stopped being enforced in those months.
      const lastDayOfMaxMonth = new Date(Number(maxDate.slice(0, 4)), Number(maxDate.slice(5, 7)), 0).getDate();
      const monthEnd = `${maxDate.slice(0, 7)}-${String(lastDayOfMaxMonth).padStart(2, '0')}`;

      const existingAttendance = affectedOfficerIds.length
        ? await db('attendance').whereIn('officer_id', affectedOfficerIds).whereBetween('date', [monthStart, monthEnd])
        : [];

      const attendanceByKey = new Map<string, any>();
      const monthlyUsage = new Map<string, { grace: Set<string>; shortLeave: Set<string> }>();
      const usageFor = (officerId: any, dateKey: string) => {
        const key = `${officerId}|${dateKey.slice(0, 7)}`;
        let entry = monthlyUsage.get(key);
        if (!entry) {
          entry = { grace: new Set(), shortLeave: new Set() };
          monthlyUsage.set(key, entry);
        }
        return entry;
      };

      for (const row of existingAttendance) {
        const dateKey = toDateKey(row.date);
        attendanceByKey.set(`${row.officer_id}|${dateKey}`, row);
        const usage = usageFor(row.officer_id, dateKey);
        if (row.grace_day_used) usage.grace.add(dateKey);
        if (row.status === 'SHORT_LEAVE') usage.shortLeave.add(dateKey);
      }

      // --- 6. Compute every status in memory, oldest day first so the monthly
      //        grace and short-leave allowances accumulate in the right order ---
      const attendanceToInsert: any[] = [];
      const attendanceToUpdate: { id: any; values: any }[] = [];
      const todayKey = new Date().toLocaleDateString('en-CA');
      const officersSeenToday = new Set<any>();

      const entries = [...byOfficerDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      for (const entry of entries) {
        const key = `${entry.officer.id}|${entry.date}`;
        const existing = attendanceByKey.get(key);

        // Sorting the day's punches makes the result independent of the order
        // the device exported them in. Processing them in file order used to
        // leave time_out unset whenever the evening row came first.
        const allTimes = [...entry.times];
        if (existing?.time_in) allTimes.push(String(existing.time_in));
        if (existing?.time_out) allTimes.push(String(existing.time_out));

        const sorted = [...new Set(allTimes)]
          .filter((t) => !Number.isNaN(timeToSeconds(t)))
          .sort((a, b) => timeToSeconds(a) - timeToSeconds(b));
        if (sorted.length === 0) continue;

        const timeIn = sorted[0];
        const lastTime = sorted[sorted.length - 1];
        // Unchanged rule: a later scan only counts as a departure when it is
        // more than ten minutes after arrival.
        const hasDeparture = lastTime !== timeIn && timeToSeconds(lastTime) - timeToSeconds(timeIn) > 600;
        const timeOut = hasDeparture ? lastTime : null;
        const effectiveOut = timeOut || timeIn;

        const usage = usageFor(entry.officer.id, entry.date);
        const graceUsed = [...usage.grace].filter((d) => d !== entry.date).length;
        const shortLeavesUsed = [...usage.shortLeave].filter((d) => d !== entry.date).length;

        const { status, shortLeaveMinutesUsed, graceDayUsed } = calculateAttendanceStatus(
          timeIn,
          effectiveOut,
          entry.officer,
          graceUsed,
          shortLeavesUsed,
          entry.date,
        );

        // Keep the running totals correct for later days in the same month.
        if (graceDayUsed) usage.grace.add(entry.date);
        else usage.grace.delete(entry.date);
        if (status === 'SHORT_LEAVE') usage.shortLeave.add(entry.date);
        else usage.shortLeave.delete(entry.date);

        if (entry.date === todayKey) officersSeenToday.add(entry.officer.id);

        const values = {
          time_in: timeIn,
          time_out: timeOut,
          status,
          short_leave_minutes: shortLeaveMinutesUsed || 0,
          grace_day_used: !!graceDayUsed,
        };

        if (!existing) {
          attendanceToInsert.push({ officer_id: entry.officer.id, date: entry.date, ...values });
          attendanceByKey.set(key, { ...values, officer_id: entry.officer.id, date: entry.date });
        } else {
          // Skip rows a re-import would not actually change.
          const unchanged =
            String(existing.time_in ?? '') === String(values.time_in ?? '') &&
            String(existing.time_out ?? '') === String(values.time_out ?? '') &&
            existing.status === values.status &&
            Number(existing.short_leave_minutes || 0) === values.short_leave_minutes &&
            !!existing.grace_day_used === values.grace_day_used;
          if (!unchanged) attendanceToUpdate.push({ id: existing.id, values });
        }
      }

      // --- 7. Write everything in batches, in one transaction ---
      await db.transaction(async (trx) => {
        for (const part of chunk(logsToInsert, 200)) await trx('biometric_logs').insert(part);
        for (const part of chunk(logIdsToPromote, 500)) {
          await trx('biometric_logs').whereIn('id', part).update({ status: 'SYNCED' });
        }
        for (const part of chunk(attendanceToInsert, 200)) await trx('attendance').insert(part);
        for (const { id, values } of attendanceToUpdate) {
          await trx('attendance').where('id', id).update(values);
        }
        if (officersSeenToday.size > 0) {
          await trx('officers')
            .whereIn('id', [...officersSeenToday])
            .update({ dashboard_status: 'AVAILABLE', eta: null, updated_at: trx.fn.now() });
        }
      });

      const elapsed = Date.now() - startedAt;
      console.log(
        `[AttendanceImport] ${logs.length} rows in ${elapsed}ms: ` +
          `${logsToInsert.length} new logs, ${attendanceToInsert.length} attendance created, ` +
          `${attendanceToUpdate.length} updated, ${failures.length} unreadable`,
      );

      let message =
        `${logsToInsert.length} new logs ingested. ` +
        `${attendanceToInsert.length} attendance records created, ${attendanceToUpdate.length} updated.`;
      if (unmappedBioIds.size > 0) {
        const sample = [...unmappedBioIds].slice(0, 5).join(', ');
        message += ` ${unmappedBioIds.size} biometric ID(s) are not mapped to an officer (${sample}${unmappedBioIds.size > 5 ? ', …' : ''}); their scans were stored but no attendance was recorded.`;
      }

      // Partial failures used to be counted into a success message and returned
      // as HTTP 200, so a completely failed import still read as "success".
      if (failures.length > 0) {
        return res.status(207).json({
          status: 'partial',
          message: `${message} ${failures.length} row(s) could not be read.`,
          failures: failures.slice(0, 20),
        });
      }

      res.json({ status: 'success', message });
    } catch (error: any) {
      console.error('[AttendanceImport] Global Error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/attendance/registry', authenticate, async (req, res) => {
    try {
      const { date } = req.query;
      const d = (date as string) || new Date().toLocaleDateString('en-CA');
      console.log(`[AttendanceRegistry] Fetching for date: ${d}`);
      
      const officers = await db('officers').select('id', 'name', 'post', 'department');
      const attendance = await db('attendance')
        .where('date', d)
        .select('*');

      const registry = officers.map(officer => {
        const att = attendance.find(a => String(a.officer_id) === String(officer.id));
        return {
          id: officer.id,
          officer_id: officer.id,
          name: officer.name,
          post: officer.post,
          department: officer.department,
          official_status: att ? att.status : 'ABSENT',
          check_in: att ? att.time_in : null,
          check_out: att ? att.time_out : null,
          status: att ? att.status : 'ABSENT'
        };
      });

      res.json({ status: 'success', data: registry });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/attendance/monthly-registry', authenticate, async (req, res) => {
    try {
      const { year, month } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;
      
      const daysInMonth = new Date(y, m, 0).getDate();
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const calendar = await loadLeaveCalendar();

      const officers = await db('officers').select('id', 'name', 'post');
      const attendance = await db('attendance')
        .whereBetween('date', [startDate, endDate])
        .select('officer_id', 'date', 'status');

      // Approved leave lives in its own table and never reached this grid, so
      // an officer on sanctioned leave was shown as ABSENT.
      const approvedLeaves = await db('leaves')
        .where('status', 'APPROVED')
        .where('start_date', '<=', endDate)
        .where('end_date', '>=', startDate)
        .select('officer_id', 'start_date', 'end_date', 'type');

      const registry = officers.map(officer => {
        const days: Record<number, string> = {};
        for (let i = 1; i <= daysInMonth; i++) {
          const key = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          // Weekends and public holidays are not absences. HOLIDAY and
          // NON_WORKING are rendered distinctly by the registry grid.
          if (calendar.isHoliday(key)) days[i] = 'HOLIDAY';
          else if (!calendar.isWorkingDay(key)) days[i] = 'NON_WORKING';
          else days[i] = 'ABSENT';
        }

        // Overlay approved leave first, so a real attendance scan still wins.
        approvedLeaves
          .filter(l => String(l.officer_id) === String(officer.id))
          .forEach(l => {
            calendar.workingDaysIn(l.start_date, l.end_date).forEach(key => {
              if (key >= startDate && key <= endDate) {
                days[Number(key.slice(8, 10))] = 'LEAVE';
              }
            });
          });

        attendance
          // Compared as strings: the two drivers disagree on whether a BIGINT
          // comes back as a number or a string, and a strict === against the
          // wrong type silently rendered the whole month as ABSENT.
          .filter(a => String(a.officer_id) === String(officer.id))
          .forEach(a => {
            const day = Number(toDateKey(a.date).slice(8, 10));
            days[day] = a.status;
          });

        return {
          officer_id: officer.id,
          name: officer.name,
          post: officer.post,
          days
        };
      });

      res.json({ 
        status: 'success', 
        data: {
          daysInMonth,
          registry
        } 
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/attendance/leaderboard', authenticate, async (req, res) => {
    try {
      // Calculate score based on attendance count in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toLocaleDateString('en-CA');

      const leaderboard = await db('attendance')
        .join('officers', 'attendance.officer_id', 'officers.id')
        .where('attendance.date', '>=', startDate)
        .where('attendance.status', 'PRESENT')
        .whereNotIn('officers.post', ['Administrative Officer', 'Grama Niladari', 'Field Officer'])
        .select('officers.id as officer_id', 'officers.name', 'officers.post', 'officers.profile_pic as avatar')
        .count('attendance.id as score')
        .groupBy('officers.id', 'officers.name', 'officers.post', 'officers.profile_pic')
        .orderBy('score', 'desc')
        .limit(10);

      res.json({ status: 'success', data: leaderboard });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/attendance/check-in', authenticate, async (req: any, res) => {
    try {
      const { time, isTemporary, date: dateParam } = req.body;
      const officer_id = req.user.id;
      const date = dateParam || new Date().toLocaleDateString('en-CA');
      
      const existing = await db('attendance')
        .where({ officer_id, date })
        .first();

      if (existing) {
        return res.status(400).json({ status: 'error', message: 'Already checked in for today.' });
      }

      await db('attendance').insert({
        officer_id,
        date,
        time_in: time,
        is_temporary: !!isTemporary,
        status: 'PRESENT'
      });

      res.json({ status: 'success', data: { message: 'Checked in successfully' } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.get('/presence/unavailability', authenticate, async (req, res) => {
    try {
      const date = req.query.date || new Date().toLocaleDateString('en-CA');
      const items = await db('unavailability')
        .join('officers', 'unavailability.officer_id', 'officers.id')
        .where('unavailability.date', date)
        .select('unavailability.*', 'officers.name as officer_name', 'officers.post as officer_post');
      res.json({ status: 'success', data: items });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/attendance/officer/:officerId', authenticate, async (req, res) => {
    try {
      const { officerId } = req.params;
      const { year, month } = req.query;
      
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;
      
      const daysInMonth = new Date(y, m, 0).getDate();
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const attendance = await db('attendance')
        .where('officer_id', officerId)
        .whereBetween('date', [startDate, endDate])
        .select('*');

      const holidays = await db('holidays')
        .whereBetween('date', [startDate, endDate])
        .select('*');

      res.json({ 
        status: 'success', 
        data: {
          attendance,
          holidays
        } 
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/presence/unavailability', authenticate, async (req: any, res) => {
    try {
      const { date, slot, reason, officer_id } = req.body;
      const target_officer_id = officer_id || req.user.id;
      
      const [id] = await db('unavailability').insert({
        officer_id: target_officer_id,
        date,
        slot,
        reason
      });
      const item = await db('unavailability').where('id', id).first();
      res.json({ status: 'success', data: item });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/presence/unavailability/:id', authenticate, async (req, res) => {
    try {
      await db('unavailability').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/intelligence/snapshot', authenticate, async (req, res) => {
    try {
      const dateParam = req.query.date as string;
      const today = dateParam || new Date().toLocaleDateString('en-CA');
      
      const departments = await db('departments').select('name');
      const officers = await db('officers').select('id', 'department');
      
      const deptsStats = await Promise.all(departments.map(async (dept) => {
        const deptStaff = officers.filter(o => o.department === dept.name);
        const staffCount = deptStaff.length;
        
        const leaveCount = await db('leaves')
          .whereIn('officer_id', deptStaff.map(o => o.id))
          .where('status', 'APPROVED')
          .where('start_date', '<=', today)
          .where('end_date', '>=', today)
          .count('id as count')
          .first();

        const tasksCount = await db('tasks')
          .whereIn('project_id', function() {
            this.select('id').from('projects').whereIn('circle_id', function() {
              this.select('id').from('circles');
            });
          })
          .count('id as count')
          .first();
        
        const risk = staffCount > 0 ? Math.round((Number(leaveCount?.count || 0) / staffCount) * 100) : 0;

        return {
          name: dept.name,
          staff: staffCount,
          leave: Number(leaveCount?.count || 0),
          tasks: Number(tasksCount?.count || 0),
          risk: Math.min(risk * 5 + 10, 100) // Base risk + leave impact
        };
      }));

      // Efficiency trend (last 5 days)
      const efficiency = [];
      for (let i = 4; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-CA');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        
        const attCount = await db('attendance')
          .where({ date: dateStr, status: 'PRESENT' })
          .count('id as count')
          .first();
        
        const value = officers.length > 0 ? Math.round((Number(attCount?.count || 0) / officers.length) * 100) : 0;
        efficiency.push({ day: dayName, value, predicted: value + (Math.random() * 5 - 2.5) });
      }

      const totalLeaves = deptsStats.reduce((acc, d) => acc + d.leave, 0);
      const burnoutScore = officers.length > 0 ? Math.round((totalLeaves / officers.length) * 100) : 0;

      res.json({
        status: 'success',
        data: {
          efficiency,
          depts: deptsStats,
          burnoutScore: Math.min(burnoutScore * 10 + 20, 100),
          divisionalVelocity: 1.24,
          bottleneck: deptsStats.sort((a, b) => b.risk - a.risk)[0]?.name || 'None'
        }
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // The six executive posts the public display tracks, in the order it shows
  // them. dashboard_status holds one row per slot with the officer assigned to
  // it, which is what the Display control screen edits.
  const EXECUTIVE_SLOTS: { id: string; label: string }[] = [
    { id: 'ds', label: 'Divisional Secretary' },
    { id: 'ads', label: 'Assistant Divisional Secretary' },
    { id: 'acc', label: 'Accountant' },
    { id: 'ao', label: 'Administrative Officer' },
    { id: 'adp', label: 'Assistant Director of Planning' },
    { id: 'agn', label: 'Administrative Grama Niladari' },
  ];

  apiRouter.get('/presence/executive-status', authenticate, async (req, res) => {
    try {
      const dateParam = req.query.date as string;
      const date = dateParam || new Date().toLocaleDateString('en-CA');

      // Who counts as an executive comes from the slot assignments, not from a
      // guess at role and job title. The previous version required role to be
      // EXECUTIVE or EX *and* the post to contain one of a hardcoded list of
      // keywords; against a real roster, where these officers are recorded with
      // ordinary roles and local job titles, both tests matched nobody and the
      // panel was simply empty.
      const slotRows = await db('dashboard_status')
        .leftJoin('officers', 'dashboard_status.officer_id', 'officers.id')
        .select(
          'dashboard_status.slot_id',
          'dashboard_status.officer_id',
          'dashboard_status.status as slot_status',
          'dashboard_status.eta as slot_eta',
          'officers.name',
          'officers.post',
          'officers.profile_pic',
          'officers.dashboard_status as officer_status',
          'officers.eta as officer_eta',
        );

      const slotById = new Map(slotRows.map((r: any) => [r.slot_id, r]));
      let executives = EXECUTIVE_SLOTS
        .map(({ id, label }) => {
          const row: any = slotById.get(id);
          if (!row || !row.officer_id) return null; // slot not filled
          return {
            id: row.officer_id,
            name: row.name || label,
            // The slot is the executive function being covered, which is what
            // this panel is about. An officer's own post is often their
            // substantive grade (e.g. "Development Officer") and would make
            // the display read wrong.
            post: label,
            profile_pic: row.profile_pic,
            slotStatus: row.slot_status,
            slotEta: row.slot_eta,
            officerStatus: row.officer_status,
            officerEta: row.officer_eta,
          };
        })
        .filter(Boolean) as any[];

      // Fall back to the old role/post heuristic where no slots are assigned,
      // so a deployment that records proper EXECUTIVE roles still works.
      if (executives.length === 0) {
        const candidates = await db('officers')
          .whereIn('role', ['EXECUTIVE', 'EX'])
          .select('id', 'name', 'post', 'profile_pic', 'dashboard_status', 'eta');
        executives = candidates
          .filter((o: any) => {
            const post = (o.post || '').toLowerCase();
            return EXECUTIVE_SLOTS.some(sl => post.includes(sl.label.toLowerCase()))
              || ['divisional secretary', 'accountant', 'planning', 'administrative officer', 'grama'].some(k => post.includes(k));
          })
          .map((o: any) => ({
            id: o.id,
            name: o.name,
            post: o.post,
            profile_pic: o.profile_pic,
            slotStatus: null,
            slotEta: null,
            officerStatus: o.dashboard_status,
            officerEta: o.eta,
          }));
      }

      if (executives.length === 0) {
        return res.json({ status: 'success', data: [] });
      }

      const execIds = executives.map(e => e.id);
      const [attendanceRows, unavailabilityRows, leaveRows] = await Promise.all([
        db('attendance').whereIn('officer_id', execIds).where('date', date),
        db('unavailability').whereIn('officer_id', execIds).where('date', date),
        db('leaves')
          .whereIn('officer_id', execIds)
          .where('status', 'APPROVED')
          .where('start_date', '<=', date)
          .where('end_date', '>=', date),
      ]);

      const attendanceBy = new Map(attendanceRows.map((r: any) => [String(r.officer_id), r]));
      const unavailabilityBy = new Map(unavailabilityRows.map((r: any) => [String(r.officer_id), r]));
      const leaveBy = new Map(leaveRows.map((r: any) => [String(r.officer_id), r]));

      // Statuses are stored inconsistently ('Available', 'AVAILABLE', 'OFFLINE').
      const normalise = (v: any) => String(v || '').trim().toUpperCase();

      const statusSummary = executives.map((exec) => {
        const key = String(exec.id);
        const att: any = attendanceBy.get(key);
        const unavail: any = unavailabilityBy.get(key);
        const leave: any = leaveBy.get(key);

        // A status set on the slot is the operator's deliberate choice and
        // outranks anything inferred; the officer's own field is the next
        // explicit signal.
        const manual = normalise(exec.slotStatus) !== 'OFFLINE' && normalise(exec.slotStatus) !== ''
          ? normalise(exec.slotStatus)
          : normalise(exec.officerStatus);

        let status_label = 'OFFLINE';
        let eta = exec.slotEta || exec.officerEta || '';

        if (manual && manual !== 'OFFLINE' && manual !== 'AVAILABLE') {
          status_label = manual.includes('FIELD') ? 'OFF TO FIELD' : manual;
        } else if (leave) {
          status_label = 'ON LEAVE';
        } else if (unavail) {
          status_label = 'BUSY';
          eta = unavail.eta || eta;
        } else if (att) {
          const hasTimeOut = att.time_out && att.time_out !== '00:00:00' && att.time_out !== '00:00';
          if (String(att.status || '').includes('FIELD')) status_label = 'OFF TO FIELD';
          else if (hasTimeOut) status_label = 'LEFT';
          else if (att.status === 'LEAVE') status_label = 'ON LEAVE';
          else status_label = 'AVAILABLE';
        } else if (manual === 'AVAILABLE') {
          status_label = 'AVAILABLE';
        }

        return {
          id: exec.id,
          name: exec.name,
          post: exec.post,
          profile_pic: exec.profile_pic,
          is_available: status_label === 'AVAILABLE',
          is_unavail: ['BUSY', 'OFF TO FIELD', 'ON LEAVE', 'LEFT'].includes(status_label),
          status_label,
          eta,
        };
      });

      res.json({ status: 'success', data: statusSummary });
    } catch (error: any) {
      console.error('[ExecutiveStatus] Failed:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/staff', authenticate, async (req, res) => {
    try {
      const staff = await db('officers').select('*');
      const staffWithoutPins = staff.map(({ pin, ...rest }) => rest);
      res.json({ status: 'success', data: staffWithoutPins });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/staff/:id/details', authenticate, async (req: any, res) => {
    try {
      const { id } = req.params;
      const officer = await db('officers').where('id', id).first();
      if (!officer) return res.status(404).json({ status: 'error', message: 'Officer not found' });

      // Get leaves for past 5 years
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      
      const leaves = await db('leaves')
        .where('officer_id', id)
        .where('start_date', '>=', fiveYearsAgo.toISOString().split('T')[0])
        .orderBy('start_date', 'desc');

      const { pin: _, ...officerData } = officer;
      res.json({ status: 'success', data: { ...officerData, leaves } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/staff/:id/map-biometric', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { biometricId } = req.body;

      await db('officers')
        .where({ id })
        .update({ biometric_id: biometricId });

      // Update existing logs for this hardware ID to SYNCED
      await db('biometric_logs')
        .where({ hardware_id: biometricId })
        .update({ status: 'SYNCED' });

      res.json({ status: 'success', message: 'Biometric ID mapped successfully.' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/staff/:id/biometric-history', authenticate, async (req, res) => {
    try {
      const officer = await db('officers').where({ id: req.params.id }).first();
      if (!officer || !officer.biometric_id) {
        return res.json({ status: 'success', data: [] });
      }
      const history = await db('biometric_logs')
        .where({ hardware_id: officer.biometric_id })
        .orderBy('scan_date', 'desc')
        .orderBy('scan_time', 'desc')
        .limit(50);
      res.json({ status: 'success', data: history });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/biometrics/logs/:id', authenticate, async (req, res) => {
    try {
      await db('biometric_logs').where({ id: req.params.id }).delete();
      res.json({ status: 'success', message: 'Log deleted successfully.' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/staff', authenticate, requireRole(...ADMIN_ROLES), async (req, res) => {
    try {
      const { pin, biometric_id, username } = req.body;
      // Only these columns may be set from the request body. Anything else
      // (id, timestamps, arbitrary columns) is ignored rather than mass-assigned.
      const rest = pickOfficerFields(req.body);
      
      // Handle empty biometric_id
      const bioId = (biometric_id && biometric_id.trim()) ? biometric_id.trim() : null;

      // Check if username already exists
      if (username) {
        const existingUsername = await db('officers').where('username', username).first();
        if (existingUsername) {
          return res.status(400).json({ status: 'error', message: `Username ${username} is already taken.` });
        }
      }

      // Check if biometric_id already exists
      if (bioId) {
        const existing = await db('officers').where('biometric_id', bioId).first();
        if (existing) {
          return res.status(400).json({ status: 'error', message: `Biometric ID ${bioId} is already assigned to ${existing.name}` });
        }
      }

      // Never fall back to a shared well-known PIN. If the caller supplies none,
      // generate a random one and return it once so it can be handed to the officer.
      const generatedPin = pin ? null : String(crypto.randomInt(100000, 1000000));
      const hashedPin = await bcrypt.hash(pin || generatedPin, 10);
      const [id] = await db('officers').insert({ ...rest, username, biometric_id: bioId, pin: hashedPin });
      const officer = await db('officers').where('id', id).first();
      const { pin: _, ...userWithoutPin } = officer;
      res.json({ status: 'success', data: { ...userWithoutPin, generated_pin: generatedPin } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.put('/staff/:id', authenticate, requireRole(...ADMIN_ROLES), async (req: any, res) => {
    try {
      const { pin, biometric_id, username } = req.body;
      // Explicit allowlist: prevents mass-assignment of `id`, timestamps, or any
      // column a caller invents. `role` is included but guarded separately below.
      const updateData: any = pickOfficerFields(req.body);

      // Only an SA may change a role, and nobody may change their own.
      if (updateData.role !== undefined) {
        const targetIsSelf = String(req.user.id) === String(req.params.id);
        if (req.user.role !== 'SA' || targetIsSelf) {
          delete updateData.role;
        }
      }
      
      if (username) {
        const existingUsername = await db('officers').where('username', username).whereNot('id', req.params.id).first();
        if (existingUsername) {
          return res.status(400).json({ status: 'error', message: `Username ${username} is already taken.` });
        }
        updateData.username = username;
      }

      // Handle empty biometric_id
      const bioId = (biometric_id && biometric_id.trim()) ? biometric_id.trim() : null;
      updateData.biometric_id = bioId;

      // Check if biometric_id already exists for another officer
      if (bioId) {
        const existing = await db('officers')
          .where('biometric_id', bioId)
          .whereNot('id', req.params.id)
          .first();
        if (existing) {
          return res.status(400).json({ status: 'error', message: `Biometric ID ${bioId} is already assigned to ${existing.name}` });
        }
      }

      // Resetting someone else's PIN is an SA-only action; officers change their
      // own via /me/change-password, which verifies the current PIN first.
      if (pin) {
        if (req.user.role !== 'SA') {
          return res.status(403).json({ status: 'error', message: 'Only a System Administrator may reset a PIN' });
        }
        updateData.pin = await bcrypt.hash(pin, 10);
      }
      await db('officers').where('id', req.params.id).update(updateData);
      const officer = await db('officers').where('id', req.params.id).first();
      const { pin: _, ...userWithoutPin } = officer;
      res.json({ status: 'success', data: userWithoutPin });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.delete('/staff/:id', authenticate, requireRole('SA'), async (req: any, res) => {
    try {
      if (String(req.user.id) === String(req.params.id)) {
        return res.status(400).json({ status: 'error', message: 'You cannot delete your own account' });
      }
      await db('officers').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.get('/config/departments', authenticate, async (req, res) => {
    try {
      const departments = await db('departments').select('*');
      res.json({ status: 'success', data: departments });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/config/departments', authenticate, async (req, res) => {
    try {
      const [id] = await db('departments').insert(req.body);
      const department = await db('departments').where('id', id).first();
      res.json({ status: 'success', data: department });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/config/designations', authenticate, async (req, res) => {
    try {
      const designations = await db('designations').select('*');
      res.json({ status: 'success', data: designations });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/config/designations', authenticate, async (req, res) => {
    try {
      const [id] = await db('designations').insert(req.body);
      const designation = await db('designations').where('id', id).first();
      res.json({ status: 'success', data: designation });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  const SETTING_DEFAULTS: Record<string, string> = {
    work_start_time: '08:30',
    work_end_time: '16:15',
    grace_period_minutes: '15',
    // Sunday = 0 ... Saturday = 6. Days not worked by this division; a leave
    // spanning them is not charged. Empty string = a seven-day operation.
    non_working_weekdays: DEFAULT_NON_WORKING_WEEKDAYS.join(','),
  };

  apiRouter.get('/settings', authenticate, async (req, res) => {
    try {
      // Reads app_settings, a real key/value table. This used to read
      // dashboard_settings, which is single-row and columnar, so s.key and
      // s.value were always undefined and only the defaults were ever returned.
      const settings = await db('app_settings').select('key', 'value');
      const settingsMap: Record<string, string> = {};
      settings.forEach((s: any) => {
        if (s.key) settingsMap[s.key] = s.value;
      });

      res.json({ status: 'success', data: { ...SETTING_DEFAULTS, ...settingsMap } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.put('/settings', authenticate, requireRole(...ADMIN_ROLES), async (req: any, res) => {
    try {
      const updates = req.body || {};
      const keys = Object.keys(updates).filter((k) => k in SETTING_DEFAULTS);
      if (keys.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: `No known settings supplied. Accepted keys: ${Object.keys(SETTING_DEFAULTS).join(', ')}`,
        });
      }

      for (const key of keys) {
        const value = String(updates[key] ?? '');
        const existing = await db('app_settings').where('key', key).first();
        if (existing) {
          await db('app_settings').where('key', key).update({ value, updated_at: db.fn.now() });
        } else {
          await db('app_settings').insert({ key, value });
        }
      }

      const settings = await db('app_settings').select('key', 'value');
      const settingsMap: Record<string, string> = {};
      settings.forEach((s: any) => { if (s.key) settingsMap[s.key] = s.value; });
      res.json({ status: 'success', data: { ...SETTING_DEFAULTS, ...settingsMap } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/settings/holidays', authenticate, async (req, res) => {
    try {
      const holidays = await db('holidays').select('*').orderBy('date', 'asc');
      res.json({ status: 'success', data: holidays });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/settings/holidays', authenticate, requireRole(...HOLIDAY_MANAGER_ROLES), async (req, res) => {
    try {
      const { date, name } = req.body || {};

      // A holiday reduces the leave deducted from every officer, so a malformed
      // or duplicated date here quietly affects the whole division's balances.
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.status(400).json({ status: 'error', message: 'date is required, as YYYY-MM-DD' });
      }
      if (!name || !String(name).trim()) {
        return res.status(400).json({ status: 'error', message: 'name is required' });
      }

      const existing = await db('holidays').where('date', date).first();
      if (existing) {
        return res.status(409).json({ status: 'error', message: `${date} is already a holiday (${existing.name})` });
      }

      const [id] = await db('holidays').insert({ date, name: String(name).trim() });
      console.log(`[Holidays] ${(req as any).user?.username} added ${date} (${name})`);

      const holiday = await db('holidays').where('id', id).first();
      res.json({ status: 'success', data: holiday });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/attendance/manual', authenticate, async (req: any, res) => {
    try {
      const isAdmin = ['IT', 'SA', 'ADMIN', 'EXECUTIVE', 'EX'].includes(req.user.role);
      if (!isAdmin) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized' });
      }

      const { officer_id, date, status, time_in, time_out, is_half_day, short_leave_minutes } = req.body;

      const existing = await db('attendance').where({ officer_id, date }).first();
      if (existing) {
        await db('attendance').where('id', existing.id).update({
          status,
          time_in: time_in !== undefined ? time_in : existing.time_in,
          time_out: time_out !== undefined ? time_out : existing.time_out,
          is_half_day: is_half_day !== undefined ? is_half_day : existing.is_half_day,
          short_leave_minutes: short_leave_minutes !== undefined ? short_leave_minutes : existing.short_leave_minutes,
          updated_at: db.fn.now()
        });
      } else {
        await db('attendance').insert({
          officer_id,
          date,
          status,
          time_in: time_in || null,
          time_out: time_out || null,
          is_half_day: is_half_day || null,
          short_leave_minutes: short_leave_minutes || 0,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        });
      }

      res.json({ status: 'success', message: 'Manual attendance record updated.' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/settings/holidays/:id', authenticate, requireRole(...HOLIDAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('holidays').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.get('/leaves', authenticate, async (req: any, res) => {
    try {
      const leaves = await db('leaves').where('officer_id', req.user.id).select('*');
      res.json({ status: 'success', data: leaves });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // --- LEAVE ACCOUNTING (single source of truth) ---
  // GET /leaves/balances and POST /leaves previously each had their own copy of
  // this arithmetic, and the two disagreed: one counted half-days and the other
  // did not, and the application check billed sick/vacation days against the
  // casual entitlement. Both now call computeLeaveBalances().

  const LEAVE_ENTITLEMENTS = { CASUAL: 21, SICK: 7, VACATION: 21 };

  /**
   * Every calendar day in an inclusive range, as date keys. A reversed range
   * yields nothing rather than a negative count — a reversed range used to
   * produce negative days that silently cancelled out genuine leave.
   */
  const eachDateKey = (start: any, end: any): string[] => {
    const first = toDateKey(start);
    const last = toDateKey(end);
    if (!first || !last || last < first) return [];
    const keys: string[] = [];
    // Parsed with an explicit time so date arithmetic stays in local time.
    const cursor = new Date(`${first}T00:00:00`);
    const stop = new Date(`${last}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(stop.getTime())) return [];
    while (cursor <= stop) {
      keys.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  };

  // --- WORKING-DAY CALENDAR ---
  // Leave is counted in working days. Saturdays, Sundays and public holidays
  // falling inside a leave period are not charged against an entitlement; the
  // calculation used to count every calendar day, so a Friday-to-Tuesday
  // absence cost five days instead of three.

  interface LeaveCalendar {
    isWorkingDay: (dateKey: string) => boolean;
    isHoliday: (dateKey: string) => boolean;
    workingDaysIn: (start: any, end: any) => string[];
  }

  const getSetting = async (key: string): Promise<string | null> => {
    try {
      const row = await db('app_settings').where('key', key).first();
      return row && typeof row.value === 'string' ? row.value : null;
    } catch {
      return null;
    }
  };

  const loadLeaveCalendar = async (): Promise<LeaveCalendar> => {
    let nonWorkingWeekdays = DEFAULT_NON_WORKING_WEEKDAYS;
    const configured = await getSetting('non_working_weekdays');
    if (typeof configured === 'string') {
      // An explicit empty value means a seven-day operation. Note Number('')
      // is 0, not NaN, so the empty case has to be handled before parsing or
      // it silently reads as "Sunday is non-working".
      nonWorkingWeekdays = configured.trim() === ''
        ? []
        : configured
            .split(',')
            .map((n: string) => Number(n.trim()))
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6);
    }

    // The holidays table is small (a few dozen rows per year), so load it once
    // rather than querying per leave request.
    let holidays = new Set<string>();
    try {
      const rows = await db('holidays').select('date');
      holidays = new Set(rows.map((r: any) => toDateKey(r.date)));
    } catch {
      // No holidays table yet; weekends alone still apply.
    }

    const isWorkingDay = (dateKey: string) => {
      if (holidays.has(dateKey)) return false;
      const d = new Date(`${dateKey}T00:00:00`);
      if (Number.isNaN(d.getTime())) return false;
      return !nonWorkingWeekdays.includes(d.getDay());
    };

    return {
      isWorkingDay,
      isHoliday: (dateKey: string) => holidays.has(dateKey),
      workingDaysIn: (start: any, end: any) => eachDateKey(start, end).filter(isWorkingDay),
    };
  };

  /**
   * An officer's leave usage for a year, reconciling both ledgers:
   * approved requests in `leaves`, and days the attendance ledger marks as
   * LEAVE / HALF_DAY / SHORT_LEAVE. A day present in both is counted once.
   */
  const computeLeaveBalances = async (officerId: any, year: number = new Date().getFullYear()) => {
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    const calendar = await loadLeaveCalendar();

    const [approvedLeaves, attendanceLeaves] = await Promise.all([
      db('leaves')
        .where({ officer_id: officerId, status: 'APPROVED' })
        .where(function () {
          // Include leave that starts in a previous year but runs into this one.
          this.whereBetween('start_date', [startOfYear, endOfYear])
            .orWhereBetween('end_date', [startOfYear, endOfYear]);
        }),
      db('attendance')
        .where('officer_id', officerId)
        .whereBetween('date', [startOfYear, endOfYear])
        .whereIn('status', ['LEAVE', 'HALF_DAY', 'SHORT_LEAVE']),
    ]);

    const balances = {
      casual_total: LEAVE_ENTITLEMENTS.CASUAL,
      sick_total: LEAVE_ENTITLEMENTS.SICK,
      vacation_total: LEAVE_ENTITLEMENTS.VACATION,
      casual: 0,
      sick: 0,
      vacation: 0,
      duty: 0,
      short_leave_count: 0,
      half_day_count: 0,
    };

    // Days already accounted for by an approved request, so an attendance row
    // for the same day is not charged a second time.
    const coveredDates = new Set<string>();
    const shortLeavesPerMonth: Record<string, number> = {};

    for (const leave of approvedLeaves) {
      // Only working days inside this year count against this year's
      // entitlement: weekends and public holidays inside a leave are free.
      const daysInYear = calendar
        .workingDaysIn(leave.start_date, leave.end_date)
        .filter((k) => k >= startOfYear && k <= endOfYear);
      daysInYear.forEach((k) => coveredDates.add(k));
      const n = daysInYear.length;
      if (n === 0) continue;

      switch (leave.type) {
        case 'CASUAL': balances.casual += n; break;
        case 'SICK': balances.sick += n; break;
        case 'VACATION': balances.vacation += n; break;
        case 'DUTY': balances.duty += n; break; // duty leave consumes no entitlement
        case 'HALF_DAY':
          balances.half_day_count += 0.5 * n;
          break;
        case 'SHORT_LEAVE':
          for (const k of daysInYear) {
            const monthKey = k.slice(0, 7);
            shortLeavesPerMonth[monthKey] = (shortLeavesPerMonth[monthKey] || 0) + 1;
          }
          break;
        default: break;
      }
    }

    for (const row of attendanceLeaves) {
      const key = toDateKey(row.date);
      if (coveredDates.has(key)) continue; // already charged via an approved request
      if (!calendar.isWorkingDay(key)) continue; // a weekend or holiday costs nothing
      if (row.status === 'LEAVE') {
        balances.casual += 1;
      } else if (row.status === 'HALF_DAY') {
        balances.half_day_count += 0.5;
      } else if (row.status === 'SHORT_LEAVE') {
        const monthKey = key.slice(0, 7);
        shortLeavesPerMonth[monthKey] = (shortLeavesPerMonth[monthKey] || 0) + 1;
      }
    }

    // Conversions into casual leave. Short leaves convert per month, because the
    // entitlement is two per month (ATTENDANCE_RULES.SHORT_LEAVE_COUNT).
    balances.short_leave_count = Object.values(shortLeavesPerMonth).reduce((a, b) => a + b, 0);
    for (const monthlyCount of Object.values(shortLeavesPerMonth)) {
      balances.casual += Math.floor(monthlyCount / 2);
    }
    balances.casual += balances.half_day_count;

    return balances;
  };

  /** Working days a prospective request would consume, by entitlement bucket. */
  const leaveRequestCost = (type: string, startDate: any, endDate: any, calendar: LeaveCalendar): number => {
    const workingDays = calendar.workingDaysIn(startDate, endDate);
    if (type === 'DUTY') return 0;        // consumes no entitlement
    if (type === 'SHORT_LEAVE') return 0; // charged via the per-month conversion
    // A half day on a non-working day costs nothing.
    if (type === 'HALF_DAY') return workingDays.length > 0 ? 0.5 : 0;
    return workingDays.length;
  };

  apiRouter.get('/leaves/balances', authenticate, async (req: any, res) => {
    try {
      // An officer may only read their own balance; admins may read anyone's.
      const requested = req.query.officer_id;
      if (requested && String(requested) !== String(req.user.id) && !ADMIN_ROLES.includes(req.user.role)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: you may only view your own leave balance' });
      }
      const officer_id = requested || req.user.id;
      const balances = await computeLeaveBalances(officer_id);
      res.json({ status: 'success', data: balances });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/leaves', authenticate, async (req: any, res) => {
    try {
      const { type, sub_type, start_date, end_date, reason } = req.body || {};

      const VALID_TYPES = ['CASUAL', 'SICK', 'VACATION', 'DUTY', 'SHORT_LEAVE', 'HALF_DAY'];
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ status: 'error', message: `Invalid leave type. Expected one of: ${VALID_TYPES.join(', ')}` });
      }
      if (!start_date || !end_date) {
        return res.status(400).json({ status: 'error', message: 'start_date and end_date are required' });
      }

      // Reject a reversed range outright rather than letting it through as a
      // negative day count that cancels out genuine leave.
      const requestedDates = eachDateKey(start_date, end_date);
      if (requestedDates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'end_date must be the same as or after start_date' });
      }

      // A range made up entirely of weekends and holidays consumes nothing, so
      // there is nothing to apply for; say so rather than filing an empty request.
      const calendar = await loadLeaveCalendar();
      const workingDays = calendar.workingDaysIn(start_date, end_date);
      if (workingDays.length === 0 && type !== 'DUTY') {
        return res.status(400).json({
          status: 'error',
          message: 'That period contains no working days (weekends and public holidays are not deducted).',
        });
      }

      // Same arithmetic the balance endpoint reports, so the two never disagree.
      const balances = await computeLeaveBalances(req.user.id);
      const cost = leaveRequestCost(type, start_date, end_date, calendar);

      const bucket: Record<string, { used: number; total: number; label: string }> = {
        CASUAL: { used: balances.casual, total: balances.casual_total, label: 'casual' },
        SICK: { used: balances.sick, total: balances.sick_total, label: 'sick' },
        VACATION: { used: balances.vacation, total: balances.vacation_total, label: 'vacation' },
        // A half day is charged against casual leave.
        HALF_DAY: { used: balances.casual, total: balances.casual_total, label: 'casual' },
      };

      const applicable = bucket[type];
      if (applicable && cost > 0 && applicable.used + cost > applicable.total) {
        const remaining = Math.max(0, applicable.total - applicable.used);
        return res.status(400).json({
          status: 'error',
          message: `Insufficient ${applicable.label} leave balance. Available: ${remaining} day(s), requested: ${cost} day(s).`,
        });
      }

      // Overlap against existing approved leave. The three clauses cover a new
      // range that starts inside, ends inside, or fully encloses an approved one.
      const overlap = await db('leaves')
        .where('officer_id', req.user.id)
        .where('status', 'APPROVED')
        .where(function () {
          this.whereBetween('start_date', [start_date, end_date])
            .orWhereBetween('end_date', [start_date, end_date])
            .orWhere(function () {
              this.where('start_date', '<=', start_date).andWhere('end_date', '>=', end_date);
            });
        })
        .first();

      if (overlap) {
        return res.status(400).json({ status: 'error', message: 'This leave period overlaps with an existing approved leave.' });
      }

      // Explicit field list: req.body used to be spread straight into the insert,
      // so any column name a caller invented was written through.
      const [id] = await db('leaves').insert({
        officer_id: req.user.id,
        type,
        sub_type: sub_type || null,
        start_date,
        end_date,
        reason: reason || null,
        status: 'PENDING',
      });
      const leave = await db('leaves').where('id', id).first();
      res.json({ status: 'success', data: leave });
    } catch (error: any) {
      console.error('[Leaves] Application failed:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/admin/leaves/pending', authenticate, requireRole(...APPROVER_ROLES), async (req, res) => {
    try {
      const leaves = await db('leaves')
        .join('officers', 'leaves.officer_id', 'officers.id')
        .where('leaves.status', 'PENDING')
        .select('leaves.*', 'officers.name as officer_name', 'officers.post as officer_post');
      res.json({ status: 'success', data: leaves });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  const LEAVE_DECISIONS = ['APPROVED', 'REJECTED', 'PENDING'];

  apiRouter.put('/leaves/:id/status', authenticate, requireRole(...APPROVER_ROLES), async (req: any, res) => {
    try {
      const { status } = req.body || {};

      // The column is a plain VARCHAR, so without this check any string lands in
      // it. A leave left in an unrecognised state is invisible to both the
      // balance calculation and the pending queue, which filter on exact values.
      if (!LEAVE_DECISIONS.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid status. Expected one of: ${LEAVE_DECISIONS.join(', ')}`,
        });
      }

      const leave = await db('leaves').where('id', req.params.id).first();
      if (!leave) {
        return res.status(404).json({ status: 'error', message: 'Leave request not found' });
      }

      // An approver may not action their own request, regardless of role.
      if (String(leave.officer_id) === String(req.user.id)) {
        return res.status(403).json({
          status: 'error',
          message: 'You cannot action your own leave request. Another approver must review it.',
        });
      }

      await db('leaves').where('id', req.params.id).update({ status, updated_at: db.fn.now() });

      await logActivity(
        leave.officer_id,
        'LEAVE_DECISION',
        `Leave ${status.toLowerCase()}`,
        `Your ${leave.type} leave for ${toDateKey(leave.start_date)} to ${toDateKey(leave.end_date)} was ${status.toLowerCase()}.`,
      );
      console.log(`[Leaves] ${req.user.username} (${req.user.role}) set leave ${req.params.id} to ${status} for officer ${leave.officer_id}`);

      res.json({ status: 'success', data: { id: Number(req.params.id), status } });
    } catch (error: any) {
      console.error('[Leaves] Status update failed:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/resources', authenticate, async (req, res) => {
    try {
      const resources = await db('resources').select('*');
      res.json({ status: 'success', data: resources });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/resources', authenticate, async (req: any, res) => {
    try {
      const userRole = req.user?.role || '';
      const userPost = (req.user?.post || '').toLowerCase();
      const isAllowed = ['SA', 'ADMIN', 'IT'].includes(userRole) || userPost.includes('ito') || userPost.includes('it officer');
      if (!isAllowed) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized. Only System Admin or ITO can add resources.' });
      }

      const { name, type, description, status, specs } = req.body;
      const [newId] = await db('resources').insert({
        name,
        type,
        description,
        status: status || 'AVAILABLE',
        specs
      });
      const resource = await db('resources').where('id', newId).first();
      res.json({ status: 'success', data: resource });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.put('/resources/:id', authenticate, async (req: any, res) => {
    try {
      const userRole = req.user?.role || '';
      const userPost = (req.user?.post || '').toLowerCase();
      const isAllowed = ['SA', 'ADMIN', 'IT'].includes(userRole) || userPost.includes('ito') || userPost.includes('it officer');
      if (!isAllowed) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized. Only System Admin or ITO can update resources.' });
      }

      const { name, type, description, status, specs } = req.body;
      await db('resources').where('id', req.params.id).update({
        name,
        type,
        description,
        status,
        specs
      });
      const resource = await db('resources').where('id', req.params.id).first();
      res.json({ status: 'success', data: resource });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/resources/:id', authenticate, async (req: any, res) => {
    try {
      const userRole = req.user?.role || '';
      const userPost = (req.user?.post || '').toLowerCase();
      const isAllowed = ['SA', 'ADMIN', 'IT'].includes(userRole) || userPost.includes('ito') || userPost.includes('it officer');
      if (!isAllowed) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized. Only System Admin or ITO can delete resources.' });
      }

      await db('resources').where('id', req.params.id).del();
      res.json({ status: 'success', data: { id: req.params.id } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/resources/my-bookings', authenticate, async (req: any, res) => {
    try {
      const bookings = await db('resource_bookings')
        .join('resources', 'resource_bookings.resource_id', 'resources.id')
        .where('resource_bookings.officer_id', req.user.id)
        .select('resource_bookings.*', 'resources.name as resource_name', 'resources.type as resource_type');
      res.json({ status: 'success', data: bookings });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/resources/bookings', authenticate, async (req: any, res) => {
    try {
      // Explicit field list. req.body used to be spread straight into the insert,
      // which let a caller set `status` and create a booking that was already
      // APPROVED - bypassing the approval route entirely - and let any invented
      // column through to fail the insert.
      const { resource_id, start_time, end_time, purpose, destination } = req.body || {};

      if (!resource_id || !start_time || !end_time) {
        return res.status(400).json({
          status: 'error',
          message: 'resource_id, start_time and end_time are required',
        });
      }

      const startMs = new Date(start_time).getTime();
      const endMs = new Date(end_time).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return res.status(400).json({ status: 'error', message: 'start_time and end_time must be valid dates' });
      }
      if (endMs <= startMs) {
        return res.status(400).json({ status: 'error', message: 'end_time must be after start_time' });
      }

      const resource = await db('resources').where('id', resource_id).first();
      if (!resource) {
        return res.status(404).json({ status: 'error', message: 'Resource not found' });
      }

      // A resource can only be in one place at a time. Two requests for the same
      // vehicle at the same hour were both accepted, and both could be approved.
      // Ranges touching end-to-end do not clash: a booking ending at 11:00 and
      // another starting at 11:00 are fine.
      const clash = await db('resource_bookings')
        .where('resource_id', resource_id)
        .whereIn('status', ['PENDING', 'APPROVED'])
        .where('start_time', '<', end_time)
        .where('end_time', '>', start_time)
        .first();

      if (clash) {
        const holder = await db('officers').where('id', clash.officer_id).first();
        return res.status(409).json({
          status: 'error',
          message: `${resource.name} is already booked from ${clash.start_time} to ${clash.end_time}`
            + (holder ? ` by ${holder.name}` : '')
            + ` (${String(clash.status).toLowerCase()}).`,
        });
      }

      const [id] = await db('resource_bookings').insert({
        resource_id,
        start_time,
        end_time,
        purpose: purpose || null,
        destination: destination || null,
        officer_id: req.user.id,
        // Always starts PENDING. Only the approval route may change this.
        status: 'PENDING',
      });
      const booking = await db('resource_bookings').where('id', id).first();

      // Retrieve additional info for notifications
      try {
        const resourceName = resource.name || `Resource #${resource_id}`;
        const officerObj = await db('officers').where('id', req.user.id).first();
        const officerName = officerObj ? officerObj.name : `Officer #${req.user.id}`;

        const allOfficers = await db('officers').select('id', 'post', 'role');
        const approvers = allOfficers.filter(off => {
          const post = (off.post || '').toLowerCase();
          const role = (off.role || '').toLowerCase();
          return (
            post.includes('divisional secretary') ||
            post.includes('ds') ||
            post.includes('assistant divisional secretary') ||
            post.includes('ads') ||
            post.includes('administrative officer') ||
            post.includes('ao') ||
            ['sa', 'it', 'admin'].includes(role)
          );
        });

        for (const apprv of approvers) {
          await db('notifications').insert({
            officer_id: apprv.id,
            title: 'New Resource request',
            message: `${officerName} has requested a booking for ${resourceName} starting on ${new Date(start_time).toLocaleString()}.`,
            is_read: false,
            type: 'APPROVAL'
          });
        }
      } catch (notifErr) {
        console.error('Error throwing notifications for booking:', notifErr);
      }

      res.json({ status: 'success', data: booking });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/admin/resources/pending', authenticate, requireRole(...APPROVER_ROLES), async (req, res) => {
    try {
      const bookings = await db('resource_bookings')
        .join('resources', 'resource_bookings.resource_id', 'resources.id')
        .join('officers', 'resource_bookings.officer_id', 'officers.id')
        .where('resource_bookings.status', 'PENDING')
        .select('resource_bookings.*', 'resources.name as resource_name', 'officers.name as officer_name');
      res.json({ status: 'success', data: bookings });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  const BOOKING_DECISIONS = ['APPROVED', 'REJECTED', 'PENDING'];

  apiRouter.put('/resources/bookings/:id/status', authenticate, requireRole(...APPROVER_ROLES), async (req: any, res) => {
    try {
      const { status } = req.body || {};
      if (!BOOKING_DECISIONS.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid status. Expected one of: ${BOOKING_DECISIONS.join(', ')}`,
        });
      }

      const booking = await db('resource_bookings').where('id', req.params.id).first();
      if (!booking) {
        return res.status(404).json({ status: 'error', message: 'Booking not found' });
      }

      if (String(booking.officer_id) === String(req.user.id)) {
        return res.status(403).json({
          status: 'error',
          message: 'You cannot action your own booking. Another approver must review it.',
        });
      }

      await db('resource_bookings').where('id', req.params.id).update({ status, updated_at: db.fn.now() });
      console.log(`[Resources] ${req.user.username} (${req.user.role}) set booking ${req.params.id} to ${status}`);

      res.json({ status: 'success', data: { id: Number(req.params.id), status } });
    } catch (error: any) {
      console.error('[Resources] Booking status update failed:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/audit', authenticate, async (req, res) => {
    try {
      const logs = await db('audit_logs')
        .join('officers', 'audit_logs.officer_id', 'officers.id')
        .select('audit_logs.*', 'officers.name as officer_name')
        .orderBy('audit_logs.created_at', 'desc')
        .limit(100);
      res.json({ status: 'success', data: logs });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/layout/mapping', authenticate, async (req, res) => {
    try {
      const { section } = req.query;
      if (section) {
        const row = await db('layout_mapping').where('section_id', String(section)).first();
        if (row && row.elements_json) {
          try {
            const elements = JSON.parse(row.elements_json);
            return res.json({ status: 'success', data: elements });
          } catch (e) {
            return res.json({ status: 'success', data: [] });
          }
        }
        return res.json({ status: 'success', data: [] });
      }

      const rows = await db('layout_mapping').select('*');
      const allElements: any[] = [];
      for (const row of rows) {
        if (row.elements_json) {
          try {
            const arr = JSON.parse(row.elements_json);
            if (Array.isArray(arr)) {
              allElements.push(...arr);
            }
          } catch (e) {
            // ignore
          }
        }
      }
      res.json({ status: 'success', data: allElements });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/layout/mapping', authenticate, async (req, res) => {
    try {
      const { section, layouts } = req.body;
      if (!section) {
        return res.status(400).json({ status: 'error', message: 'section parameter is required' });
      }
      await db('layout_mapping').where('section_id', section).del();
      await db('layout_mapping').insert({
        section_id: section,
        elements_json: JSON.stringify(layouts || [])
      });
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/journal', authenticate, async (req: any, res) => {
    try {
      const entries = await db('journal_entries')
        .where('officer_id', req.user.id)
        .orderBy('date', 'desc')
        .orderBy('created_at', 'desc');
      res.json({ status: 'success', data: entries });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/journal', authenticate, async (req: any, res) => {
    try {
      const [id] = await db('journal_entries').insert({
        ...pickFields(req.body, ['title', 'category', 'content', 'outcomes', 'challenges']),
        officer_id: req.user.id,
        date: req.body?.date || new Date().toLocaleDateString('en-CA')
      });
      const entry = await db('journal_entries').where('id', id).first();
      res.json({ status: 'success', data: entry });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/journal/:id', authenticate, async (req: any, res) => {
    try {
      const entry = await db('journal_entries').where('id', req.params.id).first();
      if (!entry) {
        return res.status(404).json({ status: 'error', message: 'Journal entry not found' });
      }
      // The journal is a personal record; only its author may remove an entry.
      if (String(entry.officer_id) !== String(req.user.id)) {
        return res.status(403).json({ status: 'error', message: 'You can only delete your own journal entries' });
      }
      await db('journal_entries').where('id', req.params.id).del();
      res.json({ status: 'success', data: { id: Number(req.params.id) } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/circles', authenticate, async (req, res) => {
    try {
      const circles = await db('circles').select('*');
      res.json({ status: 'success', data: circles });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/circles', authenticate, async (req, res) => {
    try {
      const [id] = await db('circles').insert(req.body);
      const circle = await db('circles').where('id', id).first();
      res.json({ status: 'success', data: circle });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/circles/:id/projects', authenticate, async (req, res) => {
    try {
      const projects = await db('projects').where('circle_id', req.params.id).select('*');
      res.json({ status: 'success', data: projects });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/circles/:id/projects', authenticate, async (req, res) => {
    try {
      const [id] = await db('projects').insert({
        ...pickFields(req.body, ['title', 'description', 'goal', 'mission', 'vision', 'status']),
        circle_id: req.params.id,
      });
      const project = await db('projects').where('id', id).first();
      res.json({ status: 'success', data: project });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/projects/:id/tasks', authenticate, async (req, res) => {
    try {
      const tasks = await db('tasks').where('project_id', req.params.id).select('*');
      res.json({ status: 'success', data: tasks });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/projects/:id/tasks', authenticate, async (req, res) => {
    try {
      const [id] = await db('tasks').insert({
        ...pickFields(req.body, ['title', 'description', 'due_date', 'priority', 'status', 'assigned_officer_id']),
        project_id: req.params.id,
      });
      const task = await db('tasks').where('id', id).first();
      res.json({ status: 'success', data: task });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/tasks/:id/updates', authenticate, async (req: any, res) => {
    try {
      // The client posts `content`; the column is `comment`. Previously the
      // whole body was spread into the insert, so every task update failed with
      // "no such column: content". Accept either name.
      const { comment, content, progress } = req.body || {};
      const text = comment ?? content;
      if (!text || !String(text).trim()) {
        return res.status(400).json({ status: 'error', message: 'An update comment is required' });
      }

      const [id] = await db('task_updates').insert({
        comment: String(text),
        ...(progress !== undefined ? { progress } : {}),
        task_id: req.params.id,
        officer_id: req.user.id
      });
      const update = await db('task_updates').where('id', id).first();
      res.json({ status: 'success', data: update });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/circulars', authenticate, async (req, res) => {
    const circulars = await db('circulars').select('*');
    res.json({ status: 'success', data: circulars });
  });
  apiRouter.post('/circulars', authenticate, async (req, res) => {
    try {
      const [id] = await db('circulars').insert(req.body);
      const circular = await db('circulars').where('id', id).first();
      res.json({ status: 'success', data: circular });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/circulars/:id', authenticate, async (req, res) => {
    try {
      await db('circulars').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/circulars/:id/sign-off', authenticate, async (req: any, res) => {
    try {
      // This could be a separate table 'circular_signoffs'
      // For now, let's just return success
      res.json({ status: 'success', data: { message: 'Signed off' } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  const isCommunityAdmin = (role: string) => {
    return ['IT', 'SA', 'ADMIN', 'EXECUTIVE', 'EX'].includes(role);
  };

  apiRouter.get('/community/posts', authenticate, async (req, res) => {
    try {
      const posts = await db('community_posts')
        .join('officers', 'community_posts.author_id', 'officers.id')
        .select(
          'community_posts.*', 
          'officers.name as author', 
          'officers.post as author_post', 
          'officers.profile_pic as author_avatar',
          'officers.id as author_id'
        )
        .orderBy('community_posts.created_at', 'desc');
      
      const postsWithData = await Promise.all(posts.map(async (post) => {
        const comments = await db('community_comments')
          .join('officers', 'community_comments.author_id', 'officers.id')
          .where('post_id', post.id)
          .select('community_comments.*', 'officers.name as author', 'officers.profile_pic as author_avatar', 'officers.id as author_id');
        
        let imagesList = [];
        try {
          imagesList = post.images ? JSON.parse(post.images) : (post.image_url ? [post.image_url] : []);
        } catch (e) {
          imagesList = post.image_url ? [post.image_url] : [];
        }

        // Map fields for frontend
        return { 
          ...post, 
          image: imagesList[0], // For backward compatibility
          images: imagesList,
          post: post.author_post,
          time: new Date(post.created_at).toLocaleString(),
          comments_count: comments.length,
          isLiked: false, 
          comments: comments.map(c => ({
            ...c,
            time: new Date(c.created_at).toLocaleString()
          }))
        };
      }));

      res.json({ status: 'success', data: postsWithData });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/community/posts', authenticate, async (req: any, res) => {
    try {
      const { content, images } = req.body;
      const user = req.user;
      
      const isAdmin = isCommunityAdmin(user.role);
      
      // 1. Post frequency limit (1 per day for non-admins)
      if (!isAdmin) {
        const today = new Date().toISOString().split('T')[0];
        const todayPosts = await db('community_posts')
          .where('author_id', user.id)
          .where('created_at', '>=', `${today} 00:00:00`)
          .count('id as count')
          .first();
        
        if (todayPosts && Number(todayPosts.count) >= 1) {
          return res.status(403).json({ status: 'error', message: 'Standard officers are only allowed to post once per day.' });
        }
      }

      // 2. Photo limit validation
      const imagesArray = Array.isArray(images) ? images : (images ? [images] : []);
      const maxPhotos = isAdmin ? 12 : 3;
      if (imagesArray.length > maxPhotos) {
        return res.status(400).json({ status: 'error', message: `Your role is only allowed to post up to ${maxPhotos} photos per post.` });
      }

      const [id] = await db('community_posts').insert({
        content,
        images: JSON.stringify(imagesArray),
        image_url: imagesArray[0] || null,
        author_id: user.id,
        created_at: new Date(),
        updated_at: new Date()
      });

      const post = await db('community_posts').where('id', id).first();
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/community/posts/:id', authenticate, async (req: any, res) => {
    try {
      const post = await db('community_posts').where('id', req.params.id).first();
      if (!post) return res.status(404).json({ status: 'error', message: 'Post not found' });

      const isAdmin = isCommunityAdmin(req.user.role);
      const isOwner = post.author_id === req.user.id;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ status: 'error', message: 'Permission denied' });
      }

      if (isAdmin && !isOwner) {
        // Send notification to author
        await db('notifications').insert({
          officer_id: post.author_id,
          title: 'Post Removed',
          message: 'Your post was removed due to breaking guidelines by Admin/DS/ITO',
          type: 'WARNING',
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      await db('community_posts').where('id', req.params.id).delete();
      res.json({ status: 'success', message: 'Post removed' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/community/posts/:id/like', authenticate, async (req, res) => {
    try {
      await db('community_posts').where('id', req.params.id).increment('likes', 1);
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/community/posts/:id/comments', authenticate, async (req: any, res) => {
    try {
      const user = req.user;
      const isAdmin = isCommunityAdmin(user.role);

      // 3. Comment limit validation (1 per post for non-admins)
      if (!isAdmin) {
        const existingComments = await db('community_comments')
          .where({ post_id: req.params.id, author_id: user.id })
          .count('id as count')
          .first();
        
        if (existingComments && Number(existingComments.count) >= 1) {
          return res.status(403).json({ status: 'error', message: 'Non-admin officers are only allowed one comment per post.' });
        }
      }

      const [id] = await db('community_comments').insert({
        content: req.body.content,
        post_id: req.params.id,
        author_id: user.id,
        created_at: new Date(),
        updated_at: new Date()
      });
      const comment = await db('community_comments').where('id', id).first();
      res.json({ status: 'success', data: comment });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/community/comments/:id', authenticate, async (req: any, res) => {
    try {
      const comment = await db('community_comments').where('id', req.params.id).first();
      if (!comment) return res.status(404).json({ status: 'error', message: 'Comment not found' });

      const isAdmin = isCommunityAdmin(req.user.role);
      const isOwner = comment.author_id === req.user.id;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ status: 'error', message: 'Permission denied' });
      }

      if (isAdmin && !isOwner) {
        // Send notification to author
        await db('notifications').insert({
          officer_id: comment.author_id,
          title: 'Comment Removed',
          message: 'Your comment was removed due to breaking guidelines by Admin/DS/ITO',
          type: 'WARNING',
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      await db('community_comments').where('id', req.params.id).delete();
      res.json({ status: 'success', message: 'Comment removed' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/gallery/albums', authenticate, async (req, res) => {
    try {
      const albums = await db('albums')
        .leftJoin('officers', 'albums.officer_id', 'officers.id')
        .select('albums.*', 'officers.name as creator_name');
      
      const albumsWithCount = await Promise.all(albums.map(async (album) => {
        const photosCount = await db('photos').where('album_id', album.id).count('id as count').first();
        return { 
          ...album, 
          photos_count: photosCount?.count || 0,
          creator: { name: album.creator_name || 'System' },
          allowed_roles: album.allowed_roles ? JSON.parse(album.allowed_roles) : [],
          allowed_departments: album.allowed_departments ? JSON.parse(album.allowed_departments) : []
        };
      }));

      res.json({ status: 'success', data: albumsWithCount });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.get('/gallery/albums/:id', authenticate, async (req, res) => {
    try {
      const album = await db('albums')
        .leftJoin('officers', 'albums.officer_id', 'officers.id')
        .where('albums.id', req.params.id)
        .select('albums.*', 'officers.name as creator_name')
        .first();
      
      if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });

      const photos = await db('photos')
        .leftJoin('officers', 'photos.officer_id', 'officers.id')
        .where('album_id', req.params.id)
        .select('photos.*', 'officers.name as uploader_name');

      res.json({ 
        status: 'success', 
        data: { 
          ...album, 
          creator: { name: album.creator_name || 'System' },
          photos: photos.map(p => ({ ...p, uploader: { name: p.uploader_name || 'System' } })),
          allowed_roles: album.allowed_roles ? JSON.parse(album.allowed_roles) : [],
          allowed_departments: album.allowed_departments ? JSON.parse(album.allowed_departments) : []
        } 
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/gallery/albums', authenticate, async (req: any, res) => {
    try {
      const { allowed_roles, allowed_departments, ...rest } = req.body;
      const [id] = await db('albums').insert({ 
        ...rest, 
        officer_id: req.user.id,
        allowed_roles: JSON.stringify(allowed_roles || []),
        allowed_departments: JSON.stringify(allowed_departments || [])
      });
      const album = await db('albums').where('id', id).first();
      res.json({ status: 'success', data: album });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.put('/gallery/albums/:id', authenticate, async (req: any, res) => {
    try {
      const { allowed_roles, allowed_departments, ...rest } = req.body;
      const album = await db('albums').where('id', req.params.id).first();
      if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });
      
      const isOwner = album.officer_id === req.user.id;
      const isAdmin = ['SA', 'ADMIN', 'IT'].includes(req.user.role);
      if (!isOwner && !isAdmin) return res.status(403).json({ status: 'error', message: 'Unauthorized' });

      await db('albums').where('id', req.params.id).update({
        ...rest,
        allowed_roles: allowed_roles ? JSON.stringify(allowed_roles) : album.allowed_roles,
        allowed_departments: allowed_departments ? JSON.stringify(allowed_departments) : album.allowed_departments
      });
      res.json({ status: 'success', message: 'Album updated' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/gallery/albums/:id', authenticate, async (req, res) => {
    try {
      await db('albums').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/gallery/albums/:id/thumbnail', authenticate, async (req: any, res) => {
    try {
      const { url } = req.body;
      const album = await db('albums').where('id', req.params.id).first();
      if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });
      
      const isOwner = album.officer_id === req.user.id;
      const isAdmin = ['SA', 'ADMIN', 'IT'].includes(req.user.role);
      if (!isOwner && !isAdmin) return res.status(403).json({ status: 'error', message: 'Unauthorized' });

      await db('albums').where('id', req.params.id).update({ cover_url: url });
      res.json({ status: 'success', message: 'Thumbnail updated' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/gallery/albums/:id/photos', authenticate, async (req: any, res) => {
    try {
      const { url } = req.body;
      const [id] = await db('photos').insert({ 
        url, 
        album_id: req.params.id,
        officer_id: req.user.id
      });
      const photo = await db('photos').where('id', id).first();
      res.json({ status: 'success', data: photo });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/gallery/albums/:albumId/photos/:photoId', authenticate, async (req: any, res) => {
    try {
      const photo = await db('photos').where({ id: req.params.photoId, album_id: req.params.albumId }).first();
      if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found' });
      
      const album = await db('albums').where('id', req.params.albumId).first();
      const isUploader = photo.officer_id === req.user.id;
      const isAlbumCreator = album?.officer_id === req.user.id;
      const isAdmin = ['SA', 'ADMIN', 'IT'].includes(req.user.role);
      
      if (!isUploader && !isAlbumCreator && !isAdmin) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized' });
      }

      await db('photos').where('id', req.params.photoId).del();
      res.json({ status: 'success', message: 'Photo removed' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * Resets stale dashboard statuses and promotes today's biometric scans to
   * AVAILABLE.
   *
   * This used to run inside GET /public-dashboard/data, which is unauthenticated:
   * a public read performed several UPDATEs, so anyone could drive database write
   * load without credentials, and the lobby screen's own refresh loop was writing
   * on every poll. It now runs on a timer inside the server process, and the
   * public endpoint only reads.
   */
  /**
   * Applies expired slot ETAs.
   *
   * This ran in the browser, on the public display, on a one-second tick - and
   * the display has no credentials, so every attempt returned 401, the ETA was
   * never cleared, the condition stayed true and it retried forever. Measured
   * on a signed-out screen: 13 failed writes in 21 seconds, per expired slot,
   * with the status never updating. It also meant transitions only happened
   * while somebody had the screen open.
   */
  const applyExpiredSlotEtas = async () => {
    const slots = await db('dashboard_status').whereNotNull('eta').whereNot('eta', '');
    const now = Date.now();

    for (const slot of slots) {
      const raw = String(slot.eta || '').toUpperCase().replace('.', ':');
      let deadline: number | null = null;

      const absolute = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/);
      const relative = raw.match(/(\d+)\s*(MIN|M|MINUTES)/);

      if (absolute) {
        let hours = parseInt(absolute[1], 10);
        const minutes = parseInt(absolute[2], 10);
        const meridiem = absolute[3];
        if (meridiem === 'PM' && hours < 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
        const d = new Date();
        d.setHours(hours, minutes, 0, 0);
        deadline = d.getTime();
      } else if (relative && slot.updated_at) {
        deadline = new Date(slot.updated_at).getTime() + parseInt(relative[1], 10) * 60000;
      }

      if (deadline === null || now < deadline) continue;

      const isBackIn = raw.includes('BACK IN') || raw.includes('IN AT') || /^\d/.test(raw);
      const isOffIn = raw.includes('OFF IN') || raw.includes('OUT AT');
      const currentlyAvailable = ['AVAILABLE', 'IN'].includes(String(slot.status || '').toUpperCase());

      const update: any = { eta: null, updated_at: db.fn.now() };
      if (isBackIn && !currentlyAvailable) update.status = 'AVAILABLE';
      else if (isOffIn && currentlyAvailable) update.status = 'OFFLINE';

      await db('dashboard_status').where('slot_id', slot.slot_id).update(update);
      console.log(`[Presence] Slot ${slot.slot_id} ETA expired -> ${update.status || 'eta cleared'}`);
    }
  };

  const refreshPresenceFromBiometrics = async () => {
    const todayDate = new Date().toISOString().split('T')[0];
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);

    // 1. Daily Reset: If status was updated before today, reset to OFFLINE
    await db('officers')
      .where('updated_at', '<', todayStart)
      .update({
        dashboard_status: 'OFFLINE',
        eta: null,
        updated_at: todayStart // Use midnight so today's scans can sync
      });

    await db('dashboard_status')
      .where('updated_at', '<', todayStart)
      .update({
        status: 'OFFLINE',
        eta: null,
        updated_at: todayStart
      });

    // 2. Auto-sync biometrics for today - Optimization: Only sync the LATEST scan for each officer
    const bioLogs = await db('biometric_logs')
      .where('scan_date', todayDate)
      .orderBy('scan_time', 'desc'); // Newest first

    const processedOfficers = new Set();
    for (const log of bioLogs) {
      const hardwareId = String(log.hardware_id).trim();
      if (processedOfficers.has(hardwareId)) continue;
      processedOfficers.add(hardwareId);

      // Robust matching: try exact string, then numeric, then padded
      // CRITICAL: hardwareId must not be empty/null to match
      if (!hardwareId || hardwareId === '0' || hardwareId === '') continue;

      const officer = await db('officers')
        .where(function() {
          this.where('biometric_id', hardwareId);
          
          const numId = Number(hardwareId);
          if (!isNaN(numId)) {
              this.orWhereRaw('CAST(biometric_id AS SIGNED) = ?', [numId]);
              const paddedId = String(numId).padStart(3, '0');
              if (paddedId !== hardwareId) {
                this.orWhere('biometric_id', paddedId);
              }
          }
        })
        .whereNotNull('biometric_id')
        .whereNot('biometric_id', '')
        .first();

      if (officer) {
        console.log(`Matched officer: ${officer.name} (ID: ${officer.id}, Role: ${officer.role}) for hardware_id: ${hardwareId}`);
        if (officer.dashboard_status !== 'AVAILABLE') {
          const timeParts = log.scan_time.split(':');
          if (timeParts.length >= 2) {
            const h = parseInt(timeParts[0]);
            const m = parseInt(timeParts[1]);
            const s = timeParts[2] ? parseInt(timeParts[2]) : 0;
            
            if (!isNaN(h) && !isNaN(m)) {
              // Create scan datetime in local context
              const scanTime = new Date();
              scanTime.setHours(h, m, s, 0);
              const updatedAt = new Date(officer.updated_at);
              
              if (scanTime.getTime() > updatedAt.getTime()) {
                console.log(`Updating ${officer.name} to AVAILABLE via biometric log`);
                await db('officers').where('id', officer.id).update({ 
                  dashboard_status: 'AVAILABLE',
                  eta: null,
                  updated_at: new Date() // Use real date object
                });

                // ALSO Update dashboard_status table if this officer is assigned to a slot
                await db('dashboard_status').where('officer_id', officer.id).update({
                  status: 'AVAILABLE',
                  eta: null,
                  updated_at: new Date()
                });

                await db('biometric_logs').where('id', log.id).update({ status: 'SYNCED' });
              }
            }
          }
        }
      } else {
        console.log(`No officer found for biometric hardware_id: ${hardwareId}`);
      }
    }
  };

  apiRouter.get('/public-dashboard/data', async (req, res) => {
    try {
      // Read-only. Presence refresh happens on a timer, not on a public GET.
      const [notices, events, videos, alerts, settings, queue] = await Promise.all([
        db('dashboard_notices').where('is_active', true),
        // Only events that have not already happened. Without the date bound a
        // past event kept rendering under "Upcoming Event" until someone
        // remembered to deactivate it.
        db('dashboard_events')
          .where('is_active', true)
          .where(function () {
            this.whereNull('event_date').orWhere('event_date', '>=', new Date().toLocaleDateString('en-CA'));
          })
          .orderBy('event_date', 'asc'),
        db('dashboard_videos').where('is_active', true).orderBy('created_at', 'desc'),
        db('dashboard_alerts').where('is_active', true),
        db('dashboard_settings').first(),
        db('queue').first()
      ]);

      const dashboardSlotsRaw = await db('dashboard_status')
        .leftJoin('officers', 'dashboard_status.officer_id', 'officers.id')
        .select('dashboard_status.*', 'officers.name as officer_name', 'officers.post as officer_post');
      
      // Maintain specific order: ds, ads, acc, ao, adp, agn
      const orderMap: any = { 'ds': 1, 'ads': 2, 'acc': 3, 'ao': 4, 'adp': 5, 'agn': 6 };
      const dashboardSlots = dashboardSlotsRaw.sort((a, b) => (orderMap[a.slot_id] || 99) - (orderMap[b.slot_id] || 99));
      
      // Get officer status for dashboard - Fetch all officers to ensure mapping works for all admin designations
      const officers = await db('officers')
        .leftJoin('designations', 'officers.post', 'designations.name')
        .select(
          'officers.id',
          'officers.name',
          'officers.post',
          'officers.role',
          'officers.dashboard_status',
          'officers.eta',
          'officers.updated_at',
          'officers.biometric_id',
          'designations.name as designation_name'
        );

      // Get birthdays today
      const today = new Date();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      // Assuming we might have a dob column or we can use biometric_id as a hint? 
      // Actually, let's just mock birthdays for now or look for a dob column.
      // I'll check if dob column exists.
      const hasDob = await db.schema.hasColumn('officers', 'dob');
      let birthdays = [];
      if (hasDob) {
        birthdays = await db('officers')
          .whereRaw("strftime('%m-%d', dob) = ?", [`${month}-${day}`])
          .select('id', 'name', 'post');
      }

      res.json({ 
        status: 'success', 
        data: { 
          notices, 
          events, 
          videos, 
          alerts, 
          settings, 
          queue,
          birthdays,
          slots: dashboardSlots,
          officers: officers.map(o => ({
            ...o,
            designation: { name: o.designation_name || o.post }
          }))
        } 
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/dashboard/queue', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const { current_token, next_token, counter_number, is_visible } = req.body;
      const queue = await db('queue').first();
      if (queue) {
        await db('queue').where('id', queue.id).update({
          current_token,
          next_token,
          counter_number,
          is_visible,
          updated_at: db.fn.now()
        });
      } else {
        await db('queue').insert({
          current_token,
          next_token,
          counter_number,
          is_visible
        });
      }
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/status', authenticate, async (req: any, res) => {
    try {
      const { status, eta } = req.body;
      const updateData: any = { 
        dashboard_status: status,
        eta: eta || null,
        updated_at: db.fn.now()
      };

      await db('officers').where('id', req.user.id).update(updateData);

      // ALSO sync dashboard_status table
      await db('dashboard_status').where('officer_id', req.user.id).update({
        status: status,
        eta: eta || null,
        updated_at: db.fn.now()
      });

      res.json({ status: 'success', data: { status, eta } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/dashboard/slots', authenticate, async (req, res) => {
    try {
      const slots = await db('dashboard_status')
        .leftJoin('officers', 'dashboard_status.officer_id', 'officers.id')
        .select('dashboard_status.*', 'officers.name', 'officers.post');
      res.json({ status: 'success', data: slots });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/dashboard/slots/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const { officer_id, status, eta, remarks } = req.body;
      const updateData: any = { updated_at: db.fn.now() };
      
      if (officer_id !== undefined) updateData.officer_id = officer_id;
      if (status !== undefined) updateData.status = status;
      if (eta !== undefined) updateData.eta = eta;
      if (remarks !== undefined) updateData.remarks = remarks;

      await db('dashboard_status').where('slot_id', req.params.id).update(updateData);
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/presence/sync-biometrics', authenticate, async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logs = await db('biometric_logs').where('scan_date', today);
      
      let syncedCount = 0;
      for (const log of logs) {
        const officer = await db('officers').where('biometric_id', log.hardware_id).first();
        // If officer scanned in, mark them as AVAILABLE if they were not already
        if (officer && officer.dashboard_status !== 'AVAILABLE') {
          await db('officers').where('id', officer.id).update({ 
            dashboard_status: 'AVAILABLE',
            eta: null 
          });
          
          await db('dashboard_status').where('officer_id', officer.id).update({
            status: 'AVAILABLE',
            eta: null
          });

          syncedCount++;
        }
      }
      
      res.json({ status: 'success', message: `Synced ${syncedCount} officers from biometric hits.` });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  apiRouter.get('/dashboard/notices', authenticate, async (req, res) => {
    try {
      const notices = await db('dashboard_notices').orderBy('created_at', 'desc');
      res.json({ status: 'success', data: notices });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/notices', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const [id] = await db('dashboard_notices').insert(req.body);
      const notice = await db('dashboard_notices').where('id', id).first();
      res.json({ status: 'success', data: notice });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.put('/dashboard/notices/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('dashboard_notices').where('id', req.params.id).update(req.body);
      const notice = await db('dashboard_notices').where('id', req.params.id).first();
      res.json({ status: 'success', data: notice });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/dashboard/notices/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('dashboard_notices').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/dashboard/events', authenticate, async (req, res) => {
    try {
      const events = await db('dashboard_events').orderBy('event_date', 'asc');
      res.json({ status: 'success', data: events });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/events', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const data = pickFields(req.body, ['title', 'event_date', 'event_time', 'location', 'image_url', 'is_active']);
      // Convert empty strings to null for optional fields
      if (data.event_date === '') data.event_date = null;
      if (data.event_time === '') data.event_time = null;
      if (data.title === '') data.title = null;
      if (data.location === '') data.location = null;

      const [id] = await db('dashboard_events').insert(data);
      const event = await db('dashboard_events').where('id', id).first();
      res.json({ status: 'success', data: event });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.put('/dashboard/events/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const data = pickFields(req.body, ['title', 'event_date', 'event_time', 'location', 'image_url', 'is_active']);
      // Convert empty strings to null for optional fields
      if (data.event_date === '') data.event_date = null;
      if (data.event_time === '') data.event_time = null;
      if (data.title === '') data.title = null;
      if (data.location === '') data.location = null;

      await db('dashboard_events').where('id', req.params.id).update(data);
      const event = await db('dashboard_events').where('id', req.params.id).first();
      res.json({ status: 'success', data: event });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/dashboard/events/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('dashboard_events').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/dashboard/videos', authenticate, async (req, res) => {
    try {
      const videos = await db('dashboard_videos').orderBy('display_order', 'asc').orderBy('id', 'asc');
      res.json({ status: 'success', data: videos });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/videos', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const [id] = await db('dashboard_videos').insert(req.body);
      const video = await db('dashboard_videos').where('id', id).first();
      res.json({ status: 'success', data: video });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/videos/reorder', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const { videoIds } = req.body;
      if (!Array.isArray(videoIds)) throw new Error('videoIds must be an array');
      
      await db.transaction(async (trx) => {
        for (let i = 0; i < videoIds.length; i++) {
          await trx('dashboard_videos')
            .where('id', videoIds[i])
            .update({ display_order: i });
        }
      });
      
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.delete('/dashboard/videos/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('dashboard_videos').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/dashboard/alerts', authenticate, async (req, res) => {
    try {
      const alerts = await db('dashboard_alerts').orderBy('created_at', 'desc');
      res.json({ status: 'success', data: alerts });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/alerts', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const [id] = await db('dashboard_alerts').insert(req.body);
      const alert = await db('dashboard_alerts').where('id', id).first();
      res.json({ status: 'success', data: alert });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.put('/dashboard/alerts/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('dashboard_alerts').where('id', req.params.id).update(req.body);
      const alert = await db('dashboard_alerts').where('id', req.params.id).first();
      res.json({ status: 'success', data: alert });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.delete('/dashboard/alerts/:id', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      await db('dashboard_alerts').where('id', req.params.id).del();
      res.json({ status: 'success', data: {} });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/dashboard/settings', authenticate, async (req, res) => {
    try {
      const settings = await db('dashboard_settings').first();
      res.json({ status: 'success', data: settings });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  apiRouter.post('/dashboard/settings', authenticate, requireRole(...DISPLAY_MANAGER_ROLES), async (req, res) => {
    try {
      const { settings } = req.body;
      
      // Sanitize settings to only include allowed columns
      const allowedColumns = ['refresh_interval', 'scrolling_speed', 'video_source', 'birthday_image_url', 'video_playlist_skip', 'default_cover_pic'];
      const sanitizedSettings: any = {};
      allowedColumns.forEach(col => {
        if (settings[col] !== undefined) {
          sanitizedSettings[col] = settings[col];
        }
      });

      const existing = await db('dashboard_settings').first();
      if (existing) {
        await db('dashboard_settings').where('id', existing.id).update(sanitizedSettings);
      } else {
        await db('dashboard_settings').insert(sanitizedSettings);
      }
      const updated = await db('dashboard_settings').first();
      res.json({ status: 'success', data: updated });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.get('/dashboard/officers', authenticate, async (req, res) => {
    try {
      const officers = await db('officers')
        .select('id', 'name', 'post', 'dashboard_status', 'eta', 'role');
      res.json({ status: 'success', data: officers });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  apiRouter.post('/dashboard/officers/:id/status', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, eta } = req.body;
      const officerId = Number(id);
      
      if (isNaN(officerId)) {
        return res.status(400).json({ status: 'error', message: `Invalid officer ID: ${id}` });
      }

      console.log(`Updating officer status - ID: ${officerId}, Status: ${status}, ETA: ${eta}`);

      // Check if user is admin or updating themselves
      const user = (req as any).user;
      let userRole = user.role;
      
      if (!userRole) {
        const dbUser = await db('officers').where('id', user.id).first();
        userRole = dbUser?.role;
      }

      const isAdmin = userRole === 'SA' || userRole === 'ADMIN';
      const isSelf = Number(user.id) === officerId;

      if (!isAdmin && !isSelf) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized status update' });
      }

      const updateData: any = {
        dashboard_status: status,
        eta: eta || null,
        updated_at: new Date()
      };

      const affected = await db('officers').where('id', officerId).update(updateData);
      
      if (affected === 0) {
        return res.status(404).json({ status: 'error', message: 'Officer not found' });
      }

      // ALSO update dashboard_status table
      await db('dashboard_status').where('officer_id', officerId).update({
        status: status,
        eta: eta || null,
        updated_at: new Date()
      });

      res.json({ status: 'success', message: 'Status updated successfully' });
    } catch (error: any) {
      console.error("Dashboard Status Update Error:", error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Mount API Router
  app.use('/api', apiRouter);

  // Serve React build
  if (process.env.NODE_ENV === 'production') {
    console.log('DEBUG: Running in PRODUCTION mode');
    const distPath = path.resolve(process.cwd(), 'dist');
    console.log(`DEBUG: distPath is ${distPath}`);
    if (!fs.existsSync(path.resolve(distPath, 'index.html'))) {
      console.warn(`CRITICAL WARNING: index.html NOT FOUND at ${path.resolve(distPath, 'index.html')}`);
      console.log('DEBUG: Contents of dist:', fs.readdirSync(distPath));
    }
    app.use(express.static(distPath));
    app.get('*all', (req: any, res: any) => {
      // Avoid sending index.html for missing assets
      if (req.url.includes('.') || req.url.startsWith('/@') || req.url.startsWith('/node_modules')) {
        return res.status(404).send('Not found');
      }
      console.log(`DEBUG: Serving SPA from ${path.resolve(distPath, 'index.html')}`);
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Development: run Vite in middleware mode so the SPA is served with HMR on
    // the same origin as /api (service/api.ts uses a relative '/api' base URL).
    // Imported dynamically so vite is never pulled into the production process.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('DEBUG: Running in DEVELOPMENT mode - Vite middleware mounted (HMR enabled)');
  }

  /**
   * Verifies a token for the broadcast surface and checks it belongs to someone
   * allowed to publish to the public display.
   *
   * Every live-stream and signalling route used to be completely open: an
   * anonymous POST could set the image on the lobby screen, and an anonymous
   * WebSocket could connect as role=broadcaster - which also closed the real
   * broadcaster's socket and replaced the feed. Viewing stays open; publishing
   * does not.
   */
  const verifyBroadcaster = (token: string | undefined | null): any | null => {
    if (!token) return null;
    try {
      const decoded: any = jwt.verify(String(token).replace(/^Bearer\s+/i, ''), JWT_SECRET);
      if (!decoded || !DISPLAY_MANAGER_ROLES.includes(decoded.role)) return null;
      return decoded;
    } catch {
      return null;
    }
  };

  const requireBroadcaster = (req: any, res: any, next: any) => {
    const header = req.headers.authorization || req.headers['x-authorization'];
    const token = header ? String(header).split(' ')[1] : req.query?.token;
    const decoded = verifyBroadcaster(token);
    if (!decoded) {
      return res.status(401).json({ status: 'error', message: 'A display operator token is required to broadcast' });
    }
    req.user = decoded;
    next();
  };

  // --- Live Stream State and Websocket Collections ---
  let broadcasterSocket: any = null;
  const viewerSockets = new Map<string, any>();
  const messageQueues = new Map<string, any[]>();
  let latestFrameBase64: string | null = null;
  let latestFrameBuffer: Buffer | null = null;
  const mjpegClients = new Set<any>();
  let latestFrameTime = 0;

  // The queue map is reachable without credentials, so both the number of
  // queues and their age are bounded. Previously any unseen `target` created an
  // entry that was never evicted, so repeated posts with invented targets grew
  // the map until the process ran out of memory.
  const MAX_SIGNALING_QUEUES = 200;
  const SIGNALING_QUEUE_TTL_MS = 2 * 60 * 1000;
  const signalingQueueSeen = new Map<string, number>();

  function pruneSignalingQueues() {
    const now = Date.now();
    for (const [target, seen] of signalingQueueSeen) {
      if (now - seen > SIGNALING_QUEUE_TTL_MS) {
        signalingQueueSeen.delete(target);
        messageQueues.delete(target);
      }
    }
    // Still over the cap after expiry: drop the least recently used.
    if (messageQueues.size > MAX_SIGNALING_QUEUES) {
      const byAge = [...signalingQueueSeen.entries()].sort((a, b) => a[1] - b[1]);
      for (const [target] of byAge.slice(0, messageQueues.size - MAX_SIGNALING_QUEUES)) {
        signalingQueueSeen.delete(target);
        messageQueues.delete(target);
      }
    }
  }

  function queueSignalingMessage(target: string, msg: any) {
    pruneSignalingQueues();
    if (!messageQueues.has(target)) {
      messageQueues.set(target, []);
    }
    signalingQueueSeen.set(target, Date.now());
    const q = messageQueues.get(target)!;
    q.push(msg);
    if (q.length > 50) {
      q.shift();
    }
  }

  // --- WebRTC signaling polling REST API fallback endpoints ---
  apiRouter.post('/live-signaling/register', (req, res) => {
    const { role, id } = req.body;
    if (role === 'broadcaster') {
      const header = req.headers.authorization || req.headers['x-authorization'];
      if (!verifyBroadcaster(header ? String(header).split(' ')[1] : (req.query as any)?.token)) {
        return res.status(401).json({ status: 'error', message: 'A display operator token is required to broadcast' });
      }
    }
    console.log(`[HTTP Signaling] Registered ${role}: ${id}`);
    if (role === 'broadcaster') {
      messageQueues.delete('broadcaster');
    } else if (role === 'viewer' && id) {
      messageQueues.delete(id);
      const joinMsg = { type: 'register-viewer', viewerId: id, timestamp: Date.now() };
      if (broadcasterSocket && broadcasterSocket.readyState === 1) {
        broadcasterSocket.send(JSON.stringify(joinMsg));
      } else {
        queueSignalingMessage('broadcaster', joinMsg);
      }
    }
    res.json({ status: 'success' });
  });

  apiRouter.post('/live-signaling/send', (req, res) => {
    const { sender, target, type, sdp, candidate } = req.body;
    const msg = { sender, target, type, sdp, candidate, timestamp: Date.now() };

    if (!target) {
      return res.status(400).json({ status: 'error', message: 'Target is required' });
    }

    // Anyone may answer as a viewer, but only an authenticated operator may
    // speak as the broadcaster.
    if (sender === 'broadcaster') {
      const header = req.headers.authorization || req.headers['x-authorization'];
      if (!verifyBroadcaster(header ? String(header).split(' ')[1] : (req.query as any)?.token)) {
        return res.status(401).json({ status: 'error', message: 'A display operator token is required to broadcast' });
      }
    }

    if (target === 'broadcaster') {
      if (broadcasterSocket && broadcasterSocket.readyState === 1) {
        broadcasterSocket.send(JSON.stringify(msg));
      } else {
        queueSignalingMessage('broadcaster', msg);
      }
    } else {
      const viewerSocket = viewerSockets.get(target);
      if (viewerSocket && viewerSocket.readyState === 1) {
        viewerSocket.send(JSON.stringify(msg));
      } else {
        queueSignalingMessage(target, msg);
      }
    }

    res.json({ status: 'success' });
  });

  apiRouter.get('/live-signaling/poll', (req, res) => {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'ID is required' });
    }

    const q = messageQueues.get(id) || [];
    messageQueues.set(id, []); // Clear queue

    res.json({ status: 'success', messages: q });
  });

  // --- Live Stream JPEG Frame Transmit & Polling Endpoints ---
  apiRouter.post('/live-stream/frame', requireBroadcaster, (req, res) => {
    const { frame } = req.body;
    if (frame) {
      latestFrameBase64 = frame;
      const base64Data = frame.replace(/^data:image\/jpeg;base64,/, "");
      latestFrameBuffer = Buffer.from(base64Data, 'base64');
      latestFrameTime = Date.now();
      
      // Instantly push to all connected WebSocket spectators (binary format)
      viewerSockets.forEach((v) => {
        if (v.readyState === 1) { // OPEN
          try { v.send(latestFrameBuffer); } catch(e) {}
        }
      });

      // Instantly push to connected MJPEG clients
      mjpegClients.forEach((client) => {
        client.sendFrame(latestFrameBuffer);
      });
    }
    res.json({ status: 'success' });
  });

  apiRouter.get('/live-stream/frame', (req, res) => {
    if (!latestFrameBase64) {
      return res.status(404).json({ status: 'error', message: 'No active broadcast frame' });
    }
    res.json({ status: 'success', frame: latestFrameBase64 });
  });

  apiRouter.get('/live-stream/raw-frame', (req, res) => {
    if (!latestFrameBuffer) {
      return res.status(404).end();
    }
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': latestFrameBuffer.length
    });
    res.end(latestFrameBuffer);
  });

  // MJPEG streaming endpoint for ultra-low overhead, native high frame rate video playback
  apiRouter.get('/live-stream/mjpeg', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const client = {
      sendFrame: (buffer: Buffer) => {
        try {
          res.write(`--frame\r\n`);
          res.write(`Content-Type: image/jpeg\r\n`);
          res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
          res.write(buffer);
          res.write(`\r\n`);
        } catch (e) {
          // Client might have disconnected
        }
      }
    };

    mjpegClients.add(client);

    // If there is an active frame, write it instantly to populate the viewport
    if (latestFrameBuffer) {
      client.sendFrame(latestFrameBuffer);
    }

    req.on('close', () => {
      mjpegClients.delete(client);
    });
  });

  // Lightweight status check endpoint to see if a live broadcast is actively streaming
  apiRouter.get('/live-stream/status', (req, res) => {
    const isLive = latestFrameBuffer !== null && (Date.now() - latestFrameTime) < 8000;
    res.json({ status: 'success', isLive, timestamp: latestFrameTime });
  });

  // API 404 Handler
  apiRouter.use((req, res) => {
    console.log(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ status: 'error', message: `API Route not found: ${req.method} ${req.url}` });
  });

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[Global Error Handler]', err);
    res.status(500).json({ status: 'error', message: err.message });
  });

  // Keep the public display's presence data current without letting an
  // unauthenticated request trigger writes. GET /public-dashboard/data used to
  // perform the updates itself on every poll.
  const PRESENCE_REFRESH_MS = Number(process.env.PRESENCE_REFRESH_MS) || 60000;
  const runPresenceRefresh = async () => {
    try {
      await refreshPresenceFromBiometrics();
    } catch (err: any) {
      console.error('[Presence] Scheduled refresh failed:', err.message);
    }
    try {
      await applyExpiredSlotEtas();
    } catch (err: any) {
      console.error('[Presence] Slot ETA sweep failed:', err.message);
    }
  };
  void runPresenceRefresh();
  const presenceTimer = setInterval(runPresenceRefresh, PRESENCE_REFRESH_MS);
  presenceTimer.unref?.();

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[Presence] Refreshing every ${PRESENCE_REFRESH_MS}ms`);
  });

  // --- Live Broadcast WebSocket Stream Server ---
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: any, req: any) => {
    const url = req.url || '';
    const isBroadcaster = url.includes('role=broadcaster');
    
    // Parse viewerId out of url query
    const hashParts = url.split('?');
    const searchParams = new URLSearchParams(hashParts[1] || '');
    const viewerId = searchParams.get('viewerId') || searchParams.get('id');

    console.log(`[WS WEBRTC] Connected: isBroadcaster=${isBroadcaster}, viewerId=${viewerId}`);

    if (isBroadcaster) {
      if (broadcasterSocket) {
        try { broadcasterSocket.close(); } catch (e) {}
      }
      broadcasterSocket = ws;

      const q = messageQueues.get('broadcaster') || [];
      if (q.length > 0) {
        console.log(`[WS WEBRTC] Flushing ${q.length} queued messages to broadcaster`);
        q.forEach(msg => ws.send(JSON.stringify(msg)));
        messageQueues.set('broadcaster', []);
      }

      ws.on('message', (message: any) => {
        // Support BOTH raw binary JPEG frames AND string signaling packets (Hybrid Dual-Mode)
        if (Buffer.isBuffer(message) || message instanceof Uint8Array || message instanceof ArrayBuffer) {
          // Narrow explicitly: Buffer.from has no single overload accepting
          // `ArrayBuffer | Uint8Array`, so hand it a Uint8Array either way.
          latestFrameBuffer = Buffer.isBuffer(message)
            ? message
            : Buffer.from(message instanceof ArrayBuffer ? new Uint8Array(message) : message);
          latestFrameBase64 = `data:image/jpeg;base64,${latestFrameBuffer.toString('base64')}`;
          latestFrameTime = Date.now();
          
          // Relay frame instantly to all connected viewers in binary
          viewerSockets.forEach((v) => {
            if (v.readyState === 1) { // OPEN
              try { v.send(latestFrameBuffer); } catch (e) {}
            }
          });

          // Relay instantly to MJPEG clients
          mjpegClients.forEach((client) => {
            client.sendFrame(latestFrameBuffer);
          });
        } else {
          try {
            const messageStr = message.toString();
            // Check if it's base64 image or json
            if (messageStr.startsWith('data:image/jpeg;base64,') || messageStr.startsWith('data:image/png;base64,')) {
              latestFrameBase64 = messageStr;
              const base64Data = messageStr.replace(/^data:image\/jpeg;base64,/, "");
              latestFrameBuffer = Buffer.from(base64Data, 'base64');
              latestFrameTime = Date.now();

              viewerSockets.forEach((v) => {
                if (v.readyState === 1) { // OPEN
                  try { v.send(latestFrameBuffer); } catch (e) {}
                }
              });

              mjpegClients.forEach((client) => {
                client.sendFrame(latestFrameBuffer);
              });
              return;
            }

            const msg = JSON.parse(messageStr);
            if (msg.target) {
              const vSocket = viewerSockets.get(msg.target);
              if (vSocket && vSocket.readyState === 1) {
                vSocket.send(JSON.stringify(msg));
              } else {
                queueSignalingMessage(msg.target, msg);
              }
            }
          } catch (e) {
            console.error('[WS WEBRTC] Broadcaster data format error:', e);
          }
        }
      });

      ws.on('close', () => {
        console.log('[WS WEBRTC] Broadcaster disconnected ws connection.');
        if (broadcasterSocket === ws) {
          broadcasterSocket = null;
          latestFrameBuffer = null;
          latestFrameBase64 = null;
          const endMsg = JSON.stringify({ type: 'ended' });
          viewerSockets.forEach(v => {
            if (v.readyState === 1) {
              try { v.send(endMsg); } catch(e) {}
            }
          });
        }
      });

      ws.on('error', (err: any) => {
        console.error('[WS WEBRTC] Broadcaster socket error:', err);
      });
    } else {
      const vId = viewerId || `v_${Math.random().toString(36).substring(2, 11)}`;
      viewerSockets.set(vId, ws);

      // If we have a cached active frameBuffer, send it immediately!
      if (latestFrameBuffer) {
        try { ws.send(latestFrameBuffer); } catch (e) {}
      }

      const q = messageQueues.get(vId) || [];
      if (q.length > 0) {
        console.log(`[WS WEBRTC] Flushing ${q.length} queued messages to viewer: ${vId}`);
        q.forEach(msg => ws.send(JSON.stringify(msg)));
        messageQueues.set(vId, []);
      }

      const joinMsg = { type: 'register-viewer', viewerId: vId, timestamp: Date.now() };
      if (broadcasterSocket && broadcasterSocket.readyState === 1) {
        broadcasterSocket.send(JSON.stringify(joinMsg));
      } else {
        queueSignalingMessage('broadcaster', joinMsg);
      }

      ws.on('message', (message: any) => {
        try {
          const msg = JSON.parse(message.toString());
          const target = msg.target || 'broadcaster';
          const payload = { ...msg, sender: vId };

          if (target === 'broadcaster') {
            if (broadcasterSocket && broadcasterSocket.readyState === 1) {
              broadcasterSocket.send(JSON.stringify(payload));
            } else {
              queueSignalingMessage('broadcaster', payload);
            }
          } else {
            const vSocket = viewerSockets.get(target);
            if (vSocket && vSocket.readyState === 1) {
              vSocket.send(JSON.stringify(payload));
            } else {
              queueSignalingMessage(target, payload);
            }
          }
        } catch (e) {
          console.error('[WS WEBRTC] Viewer msg parsing error:', e);
        }
      });

      ws.on('close', () => {
        console.log(`[WS WEBRTC] Viewer ${vId} disconnected.`);
        viewerSockets.delete(vId);
        const leaveMsg = { type: 'viewer-left', viewerId: vId, timestamp: Date.now() };
        if (broadcasterSocket && broadcasterSocket.readyState === 1) {
          broadcasterSocket.send(JSON.stringify(leaveMsg));
        } else {
          queueSignalingMessage('broadcaster', leaveMsg);
        }
      });

      ws.on('error', (err: any) => {
        console.error('[WS WEBRTC] Viewer WS error:', err);
      });
    }
  });

  httpServer.on('upgrade', (request: any, socket: any, head: any) => {
    const [pathname, query] = String(request.url || '').split('?');
    const isLiveStream = pathname === '/api/live-stream' || pathname === '/live-stream' || pathname.endsWith('live-stream');
    if (!isLiveStream) {
      socket.destroy();
      return;
    }

    // Connecting as the broadcaster takes over the feed and closes whoever was
    // broadcasting before, so it has to prove it belongs to a display operator.
    // Browsers cannot set headers on a WebSocket handshake, hence the query
    // parameter. Viewers connect without credentials, as before.
    const params = new URLSearchParams(query || '');
    if (params.get('role') === 'broadcaster' && !verifyBroadcaster(params.get('token'))) {
      console.warn('[WS WEBRTC] Rejected unauthenticated broadcaster upgrade');
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
}

try {
  await startServer();
} catch (err) {
  console.error("FATAL: Failed to start server:", err);
}
