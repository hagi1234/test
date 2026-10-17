const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../js/calc.js');
const { FOODS } = require('../js/foods.js');

const profile = { sex: 'female', age: 30, height: 160, weight: 60, targetWeight: 55, activity: 'mid', goal: 'lose' };

test('基礎代謝と目標カロリー', () => {
  assert.strictEqual(Calc.bmr(profile), 1289);
  const t = Calc.targets(profile);
  assert.strictEqual(t.kcal, Math.round(1289 * 1.75 - 250));
  assert.strictEqual(t.salt, 6.5);
});

test('目標どおりの摂取なら満点', () => {
  const t = Calc.targets(profile);
  const r = Calc.evaluate({ ...t, salt: 5 }, t);
  assert.strictEqual(r.score, 100);
  assert.ok(r.items.every((i) => i.status === 'ok'));
});

test('不足と過剰を判定し、アドバイスを返す', () => {
  const t = Calc.targets(profile);
  const total = { ...t, salt: t.salt * 2, vitc: 0 };
  const r = Calc.evaluate(total, t);
  assert.ok(r.score < 100);
  const tips = Calc.advice(r, FOODS);
  assert.ok(tips.some((x) => x.key === 'salt' && x.type === 'over'));
  assert.ok(tips.some((x) => x.key === 'vitc' && x.type === 'low' && x.text.includes('キウイ')));
});

test('記録の合計は量を反映する', () => {
  const total = Calc.sumEntries([{ n: FOODS[0].n, qty: 2 }]);
  assert.strictEqual(total.kcal, 468);
});
