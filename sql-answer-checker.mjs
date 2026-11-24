/**
 * SQL practice answers are graded by the data they return, not by matching the
 * learner's query text to the reference SQL. Column aliases and column order
 * are intentionally ignored; row order is checked only when a task asks for it.
 */
function cellKey(value) {
  if (value === null || value === undefined) return 'null:';
  if (value instanceof Uint8Array) return `blob:${Array.from(value).join(',')}`;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (!Number.isFinite(value)) return `number:${value}`;
    return `number:${Number(value.toPrecision(12))}`;
  }
  if (typeof value === 'boolean') return `boolean:${value}`;
  return `string:${String(value)}`;
}

function canonicalRow(row) {
  return row.map(cellKey).sort().join('\u001f');
}

function canonicalRows(rows) {
  return rows.map(canonicalRow);
}

function compareSqlValues(left, right) {
  if (left === null || left === undefined) {
    if (right === null || right === undefined) return 0;
    return -1;
  }
  if (right === null || right === undefined) return 1;
  if (typeof left === 'number' && typeof right === 'number') {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function findColumnIndex(resultSet, expectedSet, columnName) {
  const direct = resultSet.columns.findIndex((column) => String(column).toLowerCase() === String(columnName).toLowerCase());
  if (direct >= 0) return direct;

  // If a valid query uses a different alias, map the requested output column by
  // its values instead of requiring the exact reference column label.
  const expectedIndex = expectedSet.columns.findIndex((column) => String(column).toLowerCase() === String(columnName).toLowerCase());
  if (expectedIndex < 0) return -1;
  const signature = expectedSet.values.map((row) => cellKey(row[expectedIndex])).sort().join('\u001f');
  const mapped = resultSet.columns.findIndex((_, index) =>
    resultSet.values.map((row) => cellKey(row[index])).sort().join('\u001f') === signature
  );
  return mapped >= 0 ? mapped : -1;
}

function isSortedBy(actualSet, expectedSet, sortRules) {
  const rules = sortRules.map((rule) => ({
    index: findColumnIndex(actualSet, expectedSet, rule.column),
    direction: String(rule.direction || 'ASC').toUpperCase() === 'DESC' ? -1 : 1
  }));
  if (rules.some((rule) => rule.index < 0)) {
    return { sorted: false, reason: 'the sorted column is missing from the result' };
  }

  for (let rowIndex = 1; rowIndex < actualSet.values.length; rowIndex += 1) {
    const previous = actualSet.values[rowIndex - 1];
    const current = actualSet.values[rowIndex];
    for (const rule of rules) {
      const comparison = compareSqlValues(previous[rule.index], current[rule.index]) * rule.direction;
      if (comparison > 0) return { sorted: false, reason: 'the rows are correct but not in the requested order' };
      if (comparison < 0) break;
    }
  }
  return { sorted: true, reason: '' };
}

/**
 * @param {Array<{columns:string[], values:any[][]}>} actualRaw
 * @param {Array<{columns:string[], values:any[][]}>} expectedRaw
 * @param {{orderMatters?:boolean, orderBy?:Array<{column:string,direction?:string}>}|boolean} [question]
 */
export function compareResults(actualRaw, expectedRaw, question = {}) {
  const options = typeof question === 'boolean' ? { orderMatters: question } : (question || {});
  const actual = actualRaw || [];
  const expected = expectedRaw || [];
  if (actual.length !== expected.length) return { equal: false, reason: 'wrong number of result sets' };

  for (let index = 0; index < expected.length; index += 1) {
    const actualSet = actual[index];
    const expectedSet = expected[index];
    const actualColumns = actualSet.columns || [];
    const expectedColumns = expectedSet.columns || [];
    const actualRows = actualSet.values || [];
    const expectedRows = expectedSet.values || [];

    if (actualColumns.length !== expectedColumns.length) return { equal: false, reason: 'wrong number of columns' };
    if (actualRows.length !== expectedRows.length) return { equal: false, reason: 'wrong number of rows' };

    const actualCanonical = canonicalRows(actualRows);
    const expectedCanonical = canonicalRows(expectedRows);
    const unorderedActual = [...actualCanonical].sort();
    const unorderedExpected = [...expectedCanonical].sort();
    if (JSON.stringify(unorderedActual) !== JSON.stringify(unorderedExpected)) {
      return { equal: false, reason: 'some result values do not match the expected answer' };
    }

    if (Array.isArray(options.orderBy) && options.orderBy.length) {
      const sortedCheck = isSortedBy(actualSet, expectedSet, options.orderBy);
      if (!sortedCheck.sorted) return { equal: false, reason: sortedCheck.reason };
    } else if (options.orderMatters && JSON.stringify(actualCanonical) !== JSON.stringify(expectedCanonical)) {
      return { equal: false, reason: 'the rows are correct but in the wrong order' };
    }
  }
  return { equal: true, reason: '' };
}

export { cellKey, canonicalRow };
