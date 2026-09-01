/* 《人工智能应用基础》课程网站 · 全站脚本
   功能：任务单勾选状态本地保存（localStorage） */
(function () {
  'use strict';

  var pageKey = 'ai-course:' + (location.pathname.split('/').slice(-2, -1)[0] || 'index');

  // 恢复勾选状态
  document.querySelectorAll('ul.checklist input[type="checkbox"]').forEach(function (cb, i) {
    var key = pageKey + ':cb' + i;
    if (localStorage.getItem(key) === '1') cb.checked = true;
    cb.addEventListener('change', function () {
      localStorage.setItem(key, cb.checked ? '1' : '0');
    });
  });
})();
