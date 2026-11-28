
(function(){
  var devPreviewToken = new URLSearchParams(location.search).get("dolaryDevPreview");
  async function loadDevPreviewConfig(){
    if(!devPreviewToken) return null;
    try{
      var r=await fetch("https://dolary.aehmnazar-1234533.workers.dev/api/dev/preview-config?token="+encodeURIComponent(devPreviewToken),{cache:"no-store",credentials:"omit",mode:"cors",referrerPolicy:"no-referrer"});
      if(!r.ok) return null;
      var d=await r.json();
      return d&&d.ok&&d.config?d.config:null;
    }catch(_){return null;}
  }

  'use strict';
  function bootWithConfig(){ start(); }
  function start(){  var isStandalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||(window.matchMedia&&window.matchMedia('(display-mode: fullscreen)').matches)||window.navigator.standalone===true;
  var previewParams=new URLSearchParams(location.search);
  var devPreview=Boolean(previewParams.get('dolaryDevPreview'));
  if(devPreview)document.documentElement.dataset.dolaryPreviewDevice=previewParams.get('dolaryDevice')||'generic';
  if(!devPreview&&!isStandalone)return;

  var app=document.createElement('div');
  app.id='pwaApp';
  app.className='pwa-only';
  app.innerHTML=`
    <header class="pwa-topbar">
      <div class="pwa-brand"><img src="./dolary-mark.svg" alt="دولاري"><div class="pwa-brand-copy"><small>أسعار السوق</small><strong>دولاري</strong></div></div>
      <div class="pwa-top-actions">
        <button type="button" class="pwa-icon-btn pwa-bell" id="pwaNotificationBell" aria-label="التنبيهات"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span class="pwa-badge" id="pwaNotificationCount">0</span></button>
        <button type="button" class="pwa-icon-btn" id="pwaRefreshBtn" aria-label="تحديث الأسعار"><svg viewBox="0 0 24 24"><path d="M20 11a8.1 8.1 0 0 0-14.9-3.9L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8.1 8.1 0 0 0 14.9 3.9L21 14"/><path d="M21 20v-6h-6"/></svg></button>
      </div>
    </header>
    <main class="pwa-main">
      <section class="pwa-screen active" id="pwaHomeScreen">
        <div class="pwa-hero"><div class="pwa-hero-glow"></div><div class="pwa-hero-coin">$</div><div class="pwa-hero-top"><span class="pwa-live"><i></i> سعر السوق</span><span class="pwa-hero-unit">لكل 100 دولار</span></div>
          <div class="pwa-province-row"><div><div class="pwa-province-label">المحافظة</div><div class="pwa-province-name" id="pwaProvinceName">بغداد</div></div><select class="pwa-province-select" id="pwaProvinceSelect" aria-label="اختيار المحافظة"></select></div>
          <div class="pwa-rate-label">سعر الدولار</div><div class="pwa-rate-value" id="pwaRateValue">— <small>د.ع / 100 USD</small></div>
          <div class="pwa-rate-meta"><span id="pwaUpdatedText">بانتظار البيانات</span><span>XEIQD — السوق الموازي</span></div>
        </div>
        <button type="button" class="pwa-share-price-trigger" id="pwaSharePriceTrigger" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M5 12v7h14v-7"></path></svg>
          <span>مشاركة السعر</span>
        </button>
        <section class="daily-share-section pwa-daily-card-section" id="pwaDailyCard" hidden>
          <div class="daily-share-panel">
            <div class="daily-share-head"><div><h2>بطاقة دولاري اليومية</h2><p>نفس بطاقة تطبيق دولاري، جاهزة للمشاركة</p></div><span class="daily-share-tag">تتحدث تلقائياً</span></div>
            <div class="daily-share-frame"><canvas id="pwaDailyShareCanvas" class="daily-share-canvas" width="1080" height="1350" role="img" aria-label="بطاقة سعر الدولار اليومية من دولاري"></canvas></div>
            <button type="button" class="daily-share-button" id="pwaShareDailyCard">شارك بطاقة اليوم　↗</button>
            <small class="daily-share-note">صورة جاهزة للواتساب والقصص · السعر استرشادي حسب آخر قراءة متاحة</small>
          </div>
        </section>
        <div class="pwa-section-title"><div><h2>آخر الأسعار</h2><p>المحافظات المتاحة من المصدر</p></div></div><div class="pwa-list" id="pwaHomeRates"></div>
      </section>
      <section class="pwa-screen" id="pwaFavoritesScreen"><div class="pwa-title-row"><div><h2>المفضلة</h2><p>المحافظات التي تتابع أسعارها بسرعة</p></div><div class="pwa-title-icon"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9 4.5 4.4-1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg></div></div><div class="pwa-list" id="pwaFavoritesList"></div></section>
      <section class="pwa-screen" id="pwaCalculatorScreen"><div class="pwa-title-row"><div><h2>الحاسبة</h2><p>تحويل واضح وسريع للدولار والدينار</p></div><div class="pwa-title-icon"><svg viewBox="0 0 24 24"><rect x="5" y="2.8" width="14" height="18.4" rx="2.8"></rect><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.2h.01M12 18.2h.01M15.5 18.2h.01"></path></svg></div></div>
        <div class="pwa-calc-card"><div class="pwa-seg" id="pwaCalcDirection"><button type="button" data-dir="usd" class="active">دولار ← دينار</button><button type="button" data-dir="iqd">دينار ← دولار</button></div><label class="pwa-field-label" for="pwaCalcAmount">المبلغ</label><div class="pwa-input-wrap"><input id="pwaCalcAmount" type="text" inputmode="decimal" autocomplete="off" value="100"><span id="pwaCalcUnit">USD</span></div><div class="pwa-result"><span id="pwaCalcResultLabel">القيمة التقريبية بالدينار العراقي</span><strong id="pwaCalcResult">—</strong><small id="pwaCalcBreakdown">أدخل المبلغ حتى تظهر العملية بشكل واضح.</small></div>
          <div class="pwa-paper"><div class="pwa-paper-head"><div><strong>حاسبة الورق</strong><small>كل 100 دولار = ورقة</small></div><span>▣</span></div><div class="pwa-paper-count"><strong id="pwaPaperCount">—</strong><span>ورقة</span></div><div class="pwa-remainder-grid"><div><small>المتبقي بالدولار</small><strong id="pwaRemainderUsd">— USD</strong></div><div><small>قيمة المتبقي بالدينار العراقي</small><strong id="pwaRemainderIqd">— د.ع</strong></div></div></div><p class="pwa-note">السعر استرشادي من مصدر دولاري، وليس سعراً مضموناً للبيع أو الشراء.</p></div>
      </section>
      <section class="pwa-screen" id="pwaSettingsScreen"><div class="pwa-title-row"><div><h2>الإعدادات</h2><p>إشعارات وتنبيهات دولاري على الآيفون</p></div><div class="pwa-title-icon"><svg viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"></path><path d="m19.4 15 .1.1 1.1 1.8-1.7 1.7-1.8-1.1-.1.1c-.5.3-1-.5-1.5-.6l-.5 2.1h-2.4l-.5-2.1c-.5-.1-1-.3-1.5-.6l-.1-.1-1.8 1.1-1.7-1.7 1.1-1.8.1-.1c-.3-.5-.5-1-.6-1.5L4 13v-2l2.1-.5c.1-.5.3-1 .6-1.5L6.6 8.9 5.5 7.1 7.2 5.4 9 6.5l.1.1c.5-.3 1-.5 1.5-.6l.5-2.1h2.4l.5 2.1c.5.1 1 .3 1.5.6l.1-.1 1.8-1.1 1.7 1.7-1.1 1.8.1.1c-.3-.5-.5-1-.6-1.5L20 11v2l-2.1.5c-.1.5-.3 1-.6 1.5Z"></path></svg></div></div>
        <div class="pwa-privacy-card"><button type="button" class="pwa-privacy-link" id="pwaPrivacyBtn" aria-label="فتح سياسة الخصوصية"><span class="pwa-privacy-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6l-7-3Z"></path><path d="m9 12 2 2 4-4"></path></svg></span><span><strong>سياسة الخصوصية</strong><small>اضغط هنا لفتح سياسة الخصوصية داخل دولاري</small></span><svg class="pwa-privacy-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg></button></div>
        <div class="pwa-settings-card"><div class="pwa-setting-row"><strong>إشعارات دولاري</strong><span id="pwaPermissionStatus" class="pwa-notify-status">تحقق من صلاحية الإشعارات على هذا الجهاز.</span><button type="button" class="primary pwa-notify-control enable" id="pwaPermissionBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg><span>تفعيل إشعارات دولاري</span></button><button type="button" class="pwa-notify-control disable" id="pwaDisableNotifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path><path d="m4 4 16 16"></path></svg><span>إيقاف إشعارات هذا الجهاز</span></button></div>
          <div class="pwa-setting-row"><strong>تنبيه سعر مستهدف</strong><span>حدد سعراً لمحافظتك؛ عند عبوره يظهر في سجل التنبيهات ويمكن للنظام إظهار إشعار عندما يكون مسموحاً.</span><div class="pwa-alert-form"><select id="pwaAlertProvince"></select><select id="pwaAlertCondition"><option value="above">عندما يصل السعر إلى هذا الرقم أو أعلى</option><option value="below">عندما يصل السعر إلى هذا الرقم أو أقل</option></select><input id="pwaAlertTarget" type="number" min="1" step="250" inputmode="numeric" placeholder="مثال: 150000"></div><div class="pwa-alert-actions"><button type="button" class="primary" id="pwaSaveAlert">تفعيل التنبيه</button><button type="button" id="pwaRemoveAlert">إيقاف</button></div><p class="pwa-note" id="pwaAlertStatus">التنبيه يعمل عند فحص السعر أثناء تشغيل دولاري. الإرسال بالخلفية عند إغلاق التطبيق يحتاج خدمة Web Push خادمية.</p></div></div>
      </section>
      <section class="pwa-screen" id="pwaPrivacyScreen"><div class="pwa-title-row"><div><h2>سياسة الخصوصية</h2><p>سياسة دولاري للموقع وتطبيق Android ونسخة PWA</p></div><button type="button" class="pwa-back-btn" id="pwaPrivacyBack" aria-label="رجوع"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"></path></svg></button></div><div class="pwa-privacy-frame"><iframe src="./privacy_policy.html" title="سياسة الخصوصية – دولاري" loading="eager"></iframe></div></section>
      <section class="pwa-screen" id="pwaNotificationsScreen"><div class="pwa-title-row"><div><h2>التنبيهات</h2><p>آخر تغيّرات أسعار الدولار التي وصلتك</p></div><div class="pwa-title-icon"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg></div></div><div class="pwa-notification-head"><div><strong>آخر التنبيهات</strong><span>هنا تظهر تنبيهات تغيّر الأسعار والتنبيهات التي يعمل عليها دولاري.</span></div><button type="button" id="pwaNotificationsBack" aria-label="رجوع"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"></path></svg></button></div><div class="pwa-notification-list" id="pwaNotificationList"></div></section>
    </main>
    <nav class="pwa-bottom-nav" aria-label="تنقل دولاري">
      <button type="button" class="pwa-nav-item active" data-pwa-screen="pwaHomeScreen"><svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9v11h14V9"></path><path d="M9 20v-6h6v6"></path></svg><span>الرئيسية</span></button>
      <button type="button" class="pwa-nav-item" data-pwa-screen="pwaFavoritesScreen"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9 4.5 4.4-1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg><span>المفضلة</span></button>
      <button type="button" class="pwa-nav-item" data-pwa-screen="pwaCalculatorScreen"><svg viewBox="0 0 24 24"><rect x="5" y="2.8" width="14" height="18.4" rx="2.8"></rect><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.2h.01M12 18.2h.01M15.5 18.2h.01"></path></svg><span>الحاسبة</span></button>
      <button type="button" class="pwa-nav-item" data-pwa-screen="pwaSettingsScreen"><svg viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"></path><path d="m19.4 15 .1.1 1.1 1.8-1.7 1.7-1.8-1.1-.1-.1c-.3-.5-.5-1-.6-1.5L4 13v-2l2.1-.5c.1-.5.3-1 .6-1.5L6.6 8.9 5.5 7.1 7.2 5.4 9 6.5l.1.1c.5-.3 1-.5 1.5-.6l.5-2.1h2.4l.5 2.1c.1.5.3 1 .6 1.5l.1-.1 1.8-1.1 1.7 1.7-1.1 1.8.1.1c-.3-.5-.5-1-.6-1.5L20 11v2l-2.1.5c-.1-.5-.5-1-.6-1.5Z"></path></svg><span>الإعدادات</span></button>
    </nav>
  `;

  (document.body||document.documentElement).appendChild(app);
  var cfg=window.DOLARY_CONFIG||{};
  try{
    var brand=app.querySelector('.pwa-brand-copy strong');if(brand)brand.textContent=cfg.branding&&cfg.branding.appName||'دولاري';
    var title=app.querySelector('.pwa-section-title h2');if(title)title.textContent=cfg.text&&cfg.text.heroTitle||'آخر الأسعار';
    var sub=app.querySelector('.pwa-section-title p');if(sub)sub.textContent=cfg.text&&cfg.text.heroSubtitle||'المحافظات المتاحة من المصدر';
    var calc=app.querySelector('[data-pwa-screen="pwaCalculatorScreen"]');if(calc&&cfg.features&&cfg.features.calculator===false)calc.hidden=true;
    var fav=app.querySelector('[data-pwa-screen="pwaFavoritesScreen"]');if(fav&&cfg.features&&cfg.features.favorites===false)fav.hidden=true;
    var daily=app.querySelector('#pwaDailyCard');if(daily&&cfg.features&&cfg.features.dailyShare===false)daily.hidden=true;
    var style=document.createElement('style');style.textContent=':root{--dolary-dev-accent:'+String(cfg.theme&&cfg.theme.accent||'#67e8f9')+';--dolary-dev-gold:'+String(cfg.theme&&cfg.theme.gold||'#f6d58b')+';--dolary-dev-radius:'+String(cfg.theme&&cfg.theme.radius||26)+'px}.pwa-hero,.pwa-calc-card,.pwa-settings-card,.pwa-privacy-card{border-radius:var(--dolary-dev-radius)!important}.pwa-rate-value{color:var(--dolary-dev-accent)!important}.pwa-rate-label,.pwa-hero-unit{color:var(--dolary-dev-gold)!important}';document.head.appendChild(style);
  }catch(_){}

  var pwaSharePriceStyle=document.createElement('style');
  pwaSharePriceStyle.textContent='.pwa-share-price-trigger{width:100%;margin:12px 0 0;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid rgba(91,157,255,.32);background:linear-gradient(135deg,rgba(31,83,151,.92),rgba(14,43,84,.96));color:#fff;border-radius:16px;padding:13px 16px;font:700 15px/1 Tajawal,"Noto Sans Arabic",Tahoma,Arial,sans-serif;box-shadow:0 8px 22px rgba(4,20,48,.2);cursor:pointer}.pwa-share-price-trigger svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.pwa-share-price-trigger:active{transform:scale(.985)}.pwa-daily-card-section[hidden]{display:none!important}';
  document.head.appendChild(pwaSharePriceStyle);

  var appState={cities:[],selectedSlug:'baghdad',ratePer100:null,updatedAt:null,rateError:false};
  var FAV_KEY='dolary.pwaFavorites.v1',UNREAD_KEY='dolary.pwaUnread.v1',HISTORY_KEY='dolary.priceAlertHistory.v1',ALERT_KEY='dolary.priceAlert.v1',KNOWN_KEY='dolary.pwaKnownNotification.v1',RATES_CACHE_KEY='dolary.pwaRatesCache.v1';
  var calcDir='usd',firstHistoryCheck=true,lastHistorySig='';

  function readJson(k,f){try{var v=JSON.parse(localStorage.getItem(k)||'null');return v===null?f:v;}catch(_){return f;}}
  function fmt(n,d){return new Intl.NumberFormat('ar-IQ',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}).format(n);}
  function fmtCalc(n,d){return new Intl.NumberFormat('en-US',{minimumFractionDigits:d?Math.min(d,2):0,maximumFractionDigits:d||0}).format(n);}
  function cityName(c){var n=c&&(c.name_ar||c.city_ar||c.name);if(n&&typeof n==='object')n=n.ar||n.en||n.ku;return n||c&&c.slug||'العراق';}
  function rateFor(c){
    if(!c||typeof c!=='object')return null;
    if(Array.isArray(c.sides)){
      var middle=c.sides.find(function(side){return side&&(side.side===null||typeof side.side==='undefined')&&side.usd_iqd_per_100!=null;});
      if(middle){
        var value=Number(middle.usd_iqd_per_100);
        if(Number.isFinite(value)&&value>0)return value;
      }
    }
    var fallback=Number(c.usd_iqd_per_100);
    return Number.isFinite(fallback)&&fallback>0?fallback:null;
  }
  function history(){var v=readJson(HISTORY_KEY,[]);return Array.isArray(v)?v:[];}
  function unread(){return Math.max(0,Number(localStorage.getItem(UNREAD_KEY)||0));}
  function setUnread(n){try{localStorage.setItem(UNREAD_KEY,String(Math.max(0,n|0)));}catch(_){}}
  function setBadge(){var n=unread(),b=document.getElementById('pwaNotificationCount'),bell=document.getElementById('pwaNotificationBell');if(b){b.textContent=n>99?'99+':String(n);b.classList.toggle('show',n>0);}if(bell)bell.classList.toggle('has-unread',n>0);try{if('setAppBadge'in navigator&&n>0)navigator.setAppBadge(n);else if(navigator.clearAppBadge)navigator.clearAppBadge();}catch(_){}}
  function sig(item){return item?String(item.at||'')+'|'+String(item.province||'')+'|'+String(item.rate||'')+'|'+String(item.message||''):'';}
  function detectNewNotifications(){var h=history(),top=sig(h[0]);if(firstHistoryCheck){firstHistoryCheck=false;var saved=null;try{saved=localStorage.getItem(KNOWN_KEY);}catch(_){}lastHistorySig=saved||top;if(!saved&&top)try{localStorage.setItem(KNOWN_KEY,top);}catch(_){}}else if(top&&top!==lastHistorySig){var count=0;for(var i=0;i<h.length;i++){if(sig(h[i])===lastHistorySig)break;count++;}setUnread(unread()+Math.max(1,count));lastHistorySig=top;try{localStorage.setItem(KNOWN_KEY,top);}catch(_){}renderNotifications();}setBadge();}
  function renderNotifications(){var list=document.getElementById('pwaNotificationList'),h=history();if(!list)return;list.replaceChildren();if(!h.length){var e=document.createElement('div');e.className='pwa-empty';e.textContent='لا توجد تنبيهات بعد.';list.appendChild(e);return;}h.slice(0,20).forEach(function(item){var row=document.createElement('article');row.className='pwa-notification-item';var t=document.createElement('strong');var rate=Number(item.rate);if(item.province&&Number.isFinite(rate)){t.textContent=item.province+' — '+fmt(rate)+' د.ع لكل 100 دولار';}else{t.textContent=item.title||'دولاري';}var body=document.createElement('span');body.textContent=item.message||item.body||'لديك تنبيه جديد من دولاري.';var d=document.createElement('small');var dt=new Date(item.at);d.textContent=Number.isNaN(dt.getTime())?'وقت غير متاح':dt.toLocaleString('ar-IQ',{dateStyle:'short',timeStyle:'short'});row.append(t,body,d);list.appendChild(row);});}
  function showScreen(id){document.querySelectorAll('.pwa-screen').forEach(function(s){s.classList.toggle('active',s.id===id);});document.querySelectorAll('.pwa-nav-item').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-pwa-screen')===id);});window.scrollTo(0,0);if(id==='pwaPrivacyScreen'){document.getElementById('pwaPrivacyBack').focus();}if(id==='pwaNotificationsScreen'){setUnread(0);var h=history(),top=sig(h[0]);if(top){lastHistorySig=top;try{localStorage.setItem(KNOWN_KEY,top);}catch(_){} }try{if(navigator.clearAppBadge)navigator.clearAppBadge();}catch(_){}try{if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage({type:'DOLARY_MARK_ALL_READ'});}catch(_){}renderNotifications();}if(id==='pwaSettingsScreen')renderAlertForm();if(id==='pwaCalculatorScreen'){calc();}}
  function favorites(){var f=readJson(FAV_KEY,[]);return Array.isArray(f)?f:[];}
  function toggleFavorite(slug){var f=favorites(),i=f.indexOf(slug);if(i>=0)f.splice(i,1);else f.unshift(slug);try{localStorage.setItem(FAV_KEY,JSON.stringify(f));}catch(_){}renderHome();renderFavorites();}
  var pwaDailyCardLogo=new Image();
  pwaDailyCardLogo.crossOrigin="anonymous";
  pwaDailyCardLogo.decoding="async";
  pwaDailyCardLogo.src="./dolary-mark.svg";
  function paintPwaDailyCard(canvas,info){
    if(!canvas)return;var ctx=canvas.getContext("2d");if(!ctx)return;var w=canvas.width,h=canvas.height;
    function rounded(x,y,width,height,r){var q=Math.min(r,width/2,height/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+width,y,x+width,y+height,q);ctx.arcTo(x+width,y+height,x,y+height,q);ctx.arcTo(x,y+height,x,y,q);ctx.arcTo(x,y,x+width,y,q);ctx.closePath();}
    function text(v,x,y,size,color,align,weight,maxWidth){align=align||"right";weight=weight||700;maxWidth=maxWidth||900;ctx.save();ctx.direction="rtl";ctx.textAlign=align;ctx.textBaseline="alphabetic";var family='Tajawal,"Noto Sans Arabic",Tahoma,Arial,sans-serif',fitted=size;ctx.font=weight+" "+fitted+"px "+family;while(ctx.measureText(String(v)).width>maxWidth&&fitted>14){fitted-=2;ctx.font=weight+" "+fitted+"px "+family;}ctx.fillStyle=color;ctx.fillText(String(v),x,y,maxWidth);ctx.restore();}
    var bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#123a74");bg.addColorStop(.52,"#0b2348");bg.addColorStop(1,"#0a1c3a");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    var glow=ctx.createRadialGradient(870,160,20,870,160,690);glow.addColorStop(0,"rgba(65,150,255,.34)");glow.addColorStop(1,"rgba(65,150,255,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    var lower=ctx.createRadialGradient(90,1190,10,90,1190,430);lower.addColorStop(0,"rgba(80,150,255,.17)");lower.addColorStop(1,"rgba(80,150,255,0)");ctx.fillStyle=lower;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.font="900 720px Arial,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="rgba(255,255,255,.065)";ctx.shadowColor="rgba(80,150,255,.52)";ctx.shadowBlur=42;ctx.fillText("$",260,790);ctx.shadowBlur=2;ctx.fillStyle="rgba(150,195,255,.035)";ctx.fillText("$",265,790);ctx.restore();
    ctx.save();ctx.strokeStyle="rgba(151,195,255,.09)";ctx.lineWidth=2;for(var i=0;i<5;i++){ctx.beginPath();ctx.arc(70,1120,220+i*75,0,Math.PI*2);ctx.stroke();}ctx.restore();
    rounded(35,35,w-70,h-70,44);ctx.strokeStyle="rgba(178,211,255,.22)";ctx.lineWidth=2;ctx.stroke();
    rounded(825,92,150,150,38);ctx.save();ctx.clip();if(pwaDailyCardLogo.complete&&pwaDailyCardLogo.naturalWidth)ctx.drawImage(pwaDailyCardLogo,825,92,150,150);ctx.restore();
    text("دولاري",785,158,52,"#ffffff","right",900);text("DOLARY  ·  IRAQ EXCHANGE",785,202,17,"#a9c8f7","right",700);
    text("الدولار اليوم",w/2,490,50,"#d7e8ff","center",800,950);text(info.province||"العراق",w/2,610,78,"#ffffff","center",900,940);
    var value=info.rate==null?"غير متوفر":Number(info.rate).toLocaleString("en-US",{maximumFractionDigits:0});text(value,w/2,845,104,"#ffffff","center",900);text("دينار عراقي",w/2,905,29,"#8fb8f0","center",800);
    rounded(85,1000,910,174,32);ctx.fillStyle="rgba(255,255,255,.075)";ctx.fill();ctx.strokeStyle="rgba(175,205,255,.16)";ctx.stroke();
    var today=new Date().toLocaleDateString("en-GB");text("تاريخ اليوم",235,1057,19,"#91acd4","center",700);text(today,235,1110,25,"#ffffff","center",800);text("المحافظة",845,1057,19,"#91acd4","center",700);text(info.province||"—",845,1110,25,"#ffffff","center",800,250);
    ctx.strokeStyle="rgba(175,205,255,.18)";ctx.beginPath();ctx.moveTo(540,1028);ctx.lineTo(540,1145);ctx.stroke();ctx.strokeStyle="rgba(175,205,255,.2)";ctx.beginPath();ctx.moveTo(85,1210);ctx.lineTo(995,1210);ctx.stroke();text("تابع أسعار الدولار في العراق",995,1255,19,"#dceaff","right",700);text("aehamtech.top/dolary",85,1255,14,"#89a9d7","left",700);
  }
  function renderPwaDailyCard(city){var canvas=document.getElementById("pwaDailyShareCanvas");if(canvas)paintPwaDailyCard(canvas,{province:city?cityName(city):"العراق",rate:city?rateFor(city):null});}
  async function sharePwaDailyCard(){var canvas=document.getElementById("pwaDailyShareCanvas"),rate=Number(appState.ratePer100);if(!canvas||!Number.isFinite(rate)||rate<=0){window.alert("السعر غير متاح حالياً، حاول تحديث الصفحة");return;}canvas.toBlob(async function(blob){if(!blob){window.alert("تعذر تجهيز صورة البطاقة");return;}var file=new File([blob],"dolary-daily-card.jpg",{type:"image/jpeg"}),city=appState.cities.find(function(c){return c.slug===appState.selectedSlug}),name=city?cityName(city):"العراق",caption="الدولار اليوم في "+name+": "+fmt(rate)+" د.ع لكل 100 دولار. تابع دولاري: "+location.origin+location.pathname;try{if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}))await navigator.share({files:[file],title:"بطاقة دولاري اليومية",text:caption});else{var url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="dolary-daily-card.jpg";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);}}catch(e){if(!e||e.name!=="AbortError")window.alert("تعذرت المشاركة، حاول مرة ثانية");}},"image/jpeg",.94);}
  function renderHome(){var select=document.getElementById('pwaProvinceSelect'),name=document.getElementById('pwaProvinceName'),rate=document.getElementById('pwaRateValue'),updated=document.getElementById('pwaUpdatedText'),list=document.getElementById('pwaHomeRates');if(!select||!list)return;select.replaceChildren();appState.cities.forEach(function(c){var o=document.createElement('option');o.value=c.slug;o.textContent=cityName(c);if(c.slug===appState.selectedSlug)o.selected=true;select.appendChild(o);});var selected=appState.cities.find(function(c){return c.slug===appState.selectedSlug;})||appState.cities[0];name.textContent=selected?cityName(selected):'بغداد';rate.innerHTML=Number.isFinite(Number(appState.ratePer100))?fmt(Number(appState.ratePer100))+' <small>د.ع / 100 USD</small>':'— <small>د.ع / 100 USD</small>';var selectedForCard=appState.cities.find(function(c){return c.slug===appState.selectedSlug})||appState.cities[0];renderPwaDailyCard(selectedForCard);updated.textContent=appState.rateError?(appState.updatedAt?'آخر سعر محفوظ محلياً — غير محدث':'تعذر جلب السعر'):appState.updatedAt?('آخر تحديث: '+new Date(appState.updatedAt).toLocaleString('ar-IQ',{dateStyle:'short',timeStyle:'short'})):'بانتظار البيانات';list.replaceChildren();appState.cities.filter(function(c){return rateFor(c)!=null;}).forEach(function(c){var row=document.createElement('div');row.className='pwa-city-row';var copy=document.createElement('div');copy.className='pwa-city-copy';var st=document.createElement('strong');st.textContent=cityName(c);var sm=document.createElement('small');sm.textContent=c.slug===appState.selectedSlug?'المحافظة المحددة':'اضغط النجمة لإضافتها للمفضلة';copy.append(st,sm);var v=document.createElement('strong');v.className='pwa-city-rate';var rr=rateFor(c);v.textContent=rr?fmt(rr)+' د.ع':'—';var star=document.createElement('button');star.type='button';star.className='pwa-star'+(favorites().indexOf(c.slug)>=0?' active':'');star.setAttribute('aria-label',favorites().indexOf(c.slug)>=0?'إزالة من المفضلة':'إضافة للمفضلة');star.innerHTML='<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>';star.title=favorites().indexOf(c.slug)>=0?'إزالة من المفضلة':'إضافة إلى المفضلة';star.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();toggleFavorite(c.slug);});row.append(copy,v,star);list.appendChild(row);});if(!appState.cities.length){var e=document.createElement('div');e.className='pwa-empty';e.textContent=appState.rateError?'تعذر جلب أسعار المحافظات. اضغط زر التحديث وحاول مرة ثانية.':'جاري تحميل أسعار المحافظات…';list.appendChild(e);}}
  function renderFavorites(){var list=document.getElementById('pwaFavoritesList');if(!list)return;list.replaceChildren();var fav=favorites(),items=appState.cities.filter(function(c){return fav.indexOf(c.slug)>=0;});if(!items.length){var e=document.createElement('div');e.className='pwa-empty';e.textContent='ماكو محافظات بالمفضلة بعد. ارجع للرئيسية واختر النجمة للمحافظة التي تريدها.';list.appendChild(e);return;}items.forEach(function(c){var row=document.createElement('div');row.className='pwa-city-row';var copy=document.createElement('div');copy.className='pwa-city-copy';var st=document.createElement('strong');st.textContent=cityName(c);var sm=document.createElement('small');sm.textContent='محافظة مفضلة';copy.append(st,sm);var v=document.createElement('strong');v.className='pwa-city-rate';var rr=rateFor(c);v.textContent=rr?fmt(rr)+' د.ع':'—';var star=document.createElement('button');star.type='button';star.className='pwa-star active';star.setAttribute('aria-label','إزالة من المفضلة');star.innerHTML='<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>';star.addEventListener('click',function(){toggleFavorite(c.slug);});row.append(copy,v,star);list.appendChild(row);});}
  /* PWA CALCULATOR — مستقل فقط عن الإشعارات وباقي منطق دولاري */
  function parseCalcAmount(value){
    var s=String(value==null?'':value).trim();
    if(!s)return NaN;

    s=s.replace(/[٠-٩]/g,function(ch){return String(ch.charCodeAt(0)-1632);});
    s=s.replace(/[۰-۹]/g,function(ch){return String(ch.charCodeAt(0)-1776);});
    s=s.replace(/[\u066C\u060C،]/g,'');
    s=s.replace(/[\s\u00A0\u202F]/g,'');

    if(s.indexOf('.')===-1&&s.indexOf(',')>=0){
      var comma=s.lastIndexOf(',');
      var decimalLength=s.length-comma-1;
      if(decimalLength>0&&decimalLength<=2){
        s=s.slice(0,comma).replace(/,/g,'')+'.'+s.slice(comma+1);
      }else{
        s=s.replace(/,/g,'');
      }
    }else{
      s=s.replace(/,/g,'');
    }

    var n=Number(s);
    return Number.isFinite(n)&&n>=0?n:NaN;
  }

  function calculatorRateFromCity(city){
    if(!city||typeof city!=='object')return NaN;
    /*
      IMPORTANT:
      XEIQD's canonical calculator fields are:
      - usd_iqd_per_100 = dinars for exactly 100 USD
      - usd_iqd_per_1  = dinars for 1 USD
      Do not interpret generic "rate"/"sell_rate" fields here because
      their unit is not guaranteed to be per-100-USD.
    */
    /* السعر الأساسي للمحافظة هو usd_iqd_per_100 في سجل المدينة.
       بعض بيانات sides قد تحمل رقم الدولار الواحد رغم اسم الحقل،
       لذلك لا نعتمد عليها قبل الحقل الأساسي. */
    var candidates=[
      city.usd_iqd_per_100,
      city.usd_iqd_per_1!=null?Number(city.usd_iqd_per_1)*100:null
    ];
    if(Array.isArray(city.sides)){
      city.sides.forEach(function(side){
        if(side&&side.usd_iqd_per_100!=null)candidates.push(Number(side.usd_iqd_per_100));
      });
    }
    for(var i=0;i<candidates.length;i++){
      var value=Number(candidates[i]);
      if(Number.isFinite(value)&&value>0)return value;
    }
    return NaN;
  }
  function calculatorRateFromData(data,slug){
    if(!data||typeof data!=='object')return NaN;
    var wanted=slug||appState.selectedSlug;
    if(Array.isArray(data.cities)){
      var city=data.cities.find(function(c){return c&&c.slug===wanted;})||data.cities[0];
      var cityRate=calculatorRateFromCity(city);
      if(Number.isFinite(cityRate)&&cityRate>0)return cityRate;
    }
    var usd=data.usd;
    var rootCandidates=[usd&&usd.iqd_per_100,usd&&usd.iqd_per_1!=null?Number(usd.iqd_per_1)*100:null,data.usd_iqd_per_100,data.usd_iqd_per_1!=null?Number(data.usd_iqd_per_1)*100:null];
    for(var i=0;i<rootCandidates.length;i++){var value=Number(rootCandidates[i]);if(Number.isFinite(value)&&value>0)return value;}
    return NaN;
  }
  var calculatorFetchPromise=null,calculatorRunId=0;
  function fetchCalculatorRate(){
    if(calculatorFetchPromise)return calculatorFetchPromise;
    calculatorFetchPromise=fetch('https://dolary.aehmnazar-1234533.workers.dev/api/rates',{cache:'no-store',headers:{Accept:'application/json'},credentials:'omit'}).then(function(r){
      if(!r.ok)throw new Error('calculator_rates');
      return r.json();
    }).then(function(data){
      var rate=calculatorRateFromData(data,appState.selectedSlug);
      if(!Number.isFinite(rate)||rate<=0)throw new Error('calculator_rate_missing');
      try{window.__dolaryCalculatorRatesData=data;}catch(_){}
      return rate;
    }).catch(function(){
      return fetch('https://xeiqd.com/rates.json',{cache:'no-store',headers:{Accept:'application/json'},credentials:'omit'}).then(function(r){
        if(!r.ok)throw new Error('xeiqd_rates');
        return r.json();
      }).then(function(data){
        var rate=calculatorRateFromData(data,appState.selectedSlug);
        if(!Number.isFinite(rate)||rate<=0)throw new Error('xeiqd_rate_missing');
        try{window.__dolaryCalculatorRatesData=data;}catch(_){}
        return rate;
      });
    }).finally(function(){calculatorFetchPromise=null;});
    return calculatorFetchPromise;
  }
  function resolveCalculatorRate(){
    var city=appState.cities.find(function(c){return c&&c.slug===appState.selectedSlug;});
    var rate=calculatorRateFromCity(city);
    if(Number.isFinite(rate)&&rate>0)return rate;
    rate=calculatorRateFromData(window.__dolaryCalculatorRatesData,appState.selectedSlug);
    if(Number.isFinite(rate)&&rate>0)return rate;
    rate=calculatorRateFromData(window.__dolaryRatesData,appState.selectedSlug);
    if(Number.isFinite(rate)&&rate>0)return rate;
    rate=Number(appState.ratePer100);
    if(Number.isFinite(rate)&&rate>0)return rate;
    var visibleRate=document.getElementById('pwaRateValue');
    if(visibleRate){
      var shown=String(visibleRate.textContent||'').replace(/[٠-٩]/g,function(ch){return String(ch.charCodeAt(0)-1632);}).replace(/[۰-۹]/g,function(ch){return String(ch.charCodeAt(0)-1776);}).replace(/[^0-9.,]/g,'').replace(/,/g,'');
      rate=Number(shown);
      if(Number.isFinite(rate)&&rate>0)return rate;
    }
    return NaN;
  }
  function setCalculatorEmpty(message){
    var result=document.getElementById('pwaCalcResult'),breakdown=document.getElementById('pwaCalcBreakdown'),papers=document.getElementById('pwaPaperCount'),remUsd=document.getElementById('pwaRemainderUsd'),remIqd=document.getElementById('pwaRemainderIqd');
    if(result){result.textContent='—';result.style.display='flex';result.style.visibility='visible';result.style.opacity='1';delete result.dataset.currentValue;}
    if(breakdown)breakdown.textContent=message;
    if(papers)papers.textContent='—';
    if(remUsd)remUsd.textContent='— USD';
    if(remIqd)remIqd.textContent='— د.ع';
  }
  function runPwaCalculator(){
    var input=document.getElementById('pwaCalcAmount'),result=document.getElementById('pwaCalcResult'),label=document.getElementById('pwaCalcResultLabel'),unit=document.getElementById('pwaCalcUnit'),breakdown=document.getElementById('pwaCalcBreakdown'),papers=document.getElementById('pwaPaperCount'),remUsd=document.getElementById('pwaRemainderUsd'),remIqd=document.getElementById('pwaRemainderIqd');
    if(!input||!result||!label||!unit||!breakdown||!papers||!remUsd||!remIqd)return;
    var amount=parseCalcAmount(input.value);
    if(!Number.isFinite(amount)){setCalculatorEmpty('أدخل المبلغ حتى تظهر النتيجة.');return;}
    var rate=resolveCalculatorRate();
    if(!Number.isFinite(rate)||rate<=0){
      var runId=++calculatorRunId;
      setCalculatorEmpty('جاري جلب سعر المحافظة للحاسبة…');
      fetchCalculatorRate().then(function(freshRate){if(runId!==calculatorRunId)return;appState.ratePer100=freshRate;runPwaCalculator();}).catch(function(){if(runId!==calculatorRunId)return;setCalculatorEmpty('تعذر جلب سعر الحاسبة. اضغط تحديث الأسعار وحاول مرة ثانية.');});
      return;
    }
    var perDollar=rate/100,converted=calcDir==='iqd'?amount/perDollar:amount*perDollar;
    if(!Number.isFinite(converted)){setCalculatorEmpty('تعذر إكمال العملية، تحقق من المبلغ وحاول مرة ثانية.');return;}
    var usdFormat=new Intl.NumberFormat('en-US',{minimumFractionDigits:calcDir==='iqd'?2:0,maximumFractionDigits:calcDir==='iqd'?2:0}),iqdFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
    var inputShown=calcDir==='iqd'?iqdFormat.format(amount):usdFormat.format(amount),outputShown=calcDir==='iqd'?usdFormat.format(converted):iqdFormat.format(converted);
    unit.textContent=calcDir==='iqd'?'د.ع':'USD';
    label.textContent=calcDir==='iqd'?'القيمة بالدولار الأمريكي':'القيمة بالدينار العراقي';
    result.textContent=calcDir==='iqd'?outputShown+' USD':outputShown+' د.ع';
    result.dataset.currentValue=String(converted);result.style.display='flex';result.style.visibility='visible';result.style.opacity='1';
    breakdown.textContent=calcDir==='iqd'?inputShown+' د.ع ÷ '+iqdFormat.format(perDollar)+' د.ع = '+outputShown+' USD':inputShown+' USD × '+iqdFormat.format(perDollar)+' د.ع = '+outputShown+' د.ع';
    var usdAmount=calcDir==='iqd'?converted:amount,paperTotal=Math.floor((usdAmount+1e-9)/100),remainder=Math.max(0,usdAmount-paperTotal*100);
    papers.textContent=iqdFormat.format(paperTotal);remUsd.textContent=usdFormat.format(remainder)+' USD';remIqd.textContent=iqdFormat.format(remainder*perDollar)+' د.ع';
  }
  function calc(){runPwaCalculator();}
  function renderAlertForm(){var sel=document.getElementById('pwaAlertProvince'),target=document.getElementById('pwaAlertTarget'),cond=document.getElementById('pwaAlertCondition'),status=document.getElementById('pwaAlertStatus'),rule=readJson(ALERT_KEY,null);if(!sel)return;sel.replaceChildren();appState.cities.forEach(function(c){var o=document.createElement('option');o.value=c.slug;o.textContent=cityName(c);if(rule&&rule.slug===c.slug)o.selected=true;sel.appendChild(o);});if(rule){target.value=String(rule.target);cond.value=rule.condition;status.textContent='تنبيه مفعّل لمحافظة '+rule.province+'.';}else{target.value='';status.textContent='التنبيه يعمل عند فحص السعر أثناء تشغيل دولاري.';}}
  function permissionStatus(){var el=document.getElementById('pwaPermissionStatus');if(!el)return;el.textContent=('Notification'in window)?(Notification.permission==='granted'?'إشعارات دولاري مفعّلة على هذا الجهاز.':Notification.permission==='denied'?'الإشعارات موقوفة من إعدادات الآيفون.':'اضغط لتفعيل إشعارات دولاري.'):'إشعارات الويب غير مدعومة هنا.';}
  function applyRatesData(data,stale){if(!data||!Array.isArray(data.cities))throw new Error('data');var cities=data.cities.filter(function(c){return c&&typeof c.slug==='string'&&rateFor(c)!==null;});if(!cities.length)throw new Error('empty_rates');appState.cities=cities;appState.rateError=Boolean(stale);var saved=localStorage.getItem('dolary.pwaSelectedProvince.v1');appState.selectedSlug=saved||((cities.find(function(c){return c.slug==='baghdad';})||cities[0]||{}).slug||'baghdad');var sel=cities.find(function(c){return c.slug===appState.selectedSlug;})||cities[0];if(sel){appState.selectedSlug=sel.slug;appState.ratePer100=rateFor(sel);appState.updatedAt=sel.updated_at||data.updated_at||null;}renderHome();renderFavorites();calc();renderAlertForm();}
  async function loadRates(){try{var shared=window.__dolaryRatesData;if(shared&&Array.isArray(shared.cities)){applyRatesData(shared,false);try{localStorage.setItem(RATES_CACHE_KEY,JSON.stringify({data:shared,savedAt:new Date().toISOString()}));}catch(_){}return;}}catch(_){}try{var r=await fetch('https://dolary.aehmnazar-1234533.workers.dev/api/rates',{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error('rates');var data=await r.json();applyRatesData(data,false);try{localStorage.setItem(RATES_CACHE_KEY,JSON.stringify({data:data,savedAt:new Date().toISOString()}));}catch(_){}return;}catch(_){ }var cached=readJson(RATES_CACHE_KEY,null);if(cached&&cached.data){try{applyRatesData(cached.data,true);return;}catch(__){}}appState.rateError=true;appState.updatedAt=null;renderHome();renderFavorites();calc();}
  document.querySelectorAll('.pwa-nav-item').forEach(function(b){b.addEventListener('click',function(){showScreen(b.getAttribute('data-pwa-screen'));});});
  document.querySelectorAll('[data-pwa-go]').forEach(function(b){b.addEventListener('click',function(){showScreen(b.getAttribute('data-pwa-go'));});});
  document.getElementById('pwaNotificationBell').addEventListener('click',function(){showScreen('pwaNotificationsScreen');});
  document.getElementById('pwaNotificationsBack').addEventListener('click',function(){showScreen('pwaHomeScreen');});
  document.getElementById('pwaPrivacyBtn').addEventListener('click',function(){showScreen('pwaPrivacyScreen');});
  document.getElementById('pwaPrivacyBack').addEventListener('click',function(){showScreen('pwaSettingsScreen');});
  document.getElementById('pwaRefreshBtn').addEventListener('click',function(){var b=this;b.classList.add('spinning');loadRates().finally(function(){setTimeout(function(){b.classList.remove('spinning');},400);});});
  document.getElementById('pwaSharePriceTrigger').addEventListener('click',function(){
    var card=document.getElementById('pwaDailyCard'),button=this;
    var opening=card.hidden;
    card.hidden=!opening;
    button.setAttribute('aria-expanded',String(opening));
    button.querySelector('span').textContent=opening?'إخفاء بطاقة السعر':'مشاركة السعر';
    if(opening){setTimeout(function(){card.scrollIntoView({behavior:'smooth',block:'start'});},40);}
  });
  document.getElementById('pwaShareDailyCard').addEventListener('click',sharePwaDailyCard);
  document.getElementById('pwaProvinceSelect').addEventListener('change',function(){appState.selectedSlug=this.value;try{localStorage.setItem('dolary.pwaSelectedProvince.v1',this.value);}catch(_){}var c=appState.cities.find(function(x){return x.slug===appState.selectedSlug;});if(c){appState.ratePer100=rateFor(c);appState.updatedAt=c.updated_at||appState.updatedAt;}renderHome();renderFavorites();calc();renderAlertForm();});
  var pwaCalcInput=document.getElementById('pwaCalcAmount');
  if(pwaCalcInput){
    pwaCalcInput.addEventListener('input',calc);
    pwaCalcInput.addEventListener('change',calc);
    pwaCalcInput.addEventListener('keyup',calc);
    pwaCalcInput.addEventListener('compositionend',calc);
  }
  document.querySelectorAll('#pwaCalcDirection button').forEach(function(b){b.addEventListener('click',function(){calcDir=b.getAttribute('data-dir')==='iqd'?'iqd':'usd';document.querySelectorAll('#pwaCalcDirection button').forEach(function(x){x.classList.toggle('active',x===b);});calc();});});
  document.getElementById('pwaPermissionBtn').addEventListener('click',async function(){if(!('Notification'in window)){permissionStatus();return;}try{await Notification.requestPermission();}catch(_){}permissionStatus();});
  document.getElementById('pwaSaveAlert').addEventListener('click',async function(){var slug=document.getElementById('pwaAlertProvince').value,target=Number(document.getElementById('pwaAlertTarget').value),condition=document.getElementById('pwaAlertCondition').value,city=appState.cities.find(function(c){return c.slug===slug;}),status=document.getElementById('pwaAlertStatus');if(!city||!Number.isFinite(target)||target<=0){status.textContent='اكتب سعراً مستهدفاً صحيحاً أولاً.';return;}if('Notification'in window&&Notification.permission!=='granted'){try{await Notification.requestPermission();}catch(_){}}var rule={slug:slug,province:cityName(city),condition:condition,target:target};try{localStorage.setItem(ALERT_KEY,JSON.stringify(rule));status.textContent='تم تفعيل التنبيه لمحافظة '+rule.province+'.';}catch(_){status.textContent='تعذر حفظ التنبيه على هذا الجهاز.';}});
  document.getElementById('pwaRemoveAlert').addEventListener('click',function(){try{localStorage.removeItem(ALERT_KEY);}catch(_){}renderAlertForm();});
  window.addEventListener('storage',function(e){if(e.key===HISTORY_KEY||e.key===UNREAD_KEY){detectNewNotifications();renderNotifications();}if(e.key===ALERT_KEY)renderAlertForm();});
  window.addEventListener('dolary-push-history-updated',function(){renderNotifications();setBadge();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden){detectNewNotifications();renderNotifications();loadRates();}});
  setInterval(detectNewNotifications,2500);
  setInterval(loadRates,900000);
  permissionStatus();renderNotifications();setBadge();loadRates();
  }
  loadDevPreviewConfig().then(function(preview){if(preview){window.DOLARY_CONFIG=preview;bootWithConfig();return;}if(!window.DOLARY_CONFIG){var s=document.createElement('script');s.src='./dolary-config.js?v=1';s.onload=bootWithConfig;s.onerror=bootWithConfig;document.head.appendChild(s);}else bootWithConfig();});
})();
