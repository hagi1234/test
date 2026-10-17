// バーコード（JANコード）から Open Food Facts で商品を検索する
(function (root) {
  const API = 'https://world.openfoodfacts.org/api/v2/product/';
  const FIELDS = 'product_name,product_name_ja,brands,quantity,serving_size,serving_quantity,nutriments';

  // JAN(EAN-13/8)・UPC-A のチェックディジットを検証
  function isValidBarcode(code) {
    if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
    const digits = code.split('').map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check;
  }

  const round = (v) => Math.round(v * 10) / 10;

  // Open Food Facts の商品データを食品データに変換。栄養成分がなければ null
  function toFood(product, code) {
    const nm = (product && product.nutriments) || {};
    const servingQty = parseFloat(product.serving_quantity);
    const perServing = nm['energy-kcal_serving'] != null && servingQty > 0;
    const suffix = perServing ? '_serving' : '_100g';
    const get = (key) => {
      const v = parseFloat(nm[key + suffix]);
      return Number.isFinite(v) ? v : null;
    };

    let kcal = get('energy-kcal');
    if (kcal == null && get('energy') != null) kcal = get('energy') / 4.184; // kJ → kcal
    if (kcal == null) return null;

    let salt = get('salt');
    if (salt == null && get('sodium') != null) salt = get('sodium') * 2.54;
    const mg = (key) => (get(key) == null ? 0 : round(get(key) * 1000)); // g → mg

    const name = [product.brands && product.brands.split(',')[0].trim(), product.product_name_ja || product.product_name]
      .filter(Boolean).join(' ') || `商品 ${code}`;
    const per100 = /ml|ｍｌ|l$/i.test(product.quantity || '') ? '100ml' : '100g';
    const unit = perServing ? (product.serving_size || `${servingQty}g`) : per100;

    return {
      id: 'b' + code,
      barcode: code,
      name,
      kana: '',
      unit,
      category: 'マイ食品',
      n: {
        kcal: Math.round(kcal),
        protein: round(get('proteins') || 0),
        fat: round(get('fat') || 0),
        carbs: round(get('carbohydrates') || 0),
        fiber: round(get('fiber') || 0),
        salt: round(salt || 0),
        calcium: mg('calcium'),
        iron: mg('iron'),
        vitc: mg('vitamin-c'),
      },
    };
  }

  // 戻り値: { status: 'found', food } / { status: 'no_nutrition', name } / { status: 'not_found' }
  async function lookup(code, fetchFn = fetch) {
    const res = await fetchFn(`${API}${code}.json?fields=${FIELDS}`);
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status !== 1 || !data.product) return { status: 'not_found' };
    const food = toFood(data.product, code);
    if (food) return { status: 'found', food };
    return { status: 'no_nutrition', name: data.product.product_name_ja || data.product.product_name || '' };
  }

  const api = { isValidBarcode, toFood, lookup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Products = api;
})(this);
