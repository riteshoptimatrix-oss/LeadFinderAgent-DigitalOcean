import time
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.logger import logger
from .providers.provider_factory import AIProviderFactory
from .prompt_builder import PromptBuilder
from .response_parser import AIResponseParser

class AIService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def analyze_lead(self, lead_id: str, user_id: str) -> dict:
        """
        Analyzes a single lead and saves the result to ai_analysis.
        """
        # Fetch lead
        lead = await self.db["leads"].find_one({"_id": ObjectId(lead_id)})
        if not lead:
            raise ValueError("Lead not found.")

        # Check if analysis already exists
        existing = await self.db["ai_analysis"].find_one({"lead_id": lead_id})
        if existing:
            existing["_id"] = str(existing["_id"])
            return existing

        # Fetch settings
        settings = await self.db["user_settings"].find_one({"user_id": user_id})
        if not settings:
            settings = {}

        if not settings.get("ai_enabled", False):
            raise ValueError("AI Module is currently disabled in Settings.")

        provider = AIProviderFactory.get_provider(settings)
        prompt = PromptBuilder.build_lead_analysis_prompt(lead)
        
        start_time = time.time()
        try:
            raw_response = await provider.generate_analysis(prompt)
            data = AIResponseParser.parse_analysis(raw_response)
        except Exception as e:
            # Log failure to ai_logs
            await self.db["ai_logs"].insert_one({
                "lead_id": lead_id,
                "user_id": user_id,
                "status": "FAILED",
                "error": str(e),
                "created_at": datetime.utcnow()
            })
            logger.error(f"[AIService] Provider Error: {str(e)}")
            raise ValueError(str(e))
            
        processing_time_ms = int((time.time() - start_time) * 1000)

        # Save to DB
        doc = {
            "lead_id": lead_id,
            "user_id": user_id,
            "prompt_version": "1.0",
            "model": settings.get("ai_model", "gpt-4"),
            "data": data,
            "created_at": datetime.utcnow(),
            "processing_time_ms": processing_time_ms
        }
        
        res = await self.db["ai_analysis"].insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        
        # Log success to ai_logs
        await self.db["ai_logs"].insert_one({
            "lead_id": lead_id,
            "user_id": user_id,
            "status": "SUCCESS",
            "model": settings.get("ai_model", "gpt-4"),
            "processing_time_ms": processing_time_ms,
            "created_at": datetime.utcnow()
        })
        
        # Optionally, update the lead's status/priority directly
        if data.get("lead_priority"):
             await self.db["leads"].update_one(
                 {"_id": ObjectId(lead_id)},
                 {"$set": {"priority": data["lead_priority"]}}
             )
             
        return doc
