# GitHub Pages Setup for Quadratic OI

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
