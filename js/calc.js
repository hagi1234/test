// 目標値・採点・アドバイスの計算ロジック（DOMに依存しない純粋関数）
(function (root) {
  // kind: range = 目標の±10%が理想 / min = 目標以上が理想 / max = 目標以下が理想
  const NUTRIENTS = [
    { key: 'kcal', label: 'エネルギー', unit: 'kcal', kind: 'range', weight: 3 },
    { key: 'protein', label: 'たんぱく質', unit: 'g', kind: 'range', weight: 2 },
    { key: 'fat', label: '脂質', unit: 'g', kind: 'range', weight: 2 },
    { key: 'carbs', label: '炭水化物', unit: 'g', kind: 'range', weight: 2 },
    { key: 'fiber', label: '食物繊維', unit: 'g', kind: 'min', weight: 1 },
    { key: 'salt', label: '食塩相当量', unit: 'g', kind: 'max', weight: 1 },
    { key: 'calcium', label: 'カルシウム', unit: 'mg', kind: 'min', weight: 1 },
    { key: 'iron', label: '鉄', unit: 'mg', kind: 'min', weight: 1 },
    { key: 'vitc', label: 'ビタミンC', unit: 'mg', kind: 'min', weight: 1 },
  ];

  const ACTIVITY = { low: 1.5, mid: 1.75, high: 2.0 };
  const GOAL_DELTA = { lose_fast: -500, lose: -250, keep: 0, gain: 300 };

  // Mifflin-St Jeor式による基礎代謝
  function bmr(p) {
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return p.sex === 'male' ? base + 5 : base - 161;
  }

  function targets(p) {
    const tdee = bmr(p) * (ACTIVITY[p.activity] || ACTIVITY.mid);
    const kcal = Math.max(1200, Math.round(tdee + (GOAL_DELTA[p.goal] || 0)));
    const male = p.sex === 'male';
    return {
      kcal,
      protein: Math.round(Math.max(kcal * 0.15 / 4, p.weight * 1.0)),
      fat: Math.round(kcal * 0.25 / 9),
      carbs: Math.round(kcal * 0.6 / 4),
      fiber: male ? 21 : 18,
      salt: male ? 7.5 : 6.5,
      calcium: male ? 750 : 650,
      iron: male ? 7.5 : 10.5,
      vitc: 100,
    };
  }

  function sumEntries(entries) {
    const total = {};
    NUTRIENTS.forEach((d) => (total[d.key] = 0));
    entries.forEach((e) => {
      NUTRIENTS.forEach((d) => (total[d.key] += (e.n[d.key] || 0) * e.qty));
    });
    return total;
  }

  function clamp(v) {
    return Math.max(0, Math.min(100, v));
  }

  function nutrientScore(kind, ratio) {
    if (kind === 'min') return clamp(ratio * 100);
    if (kind === 'max') return ratio <= 1 ? 100 : clamp(100 - (ratio - 1) * 150);
    if (ratio < 0.9) return clamp(100 - (0.9 - ratio) * 150);
    if (ratio > 1.1) return clamp(100 - (ratio - 1.1) * 150);
    return 100;
  }

  function status(kind, ratio) {
    if (kind === 'max') return ratio > 1 ? 'over' : 'ok';
    if (ratio < 0.8) return 'low';
    if (kind === 'range' && ratio > 1.2) return 'over';
    return 'ok';
  }

  // 1日の栄養バランスを100点満点で採点
  function evaluate(total, target) {
    let sum = 0;
    let wsum = 0;
    const items = NUTRIENTS.map((d) => {
      const ratio = target[d.key] ? total[d.key] / target[d.key] : 0;
      const score = nutrientScore(d.kind, ratio);
      sum += score * d.weight;
      wsum += d.weight;
      return { ...d, value: total[d.key], target: target[d.key], ratio, score, status: status(d.kind, ratio) };
    });
    return { score: Math.round(sum / wsum), items };
  }

  const OVER_TIPS = {
    kcal: '揚げ物や甘い物を控え、主食の量を少し減らしてみましょう。',
    protein: '肉類が多めです。魚や大豆製品に置き換えるとバランスが良くなります。',
    fat: '揚げ物・炒め物を「焼く」「蒸す」「茹でる」調理に変えてみましょう。',
    carbs: '麺と丼の組み合わせなど、主食の重ねすぎに気をつけましょう。',
    salt: '汁物は具だくさんにして汁を残す、麺のスープを飲み干さないなどで減塩できます。',
  };

  // 不足は食品DBから含有量の多い食品をおすすめ、過剰は改善のヒント
  function advice(result, foods, limit = 3) {
    const list = [];
    result.items
      .filter((i) => i.status !== 'ok')
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .forEach((i) => {
        if (i.status === 'over') {
          list.push({ type: 'over', key: i.key, text: `${i.label}がとりすぎです。${OVER_TIPS[i.key] || ''}` });
        } else {
          const picks = foods
            .filter((f) => f.n.salt < 1.5 && f.n.kcal < 400)
            .sort((a, b) => b.n[i.key] - a.n[i.key])
            .slice(0, 3)
            .map((f) => f.name);
          list.push({ type: 'low', key: i.key, text: `${i.label}が不足しています。おすすめ: ${picks.join('、')}` });
        }
      });
    return list;
  }

  function bmi(weight, heightCm) {
    const h = heightCm / 100;
    return weight / (h * h);
  }

  const api = { NUTRIENTS, bmr, targets, sumEntries, evaluate, advice, bmi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
