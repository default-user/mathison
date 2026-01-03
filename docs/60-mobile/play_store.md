# Play Store Deployment

## Who This Is For

- Release managers deploying to Google Play Store
- DevOps engineers setting up mobile CI/CD pipelines
- Product owners managing app release lifecycle
- Developers performing manual Play Store submissions

## Why This Exists

Defines the complete process for deploying Mathison to Google Play Store, from signing key generation through production release. This guide ensures security best practices (credential management, key storage), enforces versioning discipline, and provides the manual steps required for external platform integration that cannot be fully automated.

## Guarantees / Invariants

- **Signing key security**: Keystore files NEVER committed to git
- **Monotonic versioning**: `versionCode` increases by 1 each release, never reused
- **Semantic versioning**: `versionName` follows semver (MAJOR.MINOR.PATCH)
- **AAB format**: All Play Store uploads use Android App Bundle (.aab), not APK
- **Minimum SDK**: minSdkVersion 26 (Android 8.0) for on-device ML compatibility
- **Target SDK**: targetSdkVersion 34 (Android 14) for latest features

## Non-Goals

- iOS App Store deployment (separate process)
- Direct APK distribution (Play Store only)
- Automated deployment without human review (requires Play Console credentials)
- Support for Android versions below 8.0
- Multi-flavor builds (single production flavor only)

## How to Verify

```bash
# 1. Verify signing key exists and is valid
keytool -list -v -keystore mathison-upload.keystore -alias mathison-upload
# Expected: Key details with 10000 days validity

# 2. Verify environment variables set
echo $MATHISON_KEYSTORE_PATH
echo $MATHISON_KEYSTORE_PASSWORD
echo $MATHISON_KEY_PASSWORD
# Expected: All three variables populated

# 3. Verify version numbers in build.gradle
grep "versionCode" android/app/build.gradle
grep "versionName" android/app/build.gradle
# Expected: versionCode = N (monotonic), versionName = "X.Y.Z" (semver)

# 4. Build AAB locally
cd android && ./gradlew bundleRelease
ls app/build/outputs/bundle/release/
# Expected: app-release.aab present

# 5. Verify AAB is signed
jarsigner -verify -verbose app/build/outputs/bundle/release/app-release.aab
# Expected: "jar verified"

# 6. Check AAB size
du -h app/build/outputs/bundle/release/app-release.aab
# Expected: <150MB (acceptable for Play Store)

# 7. Verify store assets exist
ls store-assets/
# Expected: icon-512.png, feature-graphic.png, screenshots/phone/

# 8. Verify privacy policy URL accessible
curl -I https://mathison.app/privacy
# Expected: HTTP 200 OK
```

## Implementation Pointers

