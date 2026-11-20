/**
 * Shared test fixtures (0.7.9). makeShared() is a factory, not a constant:
 * damageType.toObject is a function, and structuredClone cannot copy it.
 * The shape mirrors pf1 11.11 ActionUse#shared at pf1PreDisplayActionUse
 * (brief §6 P2): one crit-threat attack with fire damage, then an empty
 * Hold Person-style entry that must be skipped.
 */
const roll = (total, types) => ({ total, damageType: { toObject: () => ({ types }) } });

export const makeShared = () => ({
  rollMode: "publicroll", chatMessage: true, scriptData: {}, save: "ref", saveDC: 17,
  chatAttacks: [
    { attack: { total: 23, isCrit: true, d20: { total: 20 } }, hasCritConfirm: true, critConfirm: { total: 12 },
      damage: { rolls: [roll(7, ["fire"]), roll(1, ["fire"])] }, critDamage: { rolls: [roll(10, ["fire"])] } },
    { attack: null, damage: { rolls: [] }, critDamage: { rolls: [] } }
  ]
});
