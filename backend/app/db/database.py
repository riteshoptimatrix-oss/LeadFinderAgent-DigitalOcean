from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.logger import logger
import asyncio


class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

# ── MongoDB Health Monitor ───────────────────────────────────────────────
_health_monitor_task = None


async def _mongo_health_monitor():
    """Production-grade health monitor with circuit breaker and intelligent reconnection."""
    backoff = 2
    max_backoff = 120
    consecutive_failures = 0
    circuit_breaker_threshold = 5
    circuit_open = False
    circuit_open_time = None
    circuit_recovery_timeout = 300  # 5 minutes
    reconnection_lock = asyncio.Lock()

    while True:
        await asyncio.sleep(30)
        
        # Circuit breaker recovery check
        if circuit_open and circuit_open_time:
            if (asyncio.get_event_loop().time() - circuit_open_time) > circuit_recovery_timeout:
                logger.info("CIRCUIT_BREAKER: Attempting recovery after timeout")
                circuit_open = False
                consecutive_failures = 0
                
        if circuit_open:
            continue
            
        if db_instance.client is None or db_instance.db is None:
            continue

        try:
            # Health check with shorter timeout for faster failure detection
            await asyncio.wait_for(
                db_instance.client.admin.command("ping"),
                timeout=3.0,
            )
            
            if consecutive_failures > 0:
                logger.info(f"MONGODB_HEALTH: Connection restored after {consecutive_failures} failures.")
                
            consecutive_failures = 0
            backoff = 2
            
            if circuit_open:
                circuit_open = False
                logger.info("CIRCUIT_BREAKER: Circuit closed, normal operations resumed")
                
        except Exception as e:
            consecutive_failures += 1
            logger.warning(
                f"MONGODB_HEALTH: Check failed (attempt {consecutive_failures}): {e}"
            )

            # Circuit breaker activation
            if consecutive_failures >= circuit_breaker_threshold and not circuit_open:
                circuit_open = True
                circuit_open_time = asyncio.get_event_loop().time()
                logger.error(f"CIRCUIT_BREAKER: Opened after {consecutive_failures} failures. Entering degraded mode.")
                continue

            if consecutive_failures >= 3:
                logger.error(f"MONGODB_HEALTH: Unreachable for {consecutive_failures} checks. Attempting reconnect...")
                
                async with reconnection_lock:
                    try:
                        await _reconnect_with_retries()
                        logger.info("MONGODB_RECONNECT: Successfully reconnected.")
                        consecutive_failures = 0
                        backoff = 2
                    except Exception as re:
                        logger.error(f"MONGODB_RECONNECT: Failed - {re}")
                        wait = min(backoff, max_backoff)
                        logger.info(f"MONGODB_RECONNECT: Retrying in {wait}s...")
                        await asyncio.sleep(wait)
                        backoff = min(backoff * 2, max_backoff)


