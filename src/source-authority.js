'use strict';

const { readDocumentSnapshot, MAX_SNAPSHOT_BYTES } = require('./document-snapshot');
const { commonDiskBaseline, assertDiskBaseline, readStableDiskBaseline,
  supportedEncodings } = require('./disk-baseline');

const saveTickets = Symbol('jbsearch.observedSaveTickets');
const boundDocuments = Symbol('jbsearch.boundSourceDocuments');
const currentDiskObservations = Symbol('jbsearch.currentDiskObservations');
const preparedObservations = new WeakMap();
const authorityTransfers = new WeakMap();
const resultIndexes = new WeakMap();

function currentResultIndex(session) {
  let index = resultIndexes.get(session);
  // Completed result arrays are replaced by tracking/reconciliation. A length
  // check also handles initial streaming's push without retaining stale rows.
  if (!index || index.results !== session.results || index.length !== session.results.length) {
    const rows = new Map();
    for (const row of session.results) {
      if (rows.has(row.id)) throw new Error('Search results have ambiguous identities. Rerun Search.');
      rows.set(row.id, row);
    }
    index = { results: session.results, length: session.results.length, rows };
    resultIndexes.set(session, index);
  }
  return index.rows;
}

function requestFingerprint(session) {
  return JSON.stringify([session.query, session.options, session.scope]);
}

function eventEpoch(session) {
  return session.scopeEventRevision ?? session.sourceEventRevision ?? 0;
}

function discardDocumentBaseline(session, uri) {
  if (uri === undefined) {
    delete session[saveTickets];
    delete session[boundDocuments];
    delete session[currentDiskObservations];
  } else {
    session[saveTickets]?.delete(String(uri));
    session[boundDocuments]?.delete(String(uri));
    session[currentDiskObservations]?.delete(String(uri));
  }
}

function bindDocumentAuthority(session, document) {
  session[boundDocuments] ||= new Map();
  session[boundDocuments].set(document.uri.toString(), document);
}

/** Expire Save evidence on an edit, retaining raw disk state only for a known
 * continuous delta of the SAME bound document. No dirty/disk text comparison. */
function observeDocumentDelta(session, document, continuous) {
  const uri = document.uri.toString();
  if (!continuous || session[boundDocuments]?.get(uri) !== document) {
    discardDocumentBaseline(session, uri);
    return;
  }
  session[saveTickets]?.delete(uri);
  const observation = session[currentDiskObservations]?.get(uri);
  if (observation && (observation.generation !== session.generation ||
      observation.fingerprint !== requestFingerprint(session) || observation.encoding !== document.encoding))
    session[currentDiskObservations].delete(uri);
}

/** A watcher is not a buffer edit. Keep only a continuously bound buffer. */
function hasCurrentDocumentAuthority(session, document, { maxBytes = MAX_SNAPSHOT_BYTES } = {}) {
  const uri = document?.uri?.toString();
  if (!uri || document.isClosed || session[boundDocuments]?.get(uri) !== document) return false;
  const rows = session.results.filter(row => String(row.uri) === uri && !row.identityUnknown && !row.unavailable);
  if (!rows.length) return false;
  let snapshot;
  try { snapshot = readDocumentSnapshot(document, maxBytes); } catch { return false; }
  return rows.every(row => (row.trackedDocumentVersion ?? row.documentVersion) === snapshot.version &&
    (row.trackedContentHash ?? row.contentHash) === snapshot.contentHash);
}

/** No disk I/O on Save, and never a comparison between dirty text and disk. */
function observeDocumentSave(session, document, { maxBytes = MAX_SNAPSHOT_BYTES } = {}) {
  const uri = document.uri?.toString();
  session[saveTickets]?.delete(uri);
  if (document.uri?.scheme !== 'file' || document.isDirty !== false || document.isClosed ||
      !Number.isSafeInteger(document.version) || !supportedEncodings.has(document.encoding)) return false;
  const rows = knownRows(session, uri);
  if (!rows.length ||
      session[boundDocuments]?.get(uri) !== document) return false;
  let snapshot;
  try { snapshot = readDocumentSnapshot(document, maxBytes); } catch { return false; }
  if (rows.some(row => (row.trackedDocumentVersion ?? row.documentVersion) !== snapshot.version ||
      (row.trackedContentHash ?? row.contentHash) !== snapshot.contentHash)) return false;
  session[saveTickets] ||= new Map();
  session[saveTickets].set(uri, Object.freeze({ document, uri,
    version: snapshot.version, contentHash: snapshot.contentHash, encoding: document.encoding,
    generation: session.generation, fingerprint: requestFingerprint(session) }));
  return true;
}

