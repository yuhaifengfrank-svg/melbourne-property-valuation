// ── 日更抓取 cron 入口 ──
// ⚠️ 尚未启用
//
// 依赖: db-schema.js#ensureAllSuburbs, browser-collector.js#collectAll/saveSalesToDb
// collectAll、saveSalesToDb 和 vic-sa2-list.js 均未实现。
// 完成实现或建立数据库采集管道后，启用此脚本。

console.error("[Cron Daily] NOT ENABLED — required functions collectAll / saveSalesToDb not yet implemented");
process.exit(0);
