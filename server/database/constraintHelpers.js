const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const assertIdentifier = (value, label) => {
  const normalized = String(value || '').trim();
  if (!IDENTIFIER_RE.test(normalized)) {
    throw new Error(`Invalid SQL identifier for ${label}: ${value}`);
  }
  return normalized;
};

const constraintExists = async (executor, tableName, constraintName) => {
  const table = assertIdentifier(tableName, 'tableName');
  const constraint = assertIdentifier(constraintName, 'constraintName');
  const result = await executor.query(
    `
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.conname = $1
        AND t.relname = $2
      LIMIT 1
    `,
    [constraint, table]
  );
  return result.rows.length > 0;
};

const ensureCheckConstraint = async (executor, options) => {
  const tableName = assertIdentifier(options?.tableName, 'tableName');
  const constraintName = assertIdentifier(options?.constraintName, 'constraintName');
  const checkExpression = String(options?.checkExpression || '').trim();
  if (!checkExpression) {
    throw new Error(`Missing checkExpression for ${constraintName}`);
  }

  if (await constraintExists(executor, tableName, constraintName)) return;
  await executor.query(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT ${constraintName}
    CHECK (${checkExpression})
  `);
};

const ensureForeignKeyConstraint = async (executor, options) => {
  const tableName = assertIdentifier(options?.tableName, 'tableName');
  const constraintName = assertIdentifier(options?.constraintName, 'constraintName');
  const definition = String(options?.definition || '').trim();
  if (!definition) {
    throw new Error(`Missing definition for ${constraintName}`);
  }

  if (await constraintExists(executor, tableName, constraintName)) return;
  await executor.query(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT ${constraintName}
    ${definition}
  `);
};

module.exports = {
  ensureCheckConstraint,
  ensureForeignKeyConstraint
};
