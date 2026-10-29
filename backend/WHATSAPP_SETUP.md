# WhatsApp Automation Setup Guide

## Overview

This production-grade WhatsApp sending engine provides automated message delivery to leads with real-time progress tracking, automatic retry logic, and comprehensive error handling.

## Features

✅ **Automated Message Sending** - Sends WhatsApp messages to selected leads automatically
✅ **Phone Number Validation** - Automatic validation and E.164 formatting
✅ **Duplicate Prevention** - Prevents sending duplicate messages to the same lead
✅ **Smart Retry Logic** - Automatic retry with exponential backoff (max 3 attempts)
✅ **Real-time Progress** - Live WebSocket updates for campaign progress
✅ **Campaign Controls** - Pause, Resume, Stop, Reset Queue, Retry Failed
✅ **Error Detection** - Comprehensive error handling and logging
✅ **Browser Automation** - Uses Playwright for WhatsApp Web automation
✅ **Multiple Providers** - Supports both WhatsApp Web (Browser) and Official API

## Architecture

```
User Interface
    ↓
Campaign API (FastAPI)
    ↓
Enhanced Queue Worker
    ↓
Provider Factory (Browser/Official API)
    ↓
WhatsApp Web (Playwright) or Cloud API
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
```

### 2. Configure WhatsApp Provider

Edit `backend/.env`:

```env
# For Browser Automation (WhatsApp Web)
WA_PROVIDER_TYPE=BROWSER
WA_BROWSER_HEADLESS=false  # Set to true for production
WA_BROWSER_PROFILE_DIR=./wa_sessions  # Persistent login storage

# OR for Official WhatsApp Cloud API
WA_PROVIDER_TYPE=OFFICIAL
WA_PHONE_ID=your_phone_number_id
WA_OFFICIAL_TOKEN=your_access_token
```

### 3. First-Time Setup (Browser Provider)

1. Start the backend server:
   ```bash
   python -m app.main
   ```

2. Create your first campaign through the UI

3. When you start the campaign:
   - A Chrome browser will open automatically
   - WhatsApp Web will load
   - Scan the QR code with your phone
   - The session is saved and won't require re-scanning

### 4. Configure User Settings

In the database, set user settings:

```javascript
db.user_settings.updateOne(
  { user_id: "your_user_id" },
  {
    $set: {
      wa_provider_type: "BROWSER",  // or "OFFICIAL"
      wa_browser_headless: false,
      wa_browser_profile_dir: "./wa_sessions",
      default_country: "IN"  // For phone number formatting
    }
  },
  { upsert: true }
)
```

## Usage Workflow

### Creating a Campaign

1. **Select Leads**
   - Navigate to WhatsApp Campaigns
   - Click "New Campaign"
   - Select leads with valid phone numbers
   - System automatically filters out invalid numbers

2. **Choose Template**
   - Select or create a message template
   - Use variables like `{{business_name}}`, `{{city}}`, etc.
   - Preview with real lead data

3. **Start Campaign**
   - Click "Start Campaign"
   - Monitor real-time progress
   - View live status updates

### Campaign Controls

- **Pause** - Temporarily stop sending messages
- **Resume** - Continue a paused campaign
- **Stop** - Cancel campaign permanently
- **Reset Queue** - Reset all messages to pending (allows resending)
- **Retry Failed** - Retry all permanently failed messages

## Message States

```
PENDING → PREPARING → OPENING_WHATSAPP → SENDING → SENT
                                               ↓
                                            FAILED
                                               ↓
                                     PENDING (retry 1-3)
                                               ↓
                                         FAILED (final)
```

Additional States:
- **SKIPPED** - Duplicate or invalid number
- **DELIVERED** - Message delivered (webhook from Official API)
- **READ** - Message read (webhook from Official API)

## Error Handling

### Automatic Detection

