/* ==========================================================================
   Подтверждения («четыре глаза»). Критичную операцию система выполняет,
   только когда её подтвердит другой сотрудник с правом «подтверждать» в этом
   разделе. Запрос хранит всё, чтобы выполнить операцию позже; перед
   выполнением данные проверяются заново — за время ожидания они могли
   измениться. Основатель — последняя инстанция: его действия выполняются сразу.

   Статусы запроса: pending → executed | rejected | failed | withdrawn.
   ========================================================================== */
"use strict";

/* Вид запроса: правило, которое его включает, право, нужное для решения,
   раздел журнала и значок. */
const AP_KINDS = {
  refund:     { rule:"refund",  perm:"finance.approve",  module:"finance",  icon:"back" },
  adjust:     { rule:"adjust",  perm:"finance.approve",  module:"finance",  icon:"wallet" },
  credit:     { rule:"adjust",  perm:"finance.approve",  module:"finance",  icon:"wallet" },
  pricing:    { rule:"pricing", perm:"pricing.approve",  module:"pricing",  icon:"tag" },
  role_new:   { rule:"access",  perm:"roles.approve",    module:"roles",    icon:"key" },
  role_edit:  { rule:"access",  perm:"roles.approve",    module:"roles",    icon:"key" },
  role_del:   { rule:"access",  perm:"roles.approve",    module:"roles",    icon:"key" },
  staff_add:  { rule:"access",  perm:"roles.approve",    module:"staff",    icon:"badge" },
  staff_role: { rule:"access",  perm:"roles.approve",    module:"staff",    icon:"badge" },
  dir_del:    { rule:"delete",  perm:"services.approve", module:"services", icon:"globe" }
};
/* Правила: какие операции ждут второго сотрудника. У денежных — порог в сумах. */
const AP_RULES = ["refund", "adjust", "pricing", "access", "delete"];
const DEFAULT_RULES = { refund:{ on:true, min:5_000_000 }, adjust:{ on:true, min:0 }, pricing:{ on:true }, access:{ on:true }, delete:{ on:true } };
const RULE_MIN_MAX = 10_000_000_000;
function cleanRules(r){
  const out = {};
  for (const k of AP_RULES) {
    const d = DEFAULT_RULES[k], x = r?.[k];
    out[k] = { on:typeof x?.on === "boolean" ? x.on : d.on };
    if ("min" in d) out[k].min = Number.isInteger(x?.min) && x.min >= 0 && x.min <= RULE_MIN_MAX ? x.min : d.min;
  }
  return out;
}
/* Решённые запросы храним ограниченно, ждущие — все. */
const AP_KEEP = 300;

function needsApproval(kind, amount = 0){
  if (isFounder()) return false;
  const r = O.rules[AP_KINDS[kind].rule];
  return !!r?.on && (r.min == null || Math.abs(amount) >= r.min);
}
const pendingAp = key => O?.approvals?.find(a => a.status === "pending" && a.key === key) || null;
const refundKey = r => `refund:${r.src}:${r.o.id}`;
const apText = a => tf("apk_" + a.kind, auditVars(a.vars));

/* Запрос. key — что именно меняется: второй такой же, пока первый ждёт, не
   создаётся. vars — значения для текста, diff — что было → что станет.
   Возвращает, создан ли запрос. */
function requestApproval(kind, { key, payload, vars = {}, diff = [], amount = null }){
  let dup = false;
  change(() => {
    if (pendingAp(key)) { dup = true; return; }
    O.approvals.unshift({ id:uid("ap"), kind, key, payload, vars, diff, amount, status:"pending", by:me().id, at:Date.now() });
    const done = O.approvals.filter(a => a.status !== "pending");
    if (done.length > AP_KEEP) { const drop = new Set(done.slice(AP_KEEP).map(a => a.id)); O.approvals = O.approvals.filter(a => !drop.has(a.id)); }
    audit("ap_request", { apk:kind, w:vars }, { module:AP_KINDS[kind].module, diff });
  });
  toast(t(dup ? "ap_dup" : "ap_sent"));
  return !dup;
}

/* Почему текущий сотрудник не может решить запрос (ключ строки) или null.
   Свой запрос подтверждает другой; изменение своих прав — тоже другой. */
