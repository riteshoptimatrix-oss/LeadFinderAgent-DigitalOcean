# Backend: Lead Finder Agent

This directory contains the FastAPI backend for the Lead Finder Agent application.

## 🏗️ Folder Structure

```text
backend/
├── app/
│   ├── api/routes/       # FastAPI route controllers (REST APIs)
│   ├── core/             # Security, Exceptions, Middlewares, Logging
│   ├── db/               # MongoDB driver and initialization scripts
│   ├── models/           # Pydantic schemas (Database mapping & Validation)
│   ├── services/         # Business Logic (Email, WhatsApp, AI, Scraper)
│   └── main.py           # FastAPI application entrypoint
├── requirements.txt      # Python dependencies
└── .env                  # Environment configuration
```

## 🛠️ Technology Stack

- **Framework**: [FastAPI](https://fastapi.tiangolo.com/)
- **Language**: Python 3.12+
- **Database**: [Motor](https://motor.readthedocs.io/en/stable/) (Async MongoDB)
- **Data Validation**: Pydantic v2
- **Web Scraping**: Playwright
- **Background Jobs**: APScheduler
- **Security**: JWT (Jose), bcrypt (Passlib), cryptography (Fernet)

## 🚀 Quick Start

1. **Create Virtual Environment**
   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate
   
   # Linux/macOS
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

3. **Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Ensure `MONGODB_URL` is set correctly.

4. **Run Development Server**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## ⚙️ Background Workers

The backend uses `APScheduler` initialized in `main.py` to concurrently process Email dispatch queues, WhatsApp message dispatch queues, and AI Analysis queues entirely in the background without blocking API requests.