The system detects and handles:
- ❌ Invalid phone numbers
- ❌ WhatsApp not installed/available
- ❌ Chat unavailable
- ❌ Internet connection issues
- ❌ Rate limiting
- ❌ Browser crashes
- ❌ Session timeouts

### Retry Logic

- **Retry 1**: After 5 seconds
- **Retry 2**: After 15 seconds
- **Retry 3**: After 30 seconds
- **Final**: Marked as permanently failed

Only temporary failures are retried. Permanent failures (invalid number, chat unavailable) are not retried.

## Phone Number Validation

### Supported Formats

The system automatically normalizes:
- `9876543210` → `+919876543210`
- `+91 98765 43210` → `+919876543210`
- `91-9876-543210` → `+919876543210`

### Country Codes

Default: India (+91)

Supported countries:
- India: +91
- United States: +1
- United Kingdom: +44
- UAE: +971
- Saudi Arabia: +966
- Australia: +61
- Singapore: +65
- Malaysia: +60

Configure default country in user settings.

## Real-Time Updates

### WebSocket Events

Connect to: `ws://localhost:8000/ws/campaigns/{campaign_id}`

Events sent:
```javascript
{
  "type": "message_status_update",
  "message_id": "...",
  "status": "SENDING",
  "timestamp": "2024-01-01T12:00:00Z"
}

{
  "type": "message_sent",
  "message_id": "...",
  "phone": "+919876543210",
  "timestamp": "2024-01-01T12:00:00Z"
}

{
  "type": "message_failed",
  "message_id": "...",
  "error": "Invalid phone number",
  "timestamp": "2024-01-01T12:00:00Z"
}

{
  "type": "campaign_completed",
  "campaign_id": "...",
  "stats": {
    "SENT": 95,
    "FAILED": 3,
    "SKIPPED": 2
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## API Endpoints

### Campaigns

```bash
# List campaigns
GET /api/whatsapp/campaigns

# Create campaign
POST /api/whatsapp/campaigns
{
  "name": "Q1 Outreach",
  "template_id": "...",
  "lead_ids": ["...", "..."]
}

# Get campaign details
GET /api/whatsapp/campaigns/{campaign_id}

# Get campaign statistics
GET /api/whatsapp/campaigns/{campaign_id}/stats

# Start campaign
POST /api/whatsapp/campaigns/{campaign_id}/start

# Pause campaign
POST /api/whatsapp/campaigns/{campaign_id}/pause

# Resume campaign
POST /api/whatsapp/campaigns/{campaign_id}/resume

# Stop campaign
POST /api/whatsapp/campaigns/{campaign_id}/stop

# Reset queue (allows resending)
POST /api/whatsapp/campaigns/{campaign_id}/reset-queue

# Retry failed messages
POST /api/whatsapp/campaigns/{campaign_id}/retry-failed

# Get message logs
GET /api/whatsapp/campaigns/{campaign_id}/logs
```

### Templates

```bash
# List templates
GET /api/whatsapp/templates

# Create template
POST /api/whatsapp/templates
{
  "name": "Gym Outreach",
  "content": "Hi {{business_name}}, interested in our services?",
  "category": "Outreach"
}

# Preview template
POST /api/whatsapp/preview
{
  "template_content": "Hi {{business_name}}",
  "lead_id": "..."
}

