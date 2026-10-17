// Capacitor 用に Web ファイルを www/ にコピーする
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', 'css', 'js']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}

// アプリ版でだけ Capacitor のランタイムを読み込む
fs.copyFileSync(require.resolve('@capacitor/core/dist/capacitor.js'), path.join(out, 'js', 'capacitor.js'));
const html = path.join(out, 'index.html');
const src = fs.readFileSync(html, 'utf8');
const tag = '<script src="js/foods.js"></script>';
if (!src.includes(tag)) throw new Error('index.html に foods.js の script タグが見つかりません');
fs.writeFileSync(html, src.replace(tag, '<script src="js/capacitor.js"></script>\n  ' + tag));

console.log('built www/');
