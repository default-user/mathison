# Mathison Mobile App

React Native / Expo app for viewing Mathison system status, memory, and jobs.

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator

## Installation

```bash
cd apps/mobile-app
npm install
```

## Development

```bash
# Start Expo dev server
npm start

# Run on iOS Simulator
npm run ios

# Run on Android Emulator
npm run android

# Run in web browser
npm run web
```

## Configuration

The app connects to the Mathison server at `http://localhost:3000` by default.

To change the server URL, modify the `DEFAULT_SERVER_URL` in `src/hooks/useMathison.tsx`.

For device testing, ensure your device can reach the server IP.

## Features

### Status Tab
- System health status
- Governance info (treaty, genome)
- Storage backend status
- Memory graph statistics

### Memory Tab
- Search memory nodes
- View node details

### Jobs Tab
- View active jobs
- Job status and metadata

## Architecture

```
apps/mobile-app/
├── app/                    # Expo Router pages
│   ├── _layout.tsx         # Root layout
│   └── (tabs)/             # Tab navigation
│       ├── _layout.tsx     # Tab layout
│       ├── index.tsx       # Status screen
│       ├── memory.tsx      # Memory screen
│       └── jobs.tsx        # Jobs screen
├── src/
│   ├── components/         # UI components
│   │   ├── StatusCard.tsx
│   │   ├── GovernancePanel.tsx
│   │   ├── NodeCard.tsx
│   │   └── JobCard.tsx
│   ├── hooks/
│   │   └── useMathison.tsx # API client hook
│   └── utils/
└── assets/                 # Images and icons
```

## Building for Production

```bash
# Build for Android
expo build:android

# Build for iOS
expo build:ios
```

## Play Store / App Store

See `docs/READY_FOR_HUMAN/mobile-publishing.md` for publishing steps.

## Testing

```bash
npm test
```

## License

MIT
