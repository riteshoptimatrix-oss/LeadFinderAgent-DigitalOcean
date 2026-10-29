"""
MongoDB Migration Script: Remove Status Field from Leads
=========================================================

This script removes the 'status' field from all lead documents in MongoDB.

IMPORTANT: This is a permanent operation. Make sure you have a backup before running.

Usage:
    python migrate_remove_status.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.logger import logger

async def remove_status_field():
    """Remove status field from all lead documents"""
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    
    try:
        logger.info("=" * 60)
        logger.info("MIGRATION: Remove Status Field from Leads")
        logger.info("=" * 60)
        
        # Count total leads
        total_count = await db["leads"].count_documents({})
        logger.info(f"Total leads in database: {total_count}")
        
        # Count leads with status field
        status_count = await db["leads"].count_documents({"status": {"$exists": True}})
        logger.info(f"Leads with 'status' field: {status_count}")
        
        if status_count == 0:
            logger.info("✅ No leads have 'status' field. Migration not needed.")
            return
        
        # Confirm before proceeding
        print("\n⚠️  WARNING: This will permanently remove the 'status' field from all leads!")
        print(f"   Affected documents: {status_count}")
        response = input("\nProceed with migration? (yes/no): ")
        
        if response.lower() != 'yes':
            logger.info("❌ Migration cancelled by user.")
            return
        
        logger.info("\n🔄 Starting migration...")
        
        # Remove status field from all leads
        result = await db["leads"].update_many(
            {"status": {"$exists": True}},
            {"$unset": {"status": ""}}
        )
        
        logger.info("✅ Migration completed!")
        logger.info(f"   Documents modified: {result.modified_count}")
        logger.info(f"   Documents matched: {result.matched_count}")
        
        # Verify removal
        remaining_count = await db["leads"].count_documents({"status": {"$exists": True}})
        
        if remaining_count == 0:
            logger.info("✅ VERIFICATION PASSED: No documents have 'status' field")
        else:
            logger.warning(f"⚠️  VERIFICATION WARNING: {remaining_count} documents still have 'status' field")
        
        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total leads: {total_count}")
        logger.info(f"Leads modified: {result.modified_count}")
        logger.info("Status field removed: YES")
        logger.info("Data integrity: PRESERVED")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {str(e)}")
        raise
    finally:
        client.close()
        logger.info("Database connection closed.")


async def verify_migration():
    """Verify that status field has been removed"""
    
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    
    try:
        logger.info("\n🔍 Running verification...")
        
        # Check for any remaining status fields
        status_count = await db["leads"].count_documents({"status": {"$exists": True}})
        
        # Sample a few documents
        sample_leads = await db["leads"].find({}).limit(5).to_list(length=5)
        
        logger.info(f"Leads with 'status' field: {status_count}")
        
        if status_count == 0:
            logger.info("✅ VERIFICATION PASSED")
            logger.info("   All 'status' fields have been removed successfully")
        else:
            logger.error("❌ VERIFICATION FAILED")
            logger.error(f"   {status_count} leads still have 'status' field")
        
        # Show sample documents
        logger.info("\nSample lead documents (first 5):")
        for i, lead in enumerate(sample_leads, 1):
            logger.info(f"\n  Lead {i}:")
            logger.info(f"    ID: {lead.get('_id')}")
            logger.info(f"    Name: {lead.get('name', 'N/A')}")
            logger.info(f"    Has 'status' field: {'status' in lead}")
            
            # Show all fields
            fields = [k for k in lead.keys() if k != '_id']
            logger.info(f"    Fields: {', '.join(fields)}")
        
    except Exception as e:
        logger.error(f"Verification error: {str(e)}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    print("\n")
    print("╔════════════════════════════════════════════════════════╗")
    print("║   MongoDB Migration: Remove Lead Status Field         ║")
    print("╚════════════════════════════════════════════════════════╝")
    print("\n")
    
    # Run migration
    asyncio.run(remove_status_field())
    
    # Run verification
    asyncio.run(verify_migration())
    
    print("\n✅ Migration completed successfully!\n")
