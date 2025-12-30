# GitHub Models Setup Guide

Mathison now supports GitHub Models API with free tier access!

## Quick Start

### 1. Get Your GitHub Token

```bash
# Use your existing GitHub token with Models access
export GITHUB_TOKEN="ghp_your_token_here"
```

Or create a new token at: https://github.com/settings/tokens
- Needs `read:user` scope for GitHub Models access

### 2. Test the Integration

```bash
# Set your token
export GITHUB_TOKEN="your_token"

# Run Quadratic with GitHub Models
cd /home/user/mathison
npx tsx -e "
import { QuadraticOI } from './packages/mathison-quadratic/quad.ts';

async function test() {
  const oi = new QuadraticOI('test-oi');
  await oi.boot();

  const result = await oi.execute('llm.complete', {
    prompt: 'What is the capital of France?',
    model: 'gpt-4o-mini'
  });

  console.log('\\nResponse:', result.text);
  console.log('Provider:', result.provider);
  console.log('Model:', result.model);
  console.log('Tokens:', result.tokens);
}

test();
"
```

### 3. Available Models

GitHub Models supports (via free tier):
- `gpt-4o-mini` (default, recommended)
- `gpt-4o`
- `phi-3.5-mini`
- `meta-llama-3.1-405b-instruct`

### 4. Fallback Chain

The LLM adapter tries providers in this order:
1. **GitHub Models** (if `GITHUB_TOKEN` is set)
2. **Anthropic** (if `ANTHROPIC_API_KEY` is set)
3. **Local fallback** (simple pattern matching)

### 5. Using in Browser

```html
<!DOCTYPE html>
<html>
<head>
  <script src="quad.js"></script>
</head>
<body>
  <script>
    // Set token in browser
    window.__GITHUB_TOKEN__ = 'your_token';

    // Use Quadratic
    const oi = new QuadraticOI('browser-oi');
    await oi.boot();

    const result = await oi.execute('llm.complete', {
      prompt: 'Hello!',
      model: 'gpt-4o-mini'
    });

    console.log(result.text);
  </script>
</body>
</html>
```

## Python Integration (Alternative)

If you prefer Python, use the Azure SDK:

```python
import os
from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import SystemMessage, UserMessage
from azure.core.credentials import AzureKeyCredential

endpoint = "https://models.github.ai/inference"
model = "gpt-4o-mini"
token = os.environ["GITHUB_TOKEN"]

client = ChatCompletionsClient(
    endpoint=endpoint,
    credential=AzureKeyCredential(token),
)

response = client.complete(
    messages=[
        SystemMessage("You are a helpful assistant."),
        UserMessage("What is the capital of France?"),
    ],
    temperature=1.0,
    top_p=1.0,
    model=model
)

print(response.choices[0].message.content)
```

## Environment Variables

```bash
# Primary (free tier)
export GITHUB_TOKEN="ghp_..."

# Fallback (if you have Anthropic key)
export ANTHROPIC_API_KEY="sk-ant-..."
```

## API Endpoints

The LLM adapter uses:
- **GitHub:** `https://models.github.ai/inference/chat/completions`
- **Anthropic:** `https://api.anthropic.com/v1/messages`

Both are in the network adapter allowlist.

## Testing

```bash
# Quick test
cd /home/user/mathison
export GITHUB_TOKEN="your_token"

node -e "
const fetch = require('node-fetch');
global.fetch = fetch;

(async () => {
  const response = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Say hello!' }
      ],
      max_tokens: 100,
    }),
  });

  const data = await response.json();
  console.log(data.choices[0].message.content);
})();
"
```

## Rate Limits

GitHub Models free tier:
- **15 requests per minute**
- **150 requests per day**

If you exceed limits, the adapter will automatically fall back to Anthropic (if configured) or local fallback.

## Troubleshooting

### "GitHub Models API error: 401"
- Check your `GITHUB_TOKEN` is valid
- Ensure token has GitHub Models access

### "GitHub Models API error: 429"
- Rate limit exceeded
- Wait a minute or configure `ANTHROPIC_API_KEY` fallback

### "No API key configured"
- Set either `GITHUB_TOKEN` or `ANTHROPIC_API_KEY`

## Production Notes

For production use:
1. Use `ANTHROPIC_API_KEY` as primary (higher limits)
2. Use `GITHUB_TOKEN` for development/testing
3. Monitor provider usage via `result.provider` field
4. Implement retry logic for rate limits

## Next Steps

- Run Quadratic: `./bootstrap-oi.sh`
- Deploy to GitHub Pages: See `DEPLOYMENT.md`
- Mobile deployment: See `docs/mobile-deployment.md`
- Full docs: See `packages/mathison-quadratic/README.md`

---

**Repository:** `/home/user/mathison`
**Branch:** `claude/merged-master-ups2n`
**PR:** https://github.com/default-user/mathison/pull/new/claude/merged-master-ups2n
