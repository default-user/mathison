# GitHub Pages Deployment

**Status:** READY_FOR_HUMAN
**Blocked By:** GitHub repository settings access (requires owner permissions)

---

## What This Is

Instructions for deploying Mathison documentation and UI to GitHub Pages for public access.

---

## Prerequisites

- GitHub repository owner/admin access
- Docs built locally (verify with `pnpm build`)
- Clean git state (all changes committed)

---

## Step-by-Step Instructions

### 1. Enable GitHub Pages

1. Go to: `https://github.com/YOUR_USERNAME/mathison/settings/pages`
2. Under **Source**, select:
   - Branch: `gh-pages` (if it exists) or `main`
   - Folder: `/docs` or `/` (depending on your setup)
3. Click **Save**
4. Wait 1-2 minutes for deployment

**Expected output:** GitHub will show a URL like `https://YOUR_USERNAME.github.io/mathison/`

### 2. Verify Deployment

```bash
# Check GitHub Pages build status
gh run list --workflow=pages-build-deployment

# Visit your GitHub Pages URL
open https://YOUR_USERNAME.github.io/mathison/
```

**Expected result:** Documentation site loads with navigation working

### 3. Configure Custom Domain (Optional)

If you have a custom domain (e.g., `mathison.example.com`):

1. Add a `CNAME` file to `/docs/` with your domain:
   ```bash
   echo "mathison.example.com" > docs/CNAME
   ```

2. In DNS settings for your domain, add:
   ```
   Type: CNAME
   Name: mathison (or @ for apex domain)
   Value: YOUR_USERNAME.github.io
   ```

3. In GitHub Pages settings, enter custom domain and enable HTTPS

**Expected result:** Site accessible at custom domain with valid SSL

---

## Troubleshooting

### Pages build fails

```bash
# Check build logs
gh run view --log

# Common issues:
# 1. Large files (>100MB) → use .gitignore
# 2. Broken links → run link checker
# 3. Invalid HTML → validate locally first
```

### 404 errors on subpages

- Verify `/docs` has `index.html`
- Check that all links use relative paths
- Ensure no hardcoded `localhost` URLs

---

## Automation (Optional)

Create `.github/workflows/deploy-docs.yml`:

```yaml
name: Deploy Docs to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Pages
        uses: actions/configure-pages@v3
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: './docs'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

---

## Validation Checklist

- [ ] GitHub Pages enabled in repo settings
- [ ] Deployment successful (green check in Actions tab)
- [ ] Documentation accessible at GitHub Pages URL
- [ ] Navigation links work
- [ ] Images/assets load correctly
- [ ] No console errors in browser DevTools
- [ ] (Optional) Custom domain configured with HTTPS

---

## See Also

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Custom Domain Setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
