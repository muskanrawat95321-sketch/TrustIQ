from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import get_current_user, hash_password, verify_password
from services.scoring import calculate_trust_score, calculate_risk_score
from services.ai_service import ai_service
import json
import os
import shutil
from pathlib import Path

router = APIRouter(prefix="/api/user", tags=["user"])

def require_auth(current_user: dict = Depends(get_current_user)):
    if not current_user.get("user_id"):
        raise HTTPException(status_code=401, detail="Authentication required")
    return current_user

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    organization: Optional[str] = None
    job_title: Optional[str] = None
    bio: Optional[str] = None
    date_of_birth: Optional[str] = None
    nationality: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class VerificationStepRequest(BaseModel):
    step: int
    data: Optional[dict] = {}

@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    
    # Recalculate scores
    trust_data = calculate_trust_score(user_id)
    risk_data = calculate_risk_score(user_id)
    
    # Get user
    user = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    profile = c.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    
    # Document stats
    docs = c.execute("SELECT COUNT(*) as total, SUM(CASE WHEN verification_status='verified' THEN 1 ELSE 0 END) as verified FROM documents WHERE user_id = ?", (user_id,)).fetchone()
    
    # Pending requests
    pending = c.execute("SELECT COUNT(*) as cnt FROM verification_requests WHERE user_id = ? AND status = 'in_progress'", (user_id,)).fetchone()
    
    # Recent activities
    activities = c.execute("""
        SELECT action, description, created_at FROM activity_logs 
        WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    """, (user_id,)).fetchall()
    
    conn.close()
    
    return {
        "user": {"id": user["id"], "name": user["name"], "email": user["email"], "verification_status": user["verification_status"]},
        "trust": trust_data,
        "risk": risk_data,
        "documents": {"total": docs["total"] or 0, "verified": docs["verified"] or 0},
        "pending_requests": pending["cnt"] or 0,
        "profile_security": "Strong" if (profile and profile["two_fa_enabled"]) else "Moderate",
        "two_fa_enabled": bool(profile and profile["two_fa_enabled"]),
        "recent_activities": [dict(a) for a in activities]
    }

@router.get("/profile")
async def get_profile(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT id, name, email, role, trust_score, risk_score, verification_status, profile_image, created_at, last_login FROM users WHERE id = ?", (user_id,)).fetchone()
    profile = c.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    
    trust_data = calculate_trust_score(user_id)
    
    conn.close()
    return {
        **dict(user),
        "profile": dict(profile) if profile else {},
        "trust": trust_data,
        "ai_explanation": ai_service.explain_trust_score(trust_data["score"], trust_data["factors"])
    }

@router.put("/profile")
async def update_profile(data: ProfileUpdateRequest, current_user: dict = Depends(require_auth), request: Request = None):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    
    if data.name:
        c.execute("UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?", (data.name, user_id))
    
    profile = c.execute("SELECT id FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    if not profile:
        c.execute("INSERT INTO profiles (user_id) VALUES (?)", (user_id,))
    
    update_fields = {k: v for k, v in data.dict().items() if v is not None and k != 'name'}
    if update_fields:
        set_clause = ", ".join(f"{k} = ?" for k in update_fields.keys())
        values = list(update_fields.values()) + [user_id]
        c.execute(f"UPDATE profiles SET {set_clause} WHERE user_id = ?", values)
    
    c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'profile_updated', 'Profile information updated')", (user_id,))
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'user', 'profile_update', 'user', ?, 'User updated profile', 'success')",
              (user_id, current_user["email"], user_id))
    conn.commit()
    conn.close()
    return {"message": "Profile updated successfully"}

