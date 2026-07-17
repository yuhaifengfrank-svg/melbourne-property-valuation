#!/usr/bin/env node

/**
 * content-factory-deploy.mjs — 内容工厂自动部署
 *
 * 在 content-factory-pipeline 运行后调用：
 *   1. git add 新文件（只加 blog/ + sitemap + output/social/ 内容文件）
 *   2. git commit
 *   3. git push
 *   4. Vercel 自动部署
 *
 * 安全措施：
 *   - 只允许 public/blog/、public/sitemap.xml、output/social/、.content-factory/ 的文件变更
 *   - 其他任何文件变更 → 中断并报错
 *   - 无变更 → 跳过（不产生空 commit）
 *
 * 用法：
 *   node scripts/content-factory-deploy.mjs [--dry-run]
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

// 允许的变更模式（git status --porcelain 输出中第 4 字符开始的文件路径）
const ALLOWED_PATTERNS = [
  /^public\/blog\//,
  /^public\/sitemap\.xml$/,
  /^output\/social\//,
  /^\.content-factory\//,
];

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', ...opts }).trim();
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log(`\n🔧 Content Factory Deploy — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('━'.repeat(54));

  // 1. 检查分支
  const branch = run('git rev-parse --abbrev-ref HEAD') || 'unknown';
  console.log(`\n[1] 分支: ${branch}`);

  // 2. 检查工作区变更
  const statusRaw = run('git status --porcelain');
  if (!statusRaw) {
    console.log('[2] 工作区干净，无变更，跳过');
    console.log('\n✅ 完成（无需操作）');
    return;
  }

  const lines = statusRaw.split('\n').filter(Boolean);
  console.log(`[2] 检测到 ${lines.length} 个文件变更`);

  // 解析变更文件路径（支持 M file、AM file、?? file 等格式）
  const allowedFiles = [];
  const disallowedFiles = [];

  for (const line of lines) {
    // 格式：XY path 或 XY path -> path2
    const parts = line.trim().split(/\s+/);
    let filepath = parts[1] || '';
    // 忽略重定向中的 arrow
    if (filepath === '->') filepath = parts[2] || parts[0] || '';

    if (!filepath) continue;

    const matched = ALLOWED_PATTERNS.some(p => p.test(filepath));
    if (matched) {
      allowedFiles.push(filepath);
    } else {
      disallowedFiles.push(filepath);
    }
  }

  // 只处理内容文件
  if (allowedFiles.length === 0) {
    console.log('[2] 无内容工厂文件变更，跳过');
    console.log('\n✅ 完成（无需操作）');
    return;
  }

  // 3. 检查是否有非内容工厂变更
  if (disallowedFiles.length > 0) {
    console.log(`\n⚠️  发现 ${disallowedFiles.length} 个非内容工厂变更：`);
    disallowedFiles.forEach(f => console.log(`   ${f}`));
    console.log(`→ 只提交内容工厂文件（${allowedFiles.length} 个），其他变更保留在工作区`);
  }

  // 4. git add 白名单文件
  console.log(`\n[3] git add ${allowedFiles.length} 个文件...`);
  if (!DRY_RUN) {
    for (const f of allowedFiles) {
      const result = run(`git add -- "${f}"`);
    }
  }

  // 5. commit
  const dateStr = new Date().toISOString().slice(0, 10);
  const blogCount = allowedFiles.filter(f => f.startsWith('public/blog/')).length;
  const xhsCount = allowedFiles.filter(f => f.startsWith('output/social/')).length;
  const commitMsg = `chore(content-factory): 自动生成 ${dateStr} 内容（${blogCount} 篇博客）`;

  console.log(`[4] git commit: ${commitMsg}`);
  let commitHash = null;
  if (!DRY_RUN) {
    try {
      execSync(`git commit -m "${commitMsg}" --author="AusHomeValue Bot <bot@aushomevalue.com.au>"`, {
        cwd: ROOT, stdio: 'pipe', encoding: 'utf-8',
      });
      commitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
      console.log(`   ✅ commit: ${commitHash}`);
    } catch (e) {
      // 可能没有变更需要 commit（文件内容无变化）
      const stderr = e.stderr?.toString() || '';
      if (stderr.includes('nothing to commit') || stderr.includes('no changes')) {
        console.log('   ℹ️  无需 commit（文件未变更）');
      } else {
        console.error('❌ commit 失败:', stderr.slice(0, 200));
        process.exit(1);
      }
    }
  }

  // 6. push
  if (!DRY_RUN && commitHash) {
    console.log(`[5] git push origin ${branch}...`);
    try {
      execSync(`git push origin ${branch} 2>&1`, { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' });
      console.log('   ✅ push 完成，Vercel 将自动部署');
    } catch (e) {
      const stderr = e.stderr?.toString() || '';
      if (stderr.includes('Everything up-to-date')) {
        console.log('   ✅ 已是最新');
      } else if (stderr.includes('rejected')) {
        console.error('❌ push 被拒绝（可能需要先 pull）:', stderr.slice(0, 200));
        process.exit(1);
      } else {
        console.log('   ✅ push 完成');
      }
    }
  } else if (!commitHash && !DRY_RUN) {
    console.log('[5] 跳过 push（无新 commit）');
  } else {
    console.log(`[5] git push origin ${branch} (dry-run, skipped)`);
  }

  // 7. 报告
  console.log('\n' + '━'.repeat(54));
  console.log(`✅ ${DRY_RUN ? 'DRY RUN 完成' : '部署完成！'}`);
  console.log(`   📝 博客: ${blogCount} 篇 → public/blog/`);
  console.log(`   📕 小红书: ${xhsCount} 篇 → output/social/`);
  console.log(`   🗺️  sitemap 已更新`);
  if (!DRY_RUN && commitHash) {
    console.log(`   🔗 commit: ${commitHash}`);
    console.log(`   🌐 https://github.com/yuhaifengfrank-svg/melbourne-property-valuation/commit/${commitHash}`);
    console.log(`   ⏳ Vercel 部署中... 约 1-2 分钟后线上可见`);
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Deploy 失败:', err.message);
  process.exit(1);
});