function apBlock(a){
  const u = me(); if (!u) return "no_rights";
  if (a.by === u.id) return "ap_err_self";
  if (!can(AP_KINDS[a.kind].perm)) return "no_rights";
  const p = a.payload || {};
  if ((a.kind === "staff_role" && p.staffId === u.id) || (["role_edit", "role_del"].includes(a.kind) && p.roleId === u.role)) return "ap_err_own";
  return null;
}
const myDecisions = () => (O?.approvals || []).filter(a => a.status === "pending" && !apBlock(a));
const canDecideAny = () => Object.values(AP_KINDS).some(k => can(k.perm));
/* Запрос видят его автор и те, у кого есть право его решать. */
const canSeeAp = a => a.by === me()?.id || can(AP_KINDS[a.kind].perm);

/* Исполнители: работают внутри change() — O уже свежий, change() не вызывают.
   Возвращают ключ ошибки или null. Сами операции — рядом с их разделами. */
const AP_EXEC = {
  refund:     (p, a) => execRefund(p, a),
  adjust:     (p, a) => execAdjust(p, a),
  credit:     (p, a) => execCredit(p, a),
  pricing:    (p, a) => execPricing(p, a),
  role_new:   (p, a) => execRoleNew(p, a),
  role_edit:  (p, a) => execRoleEdit(p, a),
  role_del:   (p, a) => execRoleDel(p, a),
  staff_add:  (p, a) => execStaffAdd(p, a),
  staff_role: (p, a) => execStaffRole(p, a),
  dir_del:    (p, a) => execDirDel(p, a)
};
/* Право, с которым запрос создавали. К моменту решения автор должен быть
   действующим сотрудником и сохранить это право — иначе запрос не выполняется:
   отключённый или понижённый сотрудник не проводит операцию чужими руками. */
const AP_REQ_PERM = { refund:"finance.refund", adjust:"finance.manage", credit:"finance.manage", pricing:"pricing.edit", role_new:"roles.create", role_edit:"roles.edit",
  role_del:"roles.delete", staff_add:"staff.create", staff_role:"staff.edit", dir_del:"services.delete" };
function requesterBlock(a){
  const u = O.staff.find(s => s.id === a.by), p = a.payload || {};
  if (!u || u.active === false) return "ap_err_requester";
  const founder = u.role === "founder";
  if (!founder && !hasPerm(permsOf(u.role), AP_REQ_PERM[a.kind])) return "ap_err_requester";
  if (a.kind === "role_edit" && (p.roleId === u.role || (!founder && TOP_ROLES.includes(p.roleId)) || grantsBeyond(u, p.from, p.to).length)) return "ap_err_requester";
  if (a.kind === "role_new" && grantsBeyond(u, {}, p.role.perms).length) return "ap_err_requester";
  if (a.kind === "staff_role") { const x = O.staff.find(s => s.id === p.staffId);
    if (p.staffId === u.id || (!founder && (TOP_ROLES.includes(p.to) || TOP_ROLES.includes(x?.role)))) return "ap_err_requester"; }
  if (a.kind === "staff_add" && !founder && TOP_ROLES.includes(p.rec.role)) return "ap_err_requester";
  return null;
}
/* Сотрудника отключили или сменили ему роль — его ждущие запросы снимаются. */
function withdrawAllBy(staffId){
  for (const a of O.approvals) if (a.status === "pending" && a.by === staffId) {
    Object.assign(a, { status:"withdrawn", decidedBy:me()?.id || null, decidedAt:Date.now(), reason:"", error:"ap_err_requester" });
    audit("ap_withdraw", { apk:a.kind, w:a.vars }, { module:AP_KINDS[a.kind].module });
  }
}
function decideApproval(id, ok, reason = ""){
  const a0 = O.approvals.find(x => x.id === id);
  if (!a0 || a0.status !== "pending") { rerender(); return false; }
  const why = apBlock(a0); if (why) { toast(t(why)); return false; }
  if (!ok && !reason) { toast(t("err_reason")); return false; }
  // Операция проверит данные заново — берём свежие кабинет и сайт.
  S = loadState() || S; adminPrefs(); SITE = loadSite();
  let status = null;
  change(() => {
    const a = O.approvals.find(x => x.id === id); if (!a || a.status !== "pending") return;
    const err = ok ? requesterBlock(a) || AP_EXEC[a.kind](a.payload, a) : null;
    status = !ok ? "rejected" : err ? "failed" : "executed";
    Object.assign(a, { status, decidedBy:me().id, decidedAt:Date.now(), reason:ok ? "" : reason, error:err || "" });
    audit(!ok ? "ap_no" : err ? "ap_fail" : "ap_ok", { apk:a.kind, w:a.vars, name:staffName(a.by), reason, error:err ? strRef(err) : "" }, { module:AP_KINDS[a.kind].module });
  });
  if (status) toast(t("t_ap_" + status));
  return !!status;
}
function withdrawApproval(id){
  let done = false;
  change(() => {
    const a = O.approvals.find(x => x.id === id); if (!a || a.status !== "pending" || a.by !== me().id) return;
    Object.assign(a, { status:"withdrawn", decidedBy:me().id, decidedAt:Date.now() }); done = true;
    audit("ap_withdraw", { apk:a.kind, w:a.vars }, { module:AP_KINDS[a.kind].module });
  });
  if (done) toast(t("t_ap_withdrawn"));
}

