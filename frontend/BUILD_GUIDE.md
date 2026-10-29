# 🚀 Build Guide - Static vs Netlify

## 📋 Overview

Your Next.js app can be built in **TWO WAYS**:

| Build Type | Output | Features | Use Case |
|------------|--------|----------|----------|
| **Static Export** | `/out` folder | ❌ No RSC, No SSR, Client-only | Static hosting, CDN, S3 |
| **Netlify Runtime** | `/.next` folder | ✅ Full Next.js features | Netlify, Vercel, dynamic hosting |

---

## 🎯 Quick Decision Guide

### Choose **Static Export** if:
- ✅ You want to host on ANY static server (Apache, Nginx, CDN)
- ✅ You don't need server-side rendering
- ✅ You're okay with client-side only
- ✅ You want the `/out` folder
- ❌ BUT: No React Server Components
- ❌ BUT: No API routes in Next.js
- ❌ BUT: No server-side features

### Choose **Netlify Runtime** if:
- ✅ You're deploying to Netlify
- ✅ You want React Server Components (RSC)
- ✅ You need server-side rendering (SSR)
- ✅ You want all Next.js features
- ✅ You want dynamic routing
- ❌ BUT: No `/out` folder (uses `/.next` instead)

---

## 🛠️ How to Build

### Option 1: Automated Scripts (Recommended)

#### For Static Export (generates `/out` folder):
```bash
# Double-click this file:
build-static.bat

# Or run manually:
cd "h:\AI Projects\Lead Finder Agent\frontend"
build-static.bat
```

**What it does:**
1. Backs up your current `next.config.ts`
2. Switches to static export config
3. Runs `npm run build`
4. Generates `/out` folder
5. Restores your original config

**Result:**
- ✅ `/out` folder created
- ✅ Ready for static hosting
- ✅ Original config restored

---

#### For Netlify Deployment (full runtime):
```bash
# Double-click this file:
build-netlify.bat

# Or run manually:
cd "h:\AI Projects\Lead Finder Agent\frontend"
build-netlify.bat
```

**What it does:**
1. Backs up your current `next.config.ts`
2. Switches to Netlify config
3. Runs `npm run build`
4. Generates `/.next` folder
5. Keeps Netlify config for deployment

**Result:**
- ✅ `/.next` folder created
- ✅ Ready for Netlify deployment
- ✅ Full Next.js features enabled

---

### Option 2: Manual Build

#### For Static Export:

**Step 1:** Switch config
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
copy /Y next.config.static.ts next.config.ts
```

**Step 2:** Build
```bash
npm run build
```

**Step 3:** Verify `/out` folder
```bash
dir out
```

**Step 4:** Restore config (if needed)
```bash
copy /Y next.config.netlify.ts next.config.ts
```

---

#### For Netlify:

**Step 1:** Switch config
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
copy /Y next.config.netlify.ts next.config.ts
```

**Step 2:** Build
```bash
npm run build
```

**Step 3:** Verify `/.next` folder
```bash
dir .next
```

**Step 4:** Deploy
```bash
git add next.config.ts
git commit -m "build: configure for Netlify deployment"
git push origin main
```

---

## 📁 Config Files Explained

### `next.config.ts` (Current Active Config)
- This is the config Next.js actually uses
- Switch this file based on your build type

### `next.config.static.ts` (Static Export Template)
- Template for generating `/out` folder
- Copy this to `next.config.ts` when building static
- **Includes:** `output: "export"`

### `next.config.netlify.ts` (Netlify Runtime Template)
- Template for Netlify deployment
- Copy this to `next.config.ts` when deploying to Netlify
- **Excludes:** `output: "export"` (enables full runtime)

---

## 🔍 Troubleshooting

### Problem: "I can't get the `/out` folder"

**Solution:**
```bash
# Use the automated script:
build-static.bat

# Or manually:
copy /Y next.config.static.ts next.config.ts
npm run build
dir out
```

**Verify config:**
```bash
type next.config.ts | findstr "output"
```
Should show: `output: "export",`

---

### Problem: "RSC 404 errors on Netlify"

**Solution:**
```bash
# Use the automated script:
build-netlify.bat

# Or manually:
copy /Y next.config.netlify.ts next.config.ts
npm run build
git add next.config.ts
git commit -m "fix: enable full Next.js runtime for Netlify"
git push origin main
```

**Verify config:**
```bash
type next.config.ts | findstr "output"
```
Should show: `// NO output setting` or no `output:` line

---

### Problem: "Build fails with both configs"

