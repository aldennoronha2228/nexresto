import 'dotenv/config';
import { Groq } from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error('Missing GROQ_API_KEY in environment.');
}

const groq = new Groq({ apiKey });

const userPrompt = process.argv.slice(2).join(' ').trim() || 'Give me a short hospitality growth tip for today.';

const chatCompletion = await groq.chat.completions.create({
  messages: [
    {
      role: 'user',
      content: userPrompt,
    },
  ],
  model: process.env.GROQ_MODEL || 'qwen/qwen3-32b',
  temperature: 1,
  max_completion_tokens: 8192,
  top_p: 1,
  stream: true,
  reasoning_effort: 'medium',
  stop: null,
});

for await (const chunk of chatCompletion) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}

process.stdout.write('\n');
