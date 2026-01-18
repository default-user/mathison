#!/usr/bin/env node
/**
 * Test script for GitHub Models API integration
 * Run: GITHUB_TOKEN=your_token node test-github-models.mjs
 */

async function testGitHubModels() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.error('❌ Error: GITHUB_TOKEN environment variable not set');
    console.log('\nUsage:');
    console.log('  export GITHUB_TOKEN="your_token"');
    console.log('  node test-github-models.mjs');
    process.exit(1);
  }

  console.log('🧪 Testing GitHub Models API Integration\n');

  try {
    const response = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France? Answer in one sentence.' }
        ],
        temperature: 1.0,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    const data = await response.json();

    console.log('✓ API Call Successful!\n');
    console.log('Model:', data.model);
    console.log('Response:', data.choices[0].message.content);
    console.log('\nUsage:');
    console.log('  Prompt tokens:', data.usage.prompt_tokens);
    console.log('  Completion tokens:', data.usage.completion_tokens);
    console.log('  Total tokens:', data.usage.total_tokens);

    console.log('\n✓ GitHub Models integration is working!');
    console.log('\nYou can now use GITHUB_TOKEN with Mathison Quadratic OI.');
    console.log('See GITHUB_MODELS_SETUP.md for usage examples.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Verify your GITHUB_TOKEN is valid');
    console.log('2. Check you have GitHub Models access');
    console.log('3. Ensure rate limits not exceeded (15 req/min, 150 req/day)');
    console.log('4. Visit: https://github.com/marketplace/models');
    process.exit(1);
  }
}

testGitHubModels();
