import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent / "trustiq.db"

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        profile_image TEXT,
        trust_score REAL DEFAULT 0,
        risk_score REAL DEFAULT 0,
        verification_status TEXT DEFAULT 'unverified',
        is_active INTEGER DEFAULT 1,
        is_suspended INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        organization TEXT,
        job_title TEXT,
        bio TEXT,
        date_of_birth TEXT,
        nationality TEXT,
        two_fa_enabled INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER,
        mime_type TEXT,
        verification_status TEXT DEFAULT 'pending',
        authenticity_score REAL DEFAULT 0,
        uploaded_at TEXT DEFAULT (datetime('now')),
        reviewed_at TEXT,
        reviewer_id INTEGER,
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        step INTEGER DEFAULT 1,
        status TEXT DEFAULT 'in_progress',
        personal_info_status TEXT DEFAULT 'pending',
        identity_status TEXT DEFAULT 'pending',
        document_status TEXT DEFAULT 'pending',
        review_status TEXT DEFAULT 'pending',
        final_status TEXT DEFAULT 'pending',
        personal_info_completed_at TEXT,
        identity_completed_at TEXT,
        document_completed_at TEXT,
        reviewed_at TEXT,
        completed_at TEXT,
        reviewer_id INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trust_score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        score REAL NOT NULL,
        identity_score REAL DEFAULT 0,
        document_score REAL DEFAULT 0,
        profile_score REAL DEFAULT 0,
        security_score REAL DEFAULT 0,
        activity_score REAL DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS risk_score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        score REAL NOT NULL,
        risk_level TEXT NOT NULL,
        risk_factors TEXT,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS risk_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT DEFAULT 'medium',
        description TEXT,
        metadata TEXT,
        resolved INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT DEFAULT 'medium',
        category TEXT DEFAULT 'general',
        status TEXT DEFAULT 'open',
        assigned_to INTEGER,
        resolved_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS investigations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        alert_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        investigator_id INTEGER,
        findings TEXT,
        recommendation TEXT,
        opened_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        ip_address TEXT,
        device TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        actor_email TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        description TEXT,
        ip_address TEXT,
        device TEXT,
        status TEXT DEFAULT 'success',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        ip_address TEXT,
        device TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        report_type TEXT NOT NULL,
        generated_by INTEGER,
        parameters TEXT,
        file_path TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT,
        industry TEXT,
        country TEXT,
        trust_score REAL DEFAULT 0,
        risk_score REAL DEFAULT 0,
        verification_status TEXT DEFAULT 'unverified',
        created_at TEXT DEFAULT (datetime('now'))
    );
    """)

    conn.commit()
    conn.close()
    print("Database initialized successfully")