async def _reconnect_with_retries():
    """Enhanced reconnection with multiple fallback strategies and connection validation."""
    import urllib.parse

    mongo_url = settings.MONGODB_URL
    db_name = settings.DATABASE_NAME
    
    try:
        parsed_url = urllib.parse.urlparse(mongo_url)
        path_db = parsed_url.path.lstrip("/")
        if path_db:
            db_name = path_db
    except Exception:
        pass

    # Generate multiple connection string variants for fallback
    connection_variants = [mongo_url]
    
    # Add standard connection as fallback for SRV
    if "mongodb+srv://" in mongo_url:
        try:
            parsed = urllib.parse.urlparse(mongo_url)
            if parsed.username and parsed.password and parsed.hostname:
                standard_url = (
                    f"mongodb://{parsed.username}:{parsed.password}@{parsed.hostname}:27017"
                    f"/{parsed.path.lstrip('/')}?{parsed.query}&ssl=true&authSource=admin"
                )
                connection_variants.append(standard_url)
        except Exception:
            pass
    
    # Close existing connections safely
    if db_instance.client:
        try:
            db_instance.client.close()
        except Exception:
            pass
        db_instance.client = None
        db_instance.db = None

    last_error = None
    
    for variant_idx, conn_url in enumerate(connection_variants):
        for attempt in range(3):
            try:
                logger.info(f"MONGODB_RECONNECT: Attempting variant {variant_idx + 1}/{len(connection_variants)}, attempt {attempt + 1}/3")
                
                client_kwargs = _build_client_kwargs(conn_url)
                
                # Create new client with optimized settings
                db_instance.client = AsyncIOMotorClient(conn_url, **client_kwargs)
                
                # Validate connection with multiple checks
                await asyncio.wait_for(
                    db_instance.client.admin.command("ping"),
                    timeout=8.0,
                )
                
                # Additional validation - ensure we can list databases
                await asyncio.wait_for(
                    db_instance.client.list_database_names(),
                    timeout=5.0,
                )
                
                db_instance.db = db_instance.client[db_name]
                
                # Verify database access with a simple operation
                await db_instance.db.list_collection_names()
                
                logger.info(f"MONGODB_RECONNECT: Successfully reconnected using variant {variant_idx + 1}")
                return
                
            except Exception as e:
                last_error = str(e)
                logger.warning(f"MONGODB_RECONNECT: Variant {variant_idx + 1} attempt {attempt + 1} failed: {last_error}")
                
                if db_instance.client:
                    try:
                        db_instance.client.close()
                    except Exception:
                        pass
                    db_instance.client = None
                    db_instance.db = None
                
                if attempt < 2:  # Don't wait after the last attempt
                    await asyncio.sleep(2 ** attempt)
    
    raise Exception(f"All reconnection attempts failed. Last error: {last_error}")


async def _reconnect():
    """Legacy reconnect function - replaced by _reconnect_with_retries."""
    await _reconnect_with_retries()


def _build_client_kwargs(mongo_url: str) -> dict:
    """Build motor client kwargs with production-grade pool and timeout settings."""
    is_local = "localhost" in mongo_url or "127.0.0.1" in mongo_url
    
    # Optimized timeout values for better reliability
    server_selection_timeout = 8000 if is_local else 20000
    connect_timeout = 10000 if is_local else 25000

    kwargs = {
        "serverSelectionTimeoutMS": server_selection_timeout,
        "connectTimeoutMS": connect_timeout,
        "socketTimeoutMS": 45000,  # Increased for stability
        "maxPoolSize": 25,  # Reduced to prevent connection exhaustion
        "minPoolSize": 2,   # Minimum connections for reliability
        "maxIdleTimeMS": 60000,  # Longer idle time
        "waitQueueTimeoutMS": 15000,  # Increased wait time
        "retryWrites": True,
        "retryReads": True,
        "readPreference": "primaryPreferred",  # Allows reads from secondaries
        "heartbeatFrequencyMS": 30000,  # Health check interval
        "directConnection": True if is_local else False,  # Enable direct connection for local standalone, replica set discovery for Atlas
    }

    # TLS/SSL for Atlas or explicit SSL connections
    if any(s in mongo_url.lower() for s in ["ssl=true", "tls=true", "mongodb+srv://", "mongodb.net"]):
        try:
            import certifi
            kwargs["tlsCAFile"] = certifi.where()
            kwargs["tlsAllowInvalidCertificates"] = False  # Enforce certificate validation
        except ImportError:
            logger.warning("MONGODB_CONFIG: certifi not installed, SSL validation may be limited")

    return kwargs


# ── Connection Management ────────────────────────────────────────────────

