/* ==========================================================================
   Роли и права. Право — «раздел.действие»: orders.cancel, finance.refund.
   Одиннадцать ролей из ТЗ заданы здесь, их права хранятся в O.roles: основатель
   может их менять и заводить свои роли. У основателя все права всегда — их
   нельзя ни снять, ни изменить.
   ========================================================================== */
"use strict";

/* Действия и разделы. У раздела — только те действия, которые в нём есть:
   пустая клетка в таблице прав честнее галочки, которая ничего не делает. */
const PERM_ACTS = ["view", "create", "edit", "delete", "approve", "cancel", "refund", "export", "manage"];
const PERM_MODS = {
  orders:   ["view", "edit", "approve", "cancel"],
  b2b:      ["view", "create", "edit", "approve", "manage"],
  b2c:      ["view", "edit", "manage", "export"],
  crm:      ["view", "create", "edit", "delete", "export", "manage"],
  finance:  ["view", "approve", "refund", "manage", "export"],
  pricing:  ["view", "edit", "approve"],
  services: ["view", "create", "edit", "delete", "approve"],
  staff:    ["view", "create", "edit"],
  roles:    ["view", "create", "edit", "delete", "approve"],
  audit:    ["view", "export"],
  settings: ["view", "manage"]
};
const ALL_PERMS = () => Object.fromEntries(Object.entries(PERM_MODS).map(([m, a]) => [m, [...a]]));

/* Системные роли в порядке старшинства и их права по умолчанию. */
const SYS_ORDER = ["founder", "owner", "sysadmin", "finance", "b2b", "b2c", "sales", "ops", "content", "support", "viewer"];
const SYS_ROLES = {
  owner:    { ...ALL_PERMS(), roles:["view", "approve"] },
  sysadmin: { services:["view", "create", "edit"], staff:["view", "create", "edit"], roles:["view"], audit:["view", "export"], settings:["view", "manage"] },
  finance:  { orders:["view"], b2b:["view"], finance:["view", "approve", "refund", "manage", "export"], pricing:["view"], audit:["view"] },
  b2b:      { orders:["view", "edit", "approve", "cancel"], b2b:["view", "create", "edit", "approve", "manage"], finance:["view"], pricing:["view"], crm:["view", "create", "edit", "export"] },
  b2c:      { orders:["view", "edit", "approve", "cancel"], b2c:["view", "edit", "manage", "export"], pricing:["view"], crm:["view", "create", "edit", "export"] },
  sales:    { orders:["view", "edit"], b2b:["view"], b2c:["view"], pricing:["view"], services:["view"], crm:["view", "create", "edit", "export"] },
  ops:      { orders:["view", "edit", "approve", "cancel"], b2b:["view", "approve"], b2c:["view", "edit"], services:["view", "create", "edit"], settings:["view"], audit:["view"], crm:["view"] },
  content:  { services:["view", "create", "edit"] },
  support:  { orders:["view"], b2b:["view"], b2c:["view", "edit"], crm:["view", "create", "edit"] },
  viewer:   { orders:["view"], b2b:["view"], b2c:["view", "export"], finance:["view", "export"], pricing:["view"], services:["view"], audit:["view", "export"], crm:["view", "export", "manage"] }
};
/* Права, добавленные в новых версиях: у системных ролей из сохранённой админки
   их ещё нет — дописываются по умолчанию один раз (O.permsV). Свои роли
   основатель настраивает сам. */
const PERMS_V = 2;
const PERMS_ADDED = { 2:["b2c.manage", "b2c.export", "crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export", "crm.manage"] };
const PERMS_NEW_MODS = { 2:["crm"] };
/* Основатель и владелец: их назначает и меняет только основатель. */
const TOP_ROLES = ["founder", "owner"];
/* Роли прошлой версии админки → роли из ТЗ. */
const OLD_ROLES = { admin:"owner", operator:"ops", cashier:"finance", accountant:"viewer" };
const FOUNDER_ID = "st5";

/* Права из хранилища — только известные разделы и действия, без «дыр»:
   действие без просмотра раздела не работает, поэтому без view его нет. */
function cleanPerms(p){
  const out = {};
  for (const [m, acts] of Object.entries(PERM_MODS)) {
    const a = Array.isArray(p?.[m]) ? acts.filter(x => p[m].includes(x)) : [];
    if (a.includes("view")) out[m] = a;
  }
  return out;
}
const samePerms = (a, b) => Object.keys(PERM_MODS).every(m => (a[m] || []).join() === (b[m] || []).join());
const permCount = p => Object.values(p).reduce((n, a) => n + a.length, 0);

const roleById = id => O?.roles?.find(r => r.id === id) || null;
const liveRoles = () => (O?.roles || []).filter(r => !r.deleted);
const permsOf = id => id === "founder" ? ALL_PERMS() : roleById(id)?.perms || {};
const hasPerm = (perms, p) => { const [m, a] = p.split("."); return !!perms[m]?.includes(a); };
/* Право сотрудника s (не только вошедшего). */
const canAs = (s, p) => !!s && (s.role === "founder" || hasPerm(permsOf(s.role), p));
const isFounder = () => me()?.role === "founder";

/* Право текущего сотрудника. Два права — сборные: «задачи» есть у того, кому
   положена хоть одна очередь; «подтверждения» — у того, кто может решать
   запросы или сам их отправлял. */
function can(p){
  const u = me(); if (!u) return false;
  if (p === "tasks") return TASK_KINDS.some(([, need]) => can(need)) || canDecideAny() || can("crm.edit");
  if (p === "approvals") return canDecideAny() || O.approvals.some(a => a.by === u.id);
  if (p === "clients") return can("b2c.view") || can("crm.view");
  return u.role === "founder" || hasPerm(permsOf(u.role), p);
}

