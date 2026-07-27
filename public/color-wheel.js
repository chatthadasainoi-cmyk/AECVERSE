/* ============================================================
   AEC VERSE — จานสีแบบลากเลือกเอง (เหมือนในเกม)
   ช่องสี่เหลี่ยมเลือกความสด/ความสว่าง + แถบเลื่อนเลือกเฉดสี ลากได้ด้วยเมาส์และนิ้ว

   ใช้งาน:
     const picker = AecColorWheel.mount(containerEl, '#38bdf8', hex => { ... });
     picker.setHex('#ff0000');  picker.getHex();
   ============================================================ */
window.AecColorWheel = (function () {

  function hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  const toHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  function parseHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [56, 189, 248]; // ค่าเริ่มต้น: ฟ้าของแบรนด์
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ลากได้ทั้งเมาส์และนิ้ว และลากออกนอกกรอบแล้วยังคุมต่อได้ (pointer capture)
  function onDrag(el, handler) {
    const run = e => {
      const r = el.getBoundingClientRect();
      handler(
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      );
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      run(e);
      const move = ev => run(ev);
      const up = ev => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }

  function mount(container, initialHex, onChange) {
    const [ir, ig, ib] = parseHex(initialHex);
    let [h, s, v] = rgbToHsv(ir, ig, ib);

    container.innerHTML =
      '<div class="acw">' +
        '<canvas class="acw-sv" width="240" height="132"></canvas>' +
        '<canvas class="acw-hue" width="240" height="14"></canvas>' +
        '<div class="acw-foot">' +
          '<span class="acw-preview"></span>' +
          '<input class="acw-hexinput" type="text" maxlength="7" spellcheck="false">' +
        '</div>' +
      '</div>';

    const svC = container.querySelector('.acw-sv');
    const hueC = container.querySelector('.acw-hue');
    const preview = container.querySelector('.acw-preview');
    const hexInput = container.querySelector('.acw-hexinput');
    const svCtx = svC.getContext('2d');
    const hueCtx = hueC.getContext('2d');

    // แถบเฉดสีวาดครั้งเดียวพอ ไม่เปลี่ยนตามค่าอื่น
    const hueGrad = hueCtx.createLinearGradient(0, 0, hueC.width, 0);
    for (let i = 0; i <= 6; i++) {
      const [r, g, b] = hsvToRgb(i / 6, 1, 1);
      hueGrad.addColorStop(i / 6, `rgb(${r},${g},${b})`);
    }
    hueCtx.fillStyle = hueGrad;
    hueCtx.fillRect(0, 0, hueC.width, hueC.height);

    function drawSv() {
      const [hr, hg, hb] = hsvToRgb(h, 1, 1);
      svCtx.fillStyle = `rgb(${hr},${hg},${hb})`;
      svCtx.fillRect(0, 0, svC.width, svC.height);
      const white = svCtx.createLinearGradient(0, 0, svC.width, 0);
      white.addColorStop(0, 'rgba(255,255,255,1)');
      white.addColorStop(1, 'rgba(255,255,255,0)');
      svCtx.fillStyle = white; svCtx.fillRect(0, 0, svC.width, svC.height);
      const black = svCtx.createLinearGradient(0, 0, 0, svC.height);
      black.addColorStop(0, 'rgba(0,0,0,0)');
      black.addColorStop(1, 'rgba(0,0,0,1)');
      svCtx.fillStyle = black; svCtx.fillRect(0, 0, svC.width, svC.height);

      // วงกลมบอกตำแหน่งที่เลือกอยู่
      const x = s * svC.width, y = (1 - v) * svC.height;
      svCtx.beginPath(); svCtx.arc(x, y, 7, 0, Math.PI * 2);
      svCtx.strokeStyle = '#fff'; svCtx.lineWidth = 2.5; svCtx.stroke();
      svCtx.beginPath(); svCtx.arc(x, y, 8.6, 0, Math.PI * 2);
      svCtx.strokeStyle = 'rgba(0,0,0,0.45)'; svCtx.lineWidth = 1.5; svCtx.stroke();
    }

    let current = '#000000';
    function emit(fromInput) {
      const [r, g, b] = hsvToRgb(h, s, v);
      current = toHex(r, g, b);
      preview.style.background = current;
      if (!fromInput) hexInput.value = current;
      drawSv();
      hueC.style.setProperty('--pos', (h * 100) + '%');
      if (typeof onChange === 'function') onChange(current);
    }

    onDrag(svC, (px, py) => { s = px; v = 1 - py; emit(); });
    onDrag(hueC, px => { h = px; emit(); });
    hexInput.addEventListener('input', () => {
      if (!/^#?[0-9a-f]{6}$/i.test(hexInput.value.trim())) return; // พิมพ์ยังไม่ครบ ปล่อยให้พิมพ์ต่อ
      const [r, g, b] = parseHex(hexInput.value);
      [h, s, v] = rgbToHsv(r, g, b);
      emit(true);
    });

    emit();
    return {
      getHex: () => current,
      setHex: hex => { const [r, g, b] = parseHex(hex); [h, s, v] = rgbToHsv(r, g, b); emit(); }
    };
  }

  return { mount };
})();
