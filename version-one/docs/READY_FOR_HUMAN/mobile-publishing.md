# Mobile App Publishing Checklist

## Status
**Phase:** READY_FOR_HUMAN
**Blocker:** Requires App Store credentials and signing keys

## Prerequisites

### Apple App Store (iOS)
- [ ] Apple Developer account ($99/year)
- [ ] App Store Connect access
- [ ] Signing certificates and provisioning profiles
- [ ] App icon (1024x1024 PNG)
- [ ] Screenshots for various device sizes
- [ ] Privacy policy URL
- [ ] Support URL

### Google Play Store (Android)
- [ ] Google Play Developer account ($25 one-time)
- [ ] Google Play Console access
- [ ] Upload key (for app signing)
- [ ] Feature graphic (1024x500 PNG)
- [ ] App icon (512x512 PNG)
- [ ] Screenshots for various device sizes
- [ ] Privacy policy URL

## Steps to Publish

### 1. Configure Environment
```bash
cd apps/mobile-app

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure the project
eas build:configure
```

### 2. Build for iOS
```bash
# Development build
eas build --platform ios --profile development

# Production build
eas build --platform ios --profile production
```

### 3. Build for Android
```bash
# Development build
eas build --platform android --profile development

# Production build
eas build --platform android --profile production
```

### 4. Submit to Stores
```bash
# Submit to App Store
eas submit --platform ios

# Submit to Google Play
eas submit --platform android
```

## App Store Listing Content

### Title
Mathison - Governed AI Assistant

### Subtitle
Privacy-first AI with full governance

### Description
Mathison is a governed AI system that puts you in control. Monitor system status, explore memory, and manage jobs - all with complete transparency about how decisions are made.

Features:
- Real-time governance status monitoring
- Memory graph exploration and search
- Job management and tracking
- Full treaty and genome visibility
- Privacy-first architecture

### Keywords
AI, assistant, governance, privacy, memory, transparency

### Category
Productivity

## Testing Before Submission
- [ ] Test on physical iOS device
- [ ] Test on physical Android device
- [ ] Verify network connectivity to Mathison server
- [ ] Test all screens and navigation
- [ ] Verify error states and offline behavior

## Estimated Effort
- Initial setup: 2-4 hours
- Screenshot preparation: 1-2 hours
- Store listing: 1-2 hours
- Review response (if needed): varies
