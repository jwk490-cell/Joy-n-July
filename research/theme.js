/* Research Lab 심층리서치 공통 테마 스위치 — light/dark, localStorage 'rl-theme', ?theme= 오버라이드, iframe 전파 */
(function(){
  var KEY='rl-theme', root=document.documentElement;
  function sys(){return (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}
  function stored(){try{var v=localStorage.getItem(KEY);return (v==='dark'||v==='light')?v:null;}catch(e){return null;}}
  function param(){var m=/[?&]theme=(dark|light)/.exec(location.search);return m?m[1]:null;}
  function current(){return param()||stored()||sys();}
  function paint(t,doc){
    doc=doc||document; var r=doc.documentElement; r.setAttribute('data-theme',t); r.style.colorScheme=t;
    var m=doc.querySelector('meta[name=theme-color]'); if(!m){m=doc.createElement('meta');m.name='theme-color';doc.head&&doc.head.appendChild(m);} m.content=(t==='dark')?'#17171C':'#F2F4F6';
    var b=doc.getElementById('rl-theme-btn'); if(b){b.setAttribute('aria-label',t==='dark'?'라이트 모드로 전환':'다크 모드로 전환');b.title=b.getAttribute('aria-label');}
  }
  function frames(){return [].slice.call(document.querySelectorAll('iframe'));}
  function apply(t){
    paint(t);
    frames().forEach(function(f){try{if(f.contentDocument&&f.contentDocument.documentElement)paint(t,f.contentDocument);}catch(e){}});
  }
  function set(t){try{localStorage.setItem(KEY,t);}catch(e){} apply(t);}
  paint(current());
  window.RLTheme={get:current,set:set,apply:apply};
  window.addEventListener('storage',function(e){if(e.key===KEY)apply(current());});
  if(window.matchMedia){try{window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){if(!stored()&&!param())apply(sys());});}catch(e){}}
  document.addEventListener('DOMContentLoaded',function(){
    frames().forEach(function(f){f.addEventListener('load',function(){try{paint(current(),f.contentDocument);}catch(e){}});});
    if(window.top!==window) return; // iframe 안에서는 상위 페이지의 버튼이 제어
    var css='#rl-theme-btn{position:fixed;right:18px;bottom:18px;z-index:9999;width:44px;height:44px;border-radius:50%;border:1px solid #E5E8EB;background:#fff;color:#191F28;box-shadow:0 4px 16px rgba(25,31,40,.12);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s,background .15s}#rl-theme-btn:hover{transform:translateY(-1px)}#rl-theme-btn svg{width:20px;height:20px;display:block}#rl-theme-btn .moon{display:none}html[data-theme=dark] #rl-theme-btn{background:#26262E;color:#E5E8EB;border-color:#3A3A45;box-shadow:0 4px 16px rgba(0,0,0,.45)}html[data-theme=dark] #rl-theme-btn .sun{display:none}html[data-theme=dark] #rl-theme-btn .moon{display:block}@media print{#rl-theme-btn{display:none}}';
    var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
    var b=document.createElement('button'); b.id='rl-theme-btn'; b.type='button';
    b.innerHTML='<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    b.addEventListener('click',function(){set(current()==='dark'?'light':'dark');});
    document.body.appendChild(b); paint(current());
  });
})();