/* Название роли: системной — на языке экрана, своей — как её назвали. */
function roleName(id, lang = S.lang){
  const r = roleById(id);
  if (r && !r.sys) return r.name;
  const s = STR["role_" + id];
  return s ? s[LIDX[lang]] ?? s[0] : String(id ?? "—");
}
const roleRank = id => { const i = SYS_ORDER.indexOf(id); return i < 0 ? SYS_ORDER.length : i; };
const byRank = (a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name);

/* ---- защита от повышения самого себя ----
   Свою роль и права своей роли менять нельзя; основателя и владельца
   назначает и меняет только основатель; дать роли можно только те права,
   которые есть у тебя самого. */
const canManageStaff = s => { const u = me(); return !!u && !!s && s.id !== u.id && (isFounder() || !TOP_ROLES.includes(s.role)); };
const assignableRoles = () => liveRoles().filter(r => isFounder() || !TOP_ROLES.includes(r.id));
const canEditRole = r => !!r && !r.deleted && r.id !== "founder" && can("roles.edit") && (isFounder() || (r.id !== me().role && !TOP_ROLES.includes(r.id)));
function grantsBeyond(who, from, to){
  if (!who) return ["*"];
  if (who.role === "founder") return [];
  const mine = permsOf(who.role), out = [];
  for (const [m, acts] of Object.entries(to)) for (const a of acts) if (!from[m]?.includes(a) && !mine[m]?.includes(a)) out.push(`${m}.${a}`);
  return out;
}
const grantsBeyondMine = (from, to) => grantsBeyond(me(), from, to);
const foundersLeft = exceptId => O.staff.filter(s => s.role === "founder" && s.active !== false && s.id !== exceptId).length;

/* ---- перенос сохранённой админки на новые роли ----
   Вызывается при каждом чтении O: должен быть дешёвым и не менять уже
   перенесённое. */
function migrateRoles(o){
  o.roles = (Array.isArray(o.roles) ? o.roles : []).filter(r => r && typeof r.id === "string")
    .map(r => ({ ...r, sys:SYS_ORDER.includes(r.id), perms:r.id === "founder" ? ALL_PERMS() : cleanPerms(r.perms) }));
  for (const id of SYS_ORDER) if (!o.roles.some(r => r.id === id)) o.roles.push({ id, sys:true, perms:id === "founder" ? ALL_PERMS() : cleanPerms(SYS_ROLES[id]) });
  for (let v = (o.permsV || 1) + 1; v <= PERMS_V; v++) for (const r of o.roles) if (r.sys && r.id !== "founder") {
    const def = SYS_ROLES[r.id] || {}, next = Object.fromEntries(Object.entries(r.perms).map(([m, a]) => [m, [...a]]));
    // Новое действие добавляем, только если раздел у роли остался: раздел,
    // который основатель у роли снял, не возвращаем. Новый раздел — целиком.
    for (const p of PERMS_ADDED[v] || []) { const [m, a] = p.split("."), fresh = PERMS_NEW_MODS[v]?.includes(m);
      if (def[m]?.includes(a) && (fresh || next[m]?.includes("view"))) next[m] = [...new Set([...(next[m] || []), "view", a])]; }
    r.perms = cleanPerms(next); o._migrated = true;
  }
  o.permsV = PERMS_V;
  o.roles.sort((a, b) => (a.sys ? roleRank(a.id) : SYS_ORDER.length) - (b.sys ? roleRank(b.id) : SYS_ORDER.length) || (a.at || 0) - (b.at || 0));
  for (const s of o.staff) {
    if (OLD_ROLES[s.role]) { s.role = s.id === FOUNDER_ID && s.role === "admin" && s.active !== false ? "founder" : OLD_ROLES[s.role]; o._migrated = true; }
    if (!o.roles.some(r => r.id === s.role && !r.deleted)) s.role = "viewer";
  }
  // Без основателя права менять было бы некому. Основателем становится
  // действующий владелец (бывший главный администратор), иначе — первый
  // действующий сотрудник. Отключённых не включаем; запись — в журнал.
  if (!o.staff.some(s => s.role === "founder" && s.active !== false)) {
    const f = o.staff.find(s => s.role === "owner" && s.active !== false) || o.staff.find(s => s.active !== false);
    if (f) {
      const from = f.role; f.role = "founder"; o._migrated = true;
      (o.audit ||= []).unshift({ id:uid("a"), f:2, at:Date.now(), staffId:null, role:null, action:"role_migrate", vars:{ name:f.name }, module:"staff",
        diff:[{ k:"staff_role", from:{ role:from }, to:{ role:"founder" } }] });
    }
  }
  o.approvals = Array.isArray(o.approvals) ? o.approvals.filter(a => a && AP_KINDS[a.kind]) : [];
  o.rules = cleanRules(o.rules);
  return o;
}

/* ---- журнал: откуда действие ----
   В демо IP условный: браузер своего адреса не знает. В боевой версии IP и
   устройство записывает сервер из запроса. */
const DEVICE = (() => {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b}, ${os}` : b;
})();
const DEMO_IP = (() => {
  const k = "charteri.ops.ip";
  try { let v = sessionStorage.getItem(k); if (!v) { const n = () => 2 + Math.floor(Math.random() * 250); v = `10.${20 + Math.floor(Math.random() * 20)}.${n()}.${n()}`; sessionStorage.setItem(k, v); } return v; }
  catch(e) { return "10.20.0.1"; }
})();
