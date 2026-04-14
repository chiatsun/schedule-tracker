/**
 * 工程行程追蹤系統 - Google Apps Script 後端程式碼 (中文化標題版本)
 */

// 欄位對照表：將程式內部的英文編號轉為 Excel 顯示的中文標題
var FIELD_MAP = {
  "id": "系統編號",
  "saveTime": "新增時間",
  "name": "專案名稱",
  "personnel": "施工人員",
  "startDate": "開始日期",
  "endDate": "結束日期",
  "status": "工程狀態",
  "extendedDate": "展延日期"
};

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("行程列表");
  var personnelSheet = ss.getSheetByName("施工人員名單");
  
  // 反向對照表：標題轉 Key
  var reverseMap = {};
  for (var key in FIELD_MAP) {
    reverseMap[FIELD_MAP[key]] = key;
  }
  
  // 1. 讀取行程資料
  var schedules = [];
  if (sheet && sheet.getLastRow() > 0) {
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    for (var i = 1; i < values.length; i++) {
        var row = values[i];
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
            var headerName = headers[j];
            var englishKey = reverseMap[headerName] || headerName;
            obj[englishKey] = row[j];
        }
        schedules.push(obj);
    }
  }
  
  // 2. 讀取人員管理資料
  var personnel = [];
  if (personnelSheet && personnelSheet.getLastRow() > 0) {
    var pValues = personnelSheet.getDataRange().getValues();
    if (pValues.length > 1) { 
       for (var k = 1; k < pValues.length; k++) {
         if (pValues[k][0]) personnel.push(pValues[k][0]);
       }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    schedules: schedules,
    personnel: personnel
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload;
  
  try {
    payload = JSON.parse(e.postData.contents);
    
    var schedulesData = [];
    var personnelData = [];

    if (Array.isArray(payload)) {
      schedulesData = payload;
    } else {
      schedulesData = payload.schedules || [];
      personnelData = payload.personnel || [];
    }
    
    // 儲存行程資料
    var sheet = ss.getSheetByName("行程列表") || ss.insertSheet("行程列表");
    sheet.clear();
    
    if (schedulesData.length > 0) {
      // 使用中文標題作為第一列
      var englishKeys = ["id", "saveTime", "name", "personnel", "startDate", "endDate", "status", "extendedDate"];
      var chineseHeaders = englishKeys.map(function(k) { return FIELD_MAP[k] || k; });
      sheet.appendRow(chineseHeaders);
      
      var rows = schedulesData.map(function(s) {
        return englishKeys.map(function(k) { return s[k] || ""; });
      });
      sheet.getRange(2, 1, rows.length, chineseHeaders.length).setValues(rows);
    }
    
    // 儲存人員資料
    var pSheet = ss.getSheetByName("施工人員名單") || ss.insertSheet("施工人員名單");
    pSheet.clear();
    pSheet.appendRow(["人員姓名"]);
    if (personnelData.length > 0) {
      var pRows = personnelData.map(function(p) { return [p]; });
      pSheet.getRange(2, 1, pRows.length, 1).setValues(pRows);
    }
    
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    var logSheet = ss.getSheetByName("錯誤紀錄") || ss.insertSheet("錯誤紀錄");
    logSheet.appendRow([new Date(), "POST Error", err.toString()]);
    return ContentService.createTextOutput("Error: " + err.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}