/**
 * Return a verified disk baseline, or lazily adopt an observed clean Save state.
 * This proves state equality only, not who wrote the bytes or historical identity.
 * The caller owns its deadline, physical I/O capacity and immutable action token.
 * No source result is mutated here: commit a returned rebase only under the same
 * action/epoch guards. Unknown anchors cannot be revived by equal saved bytes.
 */
async function prepareDiskBaseline(session, document, selected, {
  signal, check = () => {}, maxBytes = MAX_SNAPSHOT_BYTES,
  readDisk = readStableDiskBaseline, assertDisk = assertDiskBaseline
} = {}) {
  const uri = document.uri?.toString();
  const historicalBaseline = commonDiskBaseline(selected);
  if (!historicalBaseline) {
    if (document.uri?.scheme === 'file')
      throw new Error('The file has no independent disk baseline. Rerun Search before replacing.');
    return undefined;
  }
  const generation = session.generation;
  const fingerprint = requestFingerprint(session);
  const epoch = eventEpoch(session);
  const version = document.version;
  const encoding = document.encoding;
  const ticket = session[saveTickets]?.get(uri);
  const observation = session[currentDiskObservations]?.get(uri);
  const baseline = observation && observation.document === document &&
    observation.generation === generation && observation.fingerprint === fingerprint &&
    observation.encoding === encoding && session[boundDocuments]?.get(uri) === document
    ? observation.baseline : historicalBaseline;
  const current = () => {
    signal?.throwIfAborted();
    check();
    if (session.generation !== generation || requestFingerprint(session) !== fingerprint ||
        eventEpoch(session) !== epoch || document.uri?.toString() !== uri ||
        document.version !== version || document.encoding !== encoding || document.isClosed)
      throw new Error('The source changed while its disk baseline was checked. Rerun Search.');
    const live = currentResultIndex(session);
    if (selected.some(row => {
      const now = live.get(row.id);
      return !now || now.uri !== row.uri || (now.resultRevision ?? 0) !== (row.resultRevision ?? 0) ||
        now.identityUnknown || now.pending || now.invalid || now.unavailable;
    })) throw new Error('The occurrence changed while its disk baseline was checked. Rerun Search.');
  };
  current();
  try {
    await assertDisk(document.uri, baseline, { signal });
    current();
    return baseline;
  } catch (error) {
    current();
    // Only a changed baseline is eligible. Missing paths, unsupported safe-open,
    // permissions, cancellation and resource failures are not Save evidence.
    if (error.code !== 'DISK_BASELINE_CHANGED') throw error;
    if (!ticket || session[saveTickets]?.get(uri) !== ticket || ticket.document !== document ||
        ticket.uri !== uri || ticket.generation !== generation || ticket.fingerprint !== fingerprint ||
        ticket.version !== version || ticket.encoding !== encoding || document.isDirty !== false)
      throw error;
  }
  const snapshot = readDocumentSnapshot(document, maxBytes);
  const savedCurrent = () => {
    current();
    if (session[saveTickets]?.get(uri) !== ticket || ticket.document !== document ||
        session[boundDocuments]?.get(uri) !== document ||
        document.isDirty !== false || document.encoding !== ticket.encoding ||
        selected.some(row => (row.trackedDocumentVersion ?? row.documentVersion) !== version ||
          (row.trackedContentHash ?? row.contentHash) !== ticket.contentHash))
      throw new Error('The saved document changed before its disk baseline could be rebased. Rerun Search.');
  };
  savedCurrent();
  if (snapshot.contentHash !== ticket.contentHash)
    throw new Error('The saved document content is no longer current. Rerun Search.');
  const rebased = await readDisk(document.uri, { signal, maxBytes, encoding: ticket.encoding });
  savedCurrent();
  const after = readDocumentSnapshot(document, maxBytes);
  if (rebased.linkPolicy !== 'no-follow')
    throw new Error('A saved baseline requires strict no-follow reading; no policy downgrade is allowed. Rerun Search.');
  if (after.contentHash !== snapshot.contentHash || rebased.contentHash !== snapshot.contentHash)
    throw new Error('The saved file and the clean document do not have the same text. Rerun Search.');
  // The controller commits only after its final action/disk/document guards.
  // Keeping this proof private prevents a raw baseline argument from creating
  // Save authority and never mutates historical rows or an issued approval.
  preparedObservations.set(rebased, { session, document, commit() {
    savedCurrent();
    if (readDocumentSnapshot(document, maxBytes).contentHash !== ticket.contentHash)
      throw new Error('The saved document changed before baseline admission. Rerun Search.');
    savedCurrent();
    session[currentDiskObservations] ||= new Map();
    session[currentDiskObservations].set(uri, Object.freeze({ document, uri, baseline: rebased,
      generation, fingerprint, encoding }));
  } });
  return rebased;
}

