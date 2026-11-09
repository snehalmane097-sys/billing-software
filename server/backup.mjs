import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { db, dbFile, dataDir, run, all, get, openDB, audit } from './db.mjs';
const root = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : null;
const key = /^[a-f0-9]{64}$/i.test(process.env.BACKUP_KEY || '') ? Buffer.from(process.env.BACKUP_KEY, 'hex') : null;
export function configured() {
    const normal = p => process.platform === 'win32' ? p.toLowerCase() : p;
    return !!(root && key?.length === 32 && normal(root) !== normal(dataDir) && !normal(root).startsWith(normal(dataDir) + path.sep));
}
function requireConfig() { if (!configured())
    throw Error('Set BACKUP_DIR outside data/ and BACKUP_KEY to 64 hex characters; use a separate drive or protected mounted storage'); fs.mkdirSync(root, { recursive: true }); }
export function backupStatus() {
    let files = [], storageError = '';
    if (configured()) {
        try { files = fs.readdirSync(root).filter(f => /^billing-.*\.enc$/.test(f)).sort().reverse(); }
        catch { storageError = 'Backup destination is unavailable. Check the storage connection and access permissions.'; }
    }
    return { configured: configured(), storageError, coverage: 'SQLite database, issued snapshots, users, configuration and audit. Attachments are not supported.', schedule: 'Daily while server is running; missed backups run at next startup. 30 daily + 12 monthly.', recoveryWindow: 'Up to 24 hours of work may be lost; longer after a server/storage outage.', runs: all('SELECT * FROM backup_runs ORDER BY at DESC LIMIT 12'), files, lastTest: get("SELECT * FROM backup_runs WHERE status='restore-tested' ORDER BY at DESC LIMIT 1") || null };
}
export function createBackup(actor, tag = 'daily') {
    requireConfig();
    const id = crypto.randomUUID(), at = new Date().toISOString(), temp = path.join(dataDir, `snapshot-${id}.sqlite`);
    try {
        db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`);
        const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const payload = gzipSync(fs.readFileSync(temp));
        const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
        const bytes = Buffer.concat([Buffer.from('BILLBK01'), iv, cipher.getAuthTag(), encrypted]);
        const name = `billing-${at.replace(/[:.]/g, '-')}-${tag}.enc`, target = path.join(root, name);
        fs.writeFileSync(target + '.tmp', bytes, { mode: 0o600 });
        fs.renameSync(target + '.tmp', target);
        run('INSERT INTO backup_runs VALUES(?,?,?,?)', id, at, 'success', name);
        audit(actor, 'backup.created', name);
        // Keep one copy per month for the previous 12 months in addition to 30 days.
        const files = fs.readdirSync(root).filter(f => /^billing-.*\.enc$/.test(f)).sort().reverse(), months = new Set();
        for (const f of files) {
            const stamp = f.slice(8, 18), month = stamp.slice(0, 7), age = (Date.now() - Date.parse(stamp)) / 86400000;
            const monthly = !months.has(month) && months.size < 12;
            months.add(month);
            if (age > 30 && !monthly && !f.includes('pre-restore'))
                fs.unlinkSync(path.join(root, f));
        }
        return { file: name };
    }
    catch (e) {
        run('INSERT INTO backup_runs VALUES(?,?,?,?)', id, at, 'failed', e.message);
        throw e;
    }
    finally {
        if (fs.existsSync(temp))
            fs.unlinkSync(temp);
    }
}
export function testRestore(file, actor) {
    requireConfig();
    if (!/^billing-[\w.-]+\.enc$/.test(file))
        throw Error('Invalid backup filename');
    const raw = fs.readFileSync(path.join(root, file));
    if (raw.subarray(0, 8).toString() !== 'BILLBK01')
        throw Error('Unknown backup format');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(8, 20));
    cipher.setAuthTag(raw.subarray(20, 36));
    const bytes = gunzipSync(Buffer.concat([cipher.update(raw.subarray(36)), cipher.final()]), { maxOutputLength: 256 * 1024 * 1024 });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-restore-')), target = path.join(dir, 'restored.sqlite');
    let restored;
    try {
        fs.writeFileSync(target, bytes);
        restored = new DatabaseSync(target);
        if (restored.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
            throw Error('Database integrity failed');
        if (restored.prepare('PRAGMA foreign_key_check').all().length)
            throw Error('Foreign key check failed');
        const counts = {};
        for (const table of ['users', 'customers', 'services', 'documents', 'payments', 'audit'])
            counts[table] = restored.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
        restored.close();
        restored = null;
        run('INSERT INTO backup_runs VALUES(?,?,?,?)', crypto.randomUUID(), new Date().toISOString(), 'restore-tested', JSON.stringify({ file, counts }));
        audit(actor, 'backup.restore-tested', file);
        return { file, counts, bytes };
    }
    finally {
        restored?.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
export function restoreBackup(file, actor) {
    const tested = testRestore(file, actor), safety = createBackup(actor, 'pre-restore');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    try {
        fs.copyFileSync(dbFile, dbFile + '.pre-restore');
        fs.writeFileSync(dbFile, tested.bytes);
        openDB();
        run('DELETE FROM sessions');
        audit(actor, 'backup.restored', file, JSON.stringify(safety));
        return { restored: file, safety };
    }
    catch (e) {
        fs.copyFileSync(dbFile + '.pre-restore', dbFile);
        openDB();
        throw e;
    }
}
export function scheduleBackups() {
    const tick = () => { if (!configured())
        return; const last = get("SELECT at FROM backup_runs WHERE status='success' ORDER BY at DESC LIMIT 1"); if (!last || Date.now() - Date.parse(last.at) > 86400000) {
        try {
            createBackup(null);
        }
        catch (e) {
            console.error('Automatic backup failed:', e.message);
        }
    } };
    tick();
    const timer = setInterval(tick, 60000);
    timer.unref();
}
