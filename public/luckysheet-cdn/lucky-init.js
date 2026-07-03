(function(){
  var VN_FONT = '"Be Vietnam Pro"';
  var VN_FONT_FALLBACK = '"Be Vietnam Pro","Noto Sans","Noto Sans JP","Segoe UI","Arial Unicode MS",Arial,sans-serif';

  /* ─── Patch CanvasRenderingContext2D.prototype.font ───────────────────
     Luckysheet bỏ qua ff override vì nó có font-table nội bộ riêng.
     Cách chắc chắn nhất: chặn TẤT CẢ lần gán ctx.font và chèn
     "Be Vietnam Pro" vào đầu danh sách font-family.
     Canvas font format: "[style] [variant] [weight] [size] [families]"
     Ví dụ: "bold 12px Calibri" → "bold 12px "Be Vietnam Pro",Calibri"
  ──────────────────────────────────────────────────────────────────── */
  (function patchCanvasFont(){
    var desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    if(!desc || !desc.set) return;
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
      get: desc.get,
      set: function(val){
        if(typeof val === 'string'){
          val = val.replace(
            /((?:\d+(?:\.\d+)?(?:px|pt|em|rem|vh|vw)(?:\/\S+)?\s+))(.*)/,
            function(_, prefix, families){
              if(families.indexOf('Be Vietnam Pro') !== -1) return _;
              return prefix + VN_FONT + ',' + families;
            }
          );
        }
        desc.set.call(this, val);
      },
      configurable: true
    });
  })();

  /* ─── Helpers ──────────────────────────────────────────────────────── */
  function showError(msg){
    document.getElementById('ls-loading').style.display='none';
    var el=document.getElementById('ls-error');
    el.style.display='flex';
    document.getElementById('ls-error-msg').textContent=msg;
    window.parent.postMessage({type:'LUCKY_ERROR',msg:msg},'*');
    window.parent.postMessage({type:'LUCKY_CDN_FAIL',msg:msg},'*');
  }

  function sendReady(){
    window.parent.postMessage({type:'LUCKY_READY'},'*');
  }

  window.addEventListener('error',function(e){
    showError('Lỗi JS: '+(e&&e.message?e.message:String(e)));
  });

  /* ─── Preload font trước khi luckysheet render ─────────────────────── */
  function preloadFont(callback){
    if(!document.fonts){ callback(); return; }
    var loads = [];
    ['400','500','700'].forEach(function(w){
      ['12px','14px','16px'].forEach(function(s){
        loads.push(document.fonts.load(w+' '+s+' "Be Vietnam Pro"'));
        loads.push(document.fonts.load(w+' '+s+' "Noto Sans"'));
      });
    });
    Promise.all(loads)
      .then(function(){ callback(); })
      .catch(function(){ callback(); });
  }

  /* ─── Override ff trong celldata ──────────────────────────────────── */
  function overrideCellFonts(sheets){
    if(!sheets||!sheets.length) return;
    sheets.forEach(function(sheet){
      var cells = sheet.celldata;
      if(!cells) return;
      cells.forEach(function(cell){
        if(!cell||!cell.v) return;
        cell.v.ff = 'Be Vietnam Pro';
        if(cell.v.s && 'ff' in cell.v.s) cell.v.s.ff = 'Be Vietnam Pro';
      });
    });
  }

  /* ─── Fix image type + border-offset correction ─────────────────────
     LuckyExcel's extendArray() cộng +1px "border" mỗi cột/hàng vào
     cumulative position array (columnWidthSet / rowHeightSet).
     Luckysheet KHÔNG cộng border này khi render → image bị lệch/sai kích thước.

     LuckyExcel lưu fromCol/fromRow/toCol/toRow trên imageObject.
     Correction:
       lsLeft   = xlLeft   - fromCol          (bỏ fromCol border px)
       lsTop    = xlTop    - fromRow          (bỏ fromRow border px)
       lsWidth  = xlWidth  - (toCol-fromCol)  (bỏ border px trong span)
       lsHeight = xlHeight - (toRow-fromRow)  (bỏ border px trong span)

     Type "1" = moveAndSize: ảnh di chuyển và resize theo ô (đúng nhất).
  ──────────────────────────────────────────────────────────────────── */
  function fixImagesInSheet(sheet){
    var images = sheet.images;
    if(!images || typeof images !== 'object') return;
    var keys = Object.keys(images);
    if(!keys.length) return;

    keys.forEach(function(key){
      var img = images[key];
      if(!img || !img.default) return;
      var d = img.default;

      /* Force type "1": gắn theo ô, resize theo ô */
      d.type = '1';
      img.type = '1';

      /* Đảm bảo không ở chế độ fixed */
      d.isFixedPos = false;
      delete d.fixedLeft;
      delete d.fixedTop;

      /* originWidth/originHeight có thể nằm trong d hoặc top-level */
      if(!img.originWidth  && d.originWidth)  img.originWidth  = d.originWidth;
      if(!img.originHeight && d.originHeight) img.originHeight = d.originHeight;

      /* Sửa lệch do +1px border/cột/hàng trong LuckyExcel cumulative array */
      var fromCol = (img.fromCol != null) ? parseInt(img.fromCol, 10) : null;
      var fromRow = (img.fromRow != null) ? parseInt(img.fromRow, 10) : null;
      var toCol   = (img.toCol   != null) ? parseInt(img.toCol,   10) : null;
      var toRow   = (img.toRow   != null) ? parseInt(img.toRow,   10) : null;

      if(fromCol !== null && d.left  != null)
        d.left   = Math.max(0, Math.round(d.left   - fromCol));
      if(fromRow !== null && d.top   != null)
        d.top    = Math.max(0, Math.round(d.top    - fromRow));
      if(fromCol !== null && toCol !== null && d.width  != null)
        d.width  = Math.max(4, Math.round(d.width  - Math.max(0, toCol - fromCol)));
      if(fromRow !== null && toRow !== null && d.height != null)
        d.height = Math.max(4, Math.round(d.height - Math.max(0, toRow - fromRow)));
    });
  }

  function fixAllImages(sheets){
    if(!sheets || !sheets.length) return false;
    var hasImages = false;
    sheets.forEach(function(sheet){
      if(sheet.images && Object.keys(sheet.images).length > 0){
        hasImages = true;
        fixImagesInSheet(sheet);
      }
    });
    return hasImages;
  }

  /* ─── Create Luckysheet ────────────────────────────────────────────── */
  function doCreate(data, fileName, hasImages){
    document.getElementById('ls-loading').style.display='none';
    luckysheet.create({
      container:'lucky-container',
      data: data.sheets,
      title: data.info&&data.info.name ? data.info.name : fileName,
      lang:'en',
      userInfo:false,
      showtoolbar:false,
      showinfobar:false,
      showsheetbar:true,
      showstatisticBar:false,
      enableAddBackTop:false,
      showConfigWindowResize:true,
      forceCalculation:true,
      allowUpdate:false,
      defaultFontSize:11,
      hook:{}
    });
    window.parent.postMessage({type:'LUCKY_LOADED', hasImages: hasImages},'*');
  }

  /* ─── Message handler ─────────────────────────────────────────────── */
  window.addEventListener('message',function(e){
    if(!e.data) return;

    if(e.data.type==='LUCKY_LOAD'){
      var buffer=e.data.buffer;
      var fileName=e.data.fileName||'file.xlsx';
      try{
        if(typeof LuckyExcel==='undefined'){
          showError('LuckyExcel chưa tải xong. Thử reload trang.'); return;
        }
        var blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        var file=new File([blob],fileName,{type:blob.type});
        LuckyExcel.transformExcelToLucky(file,function(exportJson){
          if(!exportJson||!exportJson.sheets||!exportJson.sheets.length){
            showError('Không thể đọc nội dung file. Định dạng chưa hỗ trợ hoặc file bị hỏng.'); return;
          }

          /* ── Capture RAW image data TRƯỚC khi fix ── */
          var rawImgDebug = [];
          (exportJson.sheets||[]).forEach(function(sh){
            if(!sh.images) return;
            Object.keys(sh.images).forEach(function(k){
              var img = sh.images[k];
              var d = img && img.default ? img.default : {};
              rawImgDebug.push({
                sheet: sh.name,
                key: k,
                originW: img.originWidth,
                originH: img.originHeight,
                raw_left:   d.left,
                raw_top:    d.top,
                raw_width:  d.width,
                raw_height: d.height,
                fromCol: img.fromCol, fromRow: img.fromRow,
                toCol:   img.toCol,   toRow:   img.toRow,
                colLen: (sh.config||{}).columnlen || {},
                rowlen: (sh.config||{}).rowlen || {}
              });
            });
          });
          if(rawImgDebug.length){
            console.log('[LuckyImg] RAW (before fix):', JSON.stringify(rawImgDebug, null, 2));
            window.parent.postMessage({type:'LUCKY_IMG_DEBUG', data: rawImgDebug},'*');
          }

          overrideCellFonts(exportJson.sheets);
          var hasImages = fixAllImages(exportJson.sheets);

          /* ── Log AFTER fix ── */
          if(rawImgDebug.length){
            var afterDebug = [];
            (exportJson.sheets||[]).forEach(function(sh){
              if(!sh.images) return;
              Object.keys(sh.images).forEach(function(k){
                var img = sh.images[k];
                var d = img && img.default ? img.default : {};
                afterDebug.push({sheet: sh.name, key: k,
                  fixed_left: d.left, fixed_top: d.top,
                  fixed_width: d.width, fixed_height: d.height});
              });
            });
            console.log('[LuckyImg] AFTER fix:', JSON.stringify(afterDebug, null, 2));
          }

          preloadFont(function(){
            doCreate(exportJson, fileName, hasImages);
          });
        });
      }catch(err){
        showError('Lỗi khi xử lý file: '+(err&&err.message?err.message:String(err)));
      }
    }

    if(e.data.type==='LUCKY_ZOOM'){
      var ratio=e.data.ratio||1;
      try{
        if(typeof luckysheet!=='undefined'&&luckysheet.setConfig){
          luckysheet.setConfig({zoomRatio:ratio});
        }
      }catch(ex){
        var c=document.getElementById('lucky-container');
        if(c){
          c.style.transformOrigin='top left';
          c.style.transform='scale('+ratio+')';
          c.style.width=Math.ceil(100/ratio)+'%';
          c.style.height=Math.ceil(100/ratio)+'%';
        }
      }
    }

    if(e.data.type==='LUCKY_PRINT'){
      window.print();
    }
  });

  /* ─── Boot ─────────────────────────────────────────────────────────── */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',sendReady);
  }else{
    sendReady();
  }
})();
