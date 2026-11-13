'use strict';

// Evaluate the restricted GitHub expression grammar used by our job guards.
// Reject unknown tokens/variables rather than duplicating the guard logic in tests.
function evaluate(expression, values) {
  const tokens = expression.match(/\s*(?:(&&|\|\||==|\(|\))|('[^']*')|([A-Za-z_][\w.]*))\s*/g) || [];
  if (tokens.join('').replace(/\s/g, '') !== expression.replace(/\s/g, ''))
    throw new Error(`Unsupported guard expression: ${expression}`);
  const parts = tokens.map(token => token.trim());
  let index = 0;
  const take = () => parts[index++];
  function operand() {
    const token = take();
    if (!token) throw new Error('Missing operand');
    if (token.startsWith("'")) return token.slice(1, -1);
    if (token === 'false') return false;
    if (token === 'true') return true;
    if (!Object.hasOwn(values, token)) throw new Error(`Unknown guard variable: ${token}`);
    return values[token];
  }
  function atom() {
    if (parts[index] === '(') {
      take(); const result = or();
      if (take() !== ')') throw new Error('Missing closing parenthesis');
      return result;
    }
    const left = operand();
    if (take() !== '==') throw new Error('Expected equality');
    return left === operand();
  }
  function and() {
    let result = atom();
    while (parts[index] === '&&') { take(); const rhs = atom(); result = result && rhs; }
    return result;
  }
  function or() {
    let result = and();
    while (parts[index] === '||') { take(); const rhs = and(); result = result || rhs; }
    return result;
  }
  const result = or();
  if (index !== parts.length) throw new Error(`Unexpected token ${parts[index]}`);
  return result;
}

function jobsOf(workflow) {
  const [, body] = workflow.split(/^jobs:\s*$/m);
  if (!body) throw new Error('Missing workflow jobs');
  const jobs = {};
  for (const section of body.split(/(?=^  [\w-]+:\s*$)/m)) {
    const name = section.match(/^  ([\w-]+):\s*$/m)?.[1];
    if (name) jobs[name] = section;
  }
  return jobs;
}

function jobRuns(job, { repository = 'idfedorov09/jbsearch', ref, event, authentication = '', deleted = false, forced = false }) {
  const expression = job.match(/^    if: (.+)$/m)?.[1];
  if (!expression) throw new Error('Missing job guard');
  return evaluate(expression, {
    'github.repository': repository,
    'github.ref': ref,
    'github.event_name': event,
    'github.event.deleted': deleted,
    'github.event.forced': forced,
    'inputs.authentication': authentication,
  });
}
module.exports = { evaluate, jobsOf, jobRuns };
