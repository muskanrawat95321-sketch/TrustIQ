import os
import json
import random

class AIService:
    """
    AI Service abstraction. Uses mock implementation by default.
    Can be extended to use Google Gemini or OpenAI.
    """

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("OPENAI_API_KEY")
        self.provider = "mock"
        if self.api_key:
            if os.environ.get("GEMINI_API_KEY"):
                self.provider = "gemini"
            else:
                self.provider = "openai"

    def generate_insight(self, context: dict) -> str:
        return self._mock_insight(context)

    def explain_trust_score(self, score: float, factors: dict) -> str:
        explanations = []
        if factors.get("identity", 0) >= 90:
            explanations.append("your identity has been fully verified")
        elif factors.get("identity", 0) >= 50:
            explanations.append("your identity verification is in progress")
        else:
            explanations.append("identity verification is incomplete")

        if factors.get("documents", 0) >= 80:
            explanations.append("all your documents are authenticated")
        elif factors.get("documents", 0) > 0:
            explanations.append("some documents are pending review")
        else:
            explanations.append("no verified documents on file")

        if factors.get("security", 0) >= 90:
            explanations.append("your account has strong security settings")

        if factors.get("profile", 0) >= 80:
            explanations.append("your profile is complete")

        score_text = ""
        if score >= 90:
            score_text = f"Your trust score of {score} places you in the top tier of trusted users."
        elif score >= 75:
            score_text = f"Your trust score of {score} is above average, indicating solid trustworthiness."
        elif score >= 50:
            score_text = f"Your trust score of {score} is moderate. Complete verification to improve it."
        else:
            score_text = f"Your trust score of {score} is low. Complete identity and document verification."

        reason = " and ".join(explanations[:3]).capitalize() + "." if explanations else ""
        return f"{score_text} This is because {reason}" if reason else score_text

    def explain_risk(self, risk_score: float, factors: list, user_name: str = "entity") -> str:
        if risk_score <= 20:
            return f"{user_name} shows no significant risk indicators. Behavioral patterns are consistent with trusted users."
        elif risk_score <= 40:
            return f"{user_name} presents moderate risk. Factors: {', '.join(factors[:2]) if factors else 'incomplete verification'}. Routine monitoring recommended."
        elif risk_score <= 60:
            return f"{user_name} presents elevated risk. Key concerns: {', '.join(factors[:3]) if factors else 'multiple risk signals detected'}. Manual review advised."
        else:
            return f"{user_name} presents HIGH risk. Critical factors: {', '.join(factors) if factors else 'multiple critical risk signals'}. Immediate investigation required."

    def summarize_document(self, doc_type: str, authenticity_score: float) -> str:
        if authenticity_score >= 90:
            return f"This {doc_type} document has passed all authenticity checks with a score of {authenticity_score}/100. No anomalies detected."
        elif authenticity_score >= 70:
            return f"This {doc_type} document appears authentic (score: {authenticity_score}/100) with minor inconsistencies. Manual review recommended."
        else:
            return f"This {doc_type} document shows potential inconsistencies (score: {authenticity_score}/100). Further verification required."

    def generate_report(self, report_type: str, data: dict) -> str:
        templates = {
            "trust_assessment": "Trust Assessment Report\n\nOverall Trust Index: {overall_trust}\nVerified Entities: {verified}\nHigh-Risk Entities: {high_risk}\n\nSummary: The platform demonstrates {trend} trust trends with {verified} verified entities.",
            "risk_intelligence": "Risk Intelligence Report\n\nAverage Risk Score: {avg_risk}\nHigh Risk Entities: {high_risk}\nFraud Signals: {fraud_signals}\n\nAnalysis: {analysis}",
            "executive_summary": "Executive Summary\n\nTrustIQ Platform Performance\n\nKey Metrics:\n- Trust Index: Strong\n- Verification Rate: {rate}%\n- Risk Level: {risk_level}\n\nRecommendations:\n1. Continue monitoring high-risk entities\n2. Accelerate pending verifications\n3. Review fraud signals weekly"
        }
        template = templates.get(report_type, "Report generated successfully.")
        return template.format(**{k: str(v) for k, v in data.items()})

    def answer_admin_query(self, query: str, context: dict) -> str:
        query_lower = query.lower()
        if "highest" in query_lower and "risk" in query_lower:
            return f"Based on current data, the highest-risk entities are those with risk scores above 70. {context.get('high_risk_count', 0)} entities currently fall into this category. Recommend immediate investigation of those with unresolved fraud signals."
        elif "fraud" in query_lower:
            return f"Fraud alert analysis shows {context.get('fraud_signals', 0)} signals detected this period. Common patterns include: identity synthesis, transaction velocity anomalies, and document alteration. Recommend cross-referencing with behavioral baselines."
        elif "verification" in query_lower and "manual" in query_lower:
            return f"Currently {context.get('pending_verification', 0)} entities require manual verification. Priority queue: entities with document authenticity score below 70 or identity mismatches."
        elif "summary" in query_lower or "monthly" in query_lower:
            return f"Monthly Risk Summary: Trust index at {context.get('trust_index', 92.4)}. Verification completion rate: 58%. {context.get('fraud_signals', 326)} fraud signals detected, {context.get('resolved_alerts', 0)} resolved. Recommend focusing on pending manual reviews."
        else:
            return f"Based on TrustIQ intelligence data: {context.get('summary', 'Platform operating within normal parameters. No critical anomalies detected in the current period. Continue standard monitoring protocols.')}"

    def _mock_insight(self, context: dict) -> str:
        insights = [
            "Identity verification rates have improved by 12% this month, indicating stronger onboarding processes.",
            "Anomalous login patterns detected in 3 high-risk entities. Recommend immediate review.",
            "Document authenticity scores are trending upward, suggesting improved submission quality.",
            "Behavioral analysis indicates 87% of flagged entities show consistent patterns with known fraud profiles.",
            "Trust score distribution is healthy: 68% of users fall in the High Trust tier."
        ]
        return random.choice(insights)

    def get_recommendations(self, user_data: dict) -> list:
        recs = []
        if not user_data.get("two_fa_enabled"):
            recs.append({"type": "security", "priority": "high", "message": "Enable two-factor authentication to strengthen your account security and boost your trust score."})
        if user_data.get("verification_status") != "verified":
            recs.append({"type": "verification", "priority": "high", "message": "Complete your identity verification to unlock all platform features and maximize your trust score."})
        if user_data.get("doc_count", 0) < 4:
            recs.append({"type": "documents", "priority": "medium", "message": "Upload all required documents to improve your document authenticity score."})
        if not user_data.get("profile_complete"):
            recs.append({"type": "profile", "priority": "low", "message": "Complete your profile to improve your profile completeness score."})
        if not recs:
            recs.append({"type": "success", "priority": "low", "message": "Your profile is in excellent shape! Keep your documents updated to maintain your high trust score."})
        return recs


ai_service = AIService()
