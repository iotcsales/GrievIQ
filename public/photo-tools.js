// public/photo-tools.js
//
// Photo preparation on the phone, before upload (item 7c, Sept 2026).
//   - GIQPhoto.prepare(file): the citizen's photo, shrunk to at most 1600 px
//     (JPEG), plus a 320 px preview. Redrawing the picture removes its hidden
//     details (date, GPS, camera), so they never leave the phone.
//   - GIQPhoto.preview(file): only the 320 px preview (for a representative's
//     "after" photo, whose original is kept as evidence).
//   - GIQPhoto.fingerprint(source): 16-hex visual fingerprint (difference
//     hash), used to spot the same or a very similar photo.
// iPhone photos (HEIC) are read by the phone's own browser where it can; if
// a photo can't be read, prepare() rejects with Error("UNREADABLE").
(function () {
  var FULL = 1600, THUMB = 320;

  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return createImageBitmap(file); })
        .catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }

  function viaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('UNREADABLE')); };
      img.src = url;
    });
  }

  function size(src) {
    return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }

  // Draws src at most maxEdge on its longer side, halving in steps for a
  // smooth result; white behind see-through areas (JPEG has none).
  function draw(src, maxEdge) {
    var s = size(src);
    if (!s.w || !s.h) throw new Error('UNREADABLE');
    var scale = Math.min(1, maxEdge / Math.max(s.w, s.h));
    var tw = Math.max(1, Math.round(s.w * scale)), th = Math.max(1, Math.round(s.h * scale));
    var cur = src, cw = s.w, ch = s.h;
    while (cw / 2 >= tw && ch / 2 >= th) {
      var half = document.createElement('canvas');
      half.width = Math.round(cw / 2); half.height = Math.round(ch / 2);
      var hx = half.getContext('2d');
      hx.imageSmoothingQuality = 'high';
      hx.drawImage(cur, 0, 0, half.width, half.height);
      cur = half; cw = half.width; ch = half.height;
    }
    var cv = document.createElement('canvas');
    cv.width = tw; cv.height = th;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, tw, th);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(cur, 0, 0, tw, th);
    return cv;
  }

  function toJpeg(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('UNREADABLE')); }, 'image/jpeg', quality);
    });
  }

  function fingerprintOf(src) {
    var cv = document.createElement('canvas');
    cv.width = 9; cv.height = 8;
    var cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0, 9, 8);
    var px = cx.getImageData(0, 0, 9, 8).data;
    var hex = '', nib = 0, n = 0;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        var a = (y * 9 + x) * 4, b = a + 4;
        var l = px[a] * 0.299 + px[a + 1] * 0.587 + px[a + 2] * 0.114;
        var r = px[b] * 0.299 + px[b + 1] * 0.587 + px[b + 2] * 0.114;
        nib = (nib << 1) | (l > r ? 1 : 0);
        if (++n % 4 === 0) { hex += nib.toString(16); nib = 0; }
      }
    }
    return hex;
  }

  function release(src) { if (src && src.close) { try { src.close(); } catch (e) { /* ignore */ } } }

  window.GIQPhoto = {
    FULL: FULL,
    THUMB: THUMB,
    prepare: function (file) {
      return decode(file).then(function (src) {
        var full = draw(src, FULL), thumb = draw(src, THUMB);
        var hash = null;
        try { hash = fingerprintOf(src); } catch (e) { hash = null; }
        release(src);
        return Promise.all([toJpeg(full, 0.82), toJpeg(thumb, 0.7)]).then(function (b) {
          return { full: b[0], thumb: b[1], width: full.width, height: full.height, dhash: hash };
        });
      }, function () { throw new Error('UNREADABLE'); });
    },
    preview: function (file) {
      return decode(file).then(function (src) {
        var thumb = draw(src, THUMB);
        var hash = null;
        try { hash = fingerprintOf(src); } catch (e) { hash = null; }
        release(src);
        return toJpeg(thumb, 0.7).then(function (b) { return { thumb: b, dhash: hash }; });
      }).catch(function () { return { thumb: null, dhash: null }; });
    },
    fingerprint: function (file) {
      return decode(file).then(function (src) { var h = fingerprintOf(src); release(src); return h; }).catch(function () { return null; });
    },
  };
})();
