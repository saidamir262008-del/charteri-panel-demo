/* ==========================================================================
   Общие куски CRM: комментарии и контакты, задачи, ответственный, история.
   Ими пользуются карточка лида, карточка клиента и страница агентства.
   ========================================================================== */
"use strict";

const cssKey = s => String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
const staffChip = id => { const s = O.staff.find(x => x.id === id);
  return s ? `<span class="who-chip"><span class="avatar xs" aria-hidden="true">${esc(monogram(s.name))}</span><span>${esc(s.name)}</span></span>` : `<span class="muted">${esc(t("crm_nobody"))}</span>`; };
const usd = n => n ? "$" + grp(n) : "—";
const stagePill = st => `<span class="pill ls-${st}">${esc(t("ls_" + st))}</span>`;

/* ---- комментарии и контакты ----
   targets — чьи записи показать: у клиента — его и всех его лидов. */
function notesBlock(target, targets = [target]){
  const list = notesFor(targets), id = "nt-" + cssKey(target), canW = canNote(target);
  return `<section class="card stack" aria-labelledby="${id}"><h2 id="${id}">${esc(t("crm_notes"))}</h2>
    ${canW ? `<div class="note-form">
      <select class="minisel" data-inp="nk:${esc(target)}" aria-label="${esc(t("crm_note_kind"))}">${NOTE_KINDS.map(k => `<option value="${k}" ${inp("nk:" + target, "call") === k ? "selected" : ""}>${esc(t("nk_" + k))}</option>`).join("")}</select>
      <textarea data-inp="nt:${esc(target)}" rows="2" maxlength="${NOTE_MAX}" placeholder="${esc(t("crm_note_ph"))}" aria-label="${esc(t("crm_note_text"))}">${esc(inp("nt:" + target))}</textarea>
      <button type="button" class="solid sm" data-act="crmnote" data-v="${esc(target)}">${esc(t("crm_note_add"))}</button></div>` : ""}
    ${list.length ? `<ol class="feed">${list.map(n => `<li><span class="feed-dot nk-${n.kind}" aria-hidden="true"></span><span class="stack" style="gap:2px">
        <span><b>${esc(t("nk_" + n.kind))}</b> · ${esc(loc(n.text))}</span>
        <span class="muted small">${esc(staffName(n.by))} · ${esc(fdt(n.at))}${n.target !== target ? ` · <a class="link" href="${targetHref(n.target)}">${esc(targetLabel(n.target))}</a>` : ""}</span></span></li>`).join("")}</ol>`
      : `<p class="muted">${esc(t("crm_notes_none"))}</p>`}</section>`;
}

