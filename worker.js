import { DurableObject } from "cloudflare:workers";
export class RealtimeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS live_attendance (member_id TEXT PRIMARY KEY, name TEXT, joined_at INTEGER)");
  }
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WS", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws, message) {
    let data; try { data = JSON.parse(message); } catch { return; }
    const sessions = this.ctx.getWebSockets();
    if (data.type === "join") {
      ws.serializeAttachment({ memberId: data.memberId, name: data.name, role: data.role });
      ws.send(JSON.stringify({ type: "sync", onlineCount: sessions.length }));
      this._broadcast(sessions, { type: "presence_update", count: sessions.length });
    } else if (data.type === "presence") {
      const att = ws.deserializeAttachment(); if (!att) return;
      this._broadcast(sessions, { type: "presence", memberId: att.memberId, name: att.name, at: Date.now() });
    } else if (data.type === "quiz_answer") {
      const att = ws.deserializeAttachment(); if (!att) return;
      this._broadcast(sessions, { type: "quiz_answer", name: att.name, answerId: data.answerId }, true);
    } else { this._broadcast(sessions, data); }
  }
  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (att?.memberId) this.sql.exec("DELETE FROM live_attendance WHERE member_id=?", att.memberId);
    this._broadcast(this.ctx.getWebSockets(), { type: "presence_update", count: this.ctx.getWebSockets().length });
  }
  _broadcast(sessions, msg, leadersOnly = false) {
    const p = JSON.stringify(msg);
    for (const ws of sessions) {
      if (ws.readyState !== 1) continue;
      if (leadersOnly) { const a = ws.deserializeAttachment(); if (a?.role !== "leader" && a?.role !== "admin") continue; }
      try { ws.send(p); } catch {}
    }
  }
  async rpcBroadcast(m) { this._broadcast(this.ctx.getWebSockets(), m); return { ok: true }; }
  async rpcGetOnlineCount() { return this.ctx.getWebSockets().length; }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.REALTIME_ROOM.idFromName(url.searchParams.get("room") || "main");
      return env.REALTIME_ROOM.get(id).fetch(request);
    }
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return new Response(HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
  },
};
async function handleApi(request, env, url) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  await initDb(env);
  const p = url.pathname.replace("/api", "").split("/").filter(Boolean);
  const r = p[0], id = p[1];
  try {
    let res;
    if (r === "members") res = await env.DB.prepare("SELECT * FROM members ORDER BY name LIMIT 100").all();
    else if (r === "members-add") { const b = await request.json(); await env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.name, b.phone||null, b.role||"member", Date.now()).run(); res = { ok: true }; }
    else if (r === "attendance") { const b = await request.json(); await env.DB.prepare("INSERT INTO attendance VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.memberId, "main", "present", Date.now()).run(); res = { ok: true }; }
    else if (r === "announcements") res = await env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50").all();
    else if (r === "announcements-add") { const b = await request.json(); await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), b.title, b.body, Date.now()).run(); env.REALTIME_ROOM.get(env.REALTIME_ROOM.idFromName("main")).rpcBroadcast({ type: "announcement", title: b.title, body: b.body, at: Date.now() }); res = { ok: true }; }
    else if (r === "events") res = await env.DB.prepare("SELECT * FROM events ORDER BY event_date DESC LIMIT 50").all();
    else if (r === "events-add") { const b = await request.json(); await env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.title, b.description||null, b.eventDate||Date.now(), Date.now()).run(); res = { ok: true }; }
    else if (r === "stats") { const m = await env.DB.prepare("SELECT COUNT(*) as c FROM members").first("c"); const a = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance").first("c"); res = { members: m, attendance: a }; }
    else if (r === "online") res = { online: await env.REALTIME_ROOM.get(env.REALTIME_ROOM.idFromName("main")).rpcGetOnlineCount() };
    else return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: cors });
    return new Response(JSON.stringify(res), { headers: cors });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors }); }
}
async function initDb(env) {
  if (env._db) return; env._db = true;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT, phone TEXT, role TEXT DEFAULT 'member', created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, member_id TEXT, event_id TEXT, status TEXT, recorded_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, event_date INTEGER, created_at INTEGER)"),
  ]);
}
const HTML = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>شباب الثلاثة فتية</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet"><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:Cairo,sans-serif}</style></head><body class="bg-slate-50"><div id="app"></div><script>
let user=JSON.parse(localStorage.getItem("u")||"null"),ws=null,online=0,conn=false,ln={};
const api=async(p,o={})=>(await fetch("/api"+p,{headers:{"Content-Type":"application/json"},...o})).json();
const go=h=>{location.hash=h;render()};const route=()=>location.hash.replace("#","")||"/";
const isL=()=>user&&(user.role==="leader"||user.role==="admin");
function cWS(){if(ws&&ws.readyState===1)return;const pr=location.protocol==="https:"?"wss":"ws";ws=new WebSocket(pr+"://"+location.host+"/ws?room=main");
ws.onopen=()=>{conn=true;if(user)ws.send(JSON.stringify({type:"join",...user}));render()};
ws.onmessage=e=>{if(e.data==="pong")return;try{const m=JSON.parse(e.data);if(m.type==="presence_update"||m.type==="sync")online=m.count||0;(ln[m.type]||[]).forEach(c=>c(m));render()}catch{}};
ws.onclose=()=>{conn=false;render();setTimeout(cWS,2000)};
setInterval(()=>{if(ws&&ws.readyState===1)ws.send("ping")},30000);}
const send=m=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(m))};
const on=(t,c)=>{(ln[t]=ln[t]||[]).push(c)};
function nav(){const i=[["/","📊","الرئيسية"],["/attendance","✅","الحضور"],["/quiz","🎯","مسابقة"],["/announcements","📢","إعلانات"],["/events","📅","فعاليات"]];
return '<nav class="bg-white border-b sticky top-0 z-50 shadow-sm"><div class="max-w-4xl mx-auto px-4 flex items-center justify-between h-14"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold">ث</div><span class="font-bold hidden sm:block">شباب الثلاثة فتية</span></div><div class="flex gap-1 overflow-x-auto">'+i.map(x=>'<a href="#'+x[0]+'" class="px-3 py-2 rounded-lg text-sm font-semibold '+(route()===x[0]?"bg-green-100 text-green-700":"text-slate-600 hover:bg-slate-100")+'">'+x[1]+' <span class="hidden md:inline">'+x[2]+'</span></a>').join("")+'</div><button onclick="localStorage.removeItem(\\'u\\');user=null;go(\\'/login\\')" class="text-slate-400">🚪</button></div></nav>'}
function login(){return '<div class="min-h-screen bg-gradient-to-br from-green-600 to-green-900 flex items-center justify-center p-4"><div class="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center"><div class="w-20 h-20 rounded-3xl bg-green-600 flex items-center justify-center text-white text-4xl font-bold mx-auto mb-4">ث</div><h1 class="text-2xl font-bold mb-1">شباب الثلاثة فتية</h1><p class="text-slate-500 mb-6">سجّل دخولك</p><input id="ln" type="text" placeholder="الاسم" class="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-green-500 mb-3"><select id="lr" class="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none mb-3"><option value="member">عضو</option><option value="leader">خادم</option><option value="admin">مشرف</option></select><button onclick="const n=document.getElementById(\\'ln\\').value.trim();if(!n)return;user={memberId:crypto.randomUUID(),name:n,role:document.getElementById(\\'lr\\').value};localStorage.setItem(\\'u\\',JSON.stringify(user));cWS();go(\\'/\\')" class="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-lg">دخول 🚀</button></div></div>'}
async function dash(){const s=await api("/stats").catch(()=>({}));return '<div class="max-w-4xl mx-auto p-4 space-y-4"><div class="bg-gradient-to-l from-green-600 to-green-800 rounded-2xl p-6 text-white"><h1 class="text-2xl font-bold">أهلاً، '+user.name+' 👋</h1><p>'+(conn?"🟢 متصل":"🔴 جارٍ الاتصال")+'</p></div><div class="grid grid-cols-3 gap-4"><div class="bg-white rounded-2xl p-5 shadow-sm text-center"><div class="text-3xl mb-1">👥</div><div class="text-2xl font-bold">'+(s.members||0)+'</div><div class="text-sm text-slate-500">أعضاء</div></div><div class="bg-white rounded-2xl p-5 shadow-sm text-center"><div class="text-3xl mb-1">✅</div><div class="text-2xl font-bold">'+(s.attendance||0)+'</div><div class="text-sm text-slate-500">حضور</div></div><div class="bg-white rounded-2xl p-5 shadow-sm text-center"><div class="text-3xl mb-1">🟢</div><div class="text-2xl font-bold">'+online+'</div><div class="text-sm text-slate-500">متصل</div></div></div><div class="bg-white rounded-2xl p-5 shadow-sm"><h3 class="font-bold mb-3">إجراءات سريعة</h3><a href="#/attendance" class="block p-3 rounded-xl bg-slate-50 hover:bg-slate-100 mb-2">📝 تسجيل الحضور</a><a href="#/quiz" class="block p-3 rounded-xl bg-slate-50 hover:bg-slate-100 mb-2">🎯 المسابقة</a><a href="#/announcements" class="block p-3 rounded-xl bg-slate-50 hover:bg-slate-100">📢 الإعلانات</a></div></div>'}
function attendance(){on("presence",m=>{const d=document.getElementById("live");if(d)d.innerHTML='<div class="flex justify-between p-2 rounded-xl bg-slate-50"><span>'+m.name+'</span><span class="text-xs text-slate-400">'+new Date().toLocaleTimeString("ar-EG")+'</span></div>'+d.innerHTML});return '<div class="max-w-2xl mx-auto p-4 space-y-4"><h1 class="text-2xl font-bold">تسجيل الحضور</h1><div class="rounded-2xl p-6 text-center '+(conn?"bg-green-50":"bg-amber-50")+'"><div class="font-bold text-lg">'+(conn?"🟢 متصل":"جارٍ الاتصال")+'</div><p class="text-slate-600 mt-1">المتصلون: <strong>'+online+'</strong></p></div><div class="bg-white rounded-2xl p-6 text-center shadow-sm"><button onclick="send({type:\\'presence\\',status:\\'present\\'});api(\\'/attendance\\',{method:\\'POST\\',body:JSON.stringify({memberId:user.memberId})});this.outerHTML=\\'<div class=\\\\"text-green-600 font-bold text-lg\\\\">✅ تم تسجيل حضورك!</div>\\'" class="bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-green-700">تسجيل الحضور ✋</button></div>'+(isL()?'<div class="bg-white rounded-2xl p-4 shadow-sm"><h3 class="font-bold mb-2">الحضور اللحظي</h3><div id="live" class="space-y-2"><p class="text-slate-400 text-center py-4">بانتظار الحضور...</p></div></div>':'')+'</div>'}
const Q=[{t:"كم فتى في قصة الثلاثة فتية؟",o:["2","3","4","5"],c:1},{t:"من ألقى الفتية في النار؟",o:["بختنصر","نيبوخذ نصر","داريوس","كورش"],c:1},{t:"من كان رفيقهم في النار؟",o:["ملاك الرب","دانيال","عزرا","نحميا"],c:0}];
const CL=["bg-red-500","bg-blue-500","bg-amber-500","bg-green-500"];let qi=0,ph="lobby",ans={},sel=null,tl=0,sc={};
function quiz(){on("quiz_state",m=>{qi=m.questionIdx;ph="question";tl=m.timeLimit;sel=null;render()});on("quiz_answer",m=>{ans[m.name]={a:m.answerId};render()});on("quiz_results",m=>{ph="results";render()});on("quiz_final",m=>{ph="final";sc=m.scores||sc;render()});
if(ph==="lobby")return '<div class="max-w-lg mx-auto p-4 text-center"><h1 class="text-2xl font-bold mb-4">المسابقة 🎯</h1><div class="bg-white rounded-2xl p-12 shadow-sm"><div class="text-6xl mb-4">🎯</div><h2 class="text-xl font-bold mb-2">'+(isL()?"جاهز؟":"بانتظار المشرف")+'</h2><p class="text-slate-500 mb-6">سؤال '+(qi+1)+" من "+Q.length+'</p>'+(isL()?'<button onclick="ph=\\'question\\';ans={};sel=null;tl=Q[qi].time;send({type:\\'quiz_state\\',questionIdx:qi,timeLimit:Q[qi].time});render();setInterval(()=>{tl--;if(tl<=0&&isL())showRes();render()},1000)" class="bg-green-600 text-white px-8 py-3 rounded-xl font-bold text-lg">ابدأ 🚀</button>':'')+'</div></div>';
if(ph==="question"){const q=Q[qi];return '<div class="max-w-lg mx-auto p-4 space-y-4"><div class="text-center text-4xl font-bold '+(tl<=5?"text-red-500":"text-green-600")+'">⏱️ '+tl+'</div><div class="bg-green-700 text-white rounded-2xl p-6 text-center"><h2 class="text-xl font-bold">'+q.t+'</h2></div><div class="grid grid-cols-2 gap-3">'+q.o.map((o,i)=>'<button onclick="if(sel!==null)return;sel='+i+';send({type:\\'quiz_answer\\',answerId:'+i+'});render()" class="'+CL[i]+' text-white min-h-[100px] rounded-2xl text-lg font-bold '+(sel===i?"ring-4 ring-white":"")+(sel!==null&&sel!==i?" opacity-50":"")+'">'+o+'</button>').join("")+'</div>'+(isL()?'<div class="bg-white rounded-2xl p-4 shadow-sm text-center"><div class="font-bold mb-2">الإجابات: '+Object.keys(ans).length+'</div><button onclick="showRes()" class="bg-green-600 text-white px-4 py-2 rounded-xl">عرض النتائج 📊</button></div>':'')+'</div>'}
if(ph==="results"){const q=Q[qi];return '<div class="max-w-lg mx-auto p-4"><div class="bg-white rounded-2xl p-6 shadow-sm text-center"><h2 class="text-xl font-bold mb-4">النتائج</h2><div class="space-y-3">'+q.o.map((o,i)=>{const n=Object.values(ans).filter(a=>a.a===i).length;return '<div class="flex justify-between text-sm"><span>'+o+(i===q.c?" ✓":"")+'</span><span>'+n+'</span></div>'}).join("")+'</div>'+(isL()?'<button onclick="if(qi+1>=Q.length){ph=\\'final\\';send({type:\\'quiz_final\\',scores:sc})}else{qi++;ph=\\'lobby\\'};render()" class="bg-green-600 text-white px-8 py-2 rounded-xl mt-4">التالي ←</button>':'')+'</div></div>'}
if(ph==="final"){const s=Object.entries(sc).sort(([,a],[,b])=>b-a);return '<div class="max-w-md mx-auto p-4 text-center"><div class="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-8 shadow-sm"><div class="text-6xl mb-4">🏆</div><h1 class="text-3xl font-bold text-amber-700 mb-6">انتهت المسابقة!</h1>'+s.map(([id,s],i)=>'<div class="flex justify-between p-3 rounded-xl mb-2 '+(i===0?"bg-amber-200":"bg-white")+'"><span>'+["🥇","🥈","🥉"][i]+'</span><span>'+s+' نقطة</span></div>').join("")+'<button onclick="qi=0;ph=\\'lobby\\';sc={};render()" class="bg-green-600 text-white px-6 py-2 rounded-xl mt-4">جديد</button></div></div>'}return ""}
function showRes(){const c=Q[qi].c;Object.entries(ans).forEach(([id,a])=>{if(a.a===c)sc[id]=(sc[id]||0)+10+tl});ph="results";send({type:"quiz_results"});render()}
async function anns(){const d=await api("/announcements").catch(()=>({results:[]}));const l=d.results||[];on("announcement",m=>{l.unshift({title:m.title,body:m.body,created_at:m.at});render()});return '<div class="max-w-2xl mx-auto p-4 space-y-4"><div class="flex justify-between"><h1 class="text-2xl font-bold">الإعلانات 📢</h1></div>'+(isL()?'<div class="bg-white rounded-2xl p-6 shadow-sm space-y-3"><input id="at" placeholder="العنوان" class="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none"><textarea id="ab" placeholder="المحتوى" class="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none min-h-[80px]"></textarea><button onclick="api(\\'/announcements-add\\',{method:\\'POST\\',body:JSON.stringify({title:document.getElementById(\\'at\\').value,body:document.getElementById(\\'ab\\').value})});go(\\'/announcements\\')" class="bg-green-600 text-white px-6 py-2 rounded-xl font-bold w-full">نشر 📡</button></div>':'')+(l.length===0?'<div class="bg-white rounded-2xl p-12 text-center text-slate-400">لا إعلانات</div>':l.map(a=>'<div class="bg-white rounded-2xl p-5 shadow-sm border-r-4 border-green-500"><h3 class="font-bold text-lg">'+a.title+'</h3><p class="text-slate-600 mt-2">'+a.body+'</p><div class="text-xs text-slate-400 mt-2">'+new Date(a.created_at).toLocaleString("ar-EG")+'</div></div>').join(""))+'</div>'}
async function events(){const d=await api("/events").catch(()=>({results:[]}));const l=d.results||[];return '<div class="max-w-2xl mx-auto p-4 space-y-4"><div class="flex justify-between"><h1 class="text-2xl font-bold">الفعاليات 📅</h1></div>'+(l.length===0?'<div class="bg-white rounded-2xl p-12 text-center text-slate-400">لا فعاليات</div>':l.map(e=>{const dd=Math.ceil((e.event_date-Date.now())/86400000);return '<div class="bg-white rounded-2xl p-5 shadow-sm"><div class="flex justify-between mb-2"><h3 class="font-bold text-lg">'+e.title+'</h3><span class="px-2 py-0.5 rounded-full text-xs '+(dd<=0?"bg-red-100 text-red-700":"bg-green-100 text-green-700")+'">'+(dd<=0?"انتهى":"بعد "+dd+" يوم")+'</span></div><p class="text-slate-600 text-sm">'+(e.description||"")+'</p></div>'}).join(""))+'</div>'}
async function render(){const a=document.getElementById("app");if(!user&&route()!=="/login"){go("/login");return}if(!user){a.innerHTML=login();return}const r=route();let c="";if(r==="/")c=await dash();else if(r==="/attendance")c=attendance();else if(r==="/quiz")c=quiz();else if(r==="/announcements")c=await anns();else if(r==="/events")c=await events();else c=await dash();a.innerHTML=nav()+c}
window.onhashchange=render;cWS();render();
</script></body></html>`;