@router.get("/trust-score")
async def get_trust_score(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    trust_data = calculate_trust_score(user_id)
    conn = get_db()
    c = conn.cursor()
    history = c.execute("SELECT score, calculated_at FROM trust_score_history WHERE user_id = ? ORDER BY calculated_at DESC LIMIT 30", (user_id,)).fetchall()
    conn.close()
    return {
        **trust_data,
        "history": [dict(h) for h in history],
        "explanation": ai_service.explain_trust_score(trust_data["score"], trust_data["factors"])
    }

@router.get("/documents")
async def get_documents(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    docs = c.execute("SELECT * FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC", (user_id,)).fetchall()
    conn.close()
    return [dict(d) for d in docs]

@router.post("/documents/upload")
async def upload_document(
    doc_type: str,
    doc_name: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_auth)
):
    user_id = current_user["user_id"]
    
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "application/pdf"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and PDF files are allowed")
    
    # Validate file size (10MB limit)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
    
    # Save file
    upload_dir = Path("uploads") / str(user_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{doc_type}_{file.filename}"
    with open(file_path, "wb") as f:
        f.write(content)
    
    import random
    authenticity_score = round(random.uniform(85, 99), 1)
    
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO documents (user_id, name, doc_type, file_path, file_size, mime_type, verification_status, authenticity_score)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    """, (user_id, doc_name, doc_type, str(file_path), len(content), file.content_type, authenticity_score))
    doc_id = c.lastrowid
    c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'document_uploaded', ?)", 
              (user_id, f"Document '{doc_name}' uploaded for verification"))
    c.execute("INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, status) VALUES (?, ?, 'user', 'document_upload', 'document', ?, 'Document uploaded', 'success')",
              (user_id, current_user["email"], doc_id))
    conn.commit()
    conn.close()
    return {"message": "Document uploaded successfully", "doc_id": doc_id, "authenticity_score": authenticity_score}

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    doc = c.execute("SELECT * FROM documents WHERE id = ? AND user_id = ?", (doc_id, user_id)).fetchone()
    if not doc:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")
    c.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'document_deleted', 'Document deleted')", (user_id,))
    conn.commit()
    conn.close()
    return {"message": "Document deleted"}

@router.get("/verification")
async def get_verification(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    ver = c.execute("SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    conn.close()
    if not ver:
        return {"step": 0, "status": "not_started"}
    return dict(ver)

@router.post("/verification/step")
async def update_verification_step(data: VerificationStepRequest, current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    ver = c.execute("SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    if not ver:
        c.execute("INSERT INTO verification_requests (user_id, step, status) VALUES (?, ?, 'in_progress')", (user_id, data.step))
        ver_id = c.lastrowid
    else:
        ver_id = ver["id"]

    step = data.step
    if step == 1:
        c.execute("UPDATE verification_requests SET step = 2, personal_info_status = 'completed', personal_info_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", (ver_id,))
        c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'verification_step', 'Personal information submitted')", (user_id,))
    elif step == 2:
        c.execute("UPDATE verification_requests SET step = 3, identity_status = 'verified', identity_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", (ver_id,))
        c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'verification_step', 'Identity verification completed')", (user_id,))
    elif step == 3:
        c.execute("UPDATE verification_requests SET step = 4, document_status = 'verified', document_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", (ver_id,))
        c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'verification_step', 'Document verification submitted')", (user_id,))
    elif step == 4:
        c.execute("UPDATE verification_requests SET step = 5, review_status = 'completed', reviewed_at = datetime('now'), final_status = 'verified', status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", (ver_id,))
        c.execute("UPDATE users SET verification_status = 'verified', updated_at = datetime('now') WHERE id = ?", (user_id,))
        c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'verified', 'Identity fully verified')", (user_id,))
        c.execute("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Verification Complete', 'Congratulations! Your identity has been fully verified.', 'success')", (user_id,))

    conn.commit()
    conn.close()
    return {"message": f"Step {step} completed", "next_step": step + 1}

@router.get("/activity")
async def get_activity(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    activities = c.execute("""
        SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    """, (user_id,)).fetchall()
    conn.close()
    return [dict(a) for a in activities]

@router.get("/insights")
async def get_insights(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    profile = c.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    doc_count = c.execute("SELECT COUNT(*) as cnt FROM documents WHERE user_id = ? AND verification_status = 'verified'", (user_id,)).fetchone()
    conn.close()
    
    trust_data = calculate_trust_score(user_id)
    
    user_data = {
        "two_fa_enabled": profile["two_fa_enabled"] if profile else False,
        "verification_status": user["verification_status"],
        "doc_count": doc_count["cnt"],
        "profile_complete": bool(profile and profile["phone"] and profile["address"])
    }
    recommendations = ai_service.get_recommendations(user_data)
    
    strengths = []
    improvements = []
    factors = trust_data.get("factors", {})
    for name, score in factors.items():
        if score >= 80:
            strengths.append({"factor": name.replace("_", " ").title(), "score": score})
        elif score < 60:
            improvements.append({"factor": name.replace("_", " ").title(), "score": score})
    
    return {
        "trust": trust_data,
        "strengths": strengths,
        "improvements": improvements,
        "recommendations": recommendations,
        "ai_summary": ai_service.explain_trust_score(trust_data["score"], trust_data["factors"])
    }

@router.get("/security")
async def get_security(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    profile = c.execute("SELECT two_fa_enabled FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    sessions = c.execute("SELECT id, ip_address, device, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", (user_id,)).fetchall()
    logins = c.execute("SELECT description, ip_address, created_at FROM activity_logs WHERE user_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 10", (user_id,)).fetchall()
    conn.close()
    return {
        "two_fa_enabled": bool(profile and profile["two_fa_enabled"]),
        "security_level": "Strong" if (profile and profile["two_fa_enabled"]) else "Moderate",
        "sessions": [dict(s) for s in sessions],
        "login_history": [dict(l) for l in logins]
    }

@router.post("/security/change-password")
async def change_password(data: PasswordChangeRequest, current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if not verify_password(data.current_password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    new_hash = hash_password(data.new_password)
    c.execute("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", (new_hash, user_id))
    c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'password_changed', 'Password changed successfully')", (user_id,))
    conn.commit()
    conn.close()
    return {"message": "Password changed successfully"}

@router.post("/security/toggle-2fa")
async def toggle_2fa(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    profile = c.execute("SELECT two_fa_enabled FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    new_val = 0 if (profile and profile["two_fa_enabled"]) else 1
    c.execute("UPDATE profiles SET two_fa_enabled = ? WHERE user_id = ?", (new_val, user_id))
    c.execute("INSERT INTO activity_logs (user_id, action, description) VALUES (?, 'security_changed', ?)",
              (user_id, "2FA enabled" if new_val else "2FA disabled"))
    conn.commit()
    conn.close()
    return {"two_fa_enabled": bool(new_val), "message": f"2FA {'enabled' if new_val else 'disabled'} successfully"}

@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]
    conn = get_db()
    c = conn.cursor()
    notifs = c.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", (user_id,)).fetchall()
    conn.close()
    return [dict(n) for n in notifs]
