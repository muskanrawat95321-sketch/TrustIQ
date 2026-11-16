from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from contextlib import asynccontextmanager
import os
import json
import random
from pathlib import Path

from database import init_db, get_db
from auth import hash_password
from routers.auth_router import router as auth_router
from routers.user_router import router as user_router
from routers.admin_router import router as admin_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database and seed data
    init_db()
    seed_demo_data()
    yield

def seed_demo_data():
    """Create demo accounts and sample data"""
    conn = get_db()
    c = conn.cursor()
    
    # Check if already seeded
    existing = c.execute("SELECT id FROM users WHERE email = 'admin@trustiq.demo'").fetchone()
    if existing:
        conn.close()
        return
    
    print("Seeding demo data...")
    
    # Create admin account
    admin_hash = hash_password("TrustIQ@Admin2024")
    c.execute("""
        INSERT INTO users (name, email, password_hash, role, trust_score, risk_score, verification_status, last_login)
        VALUES ('Alex Morgan', 'admin@trustiq.demo', ?, 'admin', 98.5, 2.1, 'verified', datetime('now', '-1 hour'))
    """, (admin_hash,))
    admin_id = c.lastrowid
    c.execute("INSERT INTO profiles (user_id, phone, address, city, country, organization, job_title, two_fa_enabled) VALUES (?, '+1-555-0001', '123 Admin St', 'San Francisco', 'USA', 'TrustIQ Inc', 'Chief Security Officer', 1)", (admin_id,))
    
    # Create demo user account
    user_hash = hash_password("TrustIQ@User2024")
    c.execute("""
        INSERT INTO users (name, email, password_hash, role, trust_score, risk_score, verification_status, last_login)
        VALUES ('Jordan Smith', 'user@trustiq.demo', ?, 'user', 94.0, 8.5, 'verified', datetime('now', '-2 hours'))
    """, (user_hash,))
    user_id = c.lastrowid
    c.execute("INSERT INTO profiles (user_id, phone, address, city, country, organization, job_title, bio, nationality, two_fa_enabled) VALUES (?, '+1-555-0101', '456 Main Ave', 'New York', 'USA', 'Acme Corp', 'Senior Engineer', 'Experienced software engineer with 10+ years in fintech.', 'American', 1)", (user_id,))
    
    # Verification for demo user
    c.execute("""
        INSERT INTO verification_requests (user_id, step, status, personal_info_status, identity_status, document_status, review_status, final_status,
        personal_info_completed_at, identity_completed_at, document_completed_at, reviewed_at, completed_at)
        VALUES (?, 5, 'completed', 'completed', 'verified', 'verified', 'completed', 'verified',
        datetime('now', '-20 days'), datetime('now', '-19 days'), datetime('now', '-18 days'), datetime('now', '-17 days'), datetime('now', '-17 days'))
    """, (user_id,))
    
    # Documents for demo user
    doc_types = [
        ("Identity Document", "identity", 97.5, "verified"),
        ("Address Proof", "address", 94.2, "verified"),
        ("Education Certificate", "education", 92.8, "verified"),
        ("Professional Certificate", "professional", 96.1, "verified"),
    ]
    for name, dtype, score, status in doc_types:
        c.execute("""
            INSERT INTO documents (user_id, name, doc_type, verification_status, authenticity_score, uploaded_at)
            VALUES (?, ?, ?, ?, ?, datetime('now', '-' || ? || ' days'))
        """, (user_id, name, dtype, status, score, random.randint(5, 20)))
    
    # Activity for demo user
    activities = [
        ("verified", "Identity fully verified by TrustIQ system"),
        ("document_uploaded", "Professional Certificate uploaded"),
        ("document_uploaded", "Education Certificate uploaded"),
        ("profile_updated", "Profile information updated"),
        ("login", "Secure login from trusted device"),
        ("security_changed", "2FA enabled"),
        ("document_uploaded", "Address Proof uploaded"),
        ("document_uploaded", "Identity Document uploaded"),
        ("verification_step", "Identity verification completed"),
        ("account_created", "Account created successfully"),
    ]
    for i, (action, desc) in enumerate(activities):
        c.execute("INSERT INTO activity_logs (user_id, action, description, ip_address, created_at) VALUES (?, ?, ?, '192.168.1.1', datetime('now', '-' || ? || ' days'))",
                  (user_id, action, desc, i+1))
    
    # Create sample users
    sample_users = [
        ("Sarah Johnson", "sarah.j@demo.com", 78.2, 28.5, "verified", "Johnson Consulting"),
        ("Mike Davis", "mike.d@demo.com", 45.0, 65.3, "unverified", "DataTech LLC"),
        ("Emily Chen", "emily.c@demo.com", 88.7, 12.1, "verified", "Chen Industries"),
        ("Robert Williams", "robert.w@demo.com", 32.1, 78.9, "rejected", "Williams & Co"),
        ("Lisa Anderson", "lisa.a@demo.com", 91.5, 5.2, "verified", "Anderson Group"),
        ("James Wilson", "james.w@demo.com", 55.3, 48.7, "pending", "Wilson Tech"),
        ("Maria Garcia", "maria.g@demo.com", 82.4, 18.3, "verified", "Garcia Partners"),
        ("David Brown", "david.b@demo.com", 24.8, 82.1, "unverified", "Brown Associates"),
        ("Jennifer Lee", "jennifer.l@demo.com", 76.9, 31.4, "verified", "Lee Corp"),
        ("Christopher Martinez", "chris.m@demo.com", 68.5, 42.6, "pending", "Martinez Solutions"),
    ]
    
    for name, email, trust, risk, ver_status, org in sample_users:
        pw_hash = hash_password("Demo@Pass123")
        c.execute("""
            INSERT INTO users (name, email, password_hash, role, trust_score, risk_score, verification_status, last_login)
            VALUES (?, ?, ?, 'user', ?, ?, ?, datetime('now', '-' || ? || ' hours'))
        """, (name, email, pw_hash, trust, risk, ver_status, random.randint(1, 72)))
        uid = c.lastrowid
        c.execute("INSERT INTO profiles (user_id, phone, country, organization, two_fa_enabled) VALUES (?, ?, 'USA', ?, ?)",
                  (uid, f"+1-555-{random.randint(1000,9999)}", org, random.randint(0,1)))
        c.execute("INSERT INTO verification_requests (user_id, step, status) VALUES (?, ?, ?)",
                  (uid, random.randint(1,5), "in_progress" if ver_status == "pending" else ("completed" if ver_status == "verified" else "rejected")))
        if risk > 50:
            c.execute("INSERT INTO risk_events (user_id, event_type, severity, description) VALUES (?, ?, ?, ?)",
                      (uid, "suspicious_activity", "high" if risk > 70 else "medium", f"Anomalous behavior detected for {name}"))
    
    # Sample alerts
    alerts_data = [
        (2, "Identity Synthesis Detected", "AI detected potential synthetic identity creation pattern", "critical", "fraud"),
        (3, "Unusual Login Pattern", "Multiple failed login attempts from different locations", "high", "security"),
        (4, "Document Mismatch", "Submitted document metadata doesn't match user profile data", "high", "document"),
        (6, "Transaction Velocity Alert", "Abnormal transaction frequency detected in entity activity", "medium", "behavioral"),
        (8, "Risk Score Escalation", "Entity risk score increased by 25 points in 24 hours", "high", "risk"),
        (10, "Profile Inconsistency", "Reported organization doesn't match verification data", "medium", "identity"),
        (None, "System: Mass Login Attempt", "Coordinated login attempts detected from known botnet IPs", "critical", "system"),
        (None, "Fraud Pattern Alert", "New fraud pattern identified matching 3 registered entities", "high", "fraud"),
    ]
    for a in alerts_data:
        c.execute("INSERT INTO alerts (user_id, title, description, severity, category, status) VALUES (?, ?, ?, ?, ?, 'open')", a)
    
    # Sample risk events for high-risk users  
    c.execute("INSERT INTO risk_events (user_id, event_type, severity, description) VALUES (4, 'document_forgery', 'high', 'Suspected document alteration detected')")
    c.execute("INSERT INTO risk_events (user_id, event_type, severity, description) VALUES (8, 'identity_mismatch', 'critical', 'Identity data contradicts public records')")
    
    # Audit logs
    audit_entries = [
        (admin_id, "admin@trustiq.demo", "admin", "admin_login", "session", None, "Admin logged in"),
        (user_id, "user@trustiq.demo", "user", "user_login", "session", None, "User logged in"),
        (admin_id, "admin@trustiq.demo", "admin", "verification_review", "verification", 1, "Verification approved for Jordan Smith"),
        (admin_id, "admin@trustiq.demo", "admin", "document_review", "document", 1, "Document verified"),
        (admin_id, "admin@trustiq.demo", "admin", "alert_update", "alert", 1, "Alert reviewed"),
    ]
    for a in audit_entries:
        c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, ip_address, status) VALUES (?, ?, ?, ?, ?, ?, ?, '10.0.0.1', 'success')", a)
    
    # Notification for demo user
    c.execute("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Welcome to TrustIQ!', 'Your account has been created. Complete your verification to unlock all features.', 'info')", (user_id,))
    c.execute("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Verification Complete', 'Congratulations! Your identity has been fully verified. Trust Score: 94', 'success')", (user_id,))
    
    conn.commit()
    conn.close()
    print("Demo data seeded successfully!")
    print("\n==========================================")
    print("DEMO ACCOUNTS:")
    print("ADMIN: admin@trustiq.demo / TrustIQ@Admin2024")
    print("USER:  user@trustiq.demo  / TrustIQ@User2024")
    print("==========================================\n")

app = FastAPI(title="TrustIQ API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(admin_router)

# Serve frontend
frontend_path = Path(__file__).parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

@app.get("/")
async def root():
    index_file = frontend_path / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({"message": "TrustIQ API Running", "docs": "/docs"})

@app.get("/{path:path}")
async def serve_spa(path: str):
    # Serve the SPA for all non-API routes
    index_file = frontend_path / "index.html"
    if index_file.exists() and not path.startswith("api/"):
        return FileResponse(str(index_file))
    return JSONResponse({"error": "Not found"}, status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