**Solution:**
```bash
# Clean everything:
rmdir /s /q .next
rmdir /s /q out
rmdir /s /q node_modules
del package-lock.json

# Reinstall:
npm install

# Try again:
build-static.bat
# OR
build-netlify.bat
```

---

## 📊 Comparison Table

| Feature | Static Export | Netlify Runtime |
|---------|--------------|-----------------|
| **Output Folder** | `/out` | `/.next` |
| **React Server Components** | ❌ No | ✅ Yes |
| **Server-side Rendering** | ❌ No | ✅ Yes |
| **API Routes** | ❌ No | ✅ Yes |
| **Dynamic Routes** | ⚠️ Limited | ✅ Full |
| **Middleware** | ❌ No | ✅ Yes |
| **Static Hosting** | ✅ Yes | ❌ No |
| **Netlify Hosting** | ⚠️ Works (static only) | ✅ Full features |
| **Build Speed** | ✅ Fast | ⚠️ Moderate |
| **File Size** | ✅ Smaller | ⚠️ Larger |

---

## 🚀 Deployment Workflows

### Workflow 1: Deploy to Netlify (Recommended)

```bash
# 1. Build for Netlify
build-netlify.bat

# 2. Commit config
git add next.config.ts
git commit -m "build: configure for Netlify"

# 3. Push to deploy
git push origin main

# 4. Netlify auto-deploys
# Visit: https://app.netlify.com
```

**Result:**
- ✅ Full Next.js features
- ✅ RSC works
- ✅ No 404 errors

---

### Workflow 2: Generate Static Export

```bash
# 1. Build static
build-static.bat

# 2. Upload /out folder to:
#    - S3
#    - CloudFront
#    - Any static host
#    - Apache/Nginx server

# 3. Serve static files
```

**Result:**
- ✅ `/out` folder ready
- ✅ Works on any static host
- ⚠️ No server features

---

### Workflow 3: Both (Static + Netlify)

```bash
# 1. Generate static export
build-static.bat
# → Upload /out to CDN

# 2. Switch to Netlify config
copy /Y next.config.netlify.ts next.config.ts

# 3. Deploy to Netlify
git add next.config.ts
git commit -m "build: enable Netlify runtime"
git push origin main

# Now you have:
# - Static version on CDN
# - Full-featured version on Netlify
```

---

## 🎓 Understanding the Error

### Why you saw RSC 404 errors:

1. **You had:** `output: "export"` in `next.config.ts`
2. **This creates:** Static HTML files only
3. **Browser requests:** `/dashboard/search/history?_rsc=abc123`
4. **Static export has:** Only `/dashboard/search/history.html`
5. **Result:** 404 error (RSC endpoint doesn't exist)

### How we fixed it:

1. **For Netlify:** Remove `output: "export"`
2. **Netlify runs:** Full Next.js server
3. **Browser requests:** `/dashboard/search/history?_rsc=abc123`
4. **Netlify serves:** RSC payload dynamically
5. **Result:** 200 OK (RSC works)

---

## ✅ Quick Commands Reference

```bash
# Static export (generates /out)
build-static.bat

# Netlify build (generates /.next)
build-netlify.bat

# Switch to static config
copy /Y next.config.static.ts next.config.ts

# Switch to Netlify config
copy /Y next.config.netlify.ts next.config.ts

# Clean builds
rmdir /s /q .next
rmdir /s /q out

# Full clean
rmdir /s /q .next out node_modules
npm install
```

---

## 🎯 Current Configuration

Your current `next.config.ts` is set to: **Netlify Runtime** (no static export)

To check:
```bash
type next.config.ts | findstr "output"
```

- If empty or commented: **Netlify Runtime** ✅
- If shows `output: "export"`: **Static Export** ✅

---

## 📞 Need Help?

**For static export issues:**
1. Run `build-static.bat`
2. Check if `/out` folder exists
3. Verify `next.config.ts` has `output: "export"`

**For Netlify deployment issues:**
1. Run `build-netlify.bat`
2. Check if `/.next` folder exists
3. Verify `next.config.ts` has NO `output` setting
4. Clear Netlify cache and redeploy

**For both:**
1. Clean everything: `rmdir /s /q .next out node_modules`
2. Reinstall: `npm install`
3. Try specific build script

---

## 🎉 Summary

**You now have TWO build options:**

1. **Static Export** → Use `build-static.bat` → Get `/out` folder
2. **Netlify Runtime** → Use `build-netlify.bat` → Get full features

**Choose based on your deployment target!**
