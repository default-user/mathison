# Mobile App Signing Setup

**Status:** READY_FOR_HUMAN
**Blocked By:** Keystore generation (requires secure environment + credentials)

---

## What This Is

Instructions for generating signing keys and configuring mobile app builds for Android (Play Store) and iOS (App Store).

---

## Android Signing (Google Play)

### 1. Generate Keystore

**Run this on a secure machine (NOT in CI/cloud initially):**

```bash
# Generate production keystore
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias mathison-release \
  -keystore mathison-release.keystore

# You will be prompted for:
# - Keystore password (SAVE THIS SECURELY)
# - Key password (can be same as keystore password)
# - Your name, organization, city, state, country
```

**Expected output:** `mathison-release.keystore` file created

**CRITICAL:** Store keystore + passwords in secure secret manager (e.g., 1Password, Vault, AWS Secrets Manager). If you lose this, you cannot update your app on Play Store.

### 2. Configure Build

Create `packages/mathison-mobile/android/gradle.properties` (DO NOT COMMIT):

```properties
MATHISON_RELEASE_STORE_FILE=mathison-release.keystore
MATHISON_RELEASE_STORE_PASSWORD=<your-keystore-password>
MATHISON_RELEASE_KEY_ALIAS=mathison-release
MATHISON_RELEASE_KEY_PASSWORD=<your-key-password>
```

Add to `.gitignore`:
```
packages/mathison-mobile/android/gradle.properties
packages/mathison-mobile/android/*.keystore
```

### 3. Update build.gradle

Edit `packages/mathison-mobile/android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file(MATHISON_RELEASE_STORE_FILE)
            storePassword MATHISON_RELEASE_STORE_PASSWORD
            keyAlias MATHISON_RELEASE_KEY_ALIAS
            keyPassword MATHISON_RELEASE_KEY_PASSWORD
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

### 4. Build Release APK/AAB

```bash
cd packages/mathison-mobile/android

# Build AAB (for Play Store upload)
./gradlew bundleRelease

# Output: app/build/outputs/bundle/release/app-release.aab

# Build APK (for direct distribution)
./gradlew assembleRelease

# Output: app/build/outputs/apk/release/app-release.apk
```

**Expected output:** Signed APK/AAB file ~10-50MB

### 5. Verify Signature

```bash
# Verify APK signature
jarsigner -verify -verbose -certs app/build/outputs/apk/release/app-release.apk

# Expected output: "jar verified"
```

---

## iOS Signing (App Store)

### 1. Create App ID

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Click **+** to create new App ID
3. Select **App** → **Continue**
4. Fill in:
   - Description: `Mathison Mobile`
   - Bundle ID: `nz.authority.mathison` (or your domain)
5. Click **Continue** → **Register**

### 2. Create Certificates

```bash
# Generate Certificate Signing Request (CSR)
# On macOS, open Keychain Access:
# Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority
# Email: your-email@example.com
# Common Name: Mathison Production
# Save to disk

# Upload CSR to Apple Developer:
# https://developer.apple.com/account/resources/certificates/add
# Select "iOS Distribution" → Upload CSR → Download certificate
# Double-click .cer file to add to Keychain
```

### 3. Create Provisioning Profile

1. Go to: https://developer.apple.com/account/resources/profiles/add
2. Select **App Store** → **Continue**
3. Select your App ID → **Continue**
4. Select certificate → **Continue**
5. Name: `Mathison Production Profile`
6. Download profile, place in `packages/mathison-mobile/ios/`

### 4. Configure Xcode Project

1. Open `packages/mathison-mobile/ios/MathisonMobile.xcworkspace`
2. Select project root → **Signing & Capabilities**
3. Uncheck **Automatically manage signing**
4. Select provisioning profile: `Mathison Production Profile`
5. Verify Team and Bundle Identifier match

### 5. Build for App Store

```bash
cd packages/mathison-mobile/ios

# Archive for App Store
xcodebuild -workspace MathisonMobile.xcworkspace \
  -scheme MathisonMobile \
  -configuration Release \
  -archivePath build/MathisonMobile.xcarchive \
  archive

# Export IPA
xcodebuild -exportArchive \
  -archivePath build/MathisonMobile.xcarchive \
  -exportPath build \
  -exportOptionsPlist ExportOptions.plist

# Output: build/MathisonMobile.ipa
```

**Expected output:** IPA file ~20-100MB

---

## Security Checklist

- [ ] Keystore stored in secure secret manager (NOT in repo)
- [ ] Passwords stored separately from keystore
- [ ] Backup of keystore exists in secure location
- [ ] `.gitignore` configured to exclude signing files
- [ ] Production builds tested on physical devices
- [ ] Certificates valid for at least 1 year
- [ ] Team members documented who have access to signing materials

---

## Key Rotation

**Android:**
- Google Play signing key can be upgraded via Play Console (one-time)
- Upload new keystore via Play Console > Setup > App Integrity

**iOS:**
- Certificates expire after 1 year
- Renew 2 months before expiration
- Download new certificate + provisioning profile from Apple Developer

---

## Troubleshooting

### Android: "keystore tampered with or password incorrect"
- Verify password in `gradle.properties` exactly matches keystore password
- Check keystore file path is correct

### iOS: "Provisioning profile doesn't include signing certificate"
- Certificate must be in Keychain Access
- Provisioning profile must include certificate
- Refresh profiles: Xcode > Preferences > Accounts > Download Manual Profiles

---

## See Also

- [Android App Signing](https://developer.android.com/studio/publish/app-signing)
- [iOS Code Signing](https://developer.apple.com/support/code-signing/)
- [Play Store Upload](./PLAY_STORE_SUBMISSION.md)
