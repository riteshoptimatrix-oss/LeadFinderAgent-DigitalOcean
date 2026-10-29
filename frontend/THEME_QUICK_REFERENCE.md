# White Theme Quick Reference Guide

## 🎨 Color Palette Cheat Sheet

### Base Colors (Use These Most Often)

```css
/* Page Backgrounds */
bg-gray-50          /* Main page background - subtle gray */
bg-white            /* Card/section backgrounds - clean white */
bg-gray-100         /* Progress bars, input backgrounds */

/* Borders */
border-gray-200     /* Default border - subtle but visible */
border-gray-300     /* Hover/active borders */

/* Text */
text-gray-900       /* Headings, important text - darkest */
text-gray-700       /* Body text, paragraphs - dark */
text-gray-600       /* Secondary text, labels - medium */
text-gray-500       /* Muted text, placeholders - light */
```

---

## 🔵 Accent Colors (Semantic Usage)

### Blue - Primary/Active/Running
```css
/* For primary actions, active states, running processes */
bg-blue-50          /* Background highlight */
bg-blue-100         /* Stronger highlight/badge background */
text-blue-600       /* Icon/text color */
text-blue-700       /* Stronger text/hover state */
border-blue-200     /* Badge/card border */

Example: Running job badge, primary button, active status
```

### Emerald - Success/Completed
```css
/* For success messages, completed states */
bg-emerald-50       /* Background highlight */
bg-emerald-100      /* Badge background */
text-emerald-600    /* Icon/text color */
text-emerald-700    /* Stronger text */
border-emerald-200  /* Badge border */

Example: Completed job, success message, positive metric
```

### Red - Error/Failed/Danger
```css
/* For errors, failed states, destructive actions */
bg-red-50           /* Background highlight */
bg-red-100          /* Badge background */
text-red-600        /* Icon/text color */
text-red-700        /* Stronger text */
border-red-200      /* Badge border */

Example: Failed job, error message, delete action
```

### Amber - Warning/Performance
```css
/* For warnings, performance metrics */
bg-amber-50         /* Background highlight */
bg-amber-100        /* Badge background */
text-amber-600      /* Icon/text color */
text-amber-700      /* Stronger text */
border-amber-200    /* Badge border */

Example: Warning message, performance score, pending status
```

### Other Accent Colors (Data Visualization)
```css
/* Indigo - Email metrics, discovery */
bg-indigo-50 text-indigo-600 border-indigo-200

/* Teal - Phone/contact metrics */
bg-teal-50 text-teal-600 border-teal-200

/* Purple - Security metrics */
bg-purple-50 text-purple-600 border-purple-200

/* Pink - UI/UX metrics */
bg-pink-50 text-pink-600 border-pink-200
```

---

## 🧩 Common Component Patterns

### Card
```tsx
<div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
  {/* Content */}
</div>
```

### Card with Header
```tsx
<div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
      Section Title
    </h3>
  </div>
  <div className="p-4">
    {/* Content */}
  </div>
</div>
```

### Section Header
```tsx
<h2 className="text-lg font-semibold text-gray-900 mb-2">
  Main Heading
</h2>
<p className="text-sm text-gray-600">
  Description or subtitle
</p>
```

### Status Badge (Running)
```tsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
  <PlayIcon className="w-3 h-3" />
  Running
</span>
```

### Status Badge (Completed)
```tsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
  <CheckIcon className="w-3 h-3" />
  Completed
</span>
```

### Status Badge (Failed)
```tsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
  <AlertIcon className="w-3 h-3" />
  Failed
</span>
```

### Button (Primary)
```tsx
<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors">
  Primary Action
</button>
```

### Button (Secondary)
```tsx
<button className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md font-medium border border-gray-200 transition-colors">
  Secondary Action
</button>
```

### Button (Danger)
```tsx
<button className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-md font-medium border border-red-200 transition-colors">
  Delete
</button>
```

### Info Row (Label + Value)
```tsx
<div className="flex items-center justify-between py-2 border-b border-gray-200">
  <span className="text-sm font-medium text-gray-600">Label:</span>
  <span className="text-sm text-gray-900">Value</span>
</div>
```

### Data Card (Metric Display)
```tsx
<div className="bg-white rounded-lg border border-gray-200 p-4">
  <div className="flex items-center gap-2 text-gray-600 mb-2">
    <MetricIcon className="w-4 h-4" />
    <span className="text-xs uppercase font-bold tracking-wider">
      Metric Label
    </span>
  </div>
  <div className="text-2xl font-bold text-emerald-600">
    85<span className="text-sm text-gray-500">/100</span>
  </div>
</div>
```