function commitDiskObservation(session, document, baseline) {
  const proof = baseline && preparedObservations.get(baseline);
  if (!proof) return;
  if (proof.session !== session || proof.document !== document)
    throw new Error('The prepared disk observation belongs to another source. Rerun Search.');
  proof.commit();
  preparedObservations.delete(baseline);
}

const knownRows = (session, uri) => session.results.filter(row => String(row.uri) === uri &&
  !row.identityUnknown && !row.unavailable);
function knownRowsByUri(session) {
  const groups = new Map();
  for (const row of session.results) {
    if (row.identityUnknown || row.unavailable) continue;
    const uri = String(row.uri);
    if (!groups.has(uri)) groups.set(uri, []);
    groups.get(uri).push(row);
  }
  return groups;
}
const rowHistory = row => JSON.stringify([row.id, row.uri, row.offset, row.length, row.range,
  row.trackedDocumentVersion ?? row.documentVersion, row.trackedContentHash ?? row.contentHash]);

/** Opaque, positively checked authority handoff. Admission always issues NEW
 * destination records and rechecks current document state and row histories.
 * The controller must additionally guard the transfer transaction/event epoch. */
function captureDocumentAuthority(session, { maxBytes = MAX_SNAPSHOT_BYTES } = {}) {
  const records = new Map(), required = new Set(), groups = knownRowsByUri(session);
  for (const [uri, rows] of groups) if (session[boundDocuments]?.has(uri) ||
      rows.some(row => Number.isSafeInteger(row.trackedDocumentVersion ?? row.documentVersion))) required.add(uri);
  for (const uri of required) {
    const document = session[boundDocuments]?.get(uri), rows = groups.get(uri);
    if (!document || document.uri.toString() !== uri) continue;
    let snapshot;
    try { snapshot = readDocumentSnapshot(document, maxBytes); } catch { continue; }
    if (rows.some(row => (row.trackedDocumentVersion ?? row.documentVersion) !== snapshot.version ||
        (row.trackedContentHash ?? row.contentHash) !== snapshot.contentHash)) continue;
    const ticket = session[saveTickets]?.get(uri), observation = session[currentDiskObservations]?.get(uri);
    const eligible = value => value?.document === document && value.uri === uri &&
      value.generation === session.generation && value.fingerprint === requestFingerprint(session) &&
      value.encoding === document.encoding;
    records.set(uri, { document, version: snapshot.version, contentHash: snapshot.contentHash,
      encoding: document.encoding, rows: new Map(rows.map(row => [row.id, rowHistory(row)])),
      saved: eligible(ticket) && ticket.version === snapshot.version &&
        ticket.contentHash === snapshot.contentHash && document.isDirty === false,
      baseline: eligible(observation) ? observation.baseline : undefined });
  }
  const transfer = Object.freeze({});
  authorityTransfers.set(transfer, { records, required });
  return transfer;
}

function admitDocumentAuthority(session, transfer, { maxBytes = MAX_SNAPSHOT_BYTES, check = () => {} } = {}) {
  const captured = authorityTransfers.get(transfer);
  if (!captured) throw new Error('Document authority handoff is unavailable. Rerun Search.');
  const rejected = new Set();
  const groups = knownRowsByUri(session);
  check();
  for (const uri of captured.required) {
    const rows = groups.get(uri) || [], record = captured.records.get(uri);
    if (!rows.length) continue; // A tombstone never regains identity.
    let snapshot;
    try { if (record) snapshot = readDocumentSnapshot(record.document, maxBytes); } catch { /* fail closed below */ }
    if (!record || record.document.uri.toString() !== uri || record.document.encoding !== record.encoding ||
        snapshot?.version !== record.version || snapshot?.contentHash !== record.contentHash ||
        rows.some(row => record.rows.get(row.id) !== rowHistory(row))) {
      discardDocumentBaseline(session, uri);
      rejected.add(uri);
      continue;
    }
    check();
    bindDocumentAuthority(session, record.document);
    if (record.saved && record.document.isDirty === false) {
      session[saveTickets] ||= new Map();
      session[saveTickets].set(uri, Object.freeze({ document: record.document, uri,
        version: record.version, contentHash: record.contentHash, encoding: record.encoding,
        generation: session.generation, fingerprint: requestFingerprint(session) }));
    }
    if (record.baseline) {
      session[currentDiskObservations] ||= new Map();
      session[currentDiskObservations].set(uri, Object.freeze({ document: record.document, uri,
        generation: session.generation, fingerprint: requestFingerprint(session),
        encoding: record.encoding, baseline: record.baseline }));
    }
  }
  return rejected;
}

module.exports = { observeDocumentSave, discardDocumentBaseline, prepareDiskBaseline,
  bindDocumentAuthority, hasCurrentDocumentAuthority, observeDocumentDelta, commitDiskObservation,
  captureDocumentAuthority, admitDocumentAuthority };
