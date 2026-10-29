import json

class PromptBuilder:
    @staticmethod
    def build_lead_analysis_prompt(lead: dict) -> str:
        lead_data = {
            "name": lead.get("name", "Unknown"),
            "category": lead.get("category", "Unknown"),
            "website": lead.get("website", "Unknown"),
            "phone": lead.get("phone", "Unknown"),
            "address": lead.get("address", "Unknown"),
            "rating": lead.get("google_rating", "Unknown"),
            "reviews": lead.get("review_count", "Unknown"),
            "description": lead.get("description", "Unknown")
        }
        
        prompt = f"""
You are an expert B2B sales analyst. Analyze the following lead and generate a structured JSON response.

LEAD DATA:
{json.dumps(lead_data, indent=2)}

You MUST respond with a JSON object matching this exact schema:
{{
  "business_summary": "A 2-3 sentence overview of what they do.",
  "strengths": ["list of 2-3 strengths"],
  "weaknesses": ["list of 2-3 weaknesses"],
  "opportunities": ["list of 2-3 sales opportunities"],
  "digital_presence_analysis": "An analysis of their digital presence.",
  "website_analysis_summary": "A readable summary of their website analysis.",
  "seo_summary": "A readable summary of their SEO.",
  "website_quality": "High/Medium/Low/None",
  "design_quality": "Explanation of design quality",
  "performance": "Explanation of website performance",
  "missing_pages": ["e.g. Privacy Policy, Contact Us"],
  "security_observations": ["e.g. Missing SSL"],
  "seo_issues": ["list of potential SEO issues"],
  "trust_signals": ["list of trust signals like physical address, rating"],
  "online_reputation_summary": "Summary of their online reputation",
  "lead_priority": "Hot", // Hot, Warm, Cold, Very Cold
  "priority_reason": "Explanation of the priority score.",
  "lead_score_explanation": "Explain why the lead score is what it is, and what data contributed.",
  "cold_outreach": "A generalized cold outreach script.",
  "sales_email": "A personalized cold email tailored to their weaknesses.",
  "sales_whatsapp": "A short, punchy WhatsApp outreach message.",
  "follow_up_email": "A polite follow-up email.",
  "follow_up_whatsapp": "A polite follow-up WhatsApp.",
  "second_follow_up": "A second follow-up email/message.",
  "final_follow_up": "A final break-up follow-up.",
  "recommendations": {{
    "services": ["Recommended Service 1"],
    "technologies": ["Tech 1"],
    "priority_level": "High",
    "expected_value": "e.g. $1000/mo",
    "reasoning": "Why you recommend this."
  }}
}}
"""
        return prompt
