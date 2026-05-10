const normalizeRestaurantNameForCompare = (value) => String(value || '').trim().toLowerCase();

const normalizeRestaurantTokenForCompare = (value) => String(value || '').trim();

const checkRestaurantIdentityAvailability = async ({
  client,
  name,
  telegramBotToken,
  excludeRestaurantId = null
}) => {
  const normalizedName = normalizeRestaurantNameForCompare(name);
  const normalizedToken = normalizeRestaurantTokenForCompare(telegramBotToken);
  const hasName = normalizedName.length > 0;
  const hasToken = normalizedToken.length > 0;

  const result = {
    nameTaken: false,
    nameConflictRestaurantId: null,
    tokenTaken: false,
    tokenConflictRestaurantId: null
  };

  if (!hasName && !hasToken) return result;

  const params = [];
  let index = 1;
  const whereParts = [];

  if (hasName) {
    params.push(normalizedName);
    whereParts.push(`LOWER(BTRIM(name)) = $${index++}`);
  }

  if (hasToken) {
    params.push(normalizedToken);
    whereParts.push(`BTRIM(COALESCE(telegram_bot_token, '')) = $${index++}`);
  }

  let query = `
    SELECT id, name, telegram_bot_token
    FROM restaurants
    WHERE (${whereParts.join(' OR ')})
  `;

  if (Number.isFinite(Number(excludeRestaurantId)) && Number(excludeRestaurantId) > 0) {
    params.push(Number(excludeRestaurantId));
    query += ` AND id <> $${index++}`;
  }

  const rows = await client.query(query, params);
  for (const row of rows.rows) {
    const rowName = normalizeRestaurantNameForCompare(row.name);
    const rowToken = normalizeRestaurantTokenForCompare(row.telegram_bot_token);
    if (!result.nameTaken && hasName && rowName === normalizedName) {
      result.nameTaken = true;
      result.nameConflictRestaurantId = Number(row.id);
    }
    if (!result.tokenTaken && hasToken && rowToken === normalizedToken) {
      result.tokenTaken = true;
      result.tokenConflictRestaurantId = Number(row.id);
    }
    if (result.nameTaken && result.tokenTaken) break;
  }

  return result;
};

module.exports = {
  checkRestaurantIdentityAvailability,
  normalizeRestaurantNameForCompare,
  normalizeRestaurantTokenForCompare
};
