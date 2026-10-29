# 🎯 Complete Build System - Quick Start

## 🚀 What You Need to Know

You have **TWO build configurations** available:

| Build Type | Script | Output | Use For |
|------------|--------|--------|---------|
| **Static Export** | `build-static.bat` | `/out` folder | Static hosting, CDN, Apache, S3 |
| **Netlify Runtime** | `build-netlify.bat` | `/.next` folder | Netlify deployment with full features |

---

## ⚡ Quick Commands

### Want `/out` folder?
```bash
# Double-click or run:
build-static.bat
```
**Result:** `/out` folder created with static HTML/CSS/JS

### Want Netlify deployment with full Next.js features?
```bash
# Double-click or run:
build-netlify.bat
```
**Result:** `/.next` folder created, ready for Netlify

---

## 📁 Files You Need to Know

| File | Purpose |
|------|---------|
| `next.config.ts` | **Active config** - This is what Next.js uses |
| `next.config.static.ts` | Template for static export builds |
| `next.config.netlify.ts` | Template for Netlify builds |
| `build-static.bat` | Automated script to build static export |
| `build-netlify.bat` | Automated script to build for Netlify |
| `BUILD_GUIDE.md` | Detailed documentation |
| `GET_OUT_FOLDER.md` | Quick guide to get `/out` folder |

---

## 🎯 Common Tasks

### Task 1: "I need the `/out` folder NOW"
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
build-static.bat
```
**Done!** Check the `/out` folder.

### Task 2: "I'm deploying to Netlify"
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
build-netlify.bat
git add next.config.ts
git commit -m "build: configure for Netlify"
git push origin main
```
**Done!** Netlify will deploy with full features.

### Task 3: "Fix RSC 404 errors on Netlify"
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
build-netlify.bat
git add next.config.ts
git commit -m "fix: enable full Next.js runtime"
git push origin main
```
**Done!** RSC 404 errors will be fixed.

### Task 4: "I need both static AND Netlify builds"
```bash
# First, build static
build-static.bat

# Upload /out folder to your static host
# (S3, CDN, etc.)

# Then, build for Netlify
build-netlify.bat
git add next.config.ts
git commit -m "build: configure for Netlify"
git push origin main
```
**Done!** You have both versions deployed.

---

## ⚠️ Important Differences

### Static Export (`build-static.bat`)

**✅ Pros:**
- Generates `/out` folder
- Can host anywhere (S3, CDN, Apache, Nginx)
- Fast, lightweight
- No server needed

**❌ Cons:**
- No React Server Components (RSC)
- No Server-side Rendering (SSR)
- No API routes in Next.js
- Client-side only

**Use when:**
- You want static files
- Hosting on CDN or static server
- Don't need server features

---

### Netlify Runtime (`build-netlify.bat`)

**✅ Pros:**
- Full Next.js features
- React Server Components (RSC) work
- Server-side Rendering (SSR)
- API routes supported
- Dynamic routing

**❌ Cons:**
- No `/out` folder (uses `/.next`)
- Must deploy to Netlify (or similar platforms)
- Requires server runtime

**Use when:**
- Deploying to Netlify
- Need RSC, SSR, or server features
- Want full Next.js capabilities

---

## 🔄 Switching Between Configs

### Currently Using: Netlify Runtime

Your `next.config.ts` is currently set for **Netlify** (no static export).

To verify:
```bash
type next.config.ts | findstr "output"
```

- If shows `// output: "export"` (commented): **Netlify** ✅  
- If shows `output: "export"` (uncommented): **Static** ✅

### To Switch:

**From Netlify → Static:**
```bash
copy /Y next.config.static.ts next.config.ts
npm run build
# Now you have /out folder
```

**From Static → Netlify:**
```bash
copy /Y next.config.netlify.ts next.config.ts
npm run build
# Now you have /.next folder
```

---

## 🛠️ Troubleshooting

### "Can't get `/out` folder"
**Solution:** Run `build-static.bat`

### "RSC 404 errors on Netlify"
**Solution:** Run `build-netlify.bat` and push

### "Build fails"
**Solution:**
```bash
rmdir /s /q .next out node_modules
npm install
build-static.bat
# OR
build-netlify.bat
```

### "Scripts don't work"
**Solution:**
```bash
# Make sure you're in the right directory
cd "h:\AI Projects\Lead Finder Agent\frontend"

# Try running directly
.\build-static.bat
```

---

## 📚 Full Documentation

- **`BUILD_GUIDE.md`** - Complete guide with all details
- **`GET_OUT_FOLDER.md`** - Quick guide to get `/out` folder
- **`NETLIFY_RSC_FIX.md`** - Fix RSC 404 errors
- **`FIX_SUMMARY.md`** - Summary of the RSC fix

---

## 🎓 Understanding Your Setup

### Your Architecture:
```
Frontend (Next.js)     Backend (FastAPI)
├── Netlify           ├── Separate server
├── Full features     ├── API endpoints
└── RSC, SSR         └── Database, workers
```

### Two Deployment Options:

**Option 1: Netlify (Current)**
```
Frontend: Netlify (full Next.js runtime)
Backend: Your FastAPI server
Connection: Frontend calls backend APIs
```

**Option 2: Static + Backend**
```
Frontend: CDN/S3 (static files from /out)
Backend: Your FastAPI server
Connection: Frontend calls backend APIs
```

Both options work! Choose based on your needs.

---

## ✅ Quick Reference Card

```bash
# Get /out folder (static export)
build-static.bat

# Build for Netlify (full features)
build-netlify.bat

# Switch to static config
copy /Y next.config.static.ts next.config.ts

# Switch to Netlify config
copy /Y next.config.netlify.ts next.config.ts

# Clean builds
rmdir /s /q .next out

# Full documentation
# Read: BUILD_GUIDE.md
```

---

## 🎯 Bottom Line

**Want `/out` folder?** → Run `build-static.bat`  
**Deploying to Netlify?** → Run `build-netlify.bat`  
**Having RSC 404 errors?** → Run `build-netlify.bat` and push  

**That's it!** 🎉

---

## 🚀 Get Started Now

```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"

# Choose one:
build-static.bat    # For /out folder
build-netlify.bat   # For Netlify deployment
```

**Questions?** Read `BUILD_GUIDE.md` for complete details.