/* ---- задачи и напоминания ---- */
/* Поручить задачу можно тому, кто ведёт лиды и видит, к чему она относится. */
const taskAssignees = target => crmStaff().filter(s => canSeeTarget(target, s));
/* Срок по умолчанию — через 1–2 часа, ровно по часам; вечером и ночью — завтра в 10:00. */
function defaultDue(){
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 2);
  if (d.getHours() >= 21 || d.getHours() < 9 || ymd(d) !== TODAY) { const x = parseYMD(addDays(TODAY, 1)); return { date:ymd(x), time:"10:00" }; }
  return { date:ymd(d), time:`${String(d.getHours()).padStart(2, "0")}:00` };
}
const canToggleTask = x => can("crm.edit") && (x.assignee === me()?.id || crmAll());
function taskRow(x, withTarget){
  const over = taskOverdue(x);
  return `<li class="crm-task ${x.done ? "done" : ""}"><label class="chk"><input type="checkbox" data-task="${x.id}" ${x.done ? "checked" : ""} ${canToggleTask(x) ? "" : "disabled"}>
      <span>${esc(loc(x.text))}</span></label>
    <span class="crm-task-meta"><span class="small ${over ? "warn-t" : "muted"}">${over ? esc(t("crm_overdue")) + " · " : ""}${esc(fdt(x.due))}</span>
      <span class="small">${staffChip(x.assignee)}</span>
      ${withTarget ? `<a class="link small" href="${targetHref(x.target)}">${esc(targetLabel(x.target))}</a>` : ""}</span></li>`;
}
function tasksBlock(target, targets = [target]){
  const list = tasksFor(targets).sort((a, b) => a.done - b.done || a.due - b.due), id = "tk-" + cssKey(target), canW = can("crm.edit") && canNote(target);
  const k = s => `${s}:${target}`, dd = defaultDue();
  return `<section class="card stack" aria-labelledby="${id}"><h2 id="${id}">${esc(t("crm_tasks"))}</h2>
    ${list.length ? `<ul class="crm-tasks">${list.map(x => taskRow(x, targets.length > 1 && x.target !== target)).join("")}</ul>` : `<p class="muted">${esc(t("crm_tasks_none"))}</p>`}
    ${canW ? `<div class="task-form stack">
      <label class="field"><span>${esc(t("crm_task_text"))}</span><input data-inp="${esc(k("tt"))}" value="${esc(inp(k("tt")))}" maxlength="${TASK_MAX}" placeholder="${esc(t("crm_task_ph"))}"></label>
      <div class="sgrid sgrid-2">
        <label class="field"><span>${esc(t("crm_task_due"))}</span><input type="date" data-inp="${esc(k("td"))}" value="${esc(inp(k("td"), dd.date))}" min="${TODAY}"></label>
        <label class="field"><span>${esc(t("time"))}</span><input type="time" data-inp="${esc(k("th"))}" value="${esc(inp(k("th"), dd.time))}"></label>
      </div>
      <label class="field"><span>${esc(t("crm_assignee"))}</span><select data-inp="${esc(k("ta"))}">${taskAssignees(target).map(s => `<option value="${s.id}" ${inp(k("ta"), me().id) === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><div class="err" id="terr-${cssKey(target)}" hidden></div>
      <div class="row"><button type="button" class="ghost sm" data-act="crmtask" data-v="${esc(target)}">${IC.plus}<span>${esc(t("crm_task_add"))}</span></button></div></div>` : ""}</section>`;
}

/* ---- ответственный ----
   Назначать может «CRM: управление»; остальные — только взять ничьего себе. */
function managerField(target, cur){
  const all = crmAll() && can("crm.edit");
  if (all) return `<select class="minisel" data-mgr="${esc(target)}" aria-label="${esc(t("crm_manager"))}"><option value="">${esc(t("crm_nobody"))}</option>
    ${crmStaff().map(s => `<option value="${s.id}" ${cur === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
  return `${staffChip(cur)}${!cur && can("crm.edit") ? ` <button type="button" class="link" data-act="crmtake" data-v="${esc(target)}">${esc(t("crm_take"))}</button>` : ""}`;
}

/* ---- действия ---- */
function addNote(target){
  if (!canNote(target)) return toast(t("no_rights"));
  const kind = NOTE_KINDS.includes(inp("nk:" + target, "call")) ? inp("nk:" + target, "call") : "note", text = inp("nt:" + target).trim();
  const box = $(`[data-inp="${CSS.escape("nt:" + target)}"]`);
  if (text.length < 2) { toast(t("err_note")); box?.setAttribute("aria-invalid", "true"); box?.focus(); return; }
  change(() => {
    O.crm.notes.unshift({ id:uid("n"), target, kind, text, by:me().id, at:Date.now() });
    const l = target.startsWith("l:") ? leadById(target.slice(2)) : null;
    // Первый контакт с новым лидом — лид сам переходит в «Связались».
    if (l && l.status === "new" && kind !== "note") { leadEvent(l, { type:"status", from:"new", to:"contacted" }); l.status = "contacted"; }
    audit("crm_note", { what:strRef("nk_" + kind), target:targetLabel(target) }, { module:"crm", diff:[{ k:"crm_note_text", from:"", to:text }] });
  });
  if (M.ui.inp) delete M.ui.inp["nt:" + target];
  rerender(); toast(t("t_crm_note")); $(`[data-inp="${CSS.escape("nt:" + target)}"]`)?.focus();
}
function addTask(target){
  if (!can("crm.edit") || !canNote(target)) return toast(t("no_rights"));
  const dd = defaultDue(), k = s => `${s}:${target}`, text = inp(k("tt")).trim(), date = inp(k("td"), dd.date), time = inp(k("th"), dd.time), who = inp(k("ta"), me().id);
  const [hh, mm] = time.split(":").map(Number), due = parseYMD(date).setHours(hh || 0, mm || 0, 0, 0);
  const bad = text.length < 3 ? ["err_task_text", "tt"] : !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(due) ? ["err_task_due", "td"] : !taskAssignees(target).some(s => s.id === who) ? ["err_task_who", "ta"] : null;
  $$(`[data-inp$="${CSS.escape(":" + target)}"][aria-invalid]`).forEach(x => x.removeAttribute("aria-invalid"));
  if (bad) { const f = $(`[data-inp="${CSS.escape(k(bad[1]))}"]`), eid = "terr-" + cssKey(target);
    f?.setAttribute("aria-invalid", "true"); f?.setAttribute("aria-describedby", eid); showErr("#" + eid, t(bad[0])); f?.focus({ preventScroll:true }); return; }
  change(() => { O.crm.tasks.push({ id:uid("tk"), target, text, due, assignee:who, by:me().id, at:Date.now(), done:false });
    audit("task_new", { text, target:targetLabel(target), name:staffName(who) }, { module:"crm" }); });
  if (M.ui.inp) delete M.ui.inp[k("tt")];
  rerender(); toast(tf("t_task_new", { name:staffName(who) })); $(`[data-inp="${CSS.escape(k("tt"))}"]`)?.focus();
}
function setManager(target, id){
  const l = target.startsWith("l:") ? leadById(target.slice(2)) : null;
  if (!can("crm.edit") || (l && !canEditLead(l))) return toast(t("no_rights"));
  // Назначить другого — только с «CRM: управление»; без него — взять ничьего себе.
  const cur = l ? l.manager : target.startsWith("c:") ? clientByKey(target.slice(2))?.manager || null : clientData(target)?.manager || null;
  if (!crmAll() && !(cur == null && id === me().id)) return toast(t("no_rights"));
  if (id && !crmStaff().some(s => s.id === id)) return;
  if ((cur || null) === (id || null)) return;
  change(() => {
    if (l) { const x = leadById(l.id); leadEvent(x, { type:"assign", from:x.manager, to:id || null }); x.manager = id || null; }
    else { const r = clientRec(target); if (target.startsWith("c:")) { const c = clientByKey(target.slice(2)); if (c && !r.phone) r.phone = c.phone; } r.manager = id || null; r.events.unshift({ at:Date.now(), by:me().id, type:"assign", to:id || null }); }
    audit("crm_assign", { target:targetLabel(target) }, { module:"crm", diff:[{ k:"crm_manager", from:cur ? staffName(cur) : "", to:id ? staffName(id) : "" }] });
  });
  toast(tf("t_crm_assign", { name:id ? staffName(id) : t("crm_nobody") }));
}
Object.assign(ACT, {
  crmnote: el => addNote(el.dataset.v),
  crmtask: el => addTask(el.dataset.v),
  crmtake: el => { setManager(el.dataset.v, me().id); }
});
document.addEventListener("change", e => {
  const tid = e.target.dataset?.task, mgr = e.target.dataset?.mgr;
  if (tid) {
    const x = O.crm.tasks.find(y => y.id === tid); if (!x || !canToggleTask(x)) return;
    const on = e.target.checked;
    // Если строка уйдёт из списка (фильтр «открытые»), фокус — на соседнюю задачу или заголовок блока.
    const boxes = $$("[data-task]"), i = boxes.indexOf(e.target), near = [boxes[i + 1], boxes[i - 1]].filter(Boolean).map(b => b.dataset.task);
    const head = e.target.closest("section, .card")?.querySelector("h2, h3")?.id;
    change(() => { const y = O.crm.tasks.find(z => z.id === tid); if (!y) return; Object.assign(y, { done:on, doneAt:on ? Date.now() : null, doneBy:on ? me().id : null });
      audit(on ? "task_done" : "task_reopen", { text:y.text, target:targetLabel(y.target) }, { module:"crm" }); });
    const next = $(`[data-task="${tid}"]`) || near.map(id => $(`[data-task="${id}"]`)).find(Boolean);
    if (next) next.focus(); else { const h = (head && $("#" + CSS.escape(head))) || $("#app h1"); if (h) { h.tabIndex = -1; h.focus(); } }
  }
  if (mgr != null) { setManager(mgr, e.target.value); $(`[data-mgr="${CSS.escape(mgr)}"]`)?.focus(); }
});
