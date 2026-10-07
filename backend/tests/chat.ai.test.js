// AI mode with the Anthropic SDK mocked: checks the request shape, the tool
// loop, ownership inside tool calls, and the fallback when the API errors.
const { startDb, stopDb, resetDb, seedBasics, bearer } = require('./helpers');

const mockCalls = [];
const mockScript = [];

jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  class FakeAnthropic {
    constructor() {
      this.beta = {
        messages: {
          stream: (params) => {
            mockCalls.push(JSON.parse(JSON.stringify(params)));
            const step = mockScript.shift();
            const handlers = [];
            return {
              on: (event, cb) => {
                if (event === 'text') handlers.push(cb);
              },
              abort: () => {},
              finalMessage: async () => {
                if (!step || step.error) throw step?.error || new APIError(500, 'no scripted response');
                if (step.text) handlers.forEach((cb) => cb(step.text));
                const content = step.content || [{ type: 'text', text: step.text }];
                return { content, stop_reason: step.stop_reason || 'end_turn' };
              },
            };
          },
        },
      };
    }
  }
  FakeAnthropic.APIError = APIError;
  return FakeAnthropic;
});

process.env.ANTHROPIC_API_KEY = 'test-key';
delete process.env.ANTHROPIC_MODEL;

const request = require('supertest');
const Anthropic = require('@anthropic-ai/sdk');
const app = require('../src/app');
const Pickup = require('../src/models/Pickup');

let world;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  world = await seedBasics();
  mockCalls.length = 0;
  mockScript.length = 0;
});

const toolUse = (name, input) => ({
  content: [{ type: 'tool_use', id: `toolu_${name}`, name, input }],
  stop_reason: 'tool_use',
});

function ask(message, user) {
  const req = request(app).post('/api/chat').send({ message, stream: false, page: '/rates' });
  return user ? req.set('Authorization', bearer(user)) : req;
}

it('runs the tool loop against real data and shows cards', async () => {
  mockScript.push(toolUse('get_scrap_rates', { search: 'copper' }), { text: 'Copper is Rs. 800–900 per kg right now.' });

  const res = await ask('copper rate?');
  expect(res.status).toBe(200);
  const msg = res.body.data.message;
  expect(msg.mode).toBe('ai');
  expect(msg.content).toBe('Copper is Rs. 800–900 per kg right now.');
  expect(msg.cards[0]).toMatchObject({ type: 'rates', city: 'Kathmandu' });

  // First request: stable system + tools (cacheable), per-request context as a system message.
  const [first, second] = mockCalls;
  expect(first.model).toBe('claude-sonnet-5-5');
  expect(first.system).toMatch(/SafaKabad Assistant/);
  expect(first.tools).toHaveLength(10);
  expect(first.cache_control).toEqual({ type: 'ephemeral' });
  expect(first.fallbacks).toBe('default');
  expect(first.messages.at(-2)).toEqual({ role: 'user', content: 'copper rate?' });
  expect(first.messages.at(-1).role).toBe('system');
  expect(first.messages.at(-1).content).toMatch(/not logged in/);

  // Second request carries the tool result from our DB.
  const toolResult = second.messages.at(-1).content[0];
  expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_get_scrap_rates' });
  expect(JSON.parse(toolResult.content).rates[0]).toMatchObject({ name: 'Copper', minPrice: 480, maxPrice: 550 });
});

it("cannot read another customer's pickup through a tool call", async () => {
  mockScript.push(toolUse('track_pickup', { pickup_id: 'SM-2026-000001' }), { text: "I couldn't find that pickup." });
  const res = await ask('where is SM-2026-000001', world.bob);
  expect(res.body.data.message.cards).toHaveLength(0);
  const toolResult = mockCalls[1].messages.at(-1).content[0];
  expect(toolResult.is_error).toBe(true);
  expect(JSON.parse(toolResult.content).error).toBe('not_found');
});

it('only proposes a cancellation; the pickup is unchanged until confirmed', async () => {
  mockScript.push(toolUse('cancel_pickup', { pickup_id: 'SM-2026-000001' }), { text: 'Press Confirm to cancel.' });
  const res = await ask('cancel my pickup SM-2026-000001', world.alice);
  expect(res.body.data.message.cards[0]).toMatchObject({ type: 'confirm', state: 'pending' });
  expect((await Pickup.findOne({ pickupId: 'SM-2026-000001' })).status).toBe('BOOKED');
});

it('falls back to the rule-based bot when the API fails', async () => {
  mockScript.push({ error: new Anthropic.APIError(529, 'overloaded') });
  const res = await ask('copper rate?');
  expect(res.body.data.message.mode).toBe('fallback');
  expect(res.body.data.message.cards[0].rates[0]).toMatchObject({ name: 'Copper', minPrice: 480 });
});

it('sends earlier turns as history', async () => {
  const agent = request.agent(app);
  mockScript.push({ text: 'Hello! How can I help?' }, { text: 'Sure.' });
  await agent.post('/api/chat').send({ message: 'hi', stream: false });
  await agent.post('/api/chat').send({ message: 'book a pickup', stream: false });
  const roles = mockCalls[1].messages.map((m) => m.role);
  expect(roles).toEqual(['user', 'assistant', 'user', 'system']);
});
