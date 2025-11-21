const fetch = globalThis.fetch;
(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('no key');
    process.exit(1);
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const body = {
    model,
    temperature: 0.3,
    max_completion_tokens: 480,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'capsule_summary',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['summary'],
          properties: {
            summary: { type: 'string' },
            highlights: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 10,
            },
            insights: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 10,
            },
            hashtags: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 12,
            },
            next_actions: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 10,
            },
            tone: { type: 'string' },
            sentiment: { type: 'string' },
            suggested_title: { type: 'string' },
            suggested_post_prompt: { type: 'string' },
            word_count: { type: 'integer', minimum: 0, maximum: 2000 },
          },
        },
      },
    },
    messages: [
      {
        role: 'system',
        content:
          'You are Capsule AI, an assistant that writes warm, succinct summaries with actionable highlights. Always respond with JSON that matches the provided schema.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          target: 'feed',
          tone_hint: 'test',
          length: 'medium',
          text: 'Post 1: Great day! Post 2: Another note.',
        }),
      },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log('status', res.status);
  const text = await res.text();
  console.log(text);
})();