- **Keystore management**: Use Google Play App Signing (recommended) to let Google manage production keys
- **Credential storage**: Store keystore passwords in 1Password/Bitwarden, use environment variables for CI/CD
- **Build command**: Always use `./gradlew bundleRelease` (AAB) not `assembleRelease` (APK) for Play Store
- **Version increment**: Automate with script: `versionCode = $(git tag | wc -l) + 1`
- **Store assets path**: Keep in `store-assets/` directory outside Android project
- **Release notes**: Keep concise (500 chars max), focus on user-facing changes
- **Review timeline**: Budget 1-7 days, usually 1-2 days
- **Rejection response**: Fix issue, increment versionCode, resubmit (don't reuse version)

---

**Phase 8.2** — Google Play Store deployment preparation.

---

## Status: READY_FOR_HUMAN

Play Store deployment requires **external credentials and manual steps** not accessible to automated systems.

---

## Prerequisites

### 1. Google Play Console Access
- **URL**: https://play.google.com/console
- **Account**: Organization Google account with Play Console access
- **App Created**: Create new app in Play Console

### 2. Signing Keys

**Option A: Google Play App Signing (Recommended)**
- Google manages signing keys
- Upload key generated locally for first release
- Lower risk (Google holds production keys)

**Option B: Self-Managed Signing**
- You manage production signing keys
- Higher risk (key compromise = permanent app loss)

Generate upload key:
```bash
keytool -genkeypair -v \
  -keystore mathison-upload.keystore \
  -alias mathison-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**CRITICAL**: Store keystore file + password in secure vault (1Password, etc.)

---

## Build Configuration

### android/app/build.gradle

```gradle
android {
    ...
    defaultConfig {
        applicationId "com.mathison.app"
        minSdkVersion 26
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
    }

    signingConfigs {
        release {
            storeFile file(System.getenv("MATHISON_KEYSTORE_PATH"))
            storePassword System.getenv("MATHISON_KEYSTORE_PASSWORD")
            keyAlias "mathison-upload"
            keyPassword System.getenv("MATHISON_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## Version Policy

Use **semantic versioning** with build numbers:
- **versionName**: "1.0.0" (displayed to users)
- **versionCode**: 1 (monotonically increasing integer)

Every release:
1. Increment versionCode by 1
2. Update versionName (1.0.1 → 1.0.2 for patches)
3. Tag git commit: `git tag v1.0.2`

---

## Build AAB (Android App Bundle)

```bash
cd android

# Set environment variables
export MATHISON_KEYSTORE_PATH=/path/to/mathison-upload.keystore
export MATHISON_KEYSTORE_PASSWORD=<password>
export MATHISON_KEY_PASSWORD=<password>

# Build release AAB
./gradlew bundleRelease

# Output: app/build/outputs/bundle/release/app-release.aab
```

---

## Store Assets

Create `store-assets/` directory with:

### 1. App Icon
- **512x512 PNG** (no transparency)
- Path: `store-assets/icon-512.png`

### 2. Feature Graphic
- **1024x500 PNG**
- Path: `store-assets/feature-graphic.png`

### 3. Screenshots
- At least 2 screenshots
- **Phone**: 1080x1920 to 1920x1080
- Path: `store-assets/screenshots/phone/`
- **Tablet** (optional): `store-assets/screenshots/tablet/`

### 4. Privacy Policy
- **URL required** by Play Store
- Host at: `https://mathison.app/privacy` or similar
- Template: See `docs/privacy-policy-template.md`

### 5. App Description

**Short description** (80 chars max):
```
Governed AI memory graph with local-first OI interpretation
```

**Full description** (4000 chars max):
```
Mathison is a governed memory graph system with:
- Local-first hypergraph memory
- Open Interpretation (OI) engine
- Consent-driven governance
- End-to-end encrypted mesh networking

Key features:
• Store and search nodes, edges, and hyperedges
• Interpret queries using memory context (no external LLM required)
• Run governed jobs with checkpointing and resumption
• Connect to peers with consent-gated discovery and E2EE

Governance:
All operations protected by Tiriti o te Kai governance framework.
- Context Integrity Firewall (CIF)
- Consent-Driven Inspection (CDI)
- Fail-closed behavior (no silent failures)

Privacy:
• Local-first: Your data stays on your device
• No telemetry, no tracking
• Optional mesh networking (explicit consent required)
• Encrypted connections (AES-256-GCM)

Learn more: https://mathison.app
```

---

## Upload Checklist

### Play Console Steps
1. Log in to Play Console
2. Select app → Production → Create new release
3. Upload `app-release.aab`
4. Set release name (e.g., "1.0.0 - Initial Release")
5. Add release notes:
   ```
   Initial release:
   - Memory graph storage (nodes, edges, hyperedges)
   - OI interpretation endpoint
   - Governed job execution
   - Local-first operation
   ```
6. Upload screenshots + feature graphic
7. Fill in app description + privacy policy URL
8. Set content rating (use questionnaire)
9. Set target audience (18+)
10. Submit for review

### Review Process
- **Timeline**: 1-7 days (usually 1-2 days)
- **Notifications**: Email when approved/rejected
- **Common rejections**:
  - Missing privacy policy
  - Misleading app description
  - Broken functionality
  - Missing required screenshots

---

## Post-Release

### Update Flow
1. Increment versionCode + versionName
2. Build new AAB
3. Upload to Production → Create new release
4. Submit for review

### Monitoring
- Play Console → Statistics (downloads, crashes)
- Play Console → Reviews (user feedback)
- Firebase Crashlytics (optional, requires setup)

---

## Security Notes

- **NEVER commit** keystore files to git
- **NEVER commit** keystore passwords
- Store credentials in 1Password or similar vault
- Use environment variables for CI/CD
- Enable 2FA on Play Console account

---

## CI/CD (Future)

GitHub Actions workflow (requires secrets):
```yaml
name: Deploy to Play Store
on:
  push:
    tags:
      - 'v*'
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build AAB
        env:
          MATHISON_KEYSTORE: ${{ secrets.MATHISON_KEYSTORE_BASE64 }}
          MATHISON_KEYSTORE_PASSWORD: ${{ secrets.MATHISON_KEYSTORE_PASSWORD }}
          MATHISON_KEY_PASSWORD: ${{ secrets.MATHISON_KEY_PASSWORD }}
        run: |
          echo "$MATHISON_KEYSTORE" | base64 -d > mathison-upload.keystore
          cd android && ./gradlew bundleRelease
      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_STORE_SERVICE_ACCOUNT }}
          packageName: com.mathison.app
          releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
          track: production
```

---

## See Also

- [Mobile App Guide](./react-native-app-guide.md)
- [Mobile Deployment](./mobile-deployment.md)