/* ---- строка запроса ----
   mode: decide — можно решить; mine — свой, ждёт; wait — чужой, решить нельзя
   (показываем почему); done — решённый. */
function apDiff(a){
  return a.diff?.length ? `<ul class="ap-diff">${a.diff.map(d => `<li><span class="muted">${esc(diffLabel(d))}:</span> <s>${esc(auditVal(d.from) || "—")}</s> <span aria-hidden="true">→</span><span class="sr-only">${esc(t("ap_becomes"))}</span> <b>${esc(auditVal(d.to) || "—")}</b></li>`).join("")}</ul>` : "";
}
function apRow(a, mode){
  const k = AP_KINDS[a.kind], by = O.staff.find(s => s.id === a.by);
  const meta = [by ? `${by.name} · ${roleName(by.role)}` : "—", ago(a.at)].join(" · ");
  let act = "";
  if (mode === "decide") act = `<button type="button" class="solid sm" data-act="apok" data-v="${a.id}">${esc(t("approve"))}</button>${rejectBox("ap" + a.id, "apno", `data-v="${a.id}"`, k.perm, "ap_reason_ph")}`;
  else if (mode === "mine") act = `<span class="pill st-PENDING">${esc(t("ap_wait"))}</span><button type="button" class="link" data-act="apwithdraw" data-v="${a.id}">${esc(t("ap_withdraw"))}</button>`;
  else if (mode === "wait") act = `<span class="pill st-PENDING">${esc(t("ap_wait"))}</span>`;
  else act = `<span class="pill ${a.status === "executed" ? "st-CONFIRMED" : a.status === "withdrawn" ? "st-NEW" : "st-CANCELLED"}">${esc(t("ap_st_" + a.status))}</span>`;
  const note = mode === "wait" ? `<span class="small muted">${esc(t(apBlock(a) || "ap_wait"))}</span>`
    : mode === "done" ? `<span class="small muted">${esc(tf(a.status === "withdrawn" ? "ap_withdrawn_at" : "ap_decided", { name:staffName(a.decidedBy), ago:ago(a.decidedAt) }))}${a.reason ? ` · «${esc(a.reason)}»` : ""}${a.error ? ` · ${esc(t(a.error))}` : ""}</span>` : "";
  return `<div class="task ap-row" id="ap-${a.id}"><span class="task-ic ${mode === "decide" ? "warn" : ""}">${IC[k.icon]}</span>
    <span class="task-main"><b>${esc(apText(a))}</b><span class="muted small">${esc(meta)}</span>${apDiff(a)}${note}</span>
    ${a.amount ? `<b class="task-amt mono">${esc(auditVal(uzsRef(a.amount, a.kind === "adjust")))}</b>` : "<span></span>"}
    <span class="task-act">${act}</span></div>`;
}
Object.assign(ACT, {
  apok:       el => { const f = nextApFocus(el); if (decideApproval(el.dataset.v, true)) f(); },
  apno:       el => { const f = nextApFocus(el); if (decideApproval(el.dataset.v, false, takeInp("why:ap" + el.dataset.v))) { M.ui.ask["ap" + el.dataset.v] = false; rerender(); f(); } },
  apwithdraw: el => withdrawApproval(el.dataset.v)
});
/* После решения строка уходит из списка — фокус на следующую «Подтвердить»
   или на заголовок, чтобы клавиатура не терялась в начале страницы. */
function nextApFocus(el){
  const rows = $$(".ap-row"), i = rows.indexOf(el.closest(".ap-row"));
  const nextId = (rows[i + 1] || rows[i - 1])?.id;
  return () => { const b = nextId && $(`#${nextId} [data-act="apok"]`); (b || $("h1"))?.focus({ preventScroll:!b }); };
}