### Progress Bar
```tsx
<div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
  <div 
    className="h-full bg-blue-500 rounded-full transition-all duration-300"
    style={{ width: '65%' }}
  />
</div>
```

### Table
```tsx
<div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
  <table className="w-full">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
          Column 1
        </th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
          Column 2
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm text-gray-900">Cell 1</td>
        <td className="px-4 py-3 text-sm text-gray-700">Cell 2</td>
      </tr>
    </tbody>
  </table>
</div>
```

### List with Dividers
```tsx
<div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
  <div className="p-4 hover:bg-gray-50 transition-colors">
    <h4 className="font-medium text-gray-900">Item Title</h4>
    <p className="text-sm text-gray-600">Item description</p>
  </div>
  {/* More items... */}
</div>
```

### Icon with Colored Background
```tsx
<div className="p-2 bg-blue-100 text-blue-600 rounded-md">
  <IconComponent className="w-5 h-5" />
</div>
```

---

## ⚡ Quick Conversion Table

| Old Dark Theme | New White Theme | Element Type |
|----------------|-----------------|--------------|
| `bg-slate-950` | `bg-gray-50` | Page background |
| `bg-slate-900` | `bg-white` | Main card |
| `bg-slate-800` | `bg-gray-50` | Section header |
| `bg-slate-700` | `bg-gray-100` | Button secondary |
| `border-slate-700` | `border-gray-200` | Card border |
| `border-slate-600` | `border-gray-300` | Hover border |
| `text-white` | `text-gray-900` | Heading |
| `text-slate-200` | `text-gray-700` | Body text |
| `text-slate-300` | `text-gray-700` | Body text |
| `text-slate-400` | `text-gray-600` | Secondary text |
| `text-slate-500` | `text-gray-500` | Muted text |
| `bg-blue-500/20` | `bg-blue-100` | Status badge bg |
| `text-blue-400` | `text-blue-700` | Status badge text |
| `border-blue-500/30` | `border-blue-200` | Status badge border |

---

## 🎯 Usage Tips

### DO ✅
- Use `white` for card backgrounds
- Use `gray-50` for page backgrounds
- Use `gray-200` for borders
- Use semantic colors (blue=active, emerald=success, red=error)
- Maintain 4.5:1+ contrast ratio for text
- Use shadows subtly (`shadow-sm`, `shadow-md`)

### DON'T ❌
- Mix gray-* scales inconsistently
- Use overly bright colors without backgrounds (e.g., `text-blue-500` directly on white)
- Create borders darker than `gray-300`
- Use pure black (`text-black`) - use `text-gray-900` instead
- Forget hover states on interactive elements
- Overuse accent colors - keep them meaningful

---

## 🔍 Accessibility Checklist

- [ ] Text has minimum 4.5:1 contrast ratio (use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/))
- [ ] Interactive elements have visible focus states
- [ ] Status is conveyed with more than just color (icons + text)
- [ ] Text scales properly with browser zoom (test at 200%)
- [ ] Hover states are clearly visible
- [ ] Disabled states are obviously different

---

## 📱 Responsive Considerations

```tsx
/* Mobile-first approach */
<div className="
  bg-white 
  p-4 sm:p-6 
  text-sm sm:text-base
  grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
  gap-4 sm:gap-6
">
  {/* Content adapts to screen size */}
</div>
```

---

## 🛠️ Tools & Resources

- **Tailwind Color Palette**: https://tailwindcss.com/docs/customizing-colors
- **Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
- **Color Picker**: Use browser DevTools to inspect existing colors

---

## 💡 Pro Tips

1. **Consistency is key**: Stick to the palette defined above
2. **Test in both light and dark monitors**: Colors appear different
3. **Use semantic naming**: Choose colors based on meaning, not appearance
4. **Layer depth with backgrounds**: `gray-50` page → `white` card → `gray-50` section
5. **Hover feedback**: Always provide visual feedback on interactive elements
6. **Icon + Text**: Combine colored icons with text for better UX
7. **Subtle shadows**: Use `shadow-sm` for cards, `shadow-md` for modals
8. **Spacing matters**: Proper padding/margin makes white space work

---

**Last Updated**: July 9, 2026
**Version**: 1.0
**Status**: Production Ready ✅
