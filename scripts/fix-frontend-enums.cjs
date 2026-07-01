const fs = require('fs');
const path = require('path');

const dir = 'src/pages/safety';
const homepage = 'src/pages/HomePage.tsx';

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walk(path.join(dir, file), fileList);
    } else {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allFiles = walk(dir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
allFiles.push(homepage);

const replacements = [
  { old: "'Cực kỳ nghiêm trọng'", new: "'CRITICAL'" },
  { old: "'Nghiêm trọng'", new: "'HIGH'" },
  { old: "'Trung bình'", new: "'MEDIUM'" },
  { old: "'Thấp'", new: "'LOW'" },
  
  { old: "'Mở'", new: "'OPEN'" },
  { old: "'Đang xử lý'", new: "'IN_PROGRESS'" },
  { old: "'Hoàn thành'", new: "'DONE'" },
  { old: "'Quá hạn'", new: "'OVERDUE'" },
  
  { old: "'Chờ duyệt'", new: "'PENDING'" },
  { old: "'Đã duyệt'", new: "'APPROVED'" },
  { old: "'Từ chối'", new: "'REJECTED'" },
  
  { old: "'Thiết bị / Máy móc'", new: "'EQUIPMENT'" },
  { old: "'Môi trường làm việc'", new: "'ENVIRONMENT'" },
  { old: "'Hành vi con người'", new: "'HUMAN_BEHAVIOR'" },
  { old: "'PCCC & Thoát hiểm'", new: "'FIRE_SAFETY'" },
  { old: "'Hóa chất nguy hiểm'", new: "'CHEMICALS'" },
  { old: "'Ergonomic / Tư thế'", new: "'ERGONOMICS'" },
  
  // Also fix double quotes if used
  { old: '"Cực kỳ nghiêm trọng"', new: '"CRITICAL"' },
  { old: '"Nghiêm trọng"', new: '"HIGH"' },
  { old: '"Trung bình"', new: '"MEDIUM"' },
  { old: '"Thấp"', new: '"LOW"' },
  { old: '"Mở"', new: '"OPEN"' },
  { old: '"Đang xử lý"', new: '"IN_PROGRESS"' },
  { old: '"Hoàn thành"', new: '"DONE"' },
  { old: '"Quá hạn"', new: '"OVERDUE"' },
  { old: '"Chờ duyệt"', new: '"PENDING"' },
  { old: '"Đã duyệt"', new: '"APPROVED"' },
  { old: '"Từ chối"', new: '"REJECTED"' },
  { old: '"Thiết bị / Máy móc"', new: '"EQUIPMENT"' },
  { old: '"Môi trường làm việc"', new: '"ENVIRONMENT"' },
  { old: '"Hành vi con người"', new: '"HUMAN_BEHAVIOR"' },
  { old: '"PCCC & Thoát hiểm"', new: '"FIRE_SAFETY"' },
  { old: '"Hóa chất nguy hiểm"', new: '"CHEMICALS"' },
  { old: '"Ergonomic / Tư thế"', new: '"ERGONOMICS"' },
];

for (const f of allFiles) {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    let changed = false;
    for (const r of replacements) {
      if (content.includes(r.old)) {
        content = content.split(r.old).join(r.new);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(f, content, 'utf8');
      console.log(`Updated ${f}`);
    }
  }
}
console.log('Frontend text replacement completed.');
