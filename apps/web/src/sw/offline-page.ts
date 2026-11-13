export interface OfflineStrings {
  title: string
  body: string
  retry: string
  saved: string
  none: string
  openSaved: string
  settings: string
}

/** The offline page's few sentences. A worker has no message catalog, so the ten languages live here. */
export const OFFLINE_STRINGS: Record<string, OfflineStrings> = {
  en: {
    title: 'You are offline',
    body: 'Radar could not reach the network, so this page is not available. Reading Dash needs a connection. Your saved items and settings are on this device.',
    retry: 'Try again',
    saved: 'Saved on this device',
    none: 'Nothing saved yet.',
    openSaved: 'Open saved items',
    settings: 'Settings',
  },
  de: {
    title: 'Du bist offline',
    body: 'Radar konnte das Netzwerk nicht erreichen, daher ist diese Seite nicht verfügbar. Dash zu lesen braucht eine Verbindung. Deine gespeicherten Einträge und Einstellungen liegen auf diesem Gerät.',
    retry: 'Erneut versuchen',
    saved: 'Auf diesem Gerät gespeichert',
    none: 'Noch nichts gespeichert.',
    openSaved: 'Gespeicherte Einträge öffnen',
    settings: 'Einstellungen',
  },
  fr: {
    title: 'Vous êtes hors ligne',
    body: 'Radar n’a pas pu joindre le réseau, cette page n’est donc pas disponible. Lire Dash demande une connexion. Vos éléments enregistrés et vos réglages sont sur cet appareil.',
    retry: 'Réessayer',
    saved: 'Enregistrés sur cet appareil',
    none: 'Rien d’enregistré pour l’instant.',
    openSaved: 'Ouvrir les éléments enregistrés',
    settings: 'Réglages',
  },
  es: {
    title: 'Estás sin conexión',
    body: 'Radar no pudo conectarse a la red, así que esta página no está disponible. Leer Dash necesita conexión. Tus elementos guardados y tus ajustes están en este dispositivo.',
    retry: 'Reintentar',
    saved: 'Guardado en este dispositivo',
    none: 'Todavía no hay nada guardado.',
    openSaved: 'Abrir elementos guardados',
    settings: 'Ajustes',
  },
  pt: {
    title: 'Você está offline',
    body: 'O Radar não conseguiu acessar a rede, então esta página não está disponível. Ler a Dash exige conexão. Seus itens salvos e suas configurações estão neste dispositivo.',
    retry: 'Tentar novamente',
    saved: 'Salvos neste dispositivo',
    none: 'Nada salvo ainda.',
    openSaved: 'Abrir itens salvos',
    settings: 'Configurações',
  },
  ja: {
    title: 'オフラインです',
    body: 'Radar がネットワークに接続できないため、このページは表示できません。Dash の情報を読むには接続が必要です。保存した項目と設定はこの端末にあります。',
    retry: '再試行',
    saved: 'この端末に保存した項目',
    none: '保存した項目はまだありません。',
    openSaved: '保存した項目を開く',
    settings: '設定',
  },
  zh: {
    title: '您已离线',
    body: 'Radar 无法连接网络，因此无法显示此页面。读取 Dash 需要网络连接。您保存的项目和设置都在此设备上。',
    retry: '重试',
    saved: '保存在此设备上',
    none: '还没有保存任何内容。',
    openSaved: '打开已保存项目',
    settings: '设置',
  },
  ru: {
    title: 'Нет подключения',
    body: 'Radar не смог связаться с сетью, поэтому эта страница недоступна. Чтобы читать данные Dash, нужно подключение. Сохранённые элементы и настройки хранятся на этом устройстве.',
    retry: 'Повторить',
    saved: 'Сохранено на этом устройстве',
    none: 'Пока ничего не сохранено.',
    openSaved: 'Открыть сохранённое',
    settings: 'Настройки',
  },
  tr: {
    title: 'Çevrimdışısınız',
    body: 'Radar ağa ulaşamadı, bu yüzden bu sayfa kullanılamıyor. Dash’i okumak için bağlantı gerekir. Kayıtlı öğeleriniz ve ayarlarınız bu cihazda duruyor.',
    retry: 'Yeniden dene',
    saved: 'Bu cihazda kayıtlı',
    none: 'Henüz kayıtlı bir şey yok.',
    openSaved: 'Kayıtlı öğeleri aç',
    settings: 'Ayarlar',
  },
  uk: {
    title: 'Немає з’єднання',
    body: 'Radar не зміг зв’язатися з мережею, тому ця сторінка недоступна. Щоб читати дані Dash, потрібне з’єднання. Збережені елементи й налаштування зберігаються на цьому пристрої.',
    retry: 'Спробувати ще раз',
    saved: 'Збережено на цьому пристрої',
    none: 'Поки що нічого не збережено.',
    openSaved: 'Відкрити збережене',
    settings: 'Налаштування',
  },
}

