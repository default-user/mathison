# GitHub Models Setup Guide

## Who This Is For

- Developers setting up Mathison with free-tier LLM access via GitHub Models
- Teams wanting to test Quadratic OI without paid API keys
- Contributors running local Mathison development environments
- Anyone needing a quick, zero-cost LLM integration for prototyping

## Why This Exists

GitHub Models provides free-tier access to GPT-4o-mini and other models, making it the fastest way to get Mathison running without upfront API costs. This guide documents the integration between Mathison's LLM adapter and GitHub Models, including fallback chains, rate limits, and browser/Node usage patterns.

## Guarantees / Invariants

1. **Fallback Chain**: If GitHub Models fails (rate limit, auth), the adapter automatically tries Anthropic, then local fallback
2. **Token Format**: GitHub tokens must have `read:user` scope for Models API access
3. **Rate Limits**: 15 req/min, 150 req/day enforced by GitHub
4. **Provider Transparency**: All responses include `provider`, `model`, and `tokens` fields
5. **Endpoint Allowlist**: Only `models.github.ai` and `api.anthropic.com` are permitted by network adapter

## Non-Goals

- Production-scale LLM usage (use Anthropic API directly for higher limits)
- Fine-tuned or custom model support (limited to GitHub Models catalog)
- Automatic retry logic (users must implement retries based on rate limits)
- Streaming responses (adapter uses completion-only mode)

## How to Verify

```bash
# 1. Test GitHub Models API directly
export GITHUB_TOKEN="ghp_your_token_here"
curl -X POST https://models.github.ai/inference/chat/completions \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}],"max_tokens":10}'

# Expected: JSON response with choices[0].message.content

# 2. Test via Quadratic OI
npx tsx -e "
import { QuadraticOI } from './packages/mathison-quadratic/quad.ts';
const oi = new QuadraticOI('test');
await oi.boot();
const r = await oi.execute('llm.complete', {prompt:'Test',model:'gpt-4o-mini'});
console.log('Provider:', r.provider); // Should be 'github'
"

# 3. Verify fallback chain
unset GITHUB_TOKEN
export ANTHROPIC_API_KEY="sk-ant-..."
# Run test again - should use provider='anthropic'
```

## Implementation Pointers

- **LLM Adapter**: `/home/user/mathison/packages/mathison-core/src/oi/adapters/llm-adapter.ts`
- **Network Adapter**: `/home/user/mathison/packages/mathison-core/src/oi/adapters/network-adapter.ts` (endpoint allowlist)
- **Quadratic Integration**: `/home/user/mathison/packages/mathison-quadratic/quad.ts`
- **Provider Logic**: Checks `GITHUB_TOKEN` → `ANTHROPIC_API_KEY` → local fallback in sequence
- **Token Injection**: Browser sets `window.__GITHUB_TOKEN__`, Node uses `process.env.GITHUB_TOKEN`

---

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
