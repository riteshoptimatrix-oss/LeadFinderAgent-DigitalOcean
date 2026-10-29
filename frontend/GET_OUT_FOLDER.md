# 🎯 How to Get the `/out` Folder

## ⚡ QUICK SOLUTION (30 seconds)

### Step 1: Run the automated script
```bash
# Double-click this file in Windows Explorer:
build-static.bat
```

**That's it!** The `/out` folder will be created automatically.

---

## 📋 What the Script Does

1. ✅ Backs up your current config
2. ✅ Switches to static export config
3. ✅ Runs `npm run build`
4. ✅ Creates `/out` folder
5. ✅ Restores your original config

---

## 🔧 Manual Method (if script fails)

### Step 1: Edit next.config.ts
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
notepad next.config.ts
```

### Step 2: Uncomment this line:
```typescript
// Change from:
// output: "export",

// To:
output: "export",
```

### Step 3: Build
```bash
npm run build
```

### Step 4: Check for `/out` folder
```bash
dir out
```

You should see:
```
Directory of h:\AI Projects\Lead Finder Agent\frontend\out

_next/
dashboard/
login/
404.html
favicon.ico
index.html
...
```

---

## ✅ Verification

### Check if `/out` folder exists:
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
dir out
```

### Check folder contents:
```bash
tree /f out
```

### Test the static site locally:
```bash
# Option 1: Use Python
cd out
python -m http.server 3000

# Option 2: Use Node.js
cd out
npx serve

# Then visit: http://https://lead-finder-agent.netlify.app/
```

---

## ⚠️ IMPORTANT NOTES

### Static Export Limitations:

When you build with `output: "export"`, you get the `/out` folder **BUT:**

- ❌ **No React Server Components (RSC)**
- ❌ **No Server-side Rendering (SSR)**  
- ❌ **No API routes**
- ❌ **No dynamic server features**
- ✅ **Client-side only**
- ✅ **Works on any static host**

### For Netlify Deployment:

If you're deploying to Netlify, **DON'T use static export**. Instead:

1. Keep `output: "export"` commented out
2. Deploy normally
3. Netlify will use full Next.js runtime
4. All features work (RSC, SSR, etc.)

---

## 🚀 Where to Use `/out` Folder

Once you have the `/out` folder, you can:

1. **Upload to S3/CloudFront**
2. **Deploy to any CDN**
3. **Serve with Apache/Nginx**
4. **Host on any static file server**
5. **Upload to GitHub Pages**
6. **Deploy to Cloudflare Pages** (static mode)

---

## 🔄 Switch Between Static and Netlify

### For `/out` folder (static):
```bash
build-static.bat
```

### For Netlify (full features):
```bash
build-netlify.bat
```

You can switch anytime without losing anything!

---

## 📊 Quick Reference

| Want | Command | Output | Features |
|------|---------|--------|----------|
| `/out` folder | `build-static.bat` | `/out` | Client-only |
| Full features | `build-netlify.bat` | `/.next` | RSC, SSR, API |
| Both | Run both scripts | Both folders | Use as needed |

---

## 🐛 Troubleshooting

### Problem: Script doesn't run

**Solution:**
```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
.\build-static.bat
```

### Problem: `/out` folder is empty

**Solution:**
```bash
# Check if build succeeded
npm run build

# Check for errors in console
# Verify next.config.ts has: output: "export"
```

### Problem: Build fails

**Solution:**
```bash
# Clean and rebuild
rmdir /s /q .next
rmdir /s /q out
npm run build
```

### Problem: `/out` folder missing after build

**Solution:**
```bash
# Verify config
type next.config.ts | findstr "output"

# Should show: output: "export",
# If not, uncomment the line and rebuild
```

---

## 🎉 Summary

**To get `/out` folder:**

1. **Easiest:** Double-click `build-static.bat`
2. **Or manually:** Uncomment `output: "export"` and run `npm run build`
3. **Result:** `/out` folder with static HTML/CSS/JS
4. **Use:** Upload to any static hosting service

**Your current config:** Set for Netlify (no `/out` folder)  
**To get `/out`:** Run `build-static.bat` right now!

---

## 🚀 Do It Now!

```bash
cd "h:\AI Projects\Lead Finder Agent\frontend"
build-static.bat
```

**Done!** Your `/out` folder is ready for deployment. 🎊
