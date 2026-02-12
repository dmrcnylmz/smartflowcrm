const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'callcenter.db');
const dataDir = path.dirname(DB_PATH);

let db = null;
let SQL = null;
let initialized = false;

async function initDatabase() {
    if (initialized) return db;

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');
    initSchema();
    initialized = true;
    return db;
}

function getDatabase() {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}

function initSchema() {
    const schemaPath = path.join(__dirname, '..', 'models', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.run(schema);
}

function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        initialized = false;
    }
}

// ──────────────── Helpers wrapping sql.js API ────────────────

function dbPrepareGet(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let result = null;
    if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        result = {};
        cols.forEach((col, i) => { result[col] = vals[i]; });
    }
    stmt.free();
    return result;
}

function dbPrepareAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    const cols = stmt.getColumnNames();
    while (stmt.step()) {
        const vals = stmt.get();
        const row = {};
        cols.forEach((col, i) => { row[col] = vals[i]; });
        results.push(row);
    }
    stmt.free();
    return results;
}

function dbRun(sql, params = []) {
    db.run(sql, params);
}

// Tenant-scoped query helpers
function tenantQuery(table, tenantId, conditions = {}, options = {}) {
    let sql = `SELECT * FROM ${table} WHERE tenant_id = ?`;
    const params = [tenantId];

    Object.entries(conditions).forEach(([key, value]) => {
        sql += ` AND ${key} = ?`;
        params.push(value);
    });

    if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy}`;
        if (options.order) sql += ` ${options.order}`;
    }

    if (options.limit) {
        sql += ` LIMIT ?`;
        params.push(options.limit);
        if (options.offset) {
            sql += ` OFFSET ?`;
            params.push(options.offset);
        }
    }

    return dbPrepareAll(sql, params);
}

function tenantInsert(table, tenantId, data) {
    const row = { ...data, tenant_id: tenantId };
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    dbRun(sql, Object.values(row));
}

function tenantCount(table, tenantId, conditions = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = ?`;
    const params = [tenantId];

    Object.entries(conditions).forEach(([key, value]) => {
        sql += ` AND ${key} = ?`;
        params.push(value);
    });

    return dbPrepareGet(sql, params).count;
}

module.exports = {
    initDatabase,
    getDatabase,
    closeDatabase,
    saveDatabase,
    tenantQuery,
    tenantInsert,
    tenantCount,
    dbPrepareGet,
    dbPrepareAll,
    dbRun,
    DB_PATH
};
