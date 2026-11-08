/** Classify retained witness transitions using the complete validated timetable.
 * A repeated trip ID is not enough: a passenger can wait while the vehicle
 * loops away, then board it again. Only adjacent legs permit on-board dwell.
 * Call once for one normalized, chronologically ordered scenario.
 */
export function continuationCheck(connections) {
  const last = new Map(), predecessors = new Map();
  for (const connection of connections) {
    predecessors.set(connection.id, last.get(connection.tripId));
    last.set(connection.tripId, connection.id);
  }
  return (previous, next) => Boolean(previous && next &&
    previous.tripId === next.tripId && predecessors.get(next.id) === previous.id);
}
