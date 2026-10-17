const test = require('node:test');
const assert = require('node:assert');
const { parseNutritionLabel } = require('../js/label.js');

test('1行ずつ並んだ表示を読む', () => {
  const r = parseNutritionLabel(`栄養成分表示 1食(78g)当たり
エネルギー 351kcal
たんぱく質 10.5g
脂質 14.6g
炭水化物 44.5g
食塩相当量 4.9g`);
  assert.strictEqual(r.unit, '1食(78g)');
  assert.deepStrictEqual(
    { kcal: r.n.kcal, protein: r.n.protein, fat: r.n.fat, carbs: r.n.carbs, salt: r.n.salt },
    { kcal: 351, protein: 10.5, fat: 14.6, carbs: 44.5, salt: 4.9 },
  );
});

test('全角数字・OCRの誤認識・ナトリウム表記に対応する', () => {
  const r = parseNutritionLabel('栄養成分表示（１００ｇ当たり）\n熱量　５２０ kcaI\nたんぱく質　６ . ２ｇ\n脂質　２８，５ｇ\n糖質 55.1g\n食物繊維 3.0g\nナトリウム 400mg\nカルシウム 120mg');
  assert.strictEqual(r.unit, '100g');
  assert.strictEqual(r.n.kcal, 520);
  assert.strictEqual(r.n.protein, 6.2);
  assert.strictEqual(r.n.fat, 28.5);
  assert.strictEqual(r.n.carbs, 58.1);
  assert.strictEqual(r.n.salt, 1);
  assert.strictEqual(r.n.calcium, 120);
});

test('項目名と数値が別々の列として読まれた場合', () => {
  const r = parseNutritionLabel(`栄養成分表示
1本(500ml)当たり
エネルギー
たんぱく質
脂質
炭水化物
食塩相当量
0kcal
0g
0g
0g
0.1g`);
  assert.strictEqual(r.unit, '1本(500ml)');
  assert.deepStrictEqual(r.found.sort(), ['carbs', 'fat', 'kcal', 'protein', 'salt']);
  assert.strictEqual(r.n.salt, 0.1);
});

test('読み取れない項目は null', () => {
  const r = parseNutritionLabel('原材料名 小麦粉、砂糖');
  assert.deepStrictEqual(r.found, []);
  assert.strictEqual(r.n.kcal, null);
});
