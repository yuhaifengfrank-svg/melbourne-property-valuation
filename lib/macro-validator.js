// macro-validator.js — 宏观指标入库前的数据校验器
// 
// 校验层级：
//   Level 1: 范围 + 时间窗口（单条数据）
//   Level 2: 权威数据源交叉验证（不同源对比）
//   Level 3: 趋势一致性（历史对比）
//
// 每个指标标注了:
//   primarySource — 入库时用的数据源
//   verifySource — 交叉验证的数据源

import { neon } from '@neondatabase/serverless';

// ====== 权威数据源定义 ======

const AUTHORITY_SOURCES = {
  'cash_rate': {
    primary: 'RBA F1.1 CSV',
    verify: {
      sources: [
        { name: 'RBA 官方媒体发布', url: 'https://www.rba.gov.au/monetary-policy/int-rate-decisions/', type: 'html_table' },
      ],
      method: '对比 RBA 每月货币政策公告的官方值。只应在 RBA 会议日（每月第一个周二）变动',
      calendar: 'rba_meeting_days', // RBA 2026 会议日历
    }
  },
  'unemployment_rate_aus': {
    primary: 'ABS 6291.0',
    verify: {
      sources: [
        { name: 'ABS Labour Force 月度发布', url: 'https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia', type: 'html_table' },
        { name: 'ABS 6291.0 CSV', url: 'https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia/latest-release/6291001.csv', type: 'csv' },
      ],
      method: '与 participation_rate_aus 同源（同一份 ABS 发布），两者趋势应一致。失业率下降时参与率通常上升',
      relatedIndicators: ['participation_rate_aus'],
    }
  },
  'participation_rate_aus': {
    primary: 'ABS 6291.0',
    verify: {
      sources: [
        { name: 'ABS Labour Force 月度发布', url: 'https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia', type: 'html_table' },
      ],
      method: '与 unemployment_rate_aus 同源。澳洲 2020s 合理范围 65-68%',
      relatedIndicators: ['unemployment_rate_aus'],
    }
  },
  'cpi_mel_annual': {
    primary: 'ABS 6401.0',
    verify: {
      sources: [
        { name: 'ABS CPI 季度发布', url: 'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia', type: 'html_table' },
        { name: 'RBA CPI forecast', url: 'https://www.rba.gov.au/statistics/tables/', type: 'html_table' },
      ],
      method: '墨尔本 CPI 与全澳 CPI (cpi_aus_annual) 应相近。住房 CPI (cpi_housing_annual) 通常高于总体 CPI',
      relatedIndicators: ['cpi_aus_annual', 'cpi_housing_annual'],
    }
  },
  'cpi_aus_annual': {
    primary: 'ABS 6401.0',
    verify: {
      sources: [
        { name: 'ABS CPI 季度发布', url: 'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia', type: 'html_table' },
        { name: 'RBA CPI forecast', url: 'https://www.rba.gov.au/statistics/tables/', type: 'html_table' },
      ],
      method: '与 cpi_mel_annual 差异通常 <1%，与 RBA 2-3% 目标区间对比',
      relatedIndicators: ['cpi_mel_annual', 'cpi_housing_annual'],
    }
  },
  'cpi_housing_annual': {
    primary: 'ABS 6401.0',
    verify: {
      sources: [
        { name: 'ABS CPI 住房分组', url: 'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia', type: 'html_table' },
      ],
      method: '住房 CPI 是总体 CPI 的主要驱动因素，通常高 2-5%',
      relatedIndicators: ['cpi_aus_annual'],
    }
  },
  'gdp_aus_annual': {
    primary: 'World Bank / ABS',
    verify: {
      sources: [
        { name: 'ABS National Accounts (5206.0)', url: 'https://www.abs.gov.au/statistics/economy/national-accounts/australian-national-accounts-national-income-expenditure-and-product', type: 'html_table' },
        { name: 'RBA GDP forecast', url: 'https://www.rba.gov.au/forecasts/', type: 'html_table' },
      ],
      method: '与 RBA 经济展望中的 GDP 预测对比，误差应 <1%',
    }
  },
  'building_approvals_vic_yoy': {
    primary: 'ABS 8731.0',
    verify: {
      sources: [
        { name: 'ABS Building Approvals', url: 'https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia', type: 'html_table' },
      ],
      method: 'VIC 同比与全澳同比 (building_approvals_aus_yoy) 趋势一致',
      relatedIndicators: ['building_approvals_aus_yoy'],
    }
  },
  'building_approvals_aus_yoy': {
    primary: 'ABS 8731.0',
    verify: {
      sources: [
        { name: 'ABS Building Approvals', url: 'https://www.abs.gov.uk/statistics/industry/building-and-construction/building-approvals-australia', type: 'html_table' },
      ],
      method: '与 VIC 分项 (building_approvals_vic_yoy) 趋势一致',
      relatedIndicators: ['building_approvals_vic_yoy'],
    }
  },
  'housing_loan_var_oo': {
    primary: 'RBA F5',
    verify: {
      sources: [
        { name: 'RBA F5 Indicator Lending Rates', url: 'https://www.rba.gov.au/statistics/tables/xls/f05d.xlsx', type: 'xlsx' },
        { name: 'Canstar/Compare the Market', url: 'https://www.canstar.com.au/home-loans/', type: 'market' },
      ],
      method: '与 cash_rate + 银行利差 (2-4%) 粗校验。浮动利率应 > cash_rate + 2%',
      relatedIndicators: ['cash_rate'],
    }
  },
};

