# Google Play Store Submission

**Status:** READY_FOR_HUMAN
**Blocked By:** Google Play Console account + signed AAB file

---

## What This Is

Step-by-step instructions for submitting Mathison Mobile to Google Play Store.

---

## Prerequisites

- [ ] Google Play Developer account ($25 one-time fee)
- [ ] Signed AAB file (see [MOBILE_SIGNING_SETUP.md](./MOBILE_SIGNING_SETUP.md))
- [ ] App icon (512x512 PNG)
- [ ] Feature graphic (1024x500 JPG/PNG)
- [ ] Screenshots (at least 2, max 8 per device type)
- [ ] Privacy policy URL
- [ ] App description ready (short + full)

---

## Step 1: Create App in Play Console

1. Go to: https://play.google.com/console
2. Click **Create app**
3. Fill in:
   - App name: `Mathison`
   - Default language: `English (United States)`
   - App or game: `App`
   - Free or paid: `Free`
   - Declarations: Check all required boxes
4. Click **Create app**

---

## Step 2: Complete Store Listing

### Main Store Listing

1. Go to **Store presence > Main store listing**
2. Fill in:
   - **App name:** Mathison
   - **Short description (80 chars max):**
     ```
     OI + hypergraph memory with governance. Local-first, treaty-bound AI.
     ```
   - **Full description (4000 chars max):**
     ```
     Mathison combines organic intelligence (OI) with hypergraph memory storage, governed by Tiriti o te Kai treaty constraints.

     Features:
     - Local-first architecture (your data stays on-device)
     - Hypergraph memory for rich relational knowledge
     - Governance-enforced safety (CIF + CDI pipeline)
     - Treaty-bound behavior (anti-hive, non-personhood, consent-first)
     - Mesh networking for multi-device sync (optional)

     Mathison is designed for users who want AI assistance without surveillance, data harvesting, or opaque behavior.

     Privacy: All data stored locally. Network requests governed by Context Integrity Firewall. No third-party analytics.

     License: See https://github.com/YOUR_USERNAME/mathison for full terms.
     ```

3. Upload **App icon** (512x512, PNG)
4. Upload **Feature graphic** (1024x500)
5. Upload **Screenshots** (at least 2 phone screenshots)

### App Category

- **App category:** Productivity
- **Tags:** AI, Knowledge Management, Privacy

### Contact Details

- **Email:** your-email@example.com
- **Website:** https://YOUR_USERNAME.github.io/mathison/
- **Privacy policy URL:** https://YOUR_USERNAME.github.io/mathison/privacy

---

## Step 3: Upload AAB

1. Go to **Release > Production**
2. Click **Create new release**
3. Upload signed AAB:
   ```bash
   # Build AAB if not already done
   cd packages/mathison-mobile/android
   ./gradlew bundleRelease
   ```
4. Drag `app/build/outputs/bundle/release/app-release.aab` to upload area
5. Wait for processing (may take 5-10 minutes)

### Release Notes

```
Initial release of Mathison Mobile.

Features:
- OI interpretation (text → hypergraph nodes)
- Local hypergraph memory storage
- Governance pipeline (CIF + CDI)
- Treaty compliance (Tiriti o te Kai)

Known limitations:
- Mesh sync not yet implemented
- UI is functional but minimal

Privacy: All data local, no analytics, no tracking.
```

---

## Step 4: Content Rating

1. Go to **Policy > App content > Content rating**
2. Click **Start questionnaire**
3. Select **Productivity**
4. Answer questions:
   - Violence: No
   - Sexual content: No
   - Profanity: No
   - User-generated content: No (memory is local only)
   - Social features: No (or Yes if mesh sync enabled)
   - Personal info collection: No
5. Submit for rating

**Expected result:** ESRB rating of E (Everyone)

---

## Step 5: Target Audience & Content

1. Go to **Policy > App content > Target audience**
2. Select:
   - **Age range:** 13+ (or 18+ if handling sensitive data)
   - **Appeals to children:** No
3. Save

### Privacy & Security

1. Go to **Policy > App content > Privacy & security**
2. **Data safety section:**
   - Collects or shares data: **No** (if true)
   - If Yes, declare what data (location, contacts, etc.)
3. **Privacy policy:** Link to your privacy policy URL

---

## Step 6: App Access

1. Go to **Policy > App content > App access**
2. **All functionality available without restrictions:** Yes (or No if login required)
3. If No, provide test credentials

---

## Step 7: Ads

1. Go to **Policy > App content > Ads**
2. **Contains ads:** No (unless you added ads)
3. Save

---

## Step 8: Review & Publish

1. Go to **Release > Production**
2. Verify all sections have green checkmarks
3. Click **Review release**
4. Read warnings/errors, fix any issues
5. Click **Start rollout to Production**

**Expected timeline:**
- Review: 1-7 days (usually 1-3 days)
- Status updates via email
- Check status: Play Console > Release dashboard

---

## Post-Launch

### Monitor Crashes

```bash
# View crash reports in Play Console
# Go to: Quality > Android vitals > Crashes & ANRs
```

### Update Release

1. Increment `versionCode` and `versionName` in `build.gradle`:
   ```gradle
   versionCode 2
   versionName "1.0.1"
   ```
2. Build new AAB
3. Upload to Production track
4. Add release notes
5. Roll out

---

## Rejection Common Issues

| Issue | Fix |
|-------|-----|
| Missing privacy policy | Add privacy policy URL in store listing |
| APK instead of AAB | Upload AAB, not APK (Play Store requires AAB) |
| Unverified email | Verify email in Play Console settings |
| Incomplete content rating | Complete content rating questionnaire |
| Missing feature graphic | Upload 1024x500 image |
| API level too low | Ensure `targetSdkVersion` >= 33 in `build.gradle` |

---

## Validation Checklist

- [ ] Google Play Developer account active
- [ ] Signed AAB uploaded and processed
- [ ] Store listing complete (name, description, images)
- [ ] Content rating completed
- [ ] Privacy policy URL set
- [ ] Target audience configured
- [ ] Data safety section filled
- [ ] Release notes written
- [ ] App tested on physical device before submission
- [ ] Screenshots show actual app functionality

---

## See Also

- [Play Console Help](https://support.google.com/googleplay/android-developer)
- [Launch Checklist](https://developer.android.com/distribute/best-practices/launch/launch-checklist)
- [Mobile Signing Setup](./MOBILE_SIGNING_SETUP.md)
