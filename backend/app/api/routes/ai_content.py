from fastapi import APIRouter, HTTPException, status, Request
from typing import Optional
import logging

from app.models.ai_content import (
    GenerateContentRequest,
    GenerateContentResponse,
    ModifyContentRequest,
    ModifyContentResponse,
    SessionStartRequest,
    SessionStatusResponse
)
from app.services.ai_content.gemini_service import gemini_service

logger = logging.getLogger("ai_content.route")

router = APIRouter()


@router.post("/generate", response_model=GenerateContentResponse)
async def generate_content(payload: GenerateContentRequest):
    """
    Generate social media content from user input using Playwright Chromium + Gemini Web.
    """
    user_query = payload.user_query.strip()
    if not user_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User query cannot be empty."
        )

    try:
        logger.info(f"Received content generation request: {user_query[:60]}...")
        result_text = await gemini_service.generate_content(user_query)
        
        if not result_text:
            return GenerateContentResponse(
                success=False,
                response=None,
                error="Extraction failed: Empty response received from Gemini."
            )

        return GenerateContentResponse(
            success=True,
            response=result_text,
            error=None
        )

    except TimeoutError as te:
        logger.error(f"Generation timed out: {te}")
        return GenerateContentResponse(
            success=False,
            response=None,
            error="Gemini timed out while generating content. Please try again."
        )
    except Exception as e:
        logger.error(f"Error during content generation: {e}", exc_info=True)
        return GenerateContentResponse(
            success=False,
            response=None,
            error=f"Content generation failed: {str(e)}"
        )


@router.post("/modify", response_model=ModifyContentResponse)
async def modify_content(payload: ModifyContentRequest):
    """
    Modify previously generated content based on user changes using Playwright Chromium + Gemini Web.
    """
    existing_response = payload.response.strip()
    user_query = payload.user_query.strip()

    if not existing_response:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Existing response is required for modification."
        )

    if not user_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Modification instructions cannot be empty."
        )

    try:
        logger.info(f"Received content modification request: {user_query[:60]}...")
        updated_text = await gemini_service.modify_content(existing_response, user_query)

        if not updated_text:
            return ModifyContentResponse(
                success=False,
                response=None,
                error="Modification failed: Empty response received from Gemini."
            )

        return ModifyContentResponse(
            success=True,
            response=updated_text,
            error=None
        )

    except TimeoutError as te:
        logger.error(f"Modification timed out: {te}")
        return ModifyContentResponse(
            success=False,
            response=None,
            error="Gemini timed out while modifying content. Please try again."
        )
    except Exception as e:
        logger.error(f"Error during content modification: {e}", exc_info=True)
        return ModifyContentResponse(
            success=False,
            response=None,
            error=f"Content modification failed: {str(e)}"
        )


@router.post("/session/start", response_model=SessionStatusResponse)
async def start_browser_session(payload: Optional[SessionStartRequest] = None):
    """
    Initialize or restart the persistent browser session.
    Allows passing headless=False to open visible Chromium for Google authentication.
    """
    try:
        headless = payload.headless if payload is not None else False
        status_info = await gemini_service.start_session(headless=headless)
        return SessionStatusResponse(**status_info)
    except Exception as e:
        logger.error(f"Failed to start browser session: {e}", exc_info=True)
        return SessionStatusResponse(
            success=False,
            status="error",
            is_logged_in=False,
            browser_running=False,
            message=str(e)
        )


@router.get("/session/status", response_model=SessionStatusResponse)
async def get_browser_session_status():
    """
    Check the current status of the Playwright Chromium browser session and Gemini authentication.
    """
    try:
        status_info = await gemini_service.get_status()
        return SessionStatusResponse(**status_info)
    except Exception as e:
        logger.error(f"Failed to fetch session status: {e}", exc_info=True)
        return SessionStatusResponse(
            success=False,
            status="error",
            is_logged_in=False,
            browser_running=False,
            message=str(e)
        )


@router.post("/session/close", response_model=SessionStatusResponse)
async def close_browser_session():
    """
    Gracefully close the browser session.
    """
    try:
        await gemini_service.close()
        return SessionStatusResponse(
            success=True,
            status="idle",
            is_logged_in=False,
            browser_running=False,
            message="Browser session closed successfully."
        )
    except Exception as e:
        logger.error(f"Failed to close session: {e}", exc_info=True)
        return SessionStatusResponse(
            success=False,
            status="error",
            is_logged_in=False,
            browser_running=False,
            message=str(e)
        )