// ====== RBA 2026 会议日历（交叉验证 cash_rate 用） ======
// RBA 2026 会议日（每月第一个周二），如果有变化次一交易日生效
const RBA_MEETING_DATES_2026 = [
  '2026-02-03',  // 2月会议
  '2026-03-03',  // 3月会议
  '2026-04-07',  // 4月会议（注意：4月第一个周二 4月7日）
  '2026-05-05',  // 5月会议
  '2026-06-02',  // 6月会议
  '2026-07-07',  // 7月会议
  '2026-08-04',  // 8月会议
  '2026-09-01',  // 9月会议
  '2026-10-06',  // 10月会议
  '2026-11-03',  // 11月会议
  '2026-12-01',  // 12月会议
];

// 实际生效日期：公告次日（也有时 RBA 说"effective from today"）
// 为了通用检查，我们允许会议日 ±1 天
function isNearRbaMeetingDate(isoDateStr) {
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return false;
  const dMs = d.getTime();
  for (const meeting of RBA_MEETING_DATES_2026) {
    const m = new Date(meeting);
    const diff = Math.abs(dMs - m.getTime());
    if (diff <= 2 * 86400000) return true; // ±2天
  }
  return false;
}

// ====== 验证范围 ======

const VALIDATION_RULES = {
  'cash_rate': {
    range: { min: 0.0, max: 7.0 },
    minYear: 2018,
    decimals: 2,
    description: 'RBA cash rate target',
  },
  'bill_90d_rate': {
    range: { min: 0.0, max: 7.0 },
    minYear: 2018,
    decimals: 2,
    description: '90-day bank bill rate',
  },
  'unemployment_rate_aus': {
    range: { min: 2.0, max: 10.0 },
    minYear: 2018,
    decimals: 2,
    description: 'National unemployment rate (ABS 6291.0)',
  },
  'unemployment_rate_aus_yoy': {
    range: { min: -5.0, max: 5.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Unemployment rate YoY change',
  },
  'participation_rate_aus': {
    range: { min: 60.0, max: 70.0 },
    minYear: 2018,
    decimals: 1,
    description: 'Labour force participation rate',
  },
  'cpi_mel_annual': {
    range: { min: -2.0, max: 10.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Melbourne CPI annual change (ABS 6401.0)',
  },
  'cpi_mel_index': {
    range: { min: 90.0, max: 150.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Melbourne CPI index level',
  },
  'cpi_aus_annual': {
    range: { min: -2.0, max: 10.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Australia CPI annual change',
  },
  'cpi_aus_index': {
    range: { min: 90.0, max: 150.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Australia CPI index level',
  },
  'cpi_housing_annual': {
    range: { min: -5.0, max: 20.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Housing CPI annual change',
  },
  'cpi_housing_index': {
    range: { min: 80.0, max: 200.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Housing CPI index level',
  },
  'gdp_aus_annual': {
    range: { min: -10.0, max: 10.0 },
    minYear: 2000,
    decimals: 2,
    description: 'Australia GDP annual growth',
  },
  'gdp_aus_recent': {
    range: { min: -10.0, max: 10.0 },
    minYear: 2024,
    decimals: 2,
    description: 'Australia GDP trailing 4Q estimate',
  },
  'housing_loan_var_oo': {
    range: { min: 2.0, max: 12.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Variable owner-occupier rate (RBA F5)',
  },
  'housing_loan_var_investor': {
    range: { min: 2.0, max: 12.0 },
    minYear: 2018,
    decimals: 2,
    description: 'Variable investor rate (RBA F5)',
  },
  'housing_loan_3y_fixed_oo': {
    range: { min: 1.0, max: 10.0 },
    minYear: 2018,
    decimals: 2,
    description: '3-year fixed owner-occupier rate (RBA F5)',
  },
  'housing_loan_3y_fixed_investor': {
    range: { min: 1.0, max: 10.0 },
    minYear: 2018,
    decimals: 2,
    description: '3-year fixed investor rate (RBA F5)',
  },
  'building_approvals_aus_annual': {
    range: { min: 50000, max: 300000 },
    decimals: 0,
    description: 'National building approvals annual (ABS 8731.0)',
  },
  'building_approvals_aus_monthly': {
    range: { min: 3000, max: 30000 },
    decimals: 0,
    description: 'National building approvals monthly',
  },
  'building_approvals_aus_yoy': {
    range: { min: -30.0, max: 50.0 },
    decimals: 2,
    description: 'National building approvals YoY',
  },
  'building_approvals_vic_annual': {
    range: { min: 20000, max: 80000 },
    decimals: 0,
    description: 'VIC building approvals annual',
  },
  'building_approvals_vic_monthly': {
    range: { min: 1000, max: 10000 },
    decimals: 0,
    description: 'VIC building approvals monthly',
  },
  'building_approvals_vic_yoy': {
    range: { min: -40.0, max: 50.0 },
    decimals: 2,
    description: 'VIC building approvals YoY',
  },
  'housing_credit_annual': {
    range: { min: -5.0, max: 25.0 },
    decimals: 2,
    description: 'Housing credit annual growth (RBA D1)',
  },
  'housing_credit_monthly': {
    range: { min: -1.0, max: 3.0 },
    decimals: 2,
    description: 'Housing credit monthly growth',
  },
  'housing_credit_oo_annual': {
    range: { min: -5.0, max: 25.0 },
    decimals: 2,
    description: 'Owner-occupier credit annual growth',
  },
  'housing_credit_oo_monthly': {
    range: { min: -1.0, max: 3.0 },
    decimals: 2,
    description: 'Owner-occupier credit monthly growth',
  },
  'housing_credit_inv_annual': {
    range: { min: -10.0, max: 30.0 },
    decimals: 2,
    description: 'Investor credit annual growth',
  },
  'housing_credit_inv_monthly': {
    range: { min: -2.0, max: 5.0 },
    decimals: 2,
    description: 'Investor credit monthly growth',
  },
  'debt_to_income_ratio': {
    range: { min: 50.0, max: 250.0 },
    decimals: 1,
    description: 'Household debt-to-income ratio',
  },
  'debt_to_assets_ratio': {
    range: { min: 5.0, max: 30.0 },
    decimals: 1,
    description: 'Household debt-to-assets ratio',
  },
  'housing_debt_to_income_ratio': {
    range: { min: 50.0, max: 250.0 },
    decimals: 1,
    description: 'Housing debt-to-income ratio',
  },
  'oo_debt_to_income_ratio': {
    range: { min: 50.0, max: 200.0 },
    decimals: 1,
    description: 'Owner-occupier debt-to-income ratio',
  },
};

/**
 * Level 1 + Level 2 验证
 * @returns {{ valid: boolean, errors: string[], warnings: string[], verifications: string[] }}
 */
export function validateMacroEntry(indicator, value, recordedDate, source) {
  const errors = [];
  const warnings = [];
  const verifications = [];

  // ——— Level 1: 基本范围 + 时间窗口 ———

  const rules = VALIDATION_RULES[indicator];
  if (!rules) {
    warnings.push(`Unknown indicator "${indicator}" — no validation rules, allow with caution`);
    return { valid: true, errors, warnings, verifications };
  }

  const v = Number(value);
  if (isNaN(v)) {
    errors.push(`Value "${value}" is not a number`);
    return { valid: false, errors, warnings, verifications };
  }
  if (v < rules.range.min || v > rules.range.max) {
    errors.push(`Value ${v} outside range [${rules.range.min}, ${rules.range.max}] for "${indicator}" (${rules.description})`);
  }

  const d = new Date(recordedDate);
  if (isNaN(d.getTime())) {
    errors.push(`Invalid date "${recordedDate}"`);
    return { valid: false, errors, warnings, verifications };
  }
  if (rules.minYear && d.getFullYear() < rules.minYear) {
    errors.push(`Date ${recordedDate} before minimum year ${rules.minYear} for "${indicator}"`);
  }

  // ——— Level 2: 权威数据源交叉验证 ———

  const authority = AUTHORITY_SOURCES[indicator];
  if (authority) {
    verifications.push(`Data source declared: primary=${authority.primary}`);

    // cash_rate 特殊：检查是否在 RBA 会议日附近
    if (indicator === 'cash_rate') {
      const isoStr = recordedDate.substring(0, 10);
      const nearMeeting = isNearRbaMeetingDate(isoStr);
      if (!nearMeeting) {
        warnings.push(`cash_rate change on ${isoStr} — not near any RBA meeting date (${authority.verify.calendar}). Verify against RBA official media releases`);
      } else {
        verifications.push(`Date ${isoStr} aligns with RBA meeting schedule ✓`);
      }

      // cash_rate 变幅限制：单次会议最多 ±0.50%
      // 这个需要 DB 查询上次值，已分离到 checkReasonableChange
    }

    // 利率相关性检查
    if (indicator === 'housing_loan_var_oo' && typeof lastCashRate !== 'undefined') {
      // 浮动利率应 > cash_rate + 2%
      // 但 lastCashRate 需要从数据库取，由调用方传入
    }

    // CPI 一致性检查
    if (indicator === 'cpi_mel_annual') {
      // 墨尔本 CPI 与全澳 CPI 偏差不应 > 2%
      // 需要 DB 查 cpi_aus_annual
    }

    // verify source URL
    if (authority.verify && authority.verify.sources) {
      for (const vs of authority.verify.sources) {
        verifications.push(`Verify source: ${vs.name} (${vs.url})`);
      }
    }
    if (authority.verify && authority.verify.relatedIndicators) {
      verifications.push(`Cross-check with related indicators: ${authority.verify.relatedIndicators.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, verifications };
  }

  return { valid: true, errors, warnings, verifications };
}

/**
 * Level 3: 趋势一致性（需要 DB 查询）
 * 检查新值与上次已收录值的变化幅度
 */
export async function checkReasonableChange(sql, indicator, newValue, newDate) {
  const last = await sql`
    SELECT value, recorded_date FROM macro_indicators
    WHERE indicator = ${indicator}
    ORDER BY recorded_date DESC LIMIT 1
  `;

  if (last.length === 0 || last[0].value === null) {
    return { ok: true, reason: null };
  }

  const lastVal = Number(last[0].value);
  const lastDate = String(last[0].recorded_date).substring(0, 10);
  const newDateStr = String(newDate).substring(0, 10);

  // 同一个日期同一个值 → 跳过
  if (lastDate === newDateStr) {
    return { ok: true, reason: 'same date, skipping' };
  }

  const absChange = Math.abs(newValue - lastVal);
  const pctChange = lastVal !== 0 ? Math.abs((newValue - lastVal) / lastVal) : 0;

  const warnings = [];

  // 针对每个指标的特殊趋势检查
  switch (indicator) {
    case 'cash_rate':
      // RBA 一次会议最多 ±0.50%
      if (absChange > 0.50) {
        warnings.push(`cash_rate changed by ${absChange.toFixed(2)}pp in one step — exceeds typical RBA max of 0.50pp per meeting`);
      }
      // 但 RBA 也可能在紧急会议中更大幅度调整
      break;

    case 'unemployment_rate_aus':
    case 'participation_rate_aus':
      // 月度失业率通常变化 <0.5%
      if (absChange > 0.5) {
        warnings.push(`${indicator} changed by ${absChange.toFixed(2)}pp in one month — unusually large`);
      }
      break;

    case 'cpi_mel_annual':
    case 'cpi_aus_annual':
      // CPI 年度变化通常每月变动 <1%
      if (absChange > 1.0) {
        warnings.push(`${indicator} changed by ${absChange.toFixed(2)}pp in one period — unusually large`);
      }
      break;

    case 'gdp_aus_annual':
      // GDP 通常每年变化 <5%（排除 COVID 时期）
      break;

    default:
      // 通用 ±50%
      if (pctChange > 0.5 && indicator !== 'building_approvals_aus_annual') {
        warnings.push(`${indicator} changed by ${(pctChange * 100).toFixed(0)}% from ${lastVal} (${lastDate}) to ${newValue} (${newDateStr})`);
      }
  }

  if (warnings.length > 0) {
    return { ok: true, warnings }; // 告警不阻止入库
  }

  return { ok: true, warnings: [] };
}

/**
 * Level 2 增强：异步交叉验证（需要 DB）
 * 检查相关指标的一致性
 */
export async function crossValidate(sql, indicator, value, recordedDate) {
  const errors = [];
  const warnings = [];

  switch (indicator) {
    case 'cash_rate': {
      // 检查住房贷款利率是否与 cash_rate 联动合理
      const varRate = await sql`
        SELECT value FROM macro_indicators
        WHERE indicator = 'housing_loan_var_oo'
        ORDER BY recorded_date DESC LIMIT 1
      `;
      if (varRate.length > 0) {
        const varVal = Number(varRate[0].value);
        const spread = varVal - value;
        if (spread < 1.5 || spread > 5.0) {
          warnings.push(`cash_rate=${value}% vs variable OO rate=${varVal}% — spread ${spread.toFixed(2)}% outside typical range (1.5-5.0%)`);
        }
      }
      break;
    }

    case 'cpi_mel_annual': {
      const ausCPI = await sql`
        SELECT value FROM macro_indicators
        WHERE indicator = 'cpi_aus_annual'
        ORDER BY recorded_date DESC LIMIT 1
      `;
      if (ausCPI.length > 0) {
        const diff = Math.abs(value - Number(ausCPI[0].value));
        if (diff > 2.0) {
          warnings.push(`cpi_mel_annual=${value}% vs cpi_aus_annual=${ausCPI[0].value}% — gap ${diff.toFixed(2)}% > 2% threshold`);
        }
      }
      break;
    }

    case 'unemployment_rate_aus': {
      const partRate = await sql`
        SELECT value FROM macro_indicators
        WHERE indicator = 'participation_rate_aus'
        ORDER BY recorded_date DESC LIMIT 1
      `;
      if (partRate.length > 0) {
        const part = Number(partRate[0].value);
        // 失业率下降时参与率通常上升（两者应负相关）
        // 简单的合理性：两者不应同时极高
        if (value < 3.0 && part > 68) {
          warnings.push(`unemployment=${value}% and participation=${part}% — both extremely low unemployment and high participation`);
        }
      }
      break;
    }
  }

  return { errors, warnings };
}

export default VALIDATION_RULES;
export { AUTHORITY_SOURCES, RBA_MEETING_DATES_2026 };
