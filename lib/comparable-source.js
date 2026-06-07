// ── ComparableSource 接口 ──
// 隔离 CDP 依赖，生产端只读数据库或 fixture

/**
 * @typedef {Object} ComparableRecord
 * @property {string} address
 * @property {number} salePrice
 * @property {string} saleDate       - ISO date string (YYYY-MM-DD)
 * @property {string} sourceUrl
 * @property {string} [propertyType]
 * @property {number} [bedrooms]
 * @property {number} [bathrooms]
 * @property {number} [carSpaces]
 * @property {number} [landSize]
 * @property {number} [distanceMeters]
 * @property {number} [qualityScore]
 * @property {string} [qualityBand]
 * @property {string} [batchId]
 * @property {string} [verifiedAt]
 */

/**
 * ComparableSource 抽象
 * 每个实现必须提供 detect() + fetch()
 */
export class ComparableSource {
  /**
   * @param {Object} subject - 目标房产信息
   * @param {string} subject.address
   * @param {string} [subject.suburb]
   * @param {string} [subject.state]
   * @param {string} [subject.propertyType]
   * @returns {Promise<ComparableRecord[]>}
   */
  async fetch(subject) {
    throw new Error("fetch() not implemented");
  }

  /**
   * 返回该源是否适用于当前环境
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }
}
