/**
 * pf15-discovery-veil — masked-cast mechanics (0.7.9, TD-47).
 *
 * A masked cast's real pf1 card is never created, so the GM would lose its
 * numbers. At pf1PreDisplayActionUse the mechanics are complete on
 * `actionUse.shared` (brief §6 P2); `extractMechanics` copies them into a small
 * JSON record that lives ONLY in the active GM's private store, next to the
 * spell identity. The GM card block renders it and its Apply buttons rebuild
 * damage instances the way pf1's own Apply button does (pf1 utils/chat.mjs).
 *
 * Everything except `applyDamagePlan` is pure: no Foundry or pf1 globals.
 */

/**
 * @typedef {{total:number, damageType:object|null}} Part
 * @typedef {{attack:{total:number, natural:number|null, isCrit:boolean}|null,
 *            critConfirm:number|null, damage:Part[], critDamage:Part[]}} AttackRec
 * @typedef {{attacks:AttackRec[], save:{type:string, dc:number}|null}} Mechanics
 */

/** Roll list → Part[], dropping rolls without a finite total. */
function parts(rolls) {
  if ( !Array.isArray(rolls) ) return [];
  return rolls
    .filter(r => Number.isFinite(r?.total))
    .map(r => ({ total: r.total, damageType: r.damageType?.toObject?.() ?? null }));
}

/**
 * Copy a cast's mechanics from pf1's ActionUse#shared into a JSON record.
 * Entries with no attack and no damage (e.g. Hold Person) are skipped; the
 * save is kept only when the spell has a save type (Scorching Ray carries a
 * saveDC but no type). Returns null when nothing is left.
 * @param {object} shared  pf1 ActionUse#shared at pf1PreDisplayActionUse
 * @returns {Mechanics|null}
 */
export function extractMechanics(shared) {
  const attacks = [];
  for ( const ca of (Array.isArray(shared?.chatAttacks) ? shared.chatAttacks : []) ) {
    const atk = (ca?.attack && Number.isFinite(ca.attack.total))
      ? { total: ca.attack.total, natural: Number.isFinite(ca.attack.d20?.total) ? ca.attack.d20.total : null, isCrit: !!ca.attack.isCrit }
      : null;
    const damage = parts(ca?.damage?.rolls);
    if ( !atk && !damage.length ) continue;
    attacks.push({
      attack: atk,
      critConfirm: (ca.hasCritConfirm && Number.isFinite(ca.critConfirm?.total)) ? ca.critConfirm.total : null,
      damage,
      critDamage: parts(ca?.critDamage?.rolls)
    });
  }
  const save = ((typeof shared?.save === "string") && shared.save && Number.isFinite(shared?.saveDC))
    ? { type: shared.save, dc: shared.saveDC } : null;
  if ( !attacks.length && !save ) return null;
  return { attacks, save };
}

/**
 * The damage one Apply button sends. "half" floors each instance; "crit" adds
 * the crit-damage instances and flags the hit critical, as pf1's button does.
 * @param {AttackRec} rec
 * @param {"normal"|"half"|"crit"} mode
 * @returns {{value:number, parts:{value:number, damageType:object|null}[], isCritical:boolean}|null}
 */
export function damagePlan(rec, mode) {
  const damage = rec?.damage ?? [];
  if ( !damage.length ) return null;
  const crit = rec?.critDamage ?? [];
  if ( (mode === "crit") && !crit.length ) return null;
  const source = (mode === "crit") ? [...damage, ...crit] : damage;
  const out = source.map(p => ({
    value: (mode === "half") ? Math.floor(p.total / 2) : p.total,
    damageType: p.damageType ?? null
  }));
  return { value: out.reduce((s, p) => s + p.value, 0), parts: out, isCritical: mode === "crit" };
}

/** Unique, labelled damage-type names across parts, joined with ", ". */
function typeNames(list, typeLabel) {
  const ids = [];
  for ( const p of list ) for ( const id of (p.damageType?.types ?? []) ) if ( !ids.includes(id) ) ids.push(id);
  return ids.map(typeLabel).join(", ");
}

const sum = list => list.reduce((s, p) => s + p.total, 0);

/**
 * The GM block's text lines as i18n keys + format data, per attack (1-based):
 * attack, crit threat, damage, crit damage; then the save last.
 * @param {Mechanics} mech
 * @param {{typeLabel:(id:string)=>string, saveLabel:(type:string)=>string}} labels
 * @returns {{key:string, data:object}[]}
 */
export function mechanicsLines(mech, { typeLabel, saveLabel }) {
  const lines = [];
  (mech?.attacks ?? []).forEach((a, i) => {
    const n = i + 1;
    if ( a.attack ) {
      lines.push({ key: "PF15DV.Spell.MechAttack", data: { n, total: a.attack.total, natural: a.attack.natural ?? "?" } });
      if ( a.attack.isCrit ) lines.push({ key: "PF15DV.Spell.MechCrit", data: { n, confirm: a.critConfirm ?? "?" } });
    }
    if ( a.damage.length ) lines.push({ key: "PF15DV.Spell.MechDamage", data: { n, total: sum(a.damage), types: typeNames(a.damage, typeLabel) } });
    if ( a.critDamage.length ) lines.push({ key: "PF15DV.Spell.MechCritDamage", data: { n, total: sum(a.critDamage), types: typeNames(a.critDamage, typeLabel) } });
  });
  if ( mech?.save ) lines.push({ key: "PF15DV.Spell.MechSave", data: { save: saveLabel(mech.save.type), dc: mech.save.dc } });
  return lines;
}

/**
 * Send a damage plan through pf1's own apply path (brief §6 P3). With no
 * targets pf1 uses the controlled tokens. Same options as pf1's own Apply
 * button (utils/chat.mjs): it applies directly, and Shift (pf1.skipConfirmPrompt)
 * opens pf1's Apply Damage dialog instead (actor-pf.mjs applyDamage, 0.7.9 R2).
 * @param {{value:number, parts:{value:number, damageType:object|null}[], isCritical:boolean}} plan
 * @returns {Promise<unknown>}
 */
export async function applyDamagePlan(plan) {
  if ( !plan ) return null;
  const instances = plan.parts.map(p => {
    const inst = new pf1.models.action.DamagePartModel(p.damageType ?? { types: [] });
    inst.value = p.value;
    return inst;
  });
  return pf1.documents.actor.ActorPF.applyDamage(plan.value, { instances, isCritical: plan.isCritical, interactive: true });
}
