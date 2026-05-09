const fs = require('fs');
const path = require('path');

function verify() {
  console.log('--- 开始安装包环境验证 ---');
  
  const requiredFiles = [
    'package.json',
    'main.js',
    'preload.js',
    'build/installer.nsh',
    'scripts/afterPack.js'
  ];

  let allPassed = true;
  requiredFiles.forEach(file => {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      console.log(`[OK] 找到文件: ${file}`);
    } else {
      console.error(`[ERROR] 缺失文件: ${file}`);
      allPassed = false;
    }
  });

  if (allPassed) {
    console.log('--- 验证成功：环境已准备就绪 ---');
    process.exit(0);
  } else {
    console.error('--- 验证失败：请检查缺失文件 ---');
    process.exit(1);
  }
}

verify();
