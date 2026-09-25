/* ==========================================================================
   Страница подтверждений: запросы, которые ждут вашего решения, ваши
   запросы, история решений и правила — какие операции ждут второго
   сотрудника. Правила меняет только основатель.
   ========================================================================== */
"use strict";

function apSections(){
  const u = me(), pending = O.approvals.filter(a => a.status === "pending" && canSeeAp(a));
  return {
    decide: pending.filter(a => !apBlock(a)),
    mine:   pending.filter(a => a.by === u.id),
    wait:   pending.filter(a => a.by !== u.id && apBlock(a)),
    done:   O.approvals.filter(a => a.status !== "pending" && canSeeAp(a))
  };
}
const apBlockList = (list, mode) => `<div class="tasks">${list.map(a => apRow(a, mode)).join("")}</div>`;
function rulesCard(){
  const edit = isFounder(), r = M.ui.rulesDraft?.rules || O.rules, dirty = !!M.ui.rulesDraft && JSON.stringify(M.ui.rulesDraft.rules) !== JSON.stringify(O.rules);
  return `<section class="card stack" id="aprules"><div class="stack" style="gap:4px"><h2>${esc(t("ap_rules"))}</h2><p class="muted small">${esc(t("ap_rules_d"))}</p></div>
    <div class="rules">${AP_RULES.map(k => `<div class="rule-row"><label class="chk"><input type="checkbox" data-rule="${k}" ${r[k].on ? "checked" : ""} ${edit ? "" : "disabled"}>
        <span>${esc(t("rule_" + k))}</span></label>
      ${"min" in r[k] ? (edit ? `<label class="rule-min"><span class="small muted">${esc(t("rule_min"))}</span><span class="rule-amt"><input data-rule-min="${k}" inputmode="numeric" value="${esc(M.ui.ruleRaw?.[k] ?? grp(r[k].min))}" ${r[k].on ? "" : "disabled"} aria-label="${esc(t("rule_" + k))}: ${esc(t("rule_min"))}"></span></label>`
        : `<span class="small muted">${esc(r[k].on ? (r[k].min ? tf("rule_from", { amount:fmtUZS(r[k].min) }) : t("rule_all")) : t("rule_off"))}</span>`)
        : `<span class="small muted">${esc(t(r[k].on ? "rule_all" : "rule_off"))}</span>`}</div>`).join("")}</div>
    ${edit ? `<div class="err" id="rlerr" hidden></div><div class="row"><button type="button" class="solid sm" data-act="rulesave" ${dirty ? "" : "disabled"}>${esc(t("rules_save"))}</button>
      ${dirty ? `<button type="button" class="link" data-act="rulereset">${esc(t("cancel"))}</button><span class="muted small">${esc(t("rules_unsaved"))}</span>` : ""}</div>` : ""}</section>`;
}
PAGES.approvals = {
  render(){
    const tab = M.ui.apTab === "done" ? "done" : "pending", s = apSections();
    const block = (title, list, mode) => list.length ? `<section class="card stack"><div class="card-h"><h2>${esc(t(title))}</h2><span class="count">${list.length}</span></div>${apBlockList(list, mode)}</section>` : "";
    const pend = block("ap_for_me", s.decide, "decide") + block("ap_mine", s.mine, "mine") + block("ap_others", s.wait, "wait");
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_approvals"))}</h1><p class="muted">${esc(t("approvals_sub"))}</p></div>
      <div class="stack">
        ${seg("aptab", [["pending", t("ap_pending_tab")], ["done", t("ap_history")]], tab)}
        ${tab === "pending" ? pend || `<div class="card"><p class="calm">${IC.ok}<span>${esc(t("ap_none"))}</span></p></div>`
          : s.done.length ? `<section class="card stack">${apBlockList(s.done.slice(0, 100), "done")}</section>` : `<div class="card"><p class="muted">${esc(t("ap_none_hist"))}</p></div>`}
        ${rulesCard()}
      </div></div>`;
  }
};
/* Правила: черновик живёт до «Сохранить». Порог — целые сумы от 0. */
function saveRules(){
  if (!isFounder()) return toast(t("no_rights"));
  const draft = M.ui.rulesDraft; if (!draft) return;
  // Правила могли поменять в другой вкладке, пока черновик был открыт.
  if (JSON.stringify(O.rules) !== draft.base) { M.ui.rulesDraft = null; rerender(); return toast(t("ap_err_changed")); }
  const d = draft.rules, next = cleanRules(d);
  for (const k of AP_RULES) if ("min" in d[k] && !(Number.isInteger(d[k].min) && d[k].min >= 0 && d[k].min <= RULE_MIN_MAX)) { $(`[data-rule-min="${k}"]`)?.focus(); return showErr("#rlerr", t("err_rule_min")); }
  const diff = AP_RULES.filter(k => JSON.stringify(O.rules[k]) !== JSON.stringify(next[k])).map(k => ({ k:"rule_" + k, from:ruleVal(O.rules[k]), to:ruleVal(next[k]) }));
  M.ui.rulesDraft = null; M.ui.ruleRaw = null;
  if (!diff.length) { rerender(); return toast(t("role_same")); }
  change(() => { O.rules = next; audit("rules", {}, { module:"settings", diff }); });
  toast(t("t_rules"));
}
/* Правило в журнале: «не нужно», «всегда» или «от 5 000 000 сум». */
const ruleVal = r => !r.on ? strRef("rule_off") : r.min ? { ruleFrom:r.min } : strRef("rule_all");
const rulesDraft = () => (M.ui.rulesDraft ||= { base:JSON.stringify(O.rules), rules:JSON.parse(JSON.stringify(O.rules)) }).rules;
document.addEventListener("change", e => {
  const k = e.target.dataset?.rule; if (!k || !isFounder()) return;
  rulesDraft()[k].on = e.target.checked;
  rerender(); $(`[data-rule="${k}"]`)?.focus();
});
/* Порог: число в черновике сразу, перерисовка — после ввода (change), чтобы
   не сбивать курсор. */
document.addEventListener("input", e => {
  const k = e.target.dataset?.ruleMin; if (!k || !isFounder()) return;
  const v = e.target.value.replace(/\s/g, "");
  rulesDraft()[k].min = /^\d+$/.test(v) ? Number(v) : NaN; (M.ui.ruleRaw ||= {})[k] = e.target.value;
});
document.addEventListener("change", e => { const k = e.target.dataset?.ruleMin; if (k && isFounder()) { rerender(); $(`[data-rule-min="${k}"]`)?.focus(); } });
Object.assign(ACT, {
  aptab:     el => { M.ui.apTab = el.dataset.v; rerender(); },
  rulesave:  () => saveRules(),
  rulereset: () => { M.ui.rulesDraft = null; M.ui.ruleRaw = null; rerender(); $("#aprules [data-rule]")?.focus(); }
});
