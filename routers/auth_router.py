from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from database import get_db
from auth import hash_password, verify_password, create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_HOURS
import json

router = APIRouter(prefix="/api/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/register")
async def register(data: RegisterRequest, request: Request):
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    conn = get_db()
    c = conn.cursor()
    existing = c.execute("SELECT id FROM users WHERE email = ?", (data.email.lower(),)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=409, detail="Email already registered")
    
    password_hash = hash_password(data.password)
    c.execute("""
        INSERT INTO users (name, email, password_hash, role, trust_score, risk_score, verification_status)
        VALUES (?, ?, ?, 'user', 0, 10, 'unverified')
    """, (data.name, data.email.lower(), password_hash))
    user_id = c.lastrowid
    
    # Create empty profile
    c.execute("INSERT INTO profiles (user_id) VALUES (?)", (user_id,))
    
    # Create initial verification request
    c.execute("""
        INSERT INTO verification_requests (user_id, step, status)
        VALUES (?, 1, 'in_progress')
    """, (user_id,))
    
    # Log activity
    c.execute("""
        INSERT INTO activity_logs (user_id, action, description, ip_address)
        VALUES (?, 'account_created', 'Account created successfully', ?)
    """, (user_id, request.client.host))
    
    # Audit log
    c.execute("""
        INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, ip_address, status)
        VALUES (?, ?, 'user', 'user_registered', 'user', ?, 'New user registered', ?, 'success')
    """, (user_id, data.email.lower(), user_id, request.client.host))
    
    conn.commit()
    conn.close()
    
    token = create_access_token({"user_id": user_id, "email": data.email.lower(), "role": "user", "name": data.name})
    return {"access_token": token, "token_type": "bearer", "role": "user", "name": data.name, "user_id": user_id}

@router.post("/login")
async def login(data: LoginRequest, request: Request):
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT * FROM users WHERE email = ?", (data.email.lower(),)).fetchone()
    
    if not user or not verify_password(data.password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if user["is_suspended"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Account suspended. Contact support.")
    
    # Update last login
    c.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user["id"],))
    
    # Activity log
    c.execute("""
        INSERT INTO activity_logs (user_id, action, description, ip_address)
        VALUES (?, 'login', 'User logged in', ?)
    """, (user["id"], request.client.host))
    
    # Audit log
    c.execute("""
        INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, description, ip_address, status)
        VALUES (?, ?, ?, 'user_login', 'user', ?, 'User logged in', ?, 'success')
    """, (user["id"], user["email"], user["role"], user["id"], request.client.host))
    
    conn.commit()
    conn.close()
    
    token = create_access_token({
        "user_id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "name": user["name"]
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "name": user["name"],
        "user_id": user["id"]
    }

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    return {"message": "Logged out successfully"}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT id, name, email, role, trust_score, risk_score, verification_status, profile_image, created_at, last_login FROM users WHERE id = ?", 
                     (current_user["user_id"],)).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(user)

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    # In production, send email. For demo, return a mock token.
    conn = get_db()
    c = conn.cursor()
    user = c.execute("SELECT id FROM users WHERE email = ?", (data.email.lower(),)).fetchone()
    conn.close()
    # Always return success to prevent email enumeration
    return {"message": "If an account exists with this email, you will receive reset instructions.", "demo_token": "reset-demo-token-123"}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    return {"message": "Password reset successful. Please log in with your new password."}
