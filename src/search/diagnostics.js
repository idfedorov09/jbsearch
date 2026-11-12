'use strict';

const validCount = value => Number.isSafeInteger(value) && value >= 0;
const displayPath = value => String(value || 'Unknown file').replace(/[\u0000-\u001f\u007f]/g,
  character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);

// Older or inconsistent worker statistics must not turn an unknown skip into a
// safe exclusion. The worker's aggregate count includes both classifications.
function classifySkips(stats = {}) {
  const total = stats.skippedFiles ?? 0;
  if (!validCount(total)) return { total: 0, excluded: 0, blocking: 1, consistent: false };
  const excluded = stats.excludedBinaryFiles;
  const blocking = stats.blockingSkippedFiles;
  if (validCount(excluded) && validCount(blocking) && excluded + blocking === total) {
    const details = stats.skippedDetails;
    const detailsValid = details === undefined || (Array.isArray(details) && details.length <= 20 &&
      details.every(item => item && typeof item.blocking === 'boolean' && (item.blocking || item.reason === 'binary')) &&
      details.filter(item => item.blocking).length <= blocking &&
      details.filter(item => !item.blocking).length <= excluded &&
      (stats.skippedDetailsOmitted === undefined ||
        (validCount(stats.skippedDetailsOmitted) && stats.skippedDetailsOmitted + details.length === total)));
    if (detailsValid) return { total, excluded, blocking, consistent: true };
  }
  if (total === 0 && excluded === undefined && blocking === undefined)
    return { total, excluded: 0, blocking: 0, consistent: true };
  return { total, excluded: 0, blocking: Math.max(1, total), consistent: false };
}

function incompleteSearch(output) {
  return Boolean(output.truncated || output.stats?.timedOut || output.stats?.errors?.length ||
    classifySkips(output.stats).blocking);
}

// Legacy diagnostic defaults are useful for rendering older snapshots, but are
// not evidence that a new worker finished a complete search. Validate the raw
// worker completion before the engine can fill in defaults, and validate the
// returned result again at the Replace All boundary.
function validWorkerStatistics(stats, resultCount) {
  if (!stats || !Array.isArray(stats.errors) || !Array.isArray(stats.skippedDetails) ||
      typeof stats.cancelled !== 'boolean' || typeof stats.timedOut !== 'boolean' ||
      !validCount(resultCount)) return false;
  const counts = ['filesScanned', 'filesMatched', 'matches', 'skippedFiles',
    'excludedBinaryFiles', 'blockingSkippedFiles', 'skippedDetailsOmitted'];
  if (counts.some(key => !validCount(stats[key]))) return false;
  const reasons = ['tooLarge', 'binary', 'encoding', 'unreadable'];
  if (!stats.skipped || reasons.some(key => !validCount(stats.skipped[key]))) return false;
  if (reasons.reduce((sum, key) => sum + stats.skipped[key], 0) !== stats.skippedFiles ||
      stats.excludedBinaryFiles > stats.skipped.binary ||
      stats.skippedDetails.length + stats.skippedDetailsOmitted !== stats.skippedFiles ||
      stats.matches !== resultCount || stats.filesMatched > stats.filesScanned ||
      stats.filesMatched > stats.matches || (stats.matches > 0 && stats.filesMatched === 0))
    return false;
  return classifySkips(stats).consistent;
}

function validWorkerCompletion(message, resultCount) {
  return Boolean(message && message.type === 'done' && typeof message.truncated === 'boolean' &&
    validWorkerStatistics(message.stats, resultCount));
}

function completePreflight(output) {
  return Boolean(output && Array.isArray(output.results) && output.truncated === false &&
    output.reason == null && validWorkerStatistics(output.stats, output.results.length) &&
    output.stats.cancelled === false && output.stats.timedOut === false &&
    output.stats.errors.length === 0 && classifySkips(output.stats).blocking === 0);
}

function skipDiagnostics(stats = {}, { includeDetails = true } = {}) {
  const counts = classifySkips(stats);
  if (!counts.total && counts.consistent) return '';
  const lines = [];
  if (counts.excluded)
    lines.push(`${counts.excluded} binary ${counts.excluded === 1 ? 'file' : 'files'} excluded from text search; contents are not searched or replaced.`);
  if (counts.blocking)
    lines.push(counts.consistent
      ? `${counts.blocking} ${counts.blocking === 1 ? 'file could' : 'files could'} not be searched; results are incomplete.`
      : 'Some skipped inputs could not be classified; results are incomplete.');
  if (!includeDetails) return lines.join('\n');
  const details = Array.isArray(stats.skippedDetails) ? stats.skippedDetails.slice(0, 20) : [];
  for (const detail of details) {
    const reason = detail.kind === 'enumeration' ? 'directory enumeration failed'
      : counts.consistent && !detail.blocking && detail.reason === 'binary'
        ? detail.format === 'ZIP' ? 'ZIP container excluded' : 'binary file excluded'
        : detail.reason === 'tooLarge' ? 'exceeds the text file size limit'
          : detail.reason === 'encoding' ? 'unsupported encoding'
            : detail.reason === 'binary' ? 'unrecognized binary data or unsupported encoding'
              : detail.reason === 'unreadable' ? 'could not be read'
                : 'could not be searched';
    // Absolute paths also distinguish workspaces with identical folder names.
    lines.push(`${displayPath(detail.path || detail.relativePath)} — ${reason}`);
  }
  const omitted = Math.max(0, counts.total - details.length);
  if (omitted) lines.push(`${omitted} additional ${omitted === 1 ? 'path is' : 'paths are'} not shown.`);
  return lines.join('\n');
}

module.exports = { classifySkips, incompleteSearch, skipDiagnostics, validWorkerStatistics,
  validWorkerCompletion, completePreflight };
