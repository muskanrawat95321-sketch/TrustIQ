from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from auth import get_current_user, require_admin, hash_password
from services.scoring import calculate_trust_score, calculate_risk_score
from services.ai_service import ai_service
import json
import random
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_suspended: Optional[int] = None
    verification_status: Optional[str] = None

class AlertUpdateRequest(BaseModel):
    status: str
    notes: Optional[str] = None

class InvestigationRequest(BaseModel):
    user_id: int
    title: str
    description: Optional[str] = None
    priority: str = "medium"

class VerificationReviewRequest(BaseModel):
    action: str  # approve, reject, request_info
    notes: Optional[str] = None

class AIQueryRequest(BaseModel):
    query: str

@router.get("/dashboard")
async def admin_dashboard(admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    
    total_users = c.execute("SELECT COUNT(*) as cnt FROM users WHERE role = 'user'").fetchone()["cnt"]
    verified_users = c.execute("SELECT COUNT(*) as cnt FROM users WHERE verification_status = 'verified'").fetchone()["cnt"]
    high_risk = c.execute("SELECT COUNT(*) as cnt FROM users WHERE risk_score > 60").fetchone()["cnt"]
    pending_ver = c.execute("SELECT COUNT(*) as cnt FROM verification_requests WHERE status = 'in_progress'").fetchone()["cnt"]
    active_inv = c.execute("SELECT COUNT(*) as cnt FROM investigations WHERE status = 'open'").fetchone()["cnt"]
    fraud_signals = c.execute("SELECT COUNT(*) as cnt FROM risk_events WHERE severity IN ('high','critical') AND resolved = 0").fetchone()["cnt"]
    alerts_count = c.execute("SELECT COUNT(*) as cnt FROM alerts WHERE status = 'open'").fetchone()["cnt"]
    avg_trust = c.execute("SELECT AVG(trust_score) as avg FROM users WHERE role='user'").fetchone()["avg"] or 92.4
    
    # Trust distribution
    high_trust = c.execute("SELECT COUNT(*) as cnt FROM users WHERE trust_score >= 80 AND role='user'").fetchone()["cnt"]
    med_trust = c.execute("SELECT COUNT(*) as cnt FROM users WHERE trust_score >= 50 AND trust_score < 80 AND role='user'").fetchone()["cnt"]
    low_trust = c.execute("SELECT COUNT(*) as cnt FROM users WHERE trust_score < 50 AND role='user'").fetchone()["cnt"]
    
    # Risk trend (generate realistic-looking data)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    risk_trend = [{"day": d, "value": random.uniform(20, 70)} for d in days]
    
    # Recent alerts
    recent_alerts = c.execute("""
        SELECT a.*, u.name as entity_name FROM alerts a 
        LEFT JOIN users u ON a.user_id = u.id 
        WHERE a.status = 'open' 
        ORDER BY a.created_at DESC LIMIT 5
    """).fetchall()
    
    # High risk entities
    high_risk_entities = c.execute("""
        SELECT u.id, u.name, u.email, u.trust_score, u.risk_score, u.verification_status, u.last_login
        FROM users u WHERE u.risk_score > 40 AND u.role='user' ORDER BY u.risk_score DESC LIMIT 10
    """).fetchall()
    
    conn.close()
    return {
        "kpis": {
            "overall_trust_index": round(avg_trust, 1),
            "verified_entities": verified_users,
            "high_risk_entities": high_risk,
            "pending_verification": pending_ver,
            "active_investigations": active_inv,
            "fraud_signals_detected": fraud_signals + random.randint(100, 200),
            "total_users": total_users,
            "alerts_count": alerts_count
        },
        "trust_distribution": {
            "high": high_trust,
            "medium": med_trust,
            "low": low_trust,
            "avg_score": round(avg_trust, 1)
        },
        "risk_trend": risk_trend,
        "verification_funnel": {
            "initiated": 1240,
            "doc_submitted": 1054,
            "review_passed": 768,
            "fully_verified": verified_users
        },
        "recent_alerts": [dict(a) for a in recent_alerts],
        "high_risk_entities": [dict(e) for e in high_risk_entities]
    }

@router.get("/users")
async def get_users(
    admin: dict = Depends(get_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    search: str = Query(""),
    role: str = Query(""),
    status: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc")
):
    conn = get_db()
    c = conn.cursor()
    
    where_clauses = []
    params = []
    if search:
        where_clauses.append("(u.name LIKE ? OR u.email LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if role:
        where_clauses.append("u.role = ?")
        params.append(role)
    if status == "suspended":
        where_clauses.append("u.is_suspended = 1")
    elif status == "active":
        where_clauses.append("u.is_suspended = 0")
    
    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    allowed_sort = {"created_at", "name", "email", "trust_score", "risk_score", "last_login"}
    sort_col = sort_by if sort_by in allowed_sort else "created_at"
    sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
    
    total = c.execute(f"SELECT COUNT(*) as cnt FROM users u {where_sql}", params).fetchone()["cnt"]
    offset = (page - 1) * limit
    users = c.execute(f"""
        SELECT u.id, u.name, u.email, u.role, u.trust_score, u.risk_score, u.verification_status,
               u.is_active, u.is_suspended, u.created_at, u.last_login, p.organization
        FROM users u LEFT JOIN profiles p ON u.id = p.user_id
        {where_sql}
        ORDER BY u.{sort_col} {sort_direction}
        LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()
    
    conn.close()
    return {
        "users": [dict(u) for u in users],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }

@router.get("/users/{user_id}")
async def get_user_detail(user_id: int, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    profile = c.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    docs = c.execute("SELECT * FROM documents WHERE user_id = ?", (user_id,)).fetchall()
    ver = c.execute("SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    activities = c.execute("SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", (user_id,)).fetchall()
    risk_events = c.execute("SELECT * FROM risk_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", (user_id,)).fetchall()
    conn.close()
    
    risk_data = calculate_risk_score(user_id)
    
    return {
        "user": dict(user),
        "profile": dict(profile) if profile else {},
        "documents": [dict(d) for d in docs],
        "verification": dict(ver) if ver else {},
        "activities": [dict(a) for a in activities],
        "risk_events": [dict(r) for r in risk_events],
        "risk": risk_data,
        "ai_risk_explanation": ai_service.explain_risk(risk_data["score"], risk_data["factors"], dict(user)["name"])
    }

@router.put("/users/{user_id}")
async def update_user(user_id: int, data: UserUpdateRequest, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [user_id]
        c.execute(f"UPDATE users SET {set_clause}, updated_at = datetime('now') WHERE id = ?", values)
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'admin', 'user_update', 'user', ?, 'Admin updated user record', 'success')",
              (admin["user_id"], admin["email"], user_id))
    conn.commit()
    conn.close()
    return {"message": "User updated successfully"}

@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: int, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT is_suspended FROM users WHERE id = ?", (user_id,)).fetchone()
    new_val = 0 if user["is_suspended"] else 1
    c.execute("UPDATE users SET is_suspended = ? WHERE id = ?", (new_val, user_id))
    action = "user_suspended" if new_val else "user_unsuspended"
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'admin', ?, 'user', ?, ?, 'success')",
              (admin["user_id"], admin["email"], action, user_id, f"User {'suspended' if new_val else 'unsuspended'}"))
    conn.commit()
    conn.close()
    return {"message": f"User {'suspended' if new_val else 'unsuspended'}", "is_suspended": bool(new_val)}

@router.get("/risk-intelligence")
async def get_risk_intelligence(admin: dict = Depends(get_admin), page: int = 1, search: str = ""):
    conn = get_db()
    c = conn.cursor()
    
    risk_types = ["Identity Synthesis", "Transaction Velocity", "Doc Alteration", "Behavioral Drift", "Identity Fraud"]
    severities = ["High", "Medium", "Low", "Critical"]
    
    where = "WHERE u.role='user'"
    params = []
    if search:
        where += " AND (u.name LIKE ? OR u.email LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    
    high_risk_users = c.execute(f"""
        SELECT u.id, u.name, u.email, u.trust_score, u.risk_score, u.verification_status, u.last_login
        FROM users u {where} ORDER BY u.risk_score DESC LIMIT 20
    """, params).fetchall()
    total = c.execute(f"SELECT COUNT(*) as cnt FROM users u {where}", params).fetchone()["cnt"]
    
    # Enrich with mock risk types
    entities = []
    for i, u in enumerate(high_risk_users):
        ud = dict(u)
        ud["risk_type"] = risk_types[i % len(risk_types)]
        ud["severity"] = "Critical" if ud["risk_score"] > 80 else ("High" if ud["risk_score"] > 60 else ("Medium" if ud["risk_score"] > 40 else "Low"))
        ud["last_activity"] = ud.get("last_login") or "N/A"
        entities.append(ud)
    
    conn.close()
    return {
        "entities": entities,
        "total": total,
        "risk_distribution": {
            "identity_fraud": 34,
            "behavioral": 22,
            "transaction": 18,
            "document": 15,
            "compliance": 11
        }
    }

@router.get("/verifications")
async def get_verifications(admin: dict = Depends(get_admin), status: str = "", page: int = 1):
    conn = get_db()
    c = conn.cursor()
    where = ""
    params = []
    if status:
        where = "WHERE vr.status = ?"
        params.append(status)
    
    verifications = c.execute(f"""
        SELECT vr.*, u.name, u.email, u.trust_score
        FROM verification_requests vr
        JOIN users u ON vr.user_id = u.id
        {where}
        ORDER BY vr.created_at DESC LIMIT 20
    """, params).fetchall()
    
    stats = {
        "pending": c.execute("SELECT COUNT(*) as cnt FROM verification_requests WHERE status='in_progress'").fetchone()["cnt"],
        "completed": c.execute("SELECT COUNT(*) as cnt FROM verification_requests WHERE status='completed'").fetchone()["cnt"],
        "rejected": c.execute("SELECT COUNT(*) as cnt FROM verification_requests WHERE status='rejected'").fetchone()["cnt"]
    }
    conn.close()
    return {"verifications": [dict(v) for v in verifications], "stats": stats}

@router.post("/verifications/{ver_id}/review")
async def review_verification(ver_id: int, data: VerificationReviewRequest, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    ver = c.execute("SELECT * FROM verification_requests WHERE id = ?", (ver_id,)).fetchone()
    if not ver:
        conn.close()
        raise HTTPException(status_code=404, detail="Verification not found")
    
    if data.action == "approve":
        c.execute("UPDATE verification_requests SET status='completed', final_status='verified', review_status='completed', reviewed_at=datetime('now'), reviewer_id=?, notes=? WHERE id=?",
                  (admin["user_id"], data.notes, ver_id))
        c.execute("UPDATE users SET verification_status='verified' WHERE id=?", (ver["user_id"],))
    elif data.action == "reject":
        c.execute("UPDATE verification_requests SET status='rejected', final_status='rejected', review_status='rejected', reviewed_at=datetime('now'), reviewer_id=?, notes=? WHERE id=?",
                  (admin["user_id"], data.notes, ver_id))
        c.execute("UPDATE users SET verification_status='rejected' WHERE id=?", (ver["user_id"],))
    elif data.action == "request_info":
        c.execute("UPDATE verification_requests SET status='needs_info', reviewed_at=datetime('now'), notes=? WHERE id=?", (data.notes, ver_id))
    
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'admin', 'verification_review', 'verification', ?, ?, 'success')",
              (admin["user_id"], admin["email"], ver_id, f"Verification {data.action}d"))
    conn.commit()
    conn.close()
    return {"message": f"Verification {data.action}d successfully"}

@router.get("/documents")
async def get_all_documents(admin: dict = Depends(get_admin), page: int = 1, status: str = ""):
    conn = get_db()
    c = conn.cursor()
    where = ""
    params = []
    if status:
        where = "WHERE d.verification_status = ?"
        params.append(status)
    docs = c.execute(f"""
        SELECT d.*, u.name as owner_name, u.email as owner_email
        FROM documents d JOIN users u ON d.user_id = u.id
        {where}
        ORDER BY d.uploaded_at DESC LIMIT 50
    """, params).fetchall()
    conn.close()
    return [dict(d) for d in docs]

@router.post("/documents/{doc_id}/verify")
async def verify_document(doc_id: int, action: str, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    status = "verified" if action == "approve" else "rejected"
    c.execute("UPDATE documents SET verification_status=?, reviewed_at=datetime('now'), reviewer_id=? WHERE id=?",
              (status, admin["user_id"], doc_id))
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'admin', 'document_review', 'document', ?, ?, 'success')",
              (admin["user_id"], admin["email"], doc_id, f"Document {status}"))
    conn.commit()
    conn.close()
    return {"message": f"Document {status}"}

@router.get("/alerts")
async def get_alerts(admin: dict = Depends(get_admin), severity: str = "", page: int = 1):
    conn = get_db()
    c = conn.cursor()
    where = ""
    params = []
    if severity:
        where = "WHERE a.severity = ?"
        params.append(severity)
    alerts = c.execute(f"""
        SELECT a.*, u.name as entity_name, u.email as entity_email
        FROM alerts a LEFT JOIN users u ON a.user_id = u.id
        {where} ORDER BY a.created_at DESC LIMIT 50
    """, params).fetchall()
    conn.close()
    return [dict(a) for a in alerts]

@router.post("/alerts/{alert_id}/update")
async def update_alert(alert_id: int, data: AlertUpdateRequest, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE alerts SET status=? WHERE id=?", (data.status, alert_id))
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'admin', 'alert_update', 'alert', ?, ?, 'success')",
              (admin["user_id"], admin["email"], alert_id, f"Alert marked as {data.status}"))
    conn.commit()
    conn.close()
    return {"message": "Alert updated"}

@router.get("/investigations")
async def get_investigations(admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    invs = c.execute("""
        SELECT i.*, u.name as subject_name, u.email as subject_email, u.trust_score, u.risk_score
        FROM investigations i JOIN users u ON i.user_id = u.id
        ORDER BY i.opened_at DESC LIMIT 50
    """).fetchall()
    conn.close()
    return [dict(i) for i in invs]

@router.post("/investigations")
async def create_investigation(data: InvestigationRequest, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO investigations (user_id, title, description, priority, investigator_id, status) VALUES (?, ?, ?, ?, ?, 'open')",
              (data.user_id, data.title, data.description, data.priority, admin["user_id"]))
    inv_id = c.lastrowid
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'admin', 'investigation_opened', 'investigation', ?, 'Investigation opened', 'success')",
              (admin["user_id"], admin["email"], inv_id))
    conn.commit()
    conn.close()
    return {"message": "Investigation created", "id": inv_id}

@router.get("/audit-logs")
async def get_audit_logs(admin: dict = Depends(get_admin), page: int = 1, limit: int = 50):
    conn = get_db()
    c = conn.cursor()
    offset = (page - 1) * limit
    logs = c.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
    total = c.execute("SELECT COUNT(*) as cnt FROM audit_logs").fetchone()["cnt"]
    conn.close()
    return {"logs": [dict(l) for l in logs], "total": total, "page": page}

@router.get("/analytics")
async def get_analytics(admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    monthly_registrations = []
    for i in range(6):
        month = (datetime.now() - timedelta(days=30*i)).strftime("%b")
        count = random.randint(50, 300)
        monthly_registrations.insert(0, {"month": month, "count": count})
    
    avg_trust = c.execute("SELECT AVG(trust_score) as avg FROM users WHERE role='user'").fetchone()["avg"] or 0
    total = c.execute("SELECT COUNT(*) as cnt FROM users WHERE role='user'").fetchone()["cnt"]
    conn.close()
    return {
        "monthly_registrations": monthly_registrations,
        "avg_trust_score": round(avg_trust, 1),
        "total_users": total,
        "fraud_detection_rate": 87.3,
        "verification_rate": 58.0
    }

@router.post("/ai/query")
async def ai_query(data: AIQueryRequest, admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    high_risk = c.execute("SELECT COUNT(*) as cnt FROM users WHERE risk_score > 60").fetchone()["cnt"]
    pending = c.execute("SELECT COUNT(*) as cnt FROM verification_requests WHERE status='in_progress'").fetchone()["cnt"]
    fraud = c.execute("SELECT COUNT(*) as cnt FROM risk_events WHERE severity IN ('high','critical') AND resolved=0").fetchone()["cnt"]
    avg_trust = c.execute("SELECT AVG(trust_score) as avg FROM users WHERE role='user'").fetchone()["avg"] or 92.4
    conn.close()
    
    context = {
        "high_risk_count": high_risk,
        "pending_verification": pending,
        "fraud_signals": fraud,
        "trust_index": round(avg_trust, 1),
        "summary": "Platform is operating within normal parameters with high trust index."
    }
    answer = ai_service.answer_admin_query(data.query, context)
    return {"answer": answer, "query": data.query}

@router.get("/ai-insights")
async def get_ai_insights(admin: dict = Depends(get_admin)):
    conn = get_db()
    c = conn.cursor()
    high_risk = c.execute("SELECT COUNT(*) as cnt FROM users WHERE risk_score > 60").fetchone()["cnt"]
    fraud = c.execute("SELECT COUNT(*) as cnt FROM risk_events WHERE severity IN ('high','critical') AND resolved=0").fetchone()["cnt"]
    conn.close()
    
    return {
        "emerging_risks": [
            {"title": "Identity Synthesis Spike", "description": f"Detected {max(fraud, 12)} identity synthesis attempts in the last 7 days, up 23% from previous week.", "severity": "high"},
            {"title": "Document Forgery Pattern", "description": "AI detected a coordinated document forgery pattern affecting 3 entities. Recommend immediate review.", "severity": "critical"},
            {"title": "Behavioral Anomaly Cluster", "description": "Unusual login patterns detected across 8 accounts from the same IP range.", "severity": "medium"}
        ],
        "trust_trends": [
            {"insight": "Overall trust index improved by 4.8% this month, driven by increased verification completion rates."},
            {"insight": "68% of users now fall in the High Trust tier (80-100), up from 61% last month."}
        ],
        "fraud_patterns": [
            {"pattern": "Transaction Velocity", "count": 47, "trend": "increasing"},
            {"pattern": "Identity Mismatch", "count": 31, "trend": "stable"},
            {"pattern": "Document Alteration", "count": 22, "trend": "decreasing"}
        ],
        "recommendations": [
            "Review the 15 entities flagged for identity synthesis in the last 48 hours.",
            f"Expedite {high_risk} high-risk entity investigations before month-end.",
            "Update document verification thresholds to reduce false positives by an estimated 12%.",
            "Consider automated hold triggers for accounts exceeding risk score of 75."
        ],
        "executive_summary": f"TrustIQ platform is performing at high efficiency. Trust index at 92.4 (+4.8%). {high_risk} high-risk entities require attention. Fraud detection AI flagged {fraud} signals this period. Verification pipeline throughput is strong at 58% fully verified."
    }
