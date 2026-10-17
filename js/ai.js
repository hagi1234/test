// 料理の写真から Claude API で栄養価を推定する
(function (root) {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-opus-5-5';
  const NUTRIENT_KEYS = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt', 'calcium', 'iron', 'vitc'];

  const SYSTEM = `あなたは日本の管理栄養士です。食事の写真から、写っている料理ごとに量と栄養価を推定します。
- 料理は1品ずつ分けて挙げてください（例: ごはん、味噌汁、焼き魚、サラダ）。同じ皿に盛られていても別の料理なら分けます。
- 量は器の大きさや一緒に写っている物から見積もり、「茶碗1杯(約150g)」のように日本語で書きます。
- 栄養価は日本食品標準成分表（八訂）を基準に、家庭料理として一般的な調味料・油の量を含めて推定します。
- ユーザーの補足（量や調理法など）があれば、それを優先して反映します。
- 単位: kcal はキロカロリー、protein/fat/carbs/fiber/salt はグラム、calcium/iron/vitc はミリグラム。
- 料理や飲み物が写っていない場合は is_food を false にし、dishes は空にします。
- note には推定の前提や注意点を1〜2文で書きます。`;

  const dishSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'amount', ...NUTRIENT_KEYS],
    properties: {
      name: { type: 'string', description: '料理名' },
      amount: { type: 'string', description: '推定した量' },
      ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { type: 'number' }])),
    },
  };
  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['is_food', 'dishes', 'note'],
    properties: {
      is_food: { type: 'boolean' },
      dishes: { type: 'array', items: dishSchema },
      note: { type: 'string' },
    },
  };

  function buildRequest(apiKey, imageBase64, hint) {
    const text = hint && hint.trim()
      ? `この食事の栄養価を推定してください。補足: ${hint.trim()}`
      : 'この食事の栄養価を推定してください。';
    return {
      url: API_URL,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // 拒否された場合に別モデルで自動再実行する（サーバー側フォールバック）
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          // 個人利用のアプリから自分のAPIキーで直接呼び出すため
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 16000,
          fallbacks: 'default',
          system: SYSTEM,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text },
            ],
          }],
        }),
      },
    };
  }

  function errorMessage(status, body) {
    const detail = body && body.error && body.error.message ? `（${body.error.message}）` : '';
    if (status === 401) return 'APIキーが正しくありません。設定画面で確認してください。';
    if (status === 403) return `このAPIキーでは利用できません${detail}`;
    if (status === 429) return '利用制限に達しました。しばらく待ってから再度お試しください。';
    if (status === 529 || status >= 500) return 'AIのサーバーが混み合っています。しばらく待ってから再度お試しください。';
    if (status === 400 && /credit|billing/i.test(detail)) return 'APIのクレジット残高が不足しています。';
    return `推定に失敗しました（エラー ${status}）${detail}`;
  }

  const round1 = (v) => Math.round(Math.max(0, Number(v) || 0) * 10) / 10;

  // API のレスポンスを { dishes, note } に変換。推定できなければ Error を投げる
  function parseResponse(body) {
    if (body.stop_reason === 'refusal') throw new Error('この写真は推定できませんでした。別の写真でお試しください。');
    if (body.stop_reason === 'max_tokens') throw new Error('推定結果が長すぎて途中で切れました。もう一度お試しください。');
    const block = (body.content || []).find((b) => b.type === 'text');
    if (!block) throw new Error('推定結果を受け取れませんでした。');
    let data;
    try {
      data = JSON.parse(block.text);
    } catch (e) {
      throw new Error('推定結果を読み取れませんでした。');
    }
    if (!data.is_food || !Array.isArray(data.dishes) || !data.dishes.length) {
      throw new Error('料理が写っていないようです。料理全体が写るように撮影してください。');
    }
    const dishes = data.dishes.map((d) => ({
      name: String(d.name || '料理'),
      amount: String(d.amount || '1人前'),
      n: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, k === 'kcal' ? Math.round(Number(d[k]) || 0) : round1(d[k])])),
    }));
    return { dishes, note: String(data.note || '') };
  }

  async function estimateMeal(apiKey, imageBase64, hint, fetchFn = fetch) {
    const { url, init } = buildRequest(apiKey, imageBase64, hint);
    let res;
    try {
      res = await fetchFn(url, init);
    } catch (e) {
      throw new Error('通信できませんでした。電波の良い場所で再度お試しください。');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(errorMessage(res.status, body));
    return parseResponse(body || {});
  }

  const api = { MODEL, buildRequest, parseResponse, estimateMeal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AI = api;
})(this);
