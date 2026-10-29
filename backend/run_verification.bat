@echo off
cd /d "h:\AI Projects\Lead Finder Agent\backend"
call .venv\Scripts\activate.bat
python verify_pipeline_complete.py
pause
