/**
 * pf15-discovery-veil — one-use roll-request ids (0.7.9, TD-10 E-2a).
 *
 * The active GM mints an id per (invited user, target) when it sends a roll
 * request, and honours a result only for an open id whose user is the
 * verified sender and whose target matches; the id is spent on use. Ids live
 * in this module's memory on the active GM (Q7): a GM reload voids open
 * requests, which fails secret (the player is told to ask again).
 *
 * Pure: no Foundry globals. `makeId` supplies unguessable ids.
 */

/**
 * @param {() => string} makeId
 * @returns {{ mint(userId:string, targetKey:string): string,
 *             redeem(requestId:string, userId:string, targetKey:string): "ok"|"stale"|"rejected" }}
 */
export function createRequestLedger(makeId) {
  /** requestId → {userId, targetKey} for requests still open. */
  const open = new Map();
  /** Ids that were used or replaced; a result for one is stale, not forged. */
  const spent = new Set();

  return {
    /**
     * Open a request id for (userId, targetKey). An open id for the same pair is
     * retired first, so a re-request leaves only the newest prompt answerable.
     */
    mint(userId, targetKey) {
      for ( const [id, rec] of open ) {
        if ( (rec.userId === userId) && (rec.targetKey === targetKey) ) {
          open.delete(id);
          spent.add(id);
        }
      }
      const id = makeId();
      open.set(id, { userId, targetKey });
      return id;
    },

    /**
     * Spend an open id when user and target both match ("ok"). A mismatch is
     * "rejected" and leaves the id open (a forger cannot burn a real request);
     * a used or replaced id is "stale"; anything else is "rejected".
     */
    redeem(requestId, userId, targetKey) {
      const rec = open.get(requestId);
      if ( rec ) {
        if ( (rec.userId !== userId) || (rec.targetKey !== targetKey) ) return "rejected";
        open.delete(requestId);
        spent.add(requestId);
        return "ok";
      }
      return spent.has(requestId) ? "stale" : "rejected";
    }
  };
}
