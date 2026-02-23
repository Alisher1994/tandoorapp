#!/usr/bin/env node
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const pool = require('../server/database/connection');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const bannerIdArg = args.find((arg) => arg.startsWith('--banner-id='));

const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : null;
const bannerId = bannerIdArg ? Number.parseInt(bannerIdArg.split('=')[1], 10) : null;

if (limitArg && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('❌ Некорректный --limit. Пример: --limit=500');
  process.exit(1);
}

if (bannerIdArg && (!Number.isInteger(bannerId) || bannerId <= 0)) {
  console.error('❌ Некорректный --banner-id. Пример: --banner-id=12');
  process.exit(1);
}

const sanitizeTextValue = (value, maxLength = 120) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const normalizeIpForGeoLookup = (value) => {
  const raw = sanitizeTextValue(value, 128);
  if (!raw) return null;
  let ip = raw;
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
};

const isPrivateIp = (ip) => {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
};

const detectAppContainer = (userAgent) => {
  const ua = String(userAgent || '');
  if (!ua) return null;
  if (/Telegram/i.test(ua)) return 'Telegram';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB|Facebook/i.test(ua)) return 'Facebook';
  if (/TikTok/i.test(ua)) return 'TikTok';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  return null;
};

const inferDeviceTypeFromUa = (userAgent) => {
  const ua = String(userAgent || '');
  if (!ua) return 'desktop';
  if (/iPad|Tablet|Tab\b|SM-T|Lenovo Tab|Nexus 7|Nexus 10/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
};

const enrichRow = (row) => {
  const userAgent = sanitizeTextValue(row.user_agent || '', 1024);
  const parser = new UAParser(userAgent || undefined);
  const result = parser.getResult();

  const appContainer = detectAppContainer(userAgent);
  const isInAppBrowser = Boolean(
    appContainer ||
    /; wv\)/i.test(userAgent || '') ||
    /\bwv\b/i.test(userAgent || '')
  );

  const deviceType = sanitizeTextValue(result.device?.type, 24) || inferDeviceTypeFromUa(userAgent);
  const deviceBrand = sanitizeTextValue(result.device?.vendor, 80);
  const deviceModel = sanitizeTextValue(result.device?.model, 120)
    || (/(iPhone)/i.test(userAgent || '') ? 'iPhone' : null)
    || (/(iPad)/i.test(userAgent || '') ? 'iPad' : null);

  const browserName = sanitizeTextValue(result.browser?.name, 80);
  const browserVersion = sanitizeTextValue(result.browser?.version, 40);
  const osName = sanitizeTextValue(result.os?.name, 60);
  const osVersion = sanitizeTextValue(result.os?.version, 40);

  const normalizedIp = normalizeIpForGeoLookup(row.ip_address);
  let country = null;
  let region = null;
  let city = null;

  if (normalizedIp && !isPrivateIp(normalizedIp)) {
    try {
      const geo = geoip.lookup(normalizedIp);
      if (geo) {
        country = sanitizeTextValue(geo.country, 80);
        region = sanitizeTextValue(geo.region, 120);
        city = sanitizeTextValue(geo.city, 120);
      }
    } catch {
      // ignore
    }
  }

  return {
    device_type: deviceType,
    device_brand: deviceBrand,
    device_model: deviceModel,
    browser_name: browserName,
    browser_version: browserVersion,
    os_name: osName,
    os_version: osVersion,
    app_container: appContainer,
    is_in_app_browser: isInAppBrowser,
    country,
    region,
    city
  };
};

async function main() {
  const startedAt = Date.now();
  console.log(`📈 Backfill ad banner events analytics started${dryRun ? ' (dry-run)' : ''}`);

  const params = [];
  let whereSql = `
    WHERE (
      device_type IS NULL
      OR browser_name IS NULL
      OR is_in_app_browser IS NULL
      OR os_name IS NULL
    )
  `;

  if (bannerId) {
    params.push(bannerId);
    whereSql += ` AND banner_id = $${params.length}`;
  }

  let limitSql = '';
  if (limit) {
    params.push(limit);
    limitSql = ` LIMIT $${params.length}`;
  }

  const selectSql = `
    SELECT id, banner_id, event_type, ip_address, user_agent
    FROM ad_banner_events
    ${whereSql}
    ORDER BY id ASC
    ${limitSql}
  `;

  const { rows } = await pool.query(selectSql, params);
  console.log(`🔎 Найдено событий для бэкфилла: ${rows.length}`);

  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  };

  for (const row of rows) {
    stats.processed += 1;
    try {
      const enriched = enrichRow(row);
      const hasAnyValue = Object.entries(enriched).some(([key, value]) => (
        key === 'is_in_app_browser' ? true : value !== null && value !== ''
      ));

      if (!hasAnyValue) {
        stats.skipped += 1;
        console.log(`⏭️  #${row.id}: no enrichable data`);
        continue;
      }

      if (!dryRun) {
        await pool.query(
          `UPDATE ad_banner_events
           SET device_type = COALESCE(device_type, $1),
               device_brand = COALESCE(device_brand, $2),
               device_model = COALESCE(device_model, $3),
               browser_name = COALESCE(browser_name, $4),
               browser_version = COALESCE(browser_version, $5),
               os_name = COALESCE(os_name, $6),
               os_version = COALESCE(os_version, $7),
               app_container = COALESCE(app_container, $8),
               is_in_app_browser = COALESCE(is_in_app_browser, $9),
               country = COALESCE(country, $10),
               region = COALESCE(region, $11),
               city = COALESCE(city, $12)
           WHERE id = $13`,
          [
            enriched.device_type,
            enriched.device_brand,
            enriched.device_model,
            enriched.browser_name,
            enriched.browser_version,
            enriched.os_name,
            enriched.os_version,
            enriched.app_container,
            enriched.is_in_app_browser,
            enriched.country,
            enriched.region,
            enriched.city,
            row.id
          ]
        );
      }

      stats.updated += 1;
      console.log(
        `✅ #${row.id}: ${enriched.browser_name || 'Unknown browser'} / ${enriched.device_model || enriched.device_brand || enriched.device_type || 'device'} / ${enriched.city || enriched.country || 'no-geo'}`
      );
    } catch (error) {
      stats.failed += 1;
      console.log(`❌ #${row.id}: ${error?.message || error}`);
    }
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log('📊 Итог:');
  console.log(`- processed: ${stats.processed}`);
  console.log(`- updated: ${stats.updated}`);
  console.log(`- skipped: ${stats.skipped}`);
  console.log(`- failed: ${stats.failed}`);
  console.log(`- duration: ${durationSec}s`);
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore pool close errors
    }
  });

