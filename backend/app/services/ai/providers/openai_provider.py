import httpx
from app.core.logger import logger
from .base_provider import BaseAIProvider
from app.core.security_crypto import decrypt_string

class OpenAIProvider(BaseAIProvider):
    def __init__(self, settings: dict):
        super().__init__(settings)
        self.api_key = decrypt_string(self.settings.get("ai_api_key"))
        self.model = self.settings.get("ai_model", "gpt-4")
        self.temperature = self.settings.get("ai_temperature", 0.7)
        self.max_tokens = self.settings.get("ai_max_tokens", 1500)
        
    async def generate_analysis(self, prompt: str) -> str:
        if not self.api_key:
            logger.warning("[OpenAIProvider] No API key configured. Simulating response.")
            return self._simulate_response()
            
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are an expert sales strategist and business analyst. Return ONLY valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "response_format": {"type": "json_object"}
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, headers=headers, json=payload, timeout=45.0)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"[OpenAIProvider] API Error: {str(e)}")
            raise ValueError(f"OpenAI API failed: {str(e)}")
            
    async def test_connection(self) -> bool:
        if not self.api_key:
            return False
        
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=10.0)
                return resp.status_code == 200
        except Exception:
            return False

    def _simulate_response(self) -> str:
        """
        Fallback simulation when API is not configured.
        Returns a minimal JSON structure for testing purposes only.
        This should not be used in production.
        """
        import json
        logger.warning("Using simulated AI response - configure OpenAI API key for production use")
        
        mock_data = {
            "business_summary": "AI analysis not available - OpenAI API key not configured",
            "strengths": [],
            "weaknesses": [],
            "opportunities": [],
            "website_quality": "Unknown",
            "seo_issues": [],
            "trust_signals": [],
            "lead_priority": "Unknown",
            "priority_reason": "Configure OpenAI API key to enable AI analysis",
            "sales_email": "",
            "sales_whatsapp": "",
            "follow_up_email": "",
            "recommendations": {
                "services": [],
                "technologies": [],
                "priority_level": "Unknown",
                "expected_value": "$0",
                "reasoning": "OpenAI API key not configured"
            }
        }
        return json.dumps(mock_data)

