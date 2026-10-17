// 栄養成分表示を文字認識（OCR）したテキストから数値を取り出す
(function (root) {
  const NUM = '(\\d+(?:\\.\\d+)?)';
  // 値の単位: エネルギーは kcal、それ以外は g / mg
  const FIELDS = [
    { key: 'kcal', label: 'エネルギー|エネルギ一|熱量', units: ['kcal'] },
    { key: 'protein', label: 'たんぱく質|タンパク質|蛋白質|たん白質', units: ['g'] },
    { key: 'fat', label: '脂質', units: ['g'] },
    { key: 'carbs', label: '炭水化物', units: ['g'] },
    { key: 'sugar', label: '糖質', units: ['g'] },
    { key: 'fiber', label: '食物繊維', units: ['g'] },
    { key: 'salt', label: '食塩相当量|食塩', units: ['g'] },
    { key: 'sodium', label: 'ナトリウム', units: ['mg', 'g'] },
    { key: 'calcium', label: 'カルシウム', units: ['mg'] },
    { key: 'iron', label: '鉄', units: ['mg'] },
    { key: 'vitc', label: 'ビタミンC', units: ['mg'] },
  ];

  // 全角→半角、OCRの誤認識しやすい文字の補正、数字まわりの空白除去
  function normalize(text) {
    return text
      .normalize('NFKC')
      .replace(/[ \t]+/g, ' ')
      .replace(/(\d) +(?=[\d.])/g, '$1')
      .replace(/(\d)\. +(?=\d)/g, '$1.')
      .replace(/(\d),(\d{3})(?!\d)/g, '$1$2') // 1,200 → 1200
      .replace(/(\d),(\d)/g, '$1.$2') // 4,9 → 4.9
      .replace(/(\d)[oO](?=\s*(?:g|mg|kcal))/g, '$10')
      .replace(/k\s*c\s*a\s*[lI1]/gi, 'kcal')
      .replace(/m\s+g/g, 'mg');
  }

  const unitRe = (units) => units.map((u) => (u === 'g' ? 'g(?!\\w)' : u)).join('|');

  function parseNutritionLabel(rawText) {
    const text = normalize(rawText || '');
    const values = {};
    const used = []; // 行内で使った数値の位置

    // 1) 「たんぱく質 10.5g」のように同じ行に並んでいるもの
    FIELDS.forEach((f) => {
      const re = new RegExp(`(?:${f.label})[^\\d\\n]{0,12}?${NUM}\\s*(${unitRe(f.units)})`);
      const m = re.exec(text);
      if (!m) return;
      values[f.key] = { value: parseFloat(m[1]), unit: m[2] };
      used.push(m.index + m[0].lastIndexOf(m[1]));
    });

    // 2) 表の列が分かれて「項目名の列」「数値の列」の順に読まれた場合は、順番で対応づける
    const missing = FIELDS
      .filter((f) => !values[f.key])
      .map((f) => ({ f, at: text.search(new RegExp(f.label)) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (missing.length) {
      const firstLabel = missing[0].at;
      const tokens = [];
      const tokenRe = new RegExp(`${NUM}\\s*(kcal|mg|g(?!\\w))`, 'g');
      let m;
      while ((m = tokenRe.exec(text))) {
        if (m.index > firstLabel && !used.includes(m.index) && !/当たり|あたり/.test(text.slice(m.index, m.index + m[0].length + 6))) {
          tokens.push({ value: parseFloat(m[1]), unit: m[2] });
        }
      }
      if (tokens.length >= missing.length && missing.every((x, i) => x.f.units.includes(tokens[i].unit))) {
        missing.forEach((x, i) => (values[x.f.key] = tokens[i]));
      }
    }

    const get = (k) => (values[k] ? values[k].value : null);
    let carbs = get('carbs');
    if (carbs == null && get('sugar') != null) carbs = get('sugar') + (get('fiber') || 0);
    let salt = get('salt');
    if (salt == null && values.sodium) {
      const mg = values.sodium.unit === 'g' ? values.sodium.value * 1000 : values.sodium.value;
      salt = Math.round((mg * 2.54) / 100) / 10;
    }

    // 「1食(78g)当たり」「100gあたり」などの基準量
    let unit = '';
    const per = /([^\n。:]{1,20}?)\s*(?:当たり|あたり)/.exec(text);
    if (per) {
      unit = per[1].replace(/^.*表示/, '').replace(/^[\s(【\[]+/, '').trim();
      // 「(100g当たり)」の開きかっこは消えたので、対になっていない閉じかっこも消す
      const count = (re) => (unit.match(re) || []).length;
      while (count(/\)/g) > count(/\(/g) && /\)$/.test(unit)) unit = unit.slice(0, -1);
    }

    const n = {
      kcal: get('kcal'), protein: get('protein'), fat: get('fat'), carbs,
      fiber: get('fiber'), salt, calcium: get('calcium'), iron: get('iron'), vitc: get('vitc'),
    };
    const found = Object.keys(n).filter((k) => n[k] != null);
    return { unit, n, found };
  }

  const api = { parseNutritionLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Label = api;
})(this);
