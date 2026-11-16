import math
from database import get_db

def calculate_trust_score(user_id: int) -> dict:
    """
    Calculates a weighted trust score (0-100) from multiple factors.
    Returns individual factor scores and the composite score.
    """
    conn = get_db()
    c = conn.cursor()

    # Get user info
    user = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"score": 0, "level": "Critical"}

    # Factor 1: Identity Verification (weight: 30%)
    identity_score = 0
    ver_req = c.execute(
        "SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if ver_req:
        if ver_req["identity_status"] == "verified":
            identity_score = 100
        elif ver_req["identity_status"] == "pending":
            identity_score = 30
        elif ver_req["personal_info_status"] == "completed":
            identity_score = 50

    # Factor 2: Document Authenticity (weight: 25%)
    docs = c.execute(
        "SELECT verification_status, authenticity_score FROM documents WHERE user_id = ?",
        (user_id,)
    ).fetchall()
    if docs:
        verified_docs = [d for d in docs if d["verification_status"] == "verified"]
        doc_score = (len(verified_docs) / len(docs)) * 100
        avg_authenticity = sum(d["authenticity_score"] for d in verified_docs) / max(len(verified_docs), 1)
        document_score = (doc_score * 0.6 + avg_authenticity * 0.4)
    else:
        document_score = 0

    # Factor 3: Profile Completeness (weight: 20%)
    profile = c.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    profile_fields = 0
    if profile:
        fields = ["phone", "address", "city", "country", "organization", "job_title", "bio", "date_of_birth", "nationality"]
        filled = sum(1 for f in fields if profile[f])
        profile_fields = (filled / len(fields)) * 100
    profile_score = profile_fields

    # Factor 4: Security (weight: 15%)
    security_score = 60  # base
    if profile and profile["two_fa_enabled"]:
        security_score += 40

    # Factor 5: Activity Trust (weight: 10%)
    activities = c.execute(
        "SELECT COUNT(*) as cnt FROM activity_logs WHERE user_id = ? AND created_at > datetime('now', '-30 days')",
        (user_id,)
    ).fetchone()
    risk_events_count = c.execute(
        "SELECT COUNT(*) as cnt FROM risk_events WHERE user_id = ? AND resolved = 0",
        (user_id,)
    ).fetchone()
    activity_score = min(100, (activities["cnt"] * 10)) if activities else 0
    activity_score = max(0, activity_score - (risk_events_count["cnt"] * 15))

    # Composite weighted score
    composite = (
        identity_score * 0.30 +
        document_score * 0.25 +
        profile_score * 0.20 +
        security_score * 0.15 +
        activity_score * 0.10
    )
    composite = round(min(100, max(0, composite)), 1)

    # Determine level
    if composite >= 90:
        level = "Highly Trusted"
    elif composite >= 75:
        level = "Trusted"
    elif composite >= 50:
        level = "Moderate"
    elif composite >= 25:
        level = "Low Trust"
    else:
        level = "Critical"

    # Update user's trust score
    c.execute("UPDATE users SET trust_score = ?, updated_at = datetime('now') WHERE id = ?", (composite, user_id))
    c.execute("""
        INSERT INTO trust_score_history 
        (user_id, score, identity_score, document_score, profile_score, security_score, activity_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user_id, composite, identity_score, document_score, profile_score, security_score, activity_score))
    conn.commit()
    conn.close()

    return {
        "score": composite,
        "level": level,
        "factors": {
            "identity": round(identity_score, 1),
            "documents": round(document_score, 1),
            "profile": round(profile_score, 1),
            "security": round(security_score, 1),
            "activity": round(activity_score, 1)
        }
    }


def calculate_risk_score(user_id: int) -> dict:
    """
    Calculates a risk score (0-100). Higher = more risky.
    """
    conn = get_db()
    c = conn.cursor()

    risk_score = 10  # base
    risk_factors = []

    # Unresolved risk events
    risk_events = c.execute(
        "SELECT severity FROM risk_events WHERE user_id = ? AND resolved = 0",
        (user_id,)
    ).fetchall()
    for event in risk_events:
        if event["severity"] == "critical":
            risk_score += 25
        elif event["severity"] == "high":
            risk_score += 15
        elif event["severity"] == "medium":
            risk_score += 8
        else:
            risk_score += 3
    if risk_events:
        risk_factors.append(f"{len(risk_events)} unresolved risk events")

    # Verification issues
    ver = c.execute(
        "SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if not ver or ver["final_status"] != "verified":
        risk_score += 20
        risk_factors.append("Verification incomplete")

    # No documents
    doc_count = c.execute(
        "SELECT COUNT(*) as cnt FROM documents WHERE user_id = ? AND verification_status = 'verified'",
        (user_id,)
    ).fetchone()
    if doc_count["cnt"] == 0:
        risk_score += 15
        risk_factors.append("No verified documents")

    risk_score = round(min(100, max(0, risk_score)), 1)

    if risk_score <= 20:
        level = "Low"
    elif risk_score <= 40:
        level = "Moderate"
    elif risk_score <= 60:
        level = "Elevated"
    elif risk_score <= 80:
        level = "High"
    else:
        level = "Critical"

    import json
    c.execute("UPDATE users SET risk_score = ?, updated_at = datetime('now') WHERE id = ?", (risk_score, user_id))
    c.execute("""
        INSERT INTO risk_score_history (user_id, score, risk_level, risk_factors)
        VALUES (?, ?, ?, ?)
    """, (user_id, risk_score, level, json.dumps(risk_factors)))
    conn.commit()
    conn.close()

    return {"score": risk_score, "level": level, "factors": risk_factors}
