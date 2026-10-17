const test = require('node:test');
const assert = require('node:assert');
const AI = require('../js/ai.js');

const reply = (data, extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(data) }], ...extra });
const dish = { name: 'ごはん', amount: '茶碗1杯(約150g)', kcal: 234.4, protein: 3.84, fat: 0.5, carbs: 55.7, fiber: 2.3, salt: 0, calcium: 5, iron: 0.2, vitc: 0 };

test('リクエストに画像・補足・構造化出力・ヘッダーが入る', () => {
  const { url, init } = AI.buildRequest('sk-test', 'BASE64', ' ご飯大盛り ');
  const body = JSON.parse(init.body);
  assert.strictEqual(url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(init.headers['x-api-key'], 'sk-test');
  assert.strictEqual(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.strictEqual(body.model, 'claude-opus-5-5');
  assert.strictEqual(body.fallbacks, 'default');
  assert.strictEqual(body.output_config.format.type, 'json_schema');
  assert.strictEqual(body.messages[0].content[0].source.data, 'BASE64');
  assert.match(body.messages[0].content[1].text, /補足: ご飯大盛り$/);
  assert.ok(!('thinking' in body));
});

test('推定結果を食品データに変換する', () => {
  const r = AI.parseResponse(reply({ is_food: true, dishes: [dish], note: '一般的な量で推定' }));
  assert.strictEqual(r.dishes[0].n.kcal, 234);
  assert.strictEqual(r.dishes[0].n.protein, 3.8);
  assert.strictEqual(r.note, '一般的な量で推定');
});

test('料理がない・拒否・途中切れはエラー', () => {
  assert.throws(() => AI.parseResponse(reply({ is_food: false, dishes: [], note: '' })), /料理が写っていない/);
  assert.throws(() => AI.parseResponse({ stop_reason: 'refusal', content: [] }), /推定できません/);
  assert.throws(() => AI.parseResponse({ stop_reason: 'max_tokens', content: [] }), /途中で切れ/);
});

test('HTTPエラーと通信エラーをわかりやすい文言にする', async () => {
  const fake = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
  await assert.rejects(AI.estimateMeal('k', 'x', '', fake(401, {})), /APIキーが正しくありません/);
  await assert.rejects(AI.estimateMeal('k', 'x', '', fake(529, {})), /混み合って/);
  await assert.rejects(AI.estimateMeal('k', 'x', '', fake(400, { error: { message: 'Your credit balance is too low' } })), /クレジット残高/);
  await assert.rejects(AI.estimateMeal('k', 'x', '', async () => { throw new TypeError('Failed to fetch'); }), /通信できませんでした/);
  const ok = await AI.estimateMeal('k', 'x', '', fake(200, reply({ is_food: true, dishes: [dish], note: '' })));
  assert.strictEqual(ok.dishes.length, 1);
});
