/**
 * GitHub Pages 前台設定
 * 完成部署後只需要修改這個檔案。
 */
window.ACTIVITY_HUB_CONFIG = {
  // Google Sheets「發布到網路」後取得的 CSV 網址。
  // V3 會先用 CSV 讀取；若瀏覽器跨網域讀取失敗，會自動嘗試 Google Visualization 備援。
  // 未填時會自動顯示內建示範資料，方便先看網站效果。
  PUBLISHED_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSimGtS27kvMS_7Qof8yAI26nJLaHrYKIChLemHU31hXHTXGqs6icerakQNOdwOOKMrXUwmyhQkroDk/pub?gid=819632519&single=true&output=csv',

  // Google Apps Script 後台 Web App 的 /exec 網址。
  ADMIN_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxvtJHVF1QIaElNySuMM3gWDHKsSDGLVQXbKRut0FbG32SObRp7vRiihKOCQhr5Y4vi/exec',

  // 網站顯示名稱，可依正式單位名稱修改。
  SITE_NAME: '高雄運動｜每月活動總入口',

  // 前台預設顯示的活動類型順序。
  TYPE_ORDER: ['課程', '賽事', '體驗', '活動', '講座／宣導', '其他'],

  // 民眾前台的運動類別排序；可自行增減。
  SPORT_ORDER: ['跑步健走', '球類', '水域', '單車', '健身體適能', '樂齡', '親子', '舞蹈韻律', '武術格鬥', '戶外休閒', '綜合運動', '其他']
};
