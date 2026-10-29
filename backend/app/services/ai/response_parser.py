import json
from app.core.logger import logger

class AIResponseParser:
    @staticmethod
    def parse_analysis(raw_response: str) -> dict:
        """
        Safely parses the JSON string returned by the LLM.
        Strips markdown wrappers (like ```json) if they exist.
        """
        cleaned = raw_response.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
            
        try:
            return json.loads(cleaned.strip())
        except json.JSONDecodeError as e:
            logger.error(f"[AIResponseParser] Failed to decode JSON: {str(e)}\nRaw Response: {raw_response}")
            raise ValueError("Failed to parse AI response into valid JSON.")
