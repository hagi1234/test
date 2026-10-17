(function () {
  'use strict';

  const STORE_KEY = 'gohan-diary-v1';
  const MEALS = [
    { key: 'breakfast', label: '朝食' },
    { key: 'lunch', label: '昼食' },
    { key: 'dinner', label: '夕食' },
    { key: 'snack', label: '間食' },
  ];
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  // Androidアプリ（Capacitor）として動いているときだけ値が入る
  const native = window.Capacitor && window.Capacitor.isNativePlatform() ? window.Capacitor : null;
  const plugins = {};
  const plugin = (name) => (plugins[name] = plugins[name] || native.registerPlugin(name));
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('ja-JP');

  // ---------- 保存データ ----------
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (data && typeof data === 'object') return { profile: null, logs: {}, weights: {}, customFoods: [], ...data };
    } catch (e) { /* 壊れたデータは初期化 */ }
    return { profile: null, logs: {}, weights: {}, customFoods: [] };
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { alert('保存に失敗しました'); }
  }

  // ---------- 日付 ----------
  function toKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fromKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const todayKey = () => toKey(new Date());
  let currentDate = todayKey();

  function shiftDate(days) {
    const d = fromKey(currentDate);
    d.setDate(d.getDate() + days);
    currentDate = toKey(d);
    renderDiary();
  }

  // ---------- 全食品（標準＋ユーザー登録） ----------
  const allFoods = () => FOODS.concat(state.customFoods);
  const entriesOf = (date) => state.logs[date] || [];

  function currentTargets() {
    return state.profile ? Calc.targets(state.profile) : null;
  }

  // ---------- 食事記録画面 ----------
  function renderDiary() {
    const d = fromKey(currentDate);
    const isToday = currentDate === todayKey();
    $('#date-label').textContent = `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})${isToday ? ' 今日' : ''}`;

    const entries = entriesOf(currentDate);
    const total = Calc.sumEntries(entries);
    const target = currentTargets();

    // 食事ごとの一覧
    $('#meals').innerHTML = MEALS.map((m) => {
      const list = entries.filter((e) => e.meal === m.key);
      const kcal = list.reduce((s, e) => s + e.n.kcal * e.qty, 0);
      const rows = list.map((e) => `
        <li>
          <div class="name">${esc(e.name)}<div class="sub">${esc(e.unit || '')} × ${e.qty}</div></div>
          <span class="kcal">${fmt(e.n.kcal * e.qty)} kcal</span>
          <button class="icon-btn" data-edit="${e.id}" aria-label="量を変更">✎</button>
          <button class="icon-btn" data-del="${e.id}" aria-label="削除">🗑</button>
        </li>`).join('');
      return `
        <div class="card">
          <div class="meal-head">
            <h2>${m.label}<span class="meal-kcal">${fmt(kcal)} kcal</span></h2>
            <button class="add-btn" data-add="${m.key}">＋ 追加</button>
          </div>
          ${rows ? `<ul class="entries">${rows}</ul>` : '<div class="empty">まだ記録がありません</div>'}
        </div>`;
    }).join('');

    // カロリー・スコア
    $('#kcal-intake').textContent = fmt(total.kcal);
    if (!target) {
      $('#kcal-target').textContent = '--';
      $('#kcal-remain').textContent = '設定画面でプロフィールを登録してください';
      $('#score-value').textContent = '--';
      $('#score-ring').style.setProperty('--p', 0);
      $('#nutrients').innerHTML = '<p class="hint">プロフィール登録後に表示されます。</p>';
      $('#advice').innerHTML = '';
      renderPfc(total);
      return;
    }
    $('#kcal-target').textContent = fmt(target.kcal);
    const remain = target.kcal - total.kcal;
    $('#kcal-remain').textContent = remain >= 0 ? `あと ${fmt(remain)} kcal 食べられます` : `${fmt(-remain)} kcal オーバーしています`;
    renderPfc(total);

    const result = Calc.evaluate(total, target);
    const hasEntries = entries.length > 0;
    $('#score-value').textContent = hasEntries ? result.score : '--';
    $('#score-ring').style.setProperty('--p', hasEntries ? result.score : 0);

    const LABEL = { low: '不足', over: '過剰', ok: '適正' };
    $('#nutrients').innerHTML = result.items.map((i) => {
      // バーは目標の150%を右端とする
      const width = Math.min(100, (i.ratio / 1.5) * 100);
      const digits = i.unit === 'kcal' ? 0 : 1;
      return `
        <div class="nutrient">
          <div class="nutrient-top">
            <span>${i.label}${hasEntries ? `<span class="tag ${i.status}">${LABEL[i.status]}</span>` : ''}</span>
            <span class="val">${fmt(i.value, digits)} / ${fmt(i.target, digits)}${i.unit}${i.kind === 'max' ? '未満' : ''}</span>
          </div>
          <div class="bar"><div class="fill-${i.status}" style="width:${width}%"></div><span class="target-mark" style="left:${100 / 1.5}%"></span></div>
        </div>`;
    }).join('');

    if (!hasEntries) {
      $('#advice').innerHTML = '<li>食事を記録すると、栄養バランスの採点とアドバイスが表示されます。</li>';
    } else {
      const tips = Calc.advice(result, allFoods());
      $('#advice').innerHTML = tips.length
        ? tips.map((t) => `<li class="${t.type}">${esc(t.text)}</li>`).join('')
        : '<li>栄養バランスはばっちりです！この調子で続けましょう。</li>';
    }
  }

  function renderPfc(total) {
    const p = total.protein * 4, f = total.fat * 9, c = total.carbs * 4;
    const sum = p + f + c;
    const pct = (v) => (sum ? Math.round((v / sum) * 100) : 0);
    $('#pfc').outerHTML = `
      <div id="pfc">
        <div class="pfc">
          <div class="c-p" style="width:${pct(p)}%"></div>
          <div class="c-f" style="width:${pct(f)}%"></div>
          <div class="c-c" style="width:${pct(c)}%"></div>
        </div>
        <div class="pfc-legend">
          <span><i class="dot c-p"></i>P ${pct(p)}%</span>
          <span><i class="dot c-f"></i>F ${pct(f)}%</span>
          <span><i class="dot c-c"></i>C ${pct(c)}%</span>
          <span>（目安 15:25:60）</span>
        </div>
      </div>`;
  }

  $('#prev-day').addEventListener('click', () => shiftDate(-1));
  $('#next-day').addEventListener('click', () => shiftDate(1));

  $('#meals').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.add) openFoodDialog(btn.dataset.add);
    if (btn.dataset.del) {
      state.logs[currentDate] = entriesOf(currentDate).filter((e) => e.id !== btn.dataset.del);
      save();
      renderDiary();
    }
    if (btn.dataset.edit) {
      const entry = entriesOf(currentDate).find((e) => e.id === btn.dataset.edit);
      if (entry) openQtyDialog(entry, entry.qty, (qty) => { entry.qty = qty; save(); renderDiary(); });
    }
  });

  // ---------- 食品追加ダイアログ ----------
  const foodDialog = $('#food-dialog');
  let addingMeal = 'breakfast';
  let activeCategory = 'すべて';

  function openFoodDialog(meal) {
    addingMeal = meal;
    $('#dialog-title').textContent = `${MEALS.find((m) => m.key === meal).label}に追加`;
    $('#food-search').value = '';
    $('#barcode-input').value = '';
    setBarcodeStatus('');
    setStatus('#label-status', '');
    resetCustomForm();
    activeCategory = 'すべて';
    renderFoodList();
    foodDialog.showModal();
  }

  function toHiragana(s) {
    return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  function renderFoodList() {
    const foods = allFoods();
    const cats = ['すべて', 'よく使う', ...new Set(foods.map((f) => f.category))];
    $('#category-chips').innerHTML = cats.map((c) => `<button type="button" class="${c === activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');

    const q = toHiragana($('#food-search').value.trim().toLowerCase());
    let list = foods;
    if (activeCategory === 'よく使う') {
      const count = {};
      Object.values(state.logs).flat().forEach((e) => { if (e.foodId) count[e.foodId] = (count[e.foodId] || 0) + 1; });
      list = foods.filter((f) => count[f.id]).sort((a, b) => count[b.id] - count[a.id]).slice(0, 20);
    } else if (activeCategory !== 'すべて') {
      list = foods.filter((f) => f.category === activeCategory);
    }
    if (q) list = list.filter((f) => toHiragana(f.name.toLowerCase()).includes(q) || (f.kana || '').includes(q));

    $('#food-list').innerHTML = list.length
      ? list.map((f) => `
        <li data-food="${f.id}">
          <div>${esc(f.name)}<div class="sub">${esc(f.unit)}・P${fmt(f.n.protein, 1)} F${fmt(f.n.fat, 1)} C${fmt(f.n.carbs, 1)}</div></div>
          <span>${fmt(f.n.kcal)} kcal</span>
        </li>`).join('')
      : '<li class="empty">該当する食品がありません</li>';
  }

  $('#food-search').addEventListener('input', renderFoodList);
  $('#category-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-cat]');
    if (!b) return;
    activeCategory = b.dataset.cat;
    renderFoodList();
  });
  $('#food-list').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-food]');
    if (!li) return;
    const food = allFoods().find((f) => f.id === li.dataset.food);
    openQtyDialog(food, 1, (qty) => addEntry(food, qty));
  });

  function addEntry(food, qty) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      meal: addingMeal,
      foodId: food.id,
      name: food.name,
      unit: food.unit,
      n: { ...food.n },
      qty,
    };
    (state.logs[currentDate] = entriesOf(currentDate)).push(entry);
    save();
    foodDialog.close();
    renderDiary();
  }

  $('#custom-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const num = (k) => Math.max(0, parseFloat(fd.get(k)) || 0);
    const barcode = fd.get('barcode');
    const food = {
      id: 'c' + Date.now().toString(36),
      ...(barcode ? { barcode } : {}),
      name: fd.get('name').trim(),
      kana: '',
      unit: fd.get('unit').trim() || '1食',
      category: 'マイ食品',
      n: {
        kcal: num('kcal'), protein: num('protein'), fat: num('fat'), carbs: num('carbs'),
        fiber: num('fiber'), salt: num('salt'), calcium: num('calcium'), iron: num('iron'), vitc: num('vitc'),
      },
    };
    state.customFoods.push(food);
    resetCustomForm();
    addEntry(food, 1);
  });

  function resetCustomForm() {
    const form = $('#custom-form');
    form.reset();
    form.elements.barcode.value = ''; // hidden は reset で消えない
    form.closest('details').open = false;
  }

  // ---------- バーコード検索 ----------
  function setBarcodeStatus(text) {
    $('#barcode-status').textContent = text;
    $('#barcode-status').hidden = !text;
  }

  async function searchBarcode(raw) {
    const code = String(raw).trim();
    if (!Products.isValidBarcode(code)) {
      setBarcodeStatus('バーコードの数字が正しくありません（8桁または13桁）');
      return;
    }
    $('#barcode-input').value = code;

    // 一度登録・検索した商品は端末内から呼び出す
    const saved = state.customFoods.find((f) => f.barcode === code);
    if (saved) {
      setBarcodeStatus('');
      openQtyDialog(saved, 1, (q) => addEntry(saved, q));
      return;
    }

    setBarcodeStatus('商品を検索しています…');
    let result;
    try {
      result = await Products.lookup(code);
    } catch (e) {
      result = { status: 'error' };
    }
    if (result.status === 'found') {
      state.customFoods.push(result.food);
      save();
      setBarcodeStatus('');
      openQtyDialog(result.food, 1, (q) => addEntry(result.food, q));
      return;
    }

    // 見つからない場合は、バーコード付きでマイ食品登録へ
    const form = $('#custom-form');
    form.elements.barcode.value = code;
    if (result.name) form.elements.name.value = result.name;
    form.closest('details').open = true;
    setBarcodeStatus({
      error: '通信できませんでした。電波の良い場所で再度お試しいただくか、下のフォームから登録してください。',
      no_nutrition: '商品は見つかりましたが栄養成分が未登録です。パッケージの栄養成分表示を見て登録してください。',
      not_found: '商品が見つかりませんでした。パッケージの栄養成分表示を見て登録すると、次回からスキャンで呼び出せます。',
    }[result.status]);
    form.elements.name.focus();
  }

  $('#barcode-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    searchBarcode($('#barcode-input').value);
  });

  if (native) {
    $('#scan-btn').hidden = false;
    $('#scan-btn').addEventListener('click', scanBarcode);
  }

  let installListening = false;
  async function scanBarcode() {
    const Scanner = plugin('BarcodeScanner');
    try {
      // Google のスキャナーモジュールは初回に Play 開発者サービス経由でダウンロードが必要
      const { available } = await Scanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        setBarcodeStatus('スキャナーを準備しています…（初回のみ）');
        if (!installListening) Scanner.addListener('googleBarcodeScannerModuleInstallProgress', (ev) => {
          if (ev.state === 4) setBarcodeStatus('準備ができました。もう一度「📷 バーコード」を押してください。');
          else if (ev.state === 3 || ev.state === 5) setBarcodeStatus('スキャナーの準備に失敗しました。通信環境を確認して再度お試しください。');
          else if (ev.progress != null) setBarcodeStatus(`スキャナーを準備しています… ${ev.progress}%`);
        });
        installListening = true;
        await Scanner.installGoogleBarcodeScannerModule();
        return;
      }
      const { barcodes } = await Scanner.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A'] });
      if (barcodes.length) searchBarcode(barcodes[0].rawValue);
    } catch (e) {
      if (!/cancel/i.test(e && e.message)) setBarcodeStatus('スキャンできませんでした。数字を入力して検索することもできます。');
    }
  }

  // ---------- 写真 ----------
  function setStatus(sel, text) {
    $(sel).textContent = text;
    $(sel).hidden = !text;
  }

  // 写真を1枚選んでもらう。アプリ版は { uri, webPath }、Web版は { webPath } を返す。キャンセル時は null
  const sourceDialog = $('#source-dialog');
  function pickPhoto() {
    if (!native) {
      return new Promise((resolve) => {
        const input = $('#photo-input');
        input.value = '';
        input.onchange = () => resolve(input.files[0] ? { webPath: URL.createObjectURL(input.files[0]) } : null);
        input.click();
      });
    }
    return new Promise((resolve) => {
      let chosen = false;
      sourceDialog.querySelectorAll('[data-source]').forEach((b) => {
        b.onclick = async () => {
          chosen = true;
          sourceDialog.close();
          try {
            const Camera = plugin('Camera');
            const photo = b.dataset.source === 'camera'
              ? await Camera.takePhoto({ quality: 90 })
              : (await Camera.chooseFromGallery({ quality: 90 })).results[0];
            resolve(photo ? { uri: photo.uri, webPath: photo.webPath } : null);
          } catch (e) {
            if (!/cancel/i.test(e && e.message)) alert('写真を取得できませんでした');
            resolve(null);
          }
        };
      });
      sourceDialog.onclose = () => { if (!chosen) resolve(null); };
      sourceDialog.showModal();
    });
  }

  // 長辺を maxSize px に縮小した JPEG の base64（data: の接頭辞なし）
  function photoToBase64(webPath, maxSize = 1280) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = webPath;
    });
  }

  // ---------- 栄養成分表示の読み取り（アプリ版のみ） ----------
  if (native) {
    $('#label-scan-btn').hidden = false;
    $('#label-scan-btn').addEventListener('click', scanLabel);
  }

  async function scanLabel() {
    const photo = await pickPhoto();
    if (!photo) return;
    setStatus('#label-status', '文字を読み取っています…');
    let parsed;
    try {
      const { text } = await plugin('TextRecognition').processImage({ path: photo.uri, script: 'JAPANESE' });
      parsed = Label.parseNutritionLabel(text);
    } catch (e) {
      setStatus('#label-status', '読み取りに失敗しました。もう一度お試しください。');
      return;
    }
    if (!parsed.found.length) {
      setStatus('#label-status', '栄養成分を読み取れませんでした。明るい場所で、表示の部分だけを大きく写してください。');
      return;
    }
    const form = $('#custom-form');
    Object.entries(parsed.n).forEach(([k, v]) => { if (v != null) form.elements[k].value = v; });
    if (parsed.unit) form.elements.unit.value = parsed.unit;
    setStatus('#label-status', `${parsed.found.length}項目を読み取りました。写真と見比べて、数値が合っているか確認してから登録してください。`);
    (form.elements.name.value ? form.elements.kcal : form.elements.name).focus();
  }

  // ---------- 料理写真からの推定 ----------
  const APIKEY_STORE = 'gohan-diary-apikey'; // バックアップ（エクスポート）には含めない
  function getApiKey() {
    try { return localStorage.getItem(APIKEY_STORE) || ''; } catch (e) { return ''; }
  }

  const mealDialog = $('#meal-dialog');
  let mealPhoto = null;
  let mealDishes = [];

  $('#meal-photo-btn').addEventListener('click', async () => {
    if (!getApiKey()) {
      if (confirm('この機能には Claude API のAPIキーが必要です。設定画面を開きますか？')) {
        foodDialog.close();
        showView('settings');
        $('#apikey-input').focus();
      }
      return;
    }
    const photo = await pickPhoto();
    if (!photo) return;
    mealPhoto = photo;
    mealDishes = [];
    $('#meal-preview').src = photo.webPath;
    $('#meal-hint').value = '';
    $('#meal-results').innerHTML = '';
    setStatus('#meal-status', '');
    setStatus('#meal-note', '');
    $('#meal-add-btn').hidden = true;
    $('#meal-estimate-btn').disabled = false;
    mealDialog.showModal();
  });

  $('#meal-estimate-btn').addEventListener('click', async () => {
    const btn = $('#meal-estimate-btn');
    btn.disabled = true;
    $('#meal-results').innerHTML = '';
    $('#meal-add-btn').hidden = true;
    setStatus('#meal-note', '');
    setStatus('#meal-status', 'AIが推定しています…（10〜30秒ほどかかります）');
    try {
      const base64 = await photoToBase64(mealPhoto.webPath);
      const result = await AI.estimateMeal(getApiKey(), base64, $('#meal-hint').value);
      mealDishes = result.dishes;
      renderMealResults();
      setStatus('#meal-status', '');
      setStatus('#meal-note', result.note ? `メモ: ${result.note}` : '');
    } catch (e) {
      setStatus('#meal-status', e.message);
    }
    btn.disabled = false;
    btn.textContent = '再推定';
  });

  function renderMealResults() {
    const rows = mealDishes.map((d, i) => `
      <li><label>
        <input type="checkbox" data-dish="${i}" checked>
        <div class="name">${esc(d.name)}<div class="sub">${esc(d.amount)}・P${fmt(d.n.protein, 1)} F${fmt(d.n.fat, 1)} C${fmt(d.n.carbs, 1)}・塩分${fmt(d.n.salt, 1)}g</div></div>
        <span>${fmt(d.n.kcal)} kcal</span>
      </label></li>`).join('');
    const total = mealDishes.reduce((s, d) => s + d.n.kcal, 0);
    $('#meal-results').innerHTML = rows + `<li class="meal-total">合計 ${fmt(total)} kcal</li>`;
    $('#meal-add-btn').hidden = false;
  }

  $('#meal-add-btn').addEventListener('click', () => {
    const picked = [...$('#meal-results').querySelectorAll('input[data-dish]:checked')].map((c) => mealDishes[c.dataset.dish]);
    if (!picked.length) return;
    const list = (state.logs[currentDate] = entriesOf(currentDate));
    picked.forEach((d, i) => list.push({
      id: Date.now().toString(36) + i + Math.random().toString(36).slice(2, 6),
      meal: addingMeal,
      name: d.name,
      unit: d.amount + '（AI推定）',
      n: { ...d.n },
      qty: 1,
    }));
    save();
    mealDialog.close();
    foodDialog.close();
    renderDiary();
  });

  // ---------- 量の選択ダイアログ ----------
  const qtyDialog = $('#qty-dialog');
  let qty = 1, qtyFood = null, qtyCallback = null;

  function openQtyDialog(food, initial, cb) {
    qtyFood = food;
    qty = initial;
    qtyCallback = cb;
    $('#qty-title').textContent = food.name;
    $('#qty-unit').textContent = `1 = ${food.unit}`;
    updateQty();
    qtyDialog.showModal();
  }
  function updateQty() {
    $('#qty-value').textContent = qty;
    $('#qty-kcal').textContent = `${fmt(qtyFood.n.kcal * qty)} kcal`;
  }
  $('#qty-minus').addEventListener('click', () => { qty = Math.max(0.25, qty - (qty <= 1 ? 0.25 : 0.5)); updateQty(); });
  $('#qty-plus').addEventListener('click', () => { qty = Math.min(10, qty + (qty < 1 ? 0.25 : 0.5)); updateQty(); });
  $('#qty-ok').addEventListener('click', () => {
    qtyDialog.close();
    qtyCallback(qty);
  });

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // ---------- 体重 ----------
  function renderWeight() {
    const entries = Object.entries(state.weights).sort(([a], [b]) => a.localeCompare(b));
    const p = state.profile;
    const latest = entries.length ? entries[entries.length - 1][1] : p && p.weight;

    const stats = [];
    if (latest) stats.push(['現在', `${fmt(latest, 1)} kg`]);
    if (p && latest) {
      stats.push(['BMI', fmt(Calc.bmi(latest, p.height), 1)]);
      const diff = latest - p.targetWeight;
      stats.push(['目標まで', diff > 0 ? `あと ${fmt(diff, 1)} kg` : '達成！']);
    }
    if (entries.length >= 2) {
      const change = latest - entries[0][1];
      stats.push(['記録開始から', `${change > 0 ? '+' : ''}${fmt(change, 1)} kg`]);
    }
    $('#weight-stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><small>${k}</small><strong>${v}</strong></div>`).join('');

    $('#weight-chart').innerHTML = entries.length >= 2 ? weightChart(entries.slice(-30), p && p.targetWeight) : '<p class="hint">2日分以上記録するとグラフが表示されます。</p>';

    $('#weight-list').innerHTML = entries.slice().reverse().slice(0, 30).map(([d, w]) => `
      <li><span>${d.replace(/-/g, '/')}</span><span>${fmt(w, 1)} kg <button class="icon-btn" data-wdel="${d}" aria-label="削除">🗑</button></span></li>`).join('')
      || '<li class="empty">記録がありません</li>';
  }

  function weightChart(entries, goal) {
    const W = 320, H = 160, pad = { l: 34, r: 10, t: 10, b: 22 };
    const values = entries.map((e) => e[1]).concat(goal ? [goal] : []);
    let min = Math.min(...values), max = Math.max(...values);
    if (max - min < 2) { min -= 1; max += 1; }
    const x = (i) => pad.l + (i / (entries.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
    const pts = entries.map((e, i) => `${x(i).toFixed(1)},${y(e[1]).toFixed(1)}`).join(' ');
    const label = (k) => k.slice(5).replace('-', '/');
    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重の推移">
        <text x="2" y="${y(max) + 4}">${fmt(max, 1)}</text>
        <text x="2" y="${y(min) + 4}">${fmt(min, 1)}</text>
        ${goal ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}" stroke="#e05050" stroke-dasharray="4 3" stroke-width="1"/>
        <text x="${W - pad.r}" y="${y(goal) - 3}" text-anchor="end">目標 ${fmt(goal, 1)}</text>` : ''}
        <polyline points="${pts}" fill="none" stroke="#2fa36b" stroke-width="2"/>
        ${entries.map((e, i) => `<circle cx="${x(i)}" cy="${y(e[1])}" r="2.5" fill="#2fa36b"/>`).join('')}
        <text x="${pad.l}" y="${H - 6}">${label(entries[0][0])}</text>
        <text x="${W - pad.r}" y="${H - 6}" text-anchor="end">${label(entries[entries.length - 1][0])}</text>
      </svg>`;
  }

  $('#weight-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const w = parseFloat($('#weight-value').value);
    if (!w) return;
    state.weights[$('#weight-date').value] = w;
    if (state.profile && $('#weight-date').value >= latestWeightDate()) state.profile.weight = w; // 目標カロリーを最新体重で再計算
    save();
    $('#weight-value').value = '';
    renderWeight();
  });
  function latestWeightDate() {
    return Object.keys(state.weights).sort().pop() || '';
  }
  $('#weight-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-wdel]');
    if (!b) return;
    delete state.weights[b.dataset.wdel];
    save();
    renderWeight();
  });

  // ---------- 設定 ----------
  const profileForm = $('#profile-form');

  function renderSettings() {
    const p = state.profile;
    $('#onboarding-hint').hidden = !!p;
    if (p) Object.entries(p).forEach(([k, v]) => { if (profileForm.elements[k]) profileForm.elements[k].value = v; });
    const t = currentTargets();
    $('#target-info').innerHTML = t ? [
      ['基礎代謝', `${fmt(Calc.bmr(p))} kcal`],
      ['目標摂取カロリー', `${fmt(t.kcal)} kcal`],
      ['たんぱく質', `${t.protein} g`],
      ['脂質', `${t.fat} g`],
      ['炭水化物', `${t.carbs} g`],
    ].map(([k, v]) => `<div class="stat"><small>${k}</small><strong>${v}</strong></div>`).join('') : '';
    renderApiKey();
  }

  function renderApiKey() {
    const key = getApiKey();
    $('#apikey-input').value = key;
    $('#apikey-status').textContent = key
      ? `設定済みです。1枚の推定に数円程度かかります（モデル: ${AI.MODEL}）。`
      : '未設定です。';
  }
  $('#apikey-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const key = $('#apikey-input').value.trim();
    try {
      if (key) localStorage.setItem(APIKEY_STORE, key);
      else localStorage.removeItem(APIKEY_STORE);
    } catch (e) {
      alert('保存に失敗しました');
    }
    renderApiKey();
  });

  profileForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(profileForm);
    state.profile = {
      sex: fd.get('sex'),
      age: parseInt(fd.get('age'), 10),
      height: parseFloat(fd.get('height')),
      weight: parseFloat(fd.get('weight')),
      targetWeight: parseFloat(fd.get('targetWeight')),
      activity: fd.get('activity'),
      goal: fd.get('goal'),
    };
    if (!Object.keys(state.weights).length) state.weights[todayKey()] = state.profile.weight;
    save();
    renderSettings();
    showView('diary');
  });

  $('#export-btn').addEventListener('click', async () => {
    const json = JSON.stringify(state, null, 2);
    const filename = `gohan-diary-${todayKey()}.json`;
    if (native) {
      // アプリ版はダウンロードできないので、ファイルを作って共有メニューから保存する
      try {
        const { uri } = await plugin('Filesystem').writeFile({ path: filename, data: json, directory: 'CACHE', encoding: 'utf8' });
        await plugin('Share').share({ title: 'ごはん日記のバックアップ', files: [uri] });
      } catch (e) {
        if (!/cancel/i.test(e && e.message)) alert('エクスポートに失敗しました');
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.logs !== 'object') throw new Error('invalid');
      state = { profile: null, logs: {}, weights: {}, customFoods: [], ...data };
      save();
      alert('インポートしました');
      renderAll();
    } catch (e) {
      alert('ファイルを読み込めませんでした');
    }
    ev.target.value = '';
  });
  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('すべての記録・プロフィール・APIキーを削除します。よろしいですか？')) return;
    state = { profile: null, logs: {}, weights: {}, customFoods: [] };
    save();
    try { localStorage.removeItem(APIKEY_STORE); } catch (e) { /* 何もしない */ }
    renderAll();
    showView('settings');
  });

  // ---------- タブ ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'diary') renderDiary();
    if (name === 'weight') { $('#weight-date').value = todayKey(); renderWeight(); }
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  function renderAll() {
    renderDiary();
    renderWeight();
    renderSettings();
  }

  // Androidの戻るボタン: ダイアログ → 食事タブ → アプリ終了 の順に戻る
  if (native) {
    const App = plugin('App');
    App.addListener('backButton', () => {
      const open = document.querySelector('dialog[open]');
      if (open) open.close();
      else if ($('#view-diary').hidden) showView('diary');
      else App.exitApp();
    });
  }

  renderAll();
  showView(state.profile ? 'diary' : 'settings');
})();
