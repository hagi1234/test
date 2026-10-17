const test = require('node:test');
const assert = require('node:assert');
const Products = require('../js/products.js');

test('JANコードのチェックディジットを検証する', () => {
  assert.ok(Products.isValidBarcode('4901085141434'));
  assert.ok(Products.isValidBarcode('49012347'));
  assert.ok(!Products.isValidBarcode('4901085141435'));
  assert.ok(!Products.isValidBarcode('49012344'));
  assert.ok(!Products.isValidBarcode('12345'));
});

test('1食分の栄養成分があればそれを使う', () => {
  const food = Products.toFood({
    product_name: 'Green tea', product_name_ja: 'お茶', brands: 'テスト飲料,Test',
    serving_size: '1本 (500ml)', serving_quantity: '500',
    nutriments: { 'energy-kcal_serving': 0, 'energy-kcal_100g': 0, proteins_serving: 0, sodium_serving: 0.05, 'vitamin-c_serving': 0.05 },
  }, '4901085141434');
  assert.strictEqual(food.name, 'テスト飲料 お茶');
  assert.strictEqual(food.unit, '1本 (500ml)');
  assert.strictEqual(food.barcode, '4901085141434');
  assert.strictEqual(food.n.salt, 0.1);
  assert.strictEqual(food.n.vitc, 50);
});

test('1食分がなければ100gあたりで換算し、kJからも計算する', () => {
  const food = Products.toFood({
    product_name: 'Cookie', quantity: '120 g',
    nutriments: { energy_100g: 2092, fat_100g: 25, carbohydrates_100g: 60, salt_100g: 0.5, calcium_100g: 0.12 },
  }, '49012347');
  assert.strictEqual(food.unit, '100g');
  assert.strictEqual(food.n.kcal, 500);
  assert.strictEqual(food.n.calcium, 120);
});

test('栄養成分がない・見つからない場合', async () => {
  const fake = (status, body) => async () => ({ status, ok: status < 400, json: async () => body });
  assert.deepStrictEqual(await Products.lookup('49012347', fake(404, {})), { status: 'not_found' });
  assert.deepStrictEqual(await Products.lookup('49012347', fake(200, { status: 0 })), { status: 'not_found' });
  const r = await Products.lookup('49012347', fake(200, { status: 1, product: { product_name: 'X', nutriments: {} } }));
  assert.deepStrictEqual(r, { status: 'no_nutrition', name: 'X' });
  const ok = await Products.lookup('49012347', fake(200, { status: 1, product: { product_name: 'Y', nutriments: { 'energy-kcal_100g': 100 } } }));
  assert.strictEqual(ok.status, 'found');
  await assert.rejects(Products.lookup('49012347', fake(500, {})));
});
