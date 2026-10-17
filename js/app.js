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
    const food = {
      id: 'c' + Date.now().toString(36),
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
    ev.target.reset();
    ev.target.closest('details').open = false;
    addEntry(food, 1);
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
  }

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
    if (!confirm('すべての記録とプロフィールを削除します。よろしいですか？')) return;
    state = { profile: null, logs: {}, weights: {}, customFoods: [] };
    save();
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
