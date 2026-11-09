import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export const dataDir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });
export const dbFile = path.join(dataDir, 'billing.sqlite');
export let db;
export function openDB() {
    db = new DatabaseSync(dbFile);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,payments INTEGER DEFAULT 0,active INTEGER DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL,csrf TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL,version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,body TEXT NOT NULL,created_by TEXT REFERENCES users(id),version INTEGER DEFAULT 1,archived INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,body TEXT NOT NULL,version INTEGER DEFAULT 1,archived INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,kind TEXT NOT NULL,number TEXT UNIQUE,status TEXT NOT NULL,customer_id TEXT REFERENCES customers(id),created_by TEXT REFERENCES users(id),body TEXT NOT NULL,snapshot TEXT,version INTEGER DEFAULT 1,converted_id TEXT UNIQUE REFERENCES documents(id));
 CREATE TABLE IF NOT EXISTS document_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT NOT NULL REFERENCES documents(id),version INTEGER NOT NULL,body TEXT NOT NULL,snapshot TEXT NOT NULL,number TEXT NOT NULL,at TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,UNIQUE(document_id,version));
 CREATE TABLE IF NOT EXISTS document_archives(document_id TEXT PRIMARY KEY REFERENCES documents(id),at TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS invoice_cancellations(document_id TEXT PRIMARY KEY REFERENCES documents(id),at TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,no_supply INTEGER NOT NULL,no_external_reporting INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sequences(fy TEXT PRIMARY KEY,value INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,document_id TEXT REFERENCES documents(id),customer_id TEXT REFERENCES customers(id),amount INTEGER NOT NULL CHECK(amount>0),date TEXT NOT NULL,method TEXT NOT NULL,reference TEXT,created_by TEXT REFERENCES users(id),reversed_at TEXT,reason TEXT,idempotency TEXT UNIQUE NOT NULL);
 CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,body TEXT NOT NULL,created_by TEXT REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,record TEXT,detail TEXT);
 CREATE TABLE IF NOT EXISTS requests(user_id TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(user_id,key));
 CREATE TABLE IF NOT EXISTS corrections(id TEXT PRIMARY KEY,document_id TEXT REFERENCES documents(id),created_by TEXT REFERENCES users(id),reason TEXT NOT NULL,status TEXT DEFAULT 'open');
 CREATE TABLE IF NOT EXISTS backup_runs(id TEXT PRIMARY KEY,at TEXT NOT NULL,status TEXT NOT NULL,detail TEXT);
 CREATE TABLE IF NOT EXISTS logos(id TEXT PRIMARY KEY,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,original BLOB NOT NULL,pdf_rgb BLOB NOT NULL,pdf_alpha BLOB NOT NULL,pdf_width INTEGER NOT NULL,pdf_height INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS branding(id INTEGER PRIMARY KEY CHECK(id=1),logo_id TEXT REFERENCES logos(id),version INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS documents_customer_kind ON documents(customer_id,kind,status);
 CREATE INDEX IF NOT EXISTS payments_document ON payments(document_id,reversed_at);
 CREATE INDEX IF NOT EXISTS audit_record ON audit(record,id);
 INSERT OR IGNORE INTO branding(id,logo_id,version) VALUES(1,NULL,0);
 `);
    return db;
}
openDB();
export const get = (sql, ...args) => db.prepare(sql).get(...args);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
export function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try {
    const result = fn();
    db.exec('COMMIT');
    return result;
}
catch (e) {
    db.exec('ROLLBACK');
    throw e;
} }
export const audit = (user, action, record = '', detail = '') => run('INSERT INTO audit(at,actor,action,record,detail) VALUES(?,?,?,?,?)', new Date().toISOString(), user?.name || 'System', action, record, detail);
export const settings = () => { const r = get('SELECT * FROM settings WHERE id=1'); return r ? { ...JSON.parse(r.body), version: r.version, logoId: get('SELECT logo_id FROM branding WHERE id=1')?.logo_id || null } : null; };