# Validate template
POST /api/whatsapp/validate-template
{
  "content": "Hi {{business_name}}"
}
```

## Database Collections

### wa_campaigns
```javascript
{
  _id: ObjectId,
  user_id: String,
  name: String,
  description: String,
  template_id: String,
  status: "DRAFT" | "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED",
  total_count: Number,
  sent_count: Number,
  failed_count: Number,
  delivered_count: Number,
  read_count: Number,
  created_at: DateTime,
  started_at: DateTime,
  completed_at: DateTime
}
```

### wa_message_logs
```javascript
{
  _id: ObjectId,
  campaign_id: String,
  user_id: String,
  lead_id: String,
  lead_name: String,
  recipient_phone: String,
  status: "PENDING" | "PREPARING" | "OPENING_WHATSAPP" | "SENDING" | "SENT" | "FAILED" | "SKIPPED",
  rendered_message: String,
  error_message: String,
  retry_count: Number,
  next_retry_at: DateTime,
  queued_at: DateTime,
  sent_at: DateTime,
  delivered_at: DateTime,
  read_at: DateTime,
  updated_at: DateTime
}
```

### wa_templates
```javascript
{
  _id: ObjectId,
  user_id: String,
  name: String,
  content: String,
  category: String,
  is_default: Boolean,
  variables_used: Array<String>,
  created_at: DateTime,
  updated_at: DateTime
}
```

## Configuration

### Worker Settings

Edit `backend/app/main.py`:

```python
wa_worker = EnhancedWAQueueWorker(
    db,
    batch_size=10,        # Messages per batch
    concurrency=5,        # Concurrent sends
    message_delay=2.0     # Delay between messages (seconds)
)
```

### Rate Limiting

To avoid WhatsApp blocks:
- Keep `message_delay` at 2-3 seconds minimum
- Don't exceed 1000 messages per hour
- Use different sessions for different campaigns

## Troubleshooting

### Browser Not Opening

```bash
# Reinstall Playwright browsers
playwright install chromium
```

### QR Code Not Appearing

1. Check if `wa_browser_headless` is set to `false`
2. Make sure Chrome/Chromium is installed
3. Check browser console for errors

### Messages Not Sending

1. Verify WhatsApp Web is connected (check browser)
2. Check phone number format (must be E.164)
3. Verify lead has valid phone number
4. Check worker logs for errors

### Session Expired

1. Delete session directory: `rm -rf wa_sessions`
2. Restart backend
3. Scan QR code again

### High Memory Usage

1. Reduce `concurrency` setting
2. Reduce `batch_size` setting
3. Enable headless mode: `wa_browser_headless=true`

## Production Deployment

### Recommended Settings

```env
WA_BROWSER_HEADLESS=true
WA_BROWSER_PROFILE_DIR=/app/wa_sessions
```

### Docker Considerations

```dockerfile
# Install Playwright dependencies
RUN playwright install-deps chromium
RUN playwright install chromium
```

### Process Management

Use PM2 or similar to ensure worker restarts on crash:

```bash
pm2 start "python -m app.main" --name wa-backend
pm2 save
```

## Testing

### Test Campaign (Small Scale)

1. Create campaign with 10 leads
2. Start and monitor progress
3. Verify all messages sent
4. Check logs for errors

### Test Campaign (Large Scale)

1. Create campaign with 100+ leads
2. Test pause/resume functionality
3. Test stop functionality
4. Verify no memory leaks
5. Check completion time

### Load Testing

```bash
# Create multiple campaigns
for i in {1..10}; do
  curl -X POST http://localhost:8000/api/whatsapp/campaigns \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Campaign '$i'",
      "template_id": "...",
      "lead_ids": [...]
    }'
done

# Monitor system resources
watch -n 1 'ps aux | grep python'
```

## Monitoring

### Key Metrics

- **Messages per minute**: Should stay within rate limits
- **Success rate**: Should be > 95%
- **Retry rate**: Should be < 10%
- **Average send time**: Should be < 5 seconds per message

### Logs

Check logs for issues:
```bash
tail -f logs/whatsapp_worker.log
```

### Dashboard

Monitor campaigns in real-time through the frontend dashboard.

## Security

### Best Practices

1. **Never commit** session files (`wa_sessions/`) to git
2. **Encrypt** WhatsApp credentials in database
3. **Use HTTPS** in production
4. **Rate limit** API endpoints
5. **Validate** all user inputs
6. **Audit log** all campaign actions

## Support

For issues or questions:
1. Check logs first
2. Review this documentation
3. Check GitHub issues
4. Contact support team

## License

Proprietary - All rights reserved