async def connect_to_mongo():
    import sys
    import urllib.parse

    logger.info("Connecting to MongoDB...")

    mongo_url = settings.MONGODB_URL
    if not mongo_url or mongo_url == "your_mongodb_connection_string_here":
        logger.error("MongoDB URL not configured. Please set MONGODB_URL in your .env file")
        logger.info("Get your connection string from: MongoDB Atlas -> Cluster -> Connect -> Drivers")
        sys.exit(1)

    # Determine the database name from the connection string or settings
    db_name = settings.DATABASE_NAME
    try:
        parsed_url = urllib.parse.urlparse(mongo_url)
        path_db = parsed_url.path.lstrip("/")
        if path_db:
            db_name = path_db
    except Exception as e:
        logger.warning(f"Could not parse database name from URL: {e}")

    # Try to convert SRV to standard connection if DNS fails
    connection_strings = [mongo_url]

    # If using SRV, add a fallback standard connection string
    if "mongodb+srv://" in mongo_url:
        try:
            parsed = urllib.parse.urlparse(mongo_url)
            if parsed.username and parsed.password and parsed.hostname:
                standard_url = (
                    f"mongodb://{parsed.username}:{parsed.password}@{parsed.hostname}:27017"
                    f"/{parsed.path.lstrip('/')}?{parsed.query}&ssl=true&authSource=admin"
                )
                connection_strings.append(standard_url)
                logger.info("Added standard connection string as fallback for SRV")
        except Exception as e:
            logger.warning(f"Could not create fallback connection string: {e}")

    try:
        parsed_url = urllib.parse.urlparse(mongo_url)
        masked_url = f"{parsed_url.scheme}://***:***@{parsed_url.hostname}{parsed_url.path}?{parsed_url.query}"
        atlas_cluster = parsed_url.hostname if "mongodb.net" in (parsed_url.hostname or "") else "Local/Other"
    except Exception:
        masked_url = "***"
        atlas_cluster = "Unknown"

    # Optimize timeout settings for local vs remote connection
    is_local = "localhost" in mongo_url or "127.0.0.1" in mongo_url
    max_retries = 1 if is_local else 3
    retry_delay = 1 if is_local else 2

    last_error = None
    for attempt in range(max_retries):
        for conn_idx, conn_url in enumerate(connection_strings):
            try:
                conn_type = "SRV" if "mongodb+srv://" in conn_url else "Standard"
                if attempt > 0 or conn_idx > 0:
                    logger.info(f"Attempting connection ({conn_type}, attempt {attempt + 1}/{max_retries})...")

                client_kwargs = _build_client_kwargs(conn_url)

                db_instance.client = AsyncIOMotorClient(conn_url, **client_kwargs)

                # Validate connection with timeout
                timeout_val = 3.0 if is_local else 10.0
                await asyncio.wait_for(
                    db_instance.client.admin.command("ping"),
                    timeout=timeout_val,
                )

                db_instance.db = db_instance.client[db_name]

                logger.info(f"MongoDB URL: {masked_url}")
                logger.info(f"Connection Type: {conn_type}")
                logger.info("Connection Status: SUCCESS")
                logger.info(f"Selected Database: {db_name}")
                logger.info(f"Database Name: {db_name}")
                logger.info(f"Atlas Cluster Name: {atlas_cluster}")

                # Connection successful, exit retry loop
                last_error = None
                break

            except asyncio.TimeoutError:
                last_error = f"Connection timeout (attempt {attempt + 1})"
                logger.warning(last_error)
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Connection attempt failed ({conn_type}, attempt {attempt + 1}): {last_error}")

        # If connection succeeded, break outer loop
        if last_error is None:
            break

        # Wait before retrying (exponential backoff)
        if attempt < max_retries - 1:
            wait_time = retry_delay * (2 ** attempt)
            logger.info(f"Waiting {wait_time} seconds before retry...")
            await asyncio.sleep(wait_time)

    # If all retries failed
    if last_error is not None:
        logger.error(f"MongoDB Connection Failed after {max_retries} attempts: {last_error}")
        logger.error("=" * 80)
        logger.error("TROUBLESHOOTING STEPS:")
        if is_local:
            logger.error("1. Ensure local MongoDB service is running on your machine.")
            logger.error("   - On Windows: Run 'net start MongoDB' in an Administrator command prompt/PowerShell.")
            logger.error("   - Or start MongoDB via Services (services.msc) -> 'MongoDB Server'.")
            logger.error("2. Verify that MongoDB is listening on the default port 27017.")
            logger.error("3. Check if MONGODB_URL in your .env file is correct.")
        else:
            logger.error("1. Check your internet connection")
            logger.error("2. Verify MongoDB Atlas cluster is running")
            logger.error("3. Check IP whitelist in MongoDB Atlas (allow 0.0.0.0/0 for testing)")
            logger.error("4. Verify credentials are correct")
            logger.error("5. Try using a standard connection string instead of SRV")
            logger.error("6. Check if your firewall/DNS is blocking MongoDB connections")
        logger.error("=" * 80)
        raise RuntimeError(f"MongoDB Connection Failed after {max_retries} attempts: {last_error}")

    # Create optimized indexes
    logger.info("Creating MongoDB Indexes...")
    import pymongo
    try:
        # ── Core Lead indexes ────────────────────────────────────────────────
        await db_instance.db["leads"].create_index(
            [("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)]
        )
        await db_instance.db["leads"].create_index([("category", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("city", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("google_rating", pymongo.DESCENDING)])

        # Phase 4 Indexes
        try:
            await db_instance.db["leads"].create_index([("fingerprint", pymongo.ASCENDING)], unique=True)
        except Exception:
            pass # ignore unique collision if existing duplicates exist in DB
        await db_instance.db["leads"].create_index([("location.address", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("contact.website", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("contact.phone", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("identity.primary_category", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("location.country", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("location.state", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("location.city", pymongo.ASCENDING)])
        await db_instance.db["leads"].create_index([("created_at", pymongo.DESCENDING)])
        await db_instance.db["leads"].create_index([("updated_at", pymongo.DESCENDING)])
        await db_instance.db["leads"].create_index([("metadata.search_session_id", pymongo.ASCENDING)])

        # ── AI Analysis indexes (Lead-centric architecture) ──────────────────
        # Query: "show me all leads with completed analysis"
        await db_instance.db["leads"].create_index(
            [("ai_analysis.analysis_status", pymongo.ASCENDING)],
            name="lead_ai_analysis_status",
            sparse=True
        )
        # Query: "sort leads by most recently analysed"
        await db_instance.db["leads"].create_index(
            [("ai_analysis.last_analysis_date", pymongo.DESCENDING)],
            name="lead_ai_last_analysis_date",
            sparse=True
        )
        # Query: "user X's leads with completed analysis" (most common dashboard query)
        await db_instance.db["leads"].create_index(
            [("user_id", pymongo.ASCENDING), ("ai_analysis.analysis_status", pymongo.ASCENDING)],
            name="lead_user_ai_status",
            sparse=True
        )
        # Query: filter leads by SEO score range
        await db_instance.db["leads"].create_index(
            [("seo.seo_score", pymongo.DESCENDING)],
            name="lead_seo_score",
            sparse=True
        )
        # Query: filter leads by overall business score
        await db_instance.db["leads"].create_index(
            [("business.overall_score", pymongo.DESCENDING)],
            name="lead_business_overall_score",
            sparse=True
        )
        # Query: filter leads by lead priority for sales pipeline
        await db_instance.db["leads"].create_index(
            [("business.lead_priority", pymongo.ASCENDING)],
            name="lead_business_priority",
            sparse=True
        )

        logger.info("Connected to MongoDB and all indexes ensured.")
    except Exception as e:
        logger.error(f"Failed to create indexes: {str(e)}")
        return

    # Start the health monitor
    global _health_monitor_task
    _health_monitor_task = asyncio.create_task(_mongo_health_monitor())
    logger.info("MongoDB health monitor started.")


async def close_mongo_connection():
    logger.info("Closing MongoDB connection...")
    global _health_monitor_task
    if _health_monitor_task and not _health_monitor_task.done():
        _health_monitor_task.cancel()
        try:
            await _health_monitor_task
        except asyncio.CancelledError:
            pass
    if db_instance.client:
        db_instance.client.close()
    logger.info("MongoDB connection closed.")


def get_db():
    if db_instance.db is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Database connection is missing. Please ensure your local MongoDB service is running and restart the server.",
        )
    
    from app.core.context import get_current_user_id
    user_id = get_current_user_id()
    if user_id:
        from app.db.tenant import TenantDatabase
        return TenantDatabase(db_instance.db, user_id)
        
    return db_instance.db