const escapeScript = (json: string): string => json.replace(/</g, '\\u003c')

/**
 * The page a failed navigation gets. It is plain HTML with no link to a script or style of the app: those may be
 * exactly what could not load. The script only reads `localStorage` (`radar.locale`, `radar.saved`) and builds the
 * list with `textContent`, so nothing a user saved is ever parsed as markup.
 */
export function offlineHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Radar</title>
<style>
:root{--bg:#f6f8f9;--ink:#10202b;--ink2:#4b5c68;--line:#d4dde2;--accent:#0b6f8f}
@media (prefers-color-scheme:dark){:root{--bg:#0c1820;--ink:#e8eef2;--ink2:#9db0bc;--line:#223641;--accent:#5cc3e0}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:40rem;margin:0 auto;padding:2.5rem 1rem}
h1{font-size:1.6rem;margin:0 0 .5rem}h2{font-size:1.1rem;margin:2rem 0 .5rem}
p{color:var(--ink2)}a{color:var(--accent)}
ul{list-style:none;padding:0;margin:0}li{padding:.5rem 0;border-top:1px solid var(--line);overflow-wrap:anywhere}
button{font:inherit;padding:.5rem 1rem;border:1px solid var(--line);border-radius:.5rem;background:transparent;color:var(--ink);cursor:pointer}
.row{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
</style>
</head>
<body>
<main data-offline-page>
<h1 id="t"></h1>
<p id="b"></p>
<p class="row"><button id="r" type="button"></button><a id="s" href="/settings"></a></p>
<h2 id="h"></h2>
<ul id="l"></ul>
<p><a id="o" href="/saved"></a></p>
</main>
<script>
(function(){
var S=${escapeScript(JSON.stringify(OFFLINE_STRINGS))};
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
var code=(get('radar.locale')||navigator.language||'en').toLowerCase().split('-')[0];
var s=S[code]||S.en;
document.documentElement.lang=S[code]?code:'en';
document.getElementById('t').textContent=s.title;
document.getElementById('b').textContent=s.body;
document.getElementById('r').textContent=s.retry;
document.getElementById('r').onclick=function(){location.reload()};
document.getElementById('s').textContent=s.settings;
document.getElementById('h').textContent=s.saved;
document.getElementById('o').textContent=s.openSaved;
var KINDS={identity:'identity',contract:'contract',token:'token'};
var items=[];try{items=JSON.parse(get('radar.saved')||'[]')}catch(e){}
var list=document.getElementById('l');
var shown=0;
if(Array.isArray(items))for(var i=0;i<items.length&&shown<30;i++){
var it=items[i];
if(!it||typeof it.id!=='string'||!KINDS[it.kind]||typeof it.net!=='string'||!/^[a-z0-9-]+$/.test(it.net))continue;
var li=document.createElement('li');var a=document.createElement('a');
a.href='/'+KINDS[it.kind]+'/'+encodeURIComponent(it.id)+(it.net==='mainnet'?'':'?network='+encodeURIComponent(it.net));
a.textContent=typeof it.label==='string'&&it.label?it.label:it.id;
li.appendChild(a);list.appendChild(li);shown++}
if(!shown){var n=document.createElement('li');n.textContent=s.none;list.appendChild(n)}
})();
</script>
</body>
</html>`
}

export function offlineResponse(): Response {
  return new Response(offlineHtml(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  })
}
