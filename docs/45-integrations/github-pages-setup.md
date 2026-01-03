# GitHub Pages Setup for Quadratic OI

## Who This Is For

- Teams deploying Quadratic OI to a public web interface
- Developers sharing live demos via GitHub Pages
- Contributors testing browser-based Mathison functionality
- Anyone needing zero-config static hosting for Quadratic

## Why This Exists

GitHub Pages provides free static hosting integrated with GitHub repos, making it the fastest path from code to live URL. This guide documents the deployment workflow for Quadratic OI's web interface, including GitHub Actions automation, custom domain setup, and troubleshooting common deployment issues.

## Guarantees / Invariants

1. **Build Automation**: GitHub Actions workflow automatically builds `quad.js` on push to main
2. **URL Structure**: Pages always deploy to `https://<username>.github.io/<repo>/<file>`
3. **HTTPS Only**: All GitHub Pages URLs are served over HTTPS by default
4. **Branch/Actions Source**: Deployment can use either branch (main) or GitHub Actions workflow
5. **Public Access**: GitHub Pages URLs are publicly accessible (no auth required)

## Non-Goals

- Private/authenticated deployments (GitHub Pages is public-only)
- Server-side logic (static files only; no backend processing)
- Real-time builds on feature branches (deploy from main/master only)
- Asset versioning or cache-busting (users handle via query params if needed)

## How to Verify

```bash
# 1. Check deployment status via GitHub CLI
gh workflow view "GitHub Pages" --repo default-user/mathison

# 2. Verify deployment URL is live
curl -I https://default-user.github.io/mathison/quadratic.html
# Expected: HTTP/2 200

# 3. Test quad.js loads in browser
curl https://default-user.github.io/mathison/quad.js | head -n 5
# Expected: JavaScript source code (QuadraticOI class definition)

# 4. Verify deployment in GitHub UI
# Visit: https://github.com/default-user/mathison/settings/pages
# Should show green checkmark and live URL
```

## Implementation Pointers

- **GitHub Actions Workflow**: `/home/user/mathison/.github/workflows/deploy-pages.yml` (if exists) or auto-deploy from branch
- **Build Output**: `quad.js` and `quadratic.html` must be in repo root or built by workflow
- **CNAME File**: `/home/user/mathison/CNAME` (optional, for custom domains)
- **Pages Settings**: GitHub repo → Settings → Pages → Source configuration
- **Deployment Logs**: Actions tab shows build/deploy status and errors

---

## Quick Setup

### 1. Enable GitHub Pages

1. Go to your GitHub repository: `https://github.com/default-user/mathison`
2. Click **Settings** tab
3. Scroll to **Pages** section (left sidebar)
4. Under **Source**, select:
   - **Source**: GitHub Actions (recommended)
   - OR **Branch**: `main` (or `master`) and `/` (root)
5. Click **Save**

### 2. Wait for Deployment

- If using GitHub Actions: The workflow will run automatically on push to main
- If using branch deploy: GitHub will build and deploy automatically
- Check the **Actions** tab to see deployment progress

### 3. Access Your Quadratic OI

Once deployed, your Quadratic OI will be available at:

```
https://default-user.github.io/mathison/quadratic.html
```

### Alternative: Deploy from Feature Branch

To deploy from the current feature branch (`claude/vision-distributed-ai-XzjFP`):

1. Merge the feature branch to `main`:
   ```bash
   git checkout main
   git merge claude/vision-distributed-ai-XzjFP
   git push origin main
   ```

2. GitHub Actions will automatically deploy

## Permalink Structure

Once deployed, share these URLs:

**Web Interface:**
```
https://default-user.github.io/mathison/quadratic.html
```

**Direct quad.js (for embedding):**
```
https://default-user.github.io/mathison/quad.js
```

**Documentation:**
```
https://default-user.github.io/mathison/README.md
https://default-user.github.io/mathison/DEPLOYMENT.md
https://default-user.github.io/mathison/BRIDGE.md
```

## Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file to the repository root:
   ```bash
   echo "quadratic.yourdomain.com" > CNAME
   git add CNAME
   git commit -m "Add custom domain"
   git push
   ```

2. Configure DNS:
   - Add CNAME record: `quadratic` → `default-user.github.io`
   - OR add A records pointing to GitHub's IPs

3. In GitHub Settings → Pages, enter your custom domain

## Verify Deployment

Check deployment status:
- **Actions tab**: `https://github.com/default-user/mathison/actions`
- **Pages URL**: Will be shown in Settings → Pages once deployed

## Troubleshooting

**404 Error:**
- Ensure Pages is enabled in Settings
- Check the source branch is correct
- Verify files are in the root directory

**Build Fails:**
- Check Actions logs for errors
- Ensure `quad.js` is committed or built by workflow
- Verify all dependencies in `package.json`

**Quad.js Not Found:**
- The GitHub Actions workflow automatically builds `quad.js`
- OR commit the pre-built `quad.js` to the repository

---

**Current Status:**
- ✅ Interface redesigned with modern UI
- ✅ GitHub Actions workflow configured
- ⏳ Awaiting merge to main branch
- ⏳ Awaiting GitHub Pages enablement
