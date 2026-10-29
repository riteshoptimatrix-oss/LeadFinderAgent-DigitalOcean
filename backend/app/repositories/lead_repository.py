import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime
from bson import ObjectId
from pymongo.errors import PyMongoError
from app.repositories.base_repository import BaseRepository
from app.repositories.job_repository import JobRepository
from app.core.logger import logger

async def retry_db_operation(operation, max_retries=3, delay=0.5, backoff=2.0):
    """Executes a MongoDB operation with write concern acknowledgement check and retries."""
    last_error = None
    curr_delay = delay
    for attempt in range(max_retries):
        try:
            result = await operation()
            if result is None:
                raise PyMongoError("Database operation returned None")
            if hasattr(result, "acknowledged") and not result.acknowledged:
                raise PyMongoError("Write concern was not acknowledged by MongoDB cluster")
            return result
        except (PyMongoError, Exception) as e:
            last_error = e
            logger.warning(f"Database operation failed on attempt {attempt + 1}/{max_retries}: {str(e)}")
            if attempt < max_retries - 1:
                await asyncio.sleep(curr_delay)
                curr_delay *= backoff
            else:
                logger.error(f"Database operation permanently failed after {max_retries} attempts.")
                raise last_error

class LeadRepository(BaseRepository):
    """Repository for managing Lead document lifecycle, retries, and write verification."""

    def __init__(self, db: Any = None):
        super().__init__(db)
        self.job_repo = JobRepository(self.db)

    async def createLead(self, lead_dict: dict, job_id: str) -> dict:
        """
        Create a new Lead with strict acknowledgement, retry, and post-write verification.
        On failure, logs to failed_leads collection and re-raises.
        """
        import traceback
        from app.services.scraper.engine.persistence_manager import PersistenceManager
        
        job_id_str = str(job_id)
        if "_id" not in lead_dict:
            lead_dict["_id"] = ObjectId()
        lead_id = lead_dict["_id"]

        logger.info("Lead Created")

        # Resolve relationship fields if not present
        if "user_id" not in lead_dict or "search_job_id" not in lead_dict or "created_by" not in lead_dict or "search_session_id" not in lead_dict:
            try:
                job_doc = await self.db["search_jobs"].find_one({"_id": ObjectId(job_id_str) if len(job_id_str) == 24 else job_id_str})
                if job_doc:
                    resolved_user = job_doc.get("user_id") or "system_automated"
                    lead_dict["user_id"] = lead_dict.get("user_id") or resolved_user
                    lead_dict["created_by"] = lead_dict.get("created_by") or resolved_user
                    lead_dict["search_job_id"] = lead_dict.get("search_job_id") or job_id_str
                    lead_dict["search_session_id"] = lead_dict.get("search_session_id") or job_doc.get("session_id") or job_id_str
                else:
                    lead_dict["user_id"] = lead_dict.get("user_id") or lead_dict.get("created_by") or "system_automated"
                    lead_dict["created_by"] = lead_dict.get("created_by") or lead_dict.get("user_id")
                    lead_dict["search_job_id"] = lead_dict.get("search_job_id") or job_id_str
                    lead_dict["search_session_id"] = lead_dict.get("search_session_id") or job_id_str
            except Exception as e:
                logger.warning(f"Failed to fetch job doc during lead creation: {e}")
                lead_dict["user_id"] = lead_dict.get("user_id") or lead_dict.get("created_by") or "system_automated"
                lead_dict["created_by"] = lead_dict.get("created_by") or lead_dict.get("user_id")
                lead_dict["search_job_id"] = lead_dict.get("search_job_id") or job_id_str
                lead_dict["search_session_id"] = lead_dict.get("search_session_id") or job_id_str

        # 1. Map/Enforce Root Required Fields
        lead_dict = PersistenceManager.ensure_required_fields(lead_dict, job_id_str, lead_id)
        lead_dict["created_at"] = lead_dict.get("created_at") or datetime.utcnow()

        # 2. Insert with acknowledgement verification and retries
        try:
            logger.info("Mongo Insert Started")
            async def do_insert():
                res = await self.db["leads"].insert_one(lead_dict)
                if not res.acknowledged:
                    raise PyMongoError("Write concern was not acknowledged by MongoDB cluster")
                if not getattr(res, "inserted_id", None):
                    raise PyMongoError("No inserted_id was returned from MongoDB cluster")
                return res

            insert_result = await retry_db_operation(do_insert)

            # 3. Read back directly from MongoDB (Single Source of Truth)
            confirmed = await self.db["leads"].find_one({"_id": lead_id})
            if not confirmed:
                raise RuntimeError(f"Database write confirmation failed for lead {lead_id} (read-after-write returned None)")

            logger.info("Mongo Insert Success")
            logger.info(f"Inserted ObjectId: {lead_id}")
            logger.info(f"Collection Name: leads")
            logger.info(f"Database Name: {self.db.name}")

            # 4. Synchronously Recalculate Job Stats
            await self.job_repo.recalculate_stats(job_id_str)
            
            # Update dashboard statistics
            try:
                from app.services.intelligence_service import invalidate_cache, write_daily_aggregate
                from app.core.intelligence_ws import intelligence_manager
                invalidate_cache()
                await write_daily_aggregate(self.db)
                await intelligence_manager.broadcast_kpi_update({
                    "lead_id": str(lead_id),
                    "action": "INSERTED"
                })
            except Exception as dash_err:
                logger.warning(f"Failed to update dashboard statistics during create: {dash_err}")
                
            return confirmed

        except Exception as e:
            # 5. Mark lead failed and persist the failure details
            logger.error("Lead")
            logger.error("Reason: Insert Failed")
            logger.error(f"Exception: {str(e)}")
            logger.error(f"Stacktrace:\n{traceback.format_exc()}")
            
            failed_doc = {
                "job_id": job_id_str,
                "lead_id": str(lead_id),
                "business_name": lead_dict.get("business_name", "Unknown Business"),
                "lead_data": {k: str(v) if isinstance(v, ObjectId) else v for k, v in lead_dict.items()},
                "error": str(e),
                "failed_at": datetime.utcnow()
            }
            await self.db["failed_leads"].insert_one(failed_doc)
            
            # Update business queue if exists to mark FAILED
            if lead_dict.get("google_maps_url"):
                await self.db["business_queue"].update_one(
                    {"job_id": job_id_str, "maps_url": lead_dict["google_maps_url"]},
                    {"$set": {"status": "FAILED", "failed_at": datetime.utcnow(), "error_message": str(e)}}
                )

            await self.job_repo.recalculate_stats(job_id_str)
            raise e

    async def updateLead(self, lead_id: str, update_dict: dict, job_id: str) -> dict:
        """
        Update a Lead with strict acknowledgement, retry, and post-write verification.
        On failure, logs to failed_leads collection and re-raises.
        """
        job_id_str = str(job_id)
        lead_oid = ObjectId(lead_id) if isinstance(lead_id, str) and len(lead_id) == 24 else lead_id

        # 1. Fetch current document
        existing = await self.db["leads"].find_one({"_id": lead_oid})
        if not existing:
            raise ValueError(f"Lead with ID {lead_id} does not exist in collection")

        # 2. If it is marked duplicate/merged, write to duplicates log
        if update_dict.get("is_duplicate") or "is_duplicate" in update_dict:
            await self.db["duplicates"].update_one(
                {"job_id": job_id_str, "lead_id": str(lead_oid)},
                {"$set": {
                    "job_id": job_id_str,
                    "lead_id": str(lead_oid),
                    "business_name": existing.get("business_name") or existing.get("name", "Unknown"),
                    "timestamp": datetime.utcnow()
                }},
                upsert=True
            )

        # 3. Update with acknowledgement verification and retries
        try:
            async def do_update():
                res = await self.db["leads"].update_one(
                    {"_id": lead_oid},
                    {"$set": update_dict}
                )
                if not res.acknowledged:
                    raise PyMongoError("Write concern was not acknowledged by MongoDB cluster during update")
                return res

            await retry_db_operation(do_update)

            # 4. Read back directly from MongoDB (Single Source of Truth)
            confirmed = await self.db["leads"].find_one({"_id": lead_oid})
            if not confirmed:
                raise RuntimeError(f"Database write confirmation failed for updated lead {lead_oid} (read-after-write returned None)")
            await self.job_repo.recalculate_stats(job_id_str)
            
            # Update dashboard statistics
            try:
                from app.services.intelligence_service import invalidate_cache, write_daily_aggregate
                from app.core.intelligence_ws import intelligence_manager
                invalidate_cache()
                await write_daily_aggregate(self.db)
                await intelligence_manager.broadcast_kpi_update({
                    "lead_id": str(lead_oid),
                    "action": "UPDATED"
                })
            except Exception as dash_err:
                logger.warning(f"Failed to update dashboard statistics during update: {dash_err}")
                
            return confirmed

        except Exception as e:
            logger.error(f"MONGO_UPDATE_FAILED: Failed to update lead {lead_id} for job {job_id_str}: {e}")
            failed_doc = {
                "job_id": job_id_str,
                "lead_id": str(lead_oid),
                "update_data": update_dict,
                "error": str(e),
                "failed_at": datetime.utcnow()
            }
            await self.db["failed_leads"].insert_one(failed_doc)
            await self.job_repo.recalculate_stats(job_id_str)
            raise e

    async def bulkInsert(self, leads: List[dict], job_id: str) -> List[str]:
        """
        Bulk insert leads with acknowledgement and retries.
        Falls back to item-by-item insertion to isolate failures if the batch fails.
        """
        from app.services.scraper.engine.persistence_manager import PersistenceManager
        
        job_id_str = str(job_id)
        if not leads:
            return []

        # 1. Pre-process and validate all documents
        processed_leads = []
        for lead in leads:
            lead_copy = dict(lead)
            if "_id" not in lead_copy:
                lead_copy["_id"] = ObjectId()
            lead_id = lead_copy["_id"]
            lead_copy = PersistenceManager.ensure_required_fields(lead_copy, job_id_str, lead_id)
            lead_copy["created_at"] = lead_copy.get("created_at") or datetime.utcnow()
            processed_leads.append(lead_copy)

        # 2. Try bulk insert with retries
        try:
            async def do_bulk():
                return await self.db["leads"].insert_many(processed_leads)

            res = await retry_db_operation(do_bulk)
            inserted_ids = [str(i) for i in res.inserted_ids]
            
            # Recalculate job stats
            await self.job_repo.recalculate_stats(job_id_str)
            
            # Update dashboard statistics
            try:
                from app.services.intelligence_service import invalidate_cache, write_daily_aggregate
                from app.core.intelligence_ws import intelligence_manager
                invalidate_cache()
                await write_daily_aggregate(self.db)
                await intelligence_manager.broadcast_kpi_update({
                    "lead_id": inserted_ids[0] if inserted_ids else "BULK",
                    "action": "INSERTED"
                })
            except Exception as dash_err:
                logger.warning(f"Failed to update dashboard statistics during bulk create: {dash_err}")
                
            return inserted_ids

        except Exception as e:
            logger.warning(f"MONGO_BULK_FAILED: Bulk insert failed for job {job_id_str}: {e}. Falling back to single inserts.")
            
            # 3. Fallback to single inserts to isolate/record failures
            inserted_ids = []
            for lead in processed_leads:
                try:
                    confirmed = await self.createLead(lead, job_id_str)
                    inserted_ids.append(str(confirmed["_id"]))
                except Exception as single_err:
                    # Individual write error is already retried, logged, marked failed, and job-recalculated in createLead()
                    logger.error(f"MONGO_SINGLE_FALLBACK_FAILED: Fallback insert failed for lead: {single_err}")
            
            return inserted_ids

    async def findBySearchJob(self, search_job_id: str, limit: int = 10, skip: int = 0) -> List[dict]:
        """Query leads by search job ID."""
        job_id_str = str(search_job_id)
        cursor = self.db["leads"].find(
            {"search_job_id": job_id_str}
        ).skip(skip).limit(limit)
        
        results = []
        async for doc in cursor:
            results.append(doc)
        return results

    async def findByLeadId(self, lead_id: str) -> Optional[dict]:
        """Query lead by ID."""
        lead_oid = ObjectId(lead_id) if isinstance(lead_id, str) and len(lead_id) == 24 else lead_id
        return await self.db["leads"].find_one({"_id": lead_oid})

    async def countBySearchJob(self, search_job_id: str) -> int:
        """Count leads by search job ID."""
        job_id_str = str(search_job_id)
        return await self.db["leads"].count_documents(
            {"search_job_id": job_id_str}
        )
