/* ============================================================
   AEC VERSE — "ลองใช้งาน" ของแต่ละ Type
   เป้าหมาย: ให้ผู้ใช้ได้ลองเล่นกับ "หลักการทำงาน" ของอุปกรณ์แต่ละชนิด
   ก่อนลงพื้นที่จริง — knowing how it works before day 1

   แต่ละ type มีบทเรียน interactive 1 ชุด แบ่งเป็น 3 รูปแบบ:
     sim      = มีตัวปรับค่า (สไลเดอร์/สวิตช์) แล้วผลลัพธ์เปลี่ยนตามจริง
     sequence = ต้องทำตามลำดับให้ถูก ผิดลำดับจะอธิบายว่าทำไมถึงอันตราย
     choice   = เลือกให้ถูกว่าอะไรใช้/ไม่ใช้ในสถานการณ์นั้น

   ⚠️ ตัวเลขจุดตั้ง (set point) ในนี้เป็นค่าตัวอย่างเชิงการสอนที่อ้างอิงเกณฑ์
   ในข้อมูลความปลอดภัยของ workflowDatabase และค่าทั่วไปของโรงไฟฟ้าก๊าซชีวภาพ
   ไม่ใช่ค่าออกแบบจริงของโรงงานนี้ — ทุกหน้าจอมีข้อความกำกับไว้ให้ผู้ใช้เห็น
   ============================================================ */
window.AecTypeInteractions = (function () {

  const ok = (title, why) => ({ tone: 'ok', title, why });
  const warn = (title, why) => ({ tone: 'warn', title, why });
  const bad = (title, why) => ({ tone: 'bad', title, why });
  const num = (v, d = 1) => Number(v).toFixed(d).replace(/\.?0+$/, '') || '0';

  const INTERACTIONS = {

    tank: {
      icon: '🟤', title: 'ทำไมบ่อหมักถึงห้ามมีประกายไฟเด็ดขาด',
      principle: 'ก๊าซมีเทนระเบิดได้เฉพาะเมื่อผสมกับอากาศในสัดส่วน 5–15% เท่านั้น ในโดมมีมีเทนเข้มข้นกว่านั้นมากจึงยัง "ไม่ติดไฟ" — แต่ถ้าอากาศรั่วเข้าไป ความเข้มข้นจะลดลงผ่านช่วง 5–15% พอดี นั่นคือวินาทีที่อันตรายที่สุด',
      kind: 'sim',
      controls: [
        { id: 'ch4', label: 'ความเข้มข้นมีเทนในโดม', type: 'range', min: 0, max: 100, step: 1, value: 60, unit: '%' },
        { id: 'spark', label: 'มีแหล่งกำเนิดประกายไฟในพื้นที่', type: 'toggle', value: false, hint: 'เช่น มือถือธรรมดา ไฟแช็ก หรือเครื่องมือที่ไม่ใช่ชนิด Explosion-Proof' }
      ],
      readouts: s => {
        const inRange = s.ch4 >= 5 && s.ch4 <= 15;
        return [
          { label: 'มีเทน (CH₄)', value: num(s.ch4) + '%' },
          { label: 'ช่วงที่ระเบิดได้', value: '5% – 15%' },
          { label: 'สถานะส่วนผสม', value: inRange ? 'อยู่ในช่วงระเบิด' : (s.ch4 < 5 ? 'เจือจางเกินไป' : 'เข้มข้นเกินไป'), tone: inRange ? 'bad' : 'ok' }
        ];
      },
      verdict: s => {
        const inRange = s.ch4 >= 5 && s.ch4 <= 15;
        if (inRange && s.spark) return bad('ระเบิด', 'ส่วนผสมอยู่ในช่วง 5–15% และมีแหล่งจุดติด ครบองค์ประกอบการระเบิดทั้งสามอย่าง (เชื้อเพลิง + ออกซิเจน + ประกายไฟ) นี่คือเหตุผลที่พื้นที่นี้ถูกกำหนดเป็น Ex-Zone 0 และอุปกรณ์ไฟฟ้าทุกชิ้นต้องเป็นชนิด Explosion-Proof');
        if (inRange) return warn('อันตรายมาก — ขาดแค่ประกายไฟ', 'ตอนนี้ส่วนผสมพร้อมระเบิดแล้ว เหลือแค่รอแหล่งจุดติดเท่านั้น ลองเปิดสวิตช์ประกายไฟดู');
        if (s.ch4 > 15) return ok('ยังไม่ติดไฟ แต่ห้ามวางใจ', 'เข้มข้นเกิน 15% คือรวยเชื้อเพลิงเกินไป ออกซิเจนไม่พอจะเผาไหม้ นี่คือสภาพปกติในโดม — แต่ถ้าเปิดฝาหรือมีรอยรั่ว อากาศจะไหลเข้าและค่าจะไหลลงผ่านช่วง 5–15% เสมอ ลองเลื่อนค่าลงมาดู');
        return ok('เจือจางเกินไป ไม่ติดไฟ', 'ต่ำกว่า 5% เชื้อเพลิงไม่พอ แต่ถ้ายังมีก๊าซไหลเข้าเรื่อยๆ ค่าจะไต่ขึ้นเข้าช่วงอันตรายได้');
      }
    },

    manhole: {
      icon: '🔴', title: 'ลำดับการเปิดปากบ่อ (ที่อับอากาศ)',
      principle: 'ที่อับอากาศคร่าชีวิตคนทุกปี และเกินครึ่งคือคนที่กระโดดลงไปช่วย ลำดับขั้นตอนไม่ใช่พิธีกรรม — แต่ละขั้นมีไว้กันการตายคนละแบบ ลองเรียงให้ถูก',
      kind: 'sequence',
      steps: [
        { id: 'permit', label: '📋 ขอใบอนุญาตทำงานในที่อับอากาศ', why: 'ทำให้มีคนระดับผู้ควบคุมงานรับรู้ว่ามีคนกำลังจะเข้าไป ถ้าไม่มีใครรู้ ก็ไม่มีใครมาช่วยตอนเกิดเรื่อง' },
        { id: 'lock', label: '🔒 ตัดแยกพลังงานและทำ LOTO ท่อ/ใบกวน', why: 'กันใบกวนหมุนหรือก๊าซไหลเข้าขณะมีคนอยู่ข้างใน' },
        { id: 'test', label: '🧪 ตรวจวัดก๊าซ 3 ค่า — O₂ / LEL / H₂S', why: 'ในบ่อหมักออกซิเจนต่ำและมี H₂S ซึ่งสูดไม่กี่ครั้งก็หมดสติ ต้องรู้ค่าก่อนเปิดฝา ไม่ใช่หลังเปิด' },
        { id: 'vent', label: '💨 ระบายอากาศจนค่าเข้าเกณฑ์ปลอดภัย', why: 'เกณฑ์คือ O₂ 19.5–23.5%, LEL ต่ำกว่า 10% และ H₂S ต่ำกว่า 10 ppm' },
        { id: 'standby', label: '👤 จัดผู้เฝ้าระวังประจำปากบ่อ', why: 'ผู้เฝ้าระวังห้ามลงไปช่วยเองเด็ดขาด หน้าที่คือเรียกทีมกู้ภัย — คนที่กระโดดลงไปช่วยคือกลุ่มที่เสียชีวิตมากที่สุด' },
        { id: 'enter', label: '🪜 เปิดฝาและเข้าปฏิบัติงาน', why: 'เข้าได้เมื่อครบ 5 ขั้นก่อนหน้าเท่านั้น และต้องวัดก๊าซต่อเนื่องตลอดเวลาที่อยู่ข้างใน' }
      ]
    },

    pvrv: {
      icon: '🔴', title: 'PVRV คือทางออกสุดท้ายของแรงดัน',
      principle: 'โดมผ้าใบรับแรงดันได้จำกัดมาก (หน่วยเป็นมิลลิบาร์ ไม่ใช่บาร์) PVRV คือวาล์วที่เปิดระบายเองเมื่อแรงดันเกิน และดูดอากาศเข้าเมื่อเป็นสุญญากาศ ถ้ามีวาล์วปิดกั้นคั่นกลาง มันจะกลายเป็นของประดับทันที',
      kind: 'sim',
      controls: [
        { id: 'p', label: 'แรงดันในโดม', type: 'range', min: -6, max: 12, step: 0.5, value: 1, unit: ' mbar' },
        { id: 'iso', label: 'มีวาล์วปิดกั้นคั่นระหว่างโดมกับ PVRV', type: 'toggle', value: false, hint: 'ของจริงห้ามติดตั้งเด็ดขาด — ลองเปิดดูว่าทำไม' }
      ],
      readouts: s => {
        let state = 'ปกติ — PVRV ปิดอยู่', tone = 'ok';
        if (s.iso && (s.p >= 3 || s.p <= -2)) { state = 'PVRV ทำงานไม่ได้ — ถูกปิดกั้น'; tone = 'bad'; }
        else if (s.p >= 3) { state = 'PVRV เปิดระบายก๊าซออก'; }
        else if (s.p <= -2) { state = 'PVRV ดูดอากาศเข้าชดเชย'; }
        return [
          { label: 'แรงดันปัจจุบัน', value: num(s.p) + ' mbar' },
          { label: 'จุดเปิดระบาย / จุดดูดอากาศ', value: '+3 / -2 mbar' },
          { label: 'ขีดจำกัดโดม', value: '+8 / -4 mbar' },
          { label: 'สถานะ PVRV', value: state, tone }
        ];
      },
      verdict: s => {
        if (s.iso && s.p >= 8) return bad('โดมฉีกขาด', 'วาล์วปิดกั้นทำให้ก๊าซระบายออกไม่ได้ แรงดันไต่ทะลุขีดจำกัดของผ้าใบ ก๊าซมีเทนปริมาณมหาศาลถูกปล่อยออกมาพร้อมกันในที่โล่ง — นี่คือเหตุผลที่กฎห้ามติดตั้งวาล์วคั่นตรงนี้เด็ดขาด');
        if (s.iso && s.p <= -4) return bad('โดมยุบตัว', 'ปิดกั้นทางอากาศเข้า โดมจึงถูกดูดยุบ ผ้าใบและโครงสร้างเสียหาย');
        if (s.iso) return warn('ตอนนี้ยังไม่มีอะไรเกิดขึ้น — และนั่นคือกับดัก', 'แรงดันยังอยู่ในช่วงปกติ วาล์วปิดกั้นจึงยังไม่แสดงผลอะไร ทุกอย่างดูปกติดีจนกว่าจะถึงวันที่แรงดันขึ้นจริง ลองเลื่อนแรงดันขึ้นไปดู');
        if (s.p >= 3) return ok('ระบบทำงานถูกต้อง', 'แรงดันถึงจุดตั้ง PVRV เปิดระบายก๊าซออกเอง แรงดันในโดมจึงไม่มีทางไต่ถึงจุดที่ผ้าใบฉีก');
        if (s.p <= -2) return ok('ระบบทำงานถูกต้อง', 'เวลาดูดก๊าซออกเร็วกว่าที่ผลิตได้ โดมจะเป็นสุญญากาศและยุบ PVRV จึงเปิดให้อากาศเข้ามาชดเชย');
        return ok('สภาวะปกติ', 'แรงดันอยู่ในช่วงทำงาน PVRV ยังไม่ต้องทำอะไร');
      }
    },

    flame_arrester: {
      icon: '🟠', title: 'Flame Arrester ดักเปลวไฟย้อนกลับอย่างไร',
      principle: 'ไส้กรองเป็นช่องเล็กจำนวนมหาศาล เปลวไฟที่วิ่งย้อนเข้ามาจะถูกช่องเหล่านี้ดูดความร้อนออกจนดับก่อนทะลุผ่าน — ก๊าซผ่านได้ แต่ไฟผ่านไม่ได้',
      kind: 'sim',
      controls: [
        { id: 'cond', label: 'สภาพไส้กรอง', type: 'select', value: 'clean', options: [{ v: 'clean', label: 'สะอาด (ล้างตามรอบ)' }, { v: 'dirty', label: 'อุดตัน (ไม่ได้ล้างนาน)' }, { v: 'none', label: 'ถอดออก / ชำรุด' }] },
        { id: 'flash', label: 'เกิดเปลวไฟย้อนกลับจากหอเผา', type: 'toggle', value: false }
      ],
      readouts: s => {
        const drop = s.cond === 'clean' ? 2 : s.cond === 'dirty' ? 18 : 0;
        const flow = s.cond === 'clean' ? 100 : s.cond === 'dirty' ? 45 : 105;
        return [
          { label: 'ความดันตกคร่อมไส้กรอง', value: num(drop) + ' mbar', tone: drop > 10 ? 'warn' : 'ok' },
          { label: 'อัตราการไหลของก๊าซ', value: num(flow) + '%', tone: flow < 70 ? 'warn' : 'ok' },
          { label: 'ความสามารถดักเปลวไฟ', value: s.cond === 'none' ? 'ไม่มี' : 'ทำงานได้', tone: s.cond === 'none' ? 'bad' : 'ok' }
        ];
      },
      verdict: s => {
        if (s.flash && s.cond === 'none') return bad('ไฟย้อนถึงบ่อหมัก', 'ไม่มีอะไรมาดักเปลวไฟ ไฟวิ่งย้อนตามท่อเข้าสู่โดมที่มีก๊าซเต็ม เป็นอุบัติเหตุระดับที่ทำให้ทั้งโรงงานเสียหาย');
        if (s.flash && s.cond === 'dirty') return warn('ดักไฟไว้ได้ แต่ระบบกำลังจะมีปัญหาอื่น', 'ไส้กรองยังดักเปลวไฟไว้ได้ แต่ความดันตกคร่อมสูงมากจนก๊าซไหลได้ไม่ถึงครึ่ง แรงดันจะไปสะสมย้อนกลับที่โดมแทน ต้องถอดล้างตามรอบทุก 3 เดือน');
        if (s.flash) return ok('ไส้กรองดับเปลวไฟไว้ได้', 'เปลวไฟถูกดูดความร้อนออกจนดับภายในไส้กรอง ไม่ทะลุไปถึงบ่อหมัก นี่คือหน้าที่เดียวของอุปกรณ์ชิ้นนี้ และมันจะทำได้ก็ต่อเมื่อไส้ยังอยู่ครบและสะอาด');
        if (s.cond === 'none') return bad('ระบบไม่มีการป้องกันอยู่ตอนนี้', 'ยังไม่เกิดไฟย้อน จึงยังไม่มีอะไรผิดปกติให้เห็น แต่ถ้าเกิดขึ้นเมื่อไหร่จะไม่มีอะไรมาหยุด ลองเปิดสวิตช์ดู');
        if (s.cond === 'dirty') return warn('ก๊าซไหลไม่สะดวก', 'ความดันตกคร่อม 18 mbar สูงเกินเกณฑ์ ก๊าซไหลได้ 45% แรงดันจะย้อนไปสะสมที่โดม ถึงรอบต้องถอดล้างแล้ว');
        return ok('สภาพพร้อมใช้งาน', 'ก๊าซไหลเต็มที่ และพร้อมดักเปลวไฟถ้าเกิดขึ้น');
      }
    },

    pipe: {
      icon: '🟠', title: 'ทำไมท่อก๊าซต้องลาดเอียง 2%',
      principle: 'ก๊าซชีวภาพออกจากบ่อหมักพร้อมไอน้ำอิ่มตัว พอเจอท่อที่เย็นกว่าจะกลั่นตัวเป็นหยดน้ำ ถ้าท่อไม่ลาดพอ น้ำจะขังเป็นแอ่งปิดกั้นทางก๊าซ ความลาด 2% คือให้น้ำไหลไปรวมที่ถังดักน้ำเอง',
      kind: 'sim',
      controls: [
        { id: 'slope', label: 'ความลาดเอียงของแนวท่อ', type: 'range', min: 0, max: 5, step: 0.1, value: 2, unit: '%' },
        { id: 'len', label: 'ความยาวแนวท่อ', type: 'range', min: 10, max: 120, step: 5, value: 60, unit: ' m' }
      ],
      readouts: s => [
        { label: 'ระดับที่ต่างกันหัว-ท้ายท่อ', value: num(s.slope / 100 * s.len, 2) + ' m' },
        { label: 'เกณฑ์ขั้นต่ำ', value: '2%' },
        { label: 'น้ำไหลลงถังดักน้ำได้เอง', value: s.slope < 2 ? 'ไม่ได้ — เกิดแอ่งขัง' : 'ได้', tone: s.slope < 2 ? 'bad' : 'ok' }
      ],
      verdict: s => {
        if (s.slope === 0) return bad('ท่อจะตันด้วยน้ำของตัวเอง', 'ท่อระนาบ น้ำที่กลั่นตัวไม่มีทางไป จะขังจนปิดหน้าตัดท่อ ก๊าซดันไม่ผ่าน แรงดันย้อนไปสะสมที่โดม');
        if (s.slope < 2) return bad('ลาดไม่พอ (' + num(s.slope) + '%)', 'ต่ำกว่าเกณฑ์ 2% น้ำไหลไม่ทันการกลั่นตัว จะค่อยๆ สะสมเป็นแอ่งในจุดที่ต่ำที่สุดของแนวท่อ อาการจะมาทีหลังเป็นเดือน ตอนที่หาสาเหตุยากแล้ว');
        if (s.slope > 4) return warn('ลาดมากเกินจำเป็น', 'ระบายน้ำได้ดีแน่นอน แต่ระดับต่างกันถึง ' + num(s.slope / 100 * s.len, 2) + ' เมตร ตลอดแนว ' + num(s.len) + ' เมตร ทำให้ต้องยกโครงสร้างรองรับสูงขึ้นมากโดยไม่จำเป็น');
        return ok('ผ่านเกณฑ์', 'ความลาด ' + num(s.slope) + '% ทำให้หัวท่อกับท้ายท่อต่างระดับกัน ' + num(s.slope / 100 * s.len, 2) + ' เมตร น้ำที่กลั่นตัวจะไหลไปรวมที่ถังดักน้ำเองโดยไม่ต้องมีใครไปไล่');
      }
    },

    lightning_rod: {
      icon: '🟠', title: 'เสาล่อฟ้าคุ้มครองโดมได้ครบหรือยัง',
      principle: 'วิธี Rolling Sphere: จินตนาการลูกบอลรัศมี 20 เมตร กลิ้งไปบนพื้นที่ ตรงไหนที่ลูกบอลแตะถึงคือจุดที่ฟ้าผ่าลงได้ ปลายเสาล่อฟ้าจะยกลูกบอลขึ้นให้แตะไม่ถึงโดม พื้นที่ที่ลูกบอลแตะไม่ถึงคือพื้นที่ที่ถูกคุ้มครอง',
      note: 'คำนวณอย่างง่ายที่ระดับพื้น ด้วย Rolling Sphere รัศมี 20 ม. (ระดับป้องกัน I) ของจริงต้องคำนวณเป็นสามมิติโดยวิศวกร',
      kind: 'sim',
      controls: [
        { id: 'h', label: 'ความสูงเสาล่อฟ้า', type: 'range', min: 5, max: 40, step: 1, value: 18, unit: ' m' },
        { id: 'd', label: 'ระยะจากเสาถึงขอบไกลสุดของโดม', type: 'range', min: 3, max: 45, step: 1, value: 16, unit: ' m' },
        { id: 'r', label: 'ค่าความต้านทานดิน (Grounding)', type: 'range', min: 1, max: 40, step: 1, value: 8, unit: ' Ω' }
      ],
      readouts: s => {
        const R = 20;
        const rp = s.h >= R ? R : Math.sqrt(2 * R * s.h - s.h * s.h);
        return [
          { label: 'รัศมีคุ้มครองที่ระดับพื้น', value: num(rp) + ' m' },
          { label: 'ต้องคุ้มครองถึง', value: num(s.d) + ' m' },
          { label: 'ครอบคลุมโดม', value: rp >= s.d ? 'ครบ 100%' : 'ขาดไป ' + num(s.d - rp) + ' m', tone: rp >= s.d ? 'ok' : 'bad' },
          { label: 'ความต้านทานดิน', value: num(s.r) + ' Ω (เกณฑ์ ≤ 10 Ω)', tone: s.r <= 10 ? 'ok' : 'bad' }
        ];
      },
      verdict: s => {
        const R = 20;
        const rp = s.h >= R ? R : Math.sqrt(2 * R * s.h - s.h * s.h);
        const covered = rp >= s.d, grounded = s.r <= 10;
        if (!covered && !grounded) return bad('ไม่ผ่านทั้งสองข้อ', 'รัศมีคุ้มครองแค่ ' + num(rp) + ' เมตร ไม่ถึงขอบโดมที่ ' + num(s.d) + ' เมตร และความต้านทานดิน ' + num(s.r) + ' Ω สูงเกินเกณฑ์ ต่อให้ล่อฟ้าได้ กระแสก็ลงดินไม่หมด จะไหลย้อนเข้าโครงสร้างแทน');
        if (!covered) return bad('โดมยังโผล่พ้นร่มเงาการป้องกัน', 'รัศมีคุ้มครอง ' + num(rp) + ' เมตร แต่ต้องคุ้มครองถึง ' + num(s.d) + ' เมตร ส่วนที่ขาดคือส่วนที่ฟ้าผ่าลงโดมก๊าซได้โดยตรง แก้ได้สองทาง — เพิ่มความสูงเสา หรือเพิ่มจำนวนเสา');
        if (!grounded) return bad('คุ้มครองครบ แต่ลงดินไม่ได้', 'รัศมีพอแล้ว แต่ความต้านทานดิน ' + num(s.r) + ' Ω เกินเกณฑ์ 10 Ω กระแสฟ้าผ่าหาทางลงดินไม่สะดวกจะกระโดดเข้าหาโครงสร้างที่ใกล้ที่สุดแทน (side flash) นี่คือเหตุผลที่ต้องวัดค่านี้ทุกปี');
        return ok('ผ่านเกณฑ์ทั้งสองข้อ', 'เสาสูง ' + num(s.h) + ' เมตร ให้รัศมีคุ้มครอง ' + num(rp) + ' เมตร ครอบคลุมโดมที่อยู่ห่าง ' + num(s.d) + ' เมตรได้ทั้งหมด และความต้านทานดิน ' + num(s.r) + ' Ω อยู่ในเกณฑ์');
      }
    },

    loto: {
      icon: '🔵', title: 'ลำดับ LOTO ที่ถูกต้อง',
      principle: 'LOTO ไม่ใช่แค่ปิดสวิตช์แล้วคล้องกุญแจ ขั้นตอนสุดท้ายคือขั้นที่คนข้ามบ่อยที่สุด และเป็นขั้นที่ช่วยชีวิตจริง ลองเรียงดู',
      kind: 'sequence',
      steps: [
        { id: 'notify', label: '📢 แจ้งผู้เกี่ยวข้องทุกคนก่อนหยุดเครื่อง', why: 'กันคนอื่นสั่งเดินเครื่องซ้ำเพราะไม่รู้ว่ามีคนกำลังทำงานอยู่' },
        { id: 'shutdown', label: '⏹️ หยุดเครื่องตามขั้นตอนปกติ', why: 'หยุดแบบถูกวิธีก่อน แล้วค่อยตัดพลังงาน ไม่ใช่กระชากตัดเลย' },
        { id: 'isolate', label: '🔌 ตัดแยกแหล่งพลังงานทุกทาง', why: 'ไม่ใช่แค่ไฟฟ้า ต้องรวมแรงดันก๊าซ ลม ไฮดรอลิก และพลังงานสะสมอย่างสปริงหรือของหนักที่ยกค้างไว้' },
        { id: 'lock', label: '🔒 คล้องกุญแจส่วนตัวของตัวเอง', why: 'กุญแจต้องเป็นของเราคนเดียว ห้ามใช้กุญแจกลางหรือฝากคนอื่นถือ ถ้ามีหลายคนทำงานต้องคล้องกุญแจของทุกคน' },
        { id: 'tag', label: '🏷️ แขวนป้าย Tagout ระบุชื่อและวันที่', why: 'ป้ายบอกว่าใครล็อกและติดต่อใครได้ กุญแจที่ไม่มีป้ายทำให้ไม่มีใครกล้าปลดและงานค้างทั้งกะ' },
        { id: 'verify', label: '✅ ทดสอบว่าพลังงานเป็นศูนย์จริง (Try-out)', why: 'ขั้นที่คนข้ามบ่อยที่สุด — กดปุ่มเดินเครื่องดูว่ามันไม่ทำงานจริง วัดแรงดันว่าเป็นศูนย์จริง เพราะสวิตช์เสียหรือล็อกผิดตัวเกิดขึ้นได้เสมอ ถ้าไม่ทดสอบ คุณกำลังเอาชีวิตไปเดิมพันกับสมมติฐาน' }
      ]
    },

    ppe_checkpoint: {
      icon: '🔵', title: 'เลือก PPE ก่อนเข้าลานบ่อหมัก',
      principle: 'PPE ไม่ใช่ยิ่งใส่เยอะยิ่งดี แต่ต้องตรงกับอันตรายของพื้นที่นั้น เลือกสิ่งที่ต้องมีสำหรับเข้าลานบ่อหมัก',
      kind: 'choice', multi: true,
      prompt: 'เลือกทุกอย่างที่จำเป็นต้องมีก่อนเข้าพื้นที่',
      items: [
        { id: 'gas', label: '📟 เครื่องตรวจวัดก๊าซพกพา 4 ชนิด', correct: true, why: 'สำคัญที่สุด — H₂S ที่ความเข้มข้นสูงจะทำให้ประสาทรับกลิ่นเป็นอัมพาต จมูกจะหยุดได้กลิ่นก่อนที่มันจะถึงระดับอันตราย เครื่องวัดคือประสาทสัมผัสเดียวที่เชื่อได้' },
        { id: 'shoe', label: '🥾 รองเท้านิรภัยหัวเหล็ก', correct: true, why: 'พื้นที่มีของหนัก ท่อ วาล์ว และพื้นลื่นจากน้ำหมัก' },
        { id: 'helmet', label: '⛑️ หมวกนิรภัย', correct: true, why: 'มีงานบนที่สูงและโครงสร้างเหนือศีรษะตลอดแนว' },
        { id: 'glass', label: '👓 แว่นตานิรภัย', correct: true, why: 'ป้องกันน้ำหมักและสารเคมีกระเด็นเข้าตาขณะทำงานกับอุปกรณ์แรงดัน' },
        { id: 'phone', label: '📱 มือถือทั่วไปติดตัว', correct: false, why: 'มือถือธรรมดาไม่ใช่อุปกรณ์ Explosion-Proof เป็นแหล่งกำเนิดประกายไฟในพื้นที่ Ex-Zone ต้องฝากไว้นอกพื้นที่หรือใช้รุ่นที่ผ่านการรับรองเท่านั้น' },
        { id: 'cotton', label: '🧤 ถุงมือผ้าธรรมดา', correct: false, why: 'ถุงมือผ้าซับสารเคมีและน้ำหมักไว้แนบผิวหนัง แย่กว่าไม่ใส่ ต้องใช้ถุงมือกันสารเคมีที่ถูกประเภท' },
        { id: 'mask', label: '😷 หน้ากากอนามัย', correct: false, why: 'กรองแค่ละอองฝุ่น ไม่กรองก๊าซพิษเลยแม้แต่น้อย การใส่แล้วรู้สึกปลอดภัยคืออันตรายที่สุด ถ้าต้องกรองก๊าซต้องใช้หน้ากากที่มีไส้กรองตรงชนิด' }
      ]
    },

    esd: {
      icon: '🟢', title: 'กดปุ่ม ESD แล้วเกิดอะไรขึ้นบ้าง',
      principle: 'ESD ตัดทุกอย่างพร้อมกันในคำสั่งเดียว ไม่ใช่การหยุดเครื่องแบบปกติ ใช้เมื่อถ้าช้าอีกวินาทีจะมีคนเจ็บเท่านั้น — ลองเรียงลำดับสิ่งที่ระบบทำให้ถูก',
      kind: 'sequence',
      steps: [
        { id: 'trip', label: '⚡ ตัดไฟเครื่องยนต์ Genset ทันที', why: 'เครื่องยนต์คือแหล่งกำเนิดประกายไฟและความร้อนที่ใหญ่ที่สุดในโรงงาน ต้องดับก่อนเป็นอันดับแรก' },
        { id: 'valve', label: '🚰 ปิดวาล์วก๊าซหลักอัตโนมัติ', why: 'หยุดการจ่ายก๊าซเข้าสู่จุดที่มีปัญหา ตัดเชื้อเพลิงออกจากสมการ' },
        { id: 'flare', label: '🔥 เบี่ยงก๊าซส่วนเกินไปหอเผา', why: 'บ่อหมักยังผลิตก๊าซต่อไปเรื่อยๆ สั่งให้หยุดไม่ได้ ถ้าปิดทุกทางออกแรงดันจะไปดันโดมแทน จึงต้องมีทางระบายไปเผาทิ้ง' },
        { id: 'alarm', label: '🚨 เปิดสัญญาณเตือนและแจ้งห้องควบคุม', why: 'ให้ทุกคนในพื้นที่รู้พร้อมกันและเริ่มอพยพตามแผน' },
        { id: 'assemble', label: '🏃 อพยพไปยังจุดรวมพล', why: 'การนับจำนวนคนที่จุดรวมพลคือวิธีเดียวที่จะรู้ว่ามีใครยังติดอยู่ข้างในหรือเปล่า' }
      ]
    },

    utilization: {
      icon: '🟢', title: 'ระยะห่างของอาคารเครื่องยนต์',
      principle: 'เครื่องยนต์คือแหล่งความร้อนและประกายไฟที่เดินตลอด 24 ชั่วโมง ส่วนบ่อหมักคือแหล่งก๊าซไวไฟ ระยะห่างคือสิ่งเดียวที่คั่นสองอย่างนี้ไว้ เกณฑ์คือไม่น้อยกว่า 15 เมตร',
      kind: 'sim',
      controls: [
        { id: 'dist', label: 'ระยะจากอาคารเครื่องยนต์ถึงบ่อหมัก', type: 'range', min: 2, max: 40, step: 1, value: 15, unit: ' m' },
        { id: 'vent', label: 'มีระบบระบายอากาศในห้องเครื่อง', type: 'toggle', value: true },
        { id: 'det', label: 'มีเครื่องตรวจจับก๊าซในห้องเครื่อง', type: 'toggle', value: true }
      ],
      readouts: s => [
        { label: 'ระยะปัจจุบัน', value: num(s.dist) + ' m' },
        { label: 'เกณฑ์ขั้นต่ำ', value: '15 m' },
        { label: 'ผ่านเกณฑ์ระยะ', value: s.dist >= 15 ? 'ผ่าน' : 'ขาดอีก ' + num(15 - s.dist) + ' m', tone: s.dist >= 15 ? 'ok' : 'bad' },
        { label: 'ระบายอากาศ / ตรวจจับก๊าซ', value: (s.vent ? 'มี' : 'ไม่มี') + ' / ' + (s.det ? 'มี' : 'ไม่มี'), tone: (s.vent && s.det) ? 'ok' : 'warn' }
      ],
      verdict: s => {
        if (s.dist < 15 && !s.det) return bad('เสี่ยงสูงสุด', 'ระยะแค่ ' + num(s.dist) + ' เมตร ต่ำกว่าเกณฑ์ และไม่มีเครื่องตรวจจับก๊าซในห้องเครื่อง ถ้าก๊าซรั่วสะสมในห้องที่มีเครื่องยนต์เดินอยู่ จะไม่มีอะไรเตือนก่อนเลย');
        if (s.dist < 15) return bad('ระยะไม่ผ่านเกณฑ์', 'ต้องห่างอย่างน้อย 15 เมตร ตอนนี้ ' + num(s.dist) + ' เมตร ขาดอีก ' + num(15 - s.dist) + ' เมตร ระยะนี้คือสิ่งที่กันไม่ให้กลุ่มก๊าซที่รั่วจากบ่อหมักลอยไปถึงแหล่งจุดติด');
        if (!s.vent || !s.det) return warn('ระยะผ่าน แต่การป้องกันในห้องยังไม่ครบ', 'ระยะ ' + num(s.dist) + ' เมตรผ่านแล้ว แต่' + (!s.vent ? 'ไม่มีระบบระบายอากาศ ก๊าซที่รั่วจะสะสมในห้องปิด' : '') + ((!s.vent && !s.det) ? ' และ' : '') + (!s.det ? 'ไม่มีเครื่องตรวจจับก๊าซ จะไม่มีอะไรเตือนก่อนถึงระดับอันตราย' : ''));
        return ok('ผ่านครบ', 'ระยะ ' + num(s.dist) + ' เมตร ผ่านเกณฑ์ 15 เมตร มีทั้งระบบระบายอากาศและเครื่องตรวจจับก๊าซในห้องเครื่อง');
      }
    },

    flare: {
      icon: '🟢', title: 'หอเผาทำงานเองเมื่อไหร่',
      principle: 'บ่อหมักผลิตก๊าซตลอดเวลาและสั่งให้หยุดไม่ได้ ถ้าเครื่องยนต์ใช้ไม่ทันหรือหยุดซ่อม ก๊าซส่วนเกินต้องมีที่ไป หอเผาคือทางออกนั้น มันจุดเองอัตโนมัติเมื่อแรงดันถึงจุดตั้ง',
      kind: 'sim',
      controls: [
        { id: 'p', label: 'แรงดันในระบบ', type: 'range', min: 0, max: 10, step: 0.5, value: 2, unit: ' mbar' },
        { id: 'genset', label: 'เครื่องยนต์ Genset เดินอยู่ (ใช้ก๊าซ)', type: 'toggle', value: true },
        { id: 'dist', label: 'ระยะจากหอเผาถึงอาคาร/ถนน', type: 'range', min: 2, max: 20, step: 0.5, value: 7.5, unit: ' m' }
      ],
      readouts: s => [
        { label: 'แรงดันระบบ', value: num(s.p) + ' mbar' },
        { label: 'จุดตั้งจุดไฟหอเผา', value: '4 mbar' },
        { label: 'สถานะหอเผา', value: s.p >= 4 ? 'กำลังเผาก๊าซส่วนเกิน' : 'สแตนด์บาย', tone: 'ok' },
        { label: 'ระยะปลอดภัย', value: num(s.dist) + ' m (เกณฑ์ ≥ 7.5 m)', tone: s.dist >= 7.5 ? 'ok' : 'bad' }
      ],
      verdict: s => {
        if (s.dist < 7.5) return bad('ระยะปลอดภัยไม่ผ่าน', 'หอเผาต้องห่างอาคารและถนนอย่างน้อย 7.5 เมตร ตอนนี้ ' + num(s.dist) + ' เมตร ระยะนี้คำนวณจากความร้อนที่แผ่ออกมาขณะเผา ใกล้เกินไปคือคนที่เดินผ่านจะโดนรังสีความร้อน');
        if (!s.genset && s.p < 4) return warn('เครื่องยนต์หยุดแล้วแรงดันกำลังไต่ขึ้น', 'ก๊าซยังผลิตอยู่แต่ไม่มีใครใช้ แรงดันจะไต่ขึ้นเรื่อยๆ จนถึงจุดตั้ง แล้วหอเผาจะจุดเอง ลองเลื่อนแรงดันขึ้นดู');
        if (s.p >= 4) return ok('หอเผาทำงานตามหน้าที่', 'แรงดันถึง ' + num(s.p) + ' mbar เกินจุดตั้ง 4 mbar ระบบจุดหัวเผาเองอัตโนมัติและเผาก๊าซส่วนเกินทิ้ง แรงดันในโดมจึงไม่ไต่ขึ้นไปถึงจุดที่ PVRV ต้องระบายก๊าซดิบออกสู่บรรยากาศ — เผาทิ้งดีกว่าปล่อยมีเทนออกไปตรงๆ เพราะมีเทนทำให้โลกร้อนกว่า CO₂ หลายสิบเท่า');
        return ok('สแตนด์บายตามปกติ', 'แรงดัน ' + num(s.p) + ' mbar ยังต่ำกว่าจุดตั้ง เครื่องยนต์ใช้ก๊าซได้ทัน หอเผารออยู่เฉยๆ ซึ่งเป็นสภาพที่ควรเป็นเกือบตลอดเวลา');
      }
    },

    water_seal: {
      icon: '🟠', title: 'ระดับน้ำใน Water Seal สำคัญแค่ไหน',
      principle: 'ชุดซีลน้ำใช้น้ำเป็นกำแพงกั้นไฟ ก๊าซต้องดันน้ำลงเพื่อผ่านไปได้ ส่วนเปลวไฟผ่านน้ำไม่ได้ ความสูงของน้ำจึงเป็นทั้งเกราะกันไฟและแรงต้านที่ก๊าซต้องเอาชนะ',
      kind: 'sim',
      controls: [
        { id: 'lvl', label: 'ระดับน้ำในซีล', type: 'range', min: 0, max: 40, step: 1, value: 20, unit: ' cm' },
        { id: 'p', label: 'แรงดันก๊าซที่เข้ามา', type: 'range', min: 0, max: 40, step: 1, value: 25, unit: ' mbar' }
      ],
      readouts: s => [
        { label: 'ระดับน้ำ', value: num(s.lvl) + ' cm', tone: (s.lvl >= 15 && s.lvl <= 25) ? 'ok' : 'warn' },
        { label: 'ช่วงที่ออกแบบไว้', value: '15 – 25 cm' },
        { label: 'แรงดันที่ก๊าซต้องเอาชนะ', value: '≈ ' + num(s.lvl) + ' mbar' },
        { label: 'ก๊าซผ่านได้', value: s.p > s.lvl ? 'ผ่านได้' : 'ผ่านไม่ได้', tone: s.p > s.lvl ? 'ok' : 'warn' }
      ],
      verdict: s => {
        if (s.lvl === 0) return bad('ไม่มีเกราะกั้นไฟเหลืออยู่เลย', 'น้ำแห้ง ซีลกลายเป็นท่อโล่ง เปลวไฟจากหอเผาย้อนกลับเข้าระบบท่อได้ตรงๆ นี่คือเหตุผลที่ต้องตรวจระดับน้ำทุกกะ ไม่ใช่ทุกเดือน');
        if (s.lvl < 15) return bad('น้ำต่ำกว่าเกณฑ์ (' + num(s.lvl) + ' cm)', 'ต่ำกว่าช่วงออกแบบ 15–25 cm เกราะกันไฟบางลง และก๊าซดันผ่านง่ายเกินไปจนควบคุมแรงดันไม่ได้ตามที่ออกแบบ ต้องเติมน้ำ');
        if (s.lvl > 25) return warn('น้ำสูงเกินเกณฑ์ (' + num(s.lvl) + ' cm)', 'กันไฟได้ดีขึ้นก็จริง แต่ก๊าซต้องใช้แรงดันถึง ' + num(s.lvl) + ' mbar ถึงจะผ่านได้ แรงดันส่วนเกินนี้จะย้อนไปกดที่โดมบ่อหมักแทน');
        if (s.p <= s.lvl) return warn('ระดับน้ำดี แต่ก๊าซยังดันไม่ผ่าน', 'แรงดันก๊าซ ' + num(s.p) + ' mbar ยังไม่ชนะแรงต้านของน้ำ ' + num(s.lvl) + ' mbar ก๊าซจะค้างอยู่ต้นทาง เป็นสภาพปกติตอนระบบเดินเบา');
        return ok('อยู่ในเกณฑ์ที่ออกแบบไว้', 'ระดับน้ำ ' + num(s.lvl) + ' cm อยู่ในช่วง 15–25 cm ก๊าซแรงดัน ' + num(s.p) + ' mbar ดันผ่านไปได้ ขณะที่ชั้นน้ำยังหนาพอจะดับเปลวไฟที่ย้อนกลับมา');
      }
    },

    gas_detector: {
      icon: '🟢', title: 'เครื่องตรวจจับก๊าซเตือนที่ระดับไหน',
      principle: 'เครื่องตรวจจับไม่ได้รอจนก๊าซถึงระดับระเบิดถึงจะเตือน แต่เตือนที่เศษเสี้ยวของระดับนั้น เพื่อให้มีเวลาแก้ไข ค่าที่ใช้กันทั่วไปคือเตือนที่ 20% LEL และสั่งหยุดระบบที่ 40% LEL',
      kind: 'sim',
      controls: [
        { id: 'lel', label: 'ระดับก๊าซจริงที่จุดติดตั้ง', type: 'range', min: 0, max: 100, step: 1, value: 5, unit: '% LEL' },
        { id: 'cal', label: 'สอบเทียบ (Calibrate) ตามรอบ', type: 'toggle', value: true, hint: 'เซนเซอร์เสื่อมตามเวลา ถ้าไม่สอบเทียบจะอ่านค่าต่ำกว่าจริง' }
      ],
      readouts: s => {
        const shown = s.cal ? s.lel : s.lel * 0.55;
        let alarm = 'ปกติ', tone = 'ok';
        if (shown >= 40) { alarm = 'ALARM 2 — สั่งหยุดระบบ'; tone = 'bad'; }
        else if (shown >= 20) { alarm = 'ALARM 1 — เตือนห้องควบคุม'; tone = 'warn'; }
        return [
          { label: 'ระดับก๊าซจริง', value: num(s.lel) + '% LEL' },
          { label: 'ค่าที่เครื่องอ่านได้', value: num(shown) + '% LEL', tone: s.cal ? 'ok' : 'bad' },
          { label: 'สถานะสัญญาณ', value: alarm, tone }
        ];
      },
      verdict: s => {
        const shown = s.cal ? s.lel : s.lel * 0.55;
        if (!s.cal && s.lel >= 40 && shown < 40) return bad('เครื่องไม่เตือนทั้งที่ถึงระดับสั่งหยุดแล้ว', 'ก๊าซจริงอยู่ที่ ' + num(s.lel) + '% LEL ซึ่งต้องสั่งหยุดระบบแล้ว แต่เซนเซอร์ที่ไม่ได้สอบเทียบอ่านได้แค่ ' + num(shown) + '% จึงเงียบสนิท — เครื่องตรวจจับที่ไม่ได้สอบเทียบอันตรายกว่าไม่มีเครื่องเลย เพราะทุกคนเชื่อมันอยู่');
        if (!s.cal) return warn('เซนเซอร์อ่านค่าต่ำกว่าความจริง', 'ก๊าซจริง ' + num(s.lel) + '% LEL แต่เครื่องอ่านได้ ' + num(shown) + '% ส่วนต่างนี้จะโตขึ้นเรื่อยๆ ตามอายุเซนเซอร์ จนวันหนึ่งมันจะเตือนช้าเกินไป');
        if (s.lel >= 40) return bad('ถึงระดับสั่งหยุดระบบ', num(s.lel) + '% LEL เกินเกณฑ์ ALARM 2 ระบบจะสั่งปิดวาล์วและหยุดอุปกรณ์อัตโนมัติ ทุกคนต้องออกจากพื้นที่ — แต่สังเกตว่านี่ยังเป็นแค่ 40% ของระดับที่ติดไฟได้จริง ยังมีระยะปลอดภัยเหลืออยู่ ระบบออกแบบมาให้เตือนก่อนถึงจุดอันตรายเสมอ');
        if (s.lel >= 20) return warn('สัญญาณเตือนขั้นที่ 1', num(s.lel) + '% LEL เข้าเกณฑ์เตือนแล้ว ห้องควบคุมจะได้รับสัญญาณ ต้องหาจุดรั่วทันทีก่อนที่ค่าจะไต่ถึง 40%');
        return ok('ระดับปกติ', num(s.lel) + '% LEL ต่ำกว่าเกณฑ์เตือน และเซนเซอร์สอบเทียบแล้วจึงเชื่อค่าที่อ่านได้');
      }
    },

    fire_equipment: {
      icon: '🟢', title: 'ไฟไหม้ที่ท่อก๊าซ — ทำอะไรก่อน',
      principle: 'สัญชาตญาณคือคว้าถังดับเพลิงฉีด แต่กับไฟที่เกิดจากก๊าซรั่ว การดับไฟก่อนปิดก๊าซคือสิ่งที่อันตรายที่สุดที่ทำได้ ลองเลือกดู',
      kind: 'choice', multi: false,
      prompt: 'มีไฟลุกที่จุดรั่วบนท่อก๊าซ คุณทำอะไรเป็นอย่างแรก',
      items: [
        { id: 'gas', label: '🚰 ปิดวาล์วก๊าซต้นทางก่อน แล้วค่อยดับไฟ', correct: true, why: 'ถูกต้อง — ตัดเชื้อเพลิงก่อนเสมอ พอไม่มีก๊าซมาเลี้ยง ไฟจะดับเอง และไม่มีก๊าซค้างเหลือให้ติดซ้ำ' },
        { id: 'co2', label: '🧯 ฉีดถัง CO₂ ดับไฟทันที', correct: false, why: 'อันตรายที่สุด — ดับไฟได้แต่ก๊าซยังพุ่งออกมาต่อ ก๊าซที่ไม่ถูกเผาจะสะสมเป็นกลุ่มเมฆรอบตัวคุณ พอเจอจุดร้อนหรือประกายไฟจะติดกลับพร้อมกันทั้งกลุ่ม กลายเป็นการระเบิดแทนที่จะเป็นไฟลุกอยู่ที่เดียว' },
        { id: 'water', label: '💦 ฉีดน้ำใส่เปลวไฟ', correct: false, why: 'น้ำไม่ดับไฟก๊าซ และถ้ามีอุปกรณ์ไฟฟ้าอยู่ใกล้จะกลายเป็นทางเดินไฟฟ้าเข้าหาตัวคุณ น้ำใช้สำหรับหล่อเย็นถังหรือโครงสร้างรอบๆ ไม่ใช่ดับเปลวไฟก๊าซ' },
        { id: 'esd', label: '🚨 กดปุ่ม ESD แล้วออกจากพื้นที่', correct: false, why: 'ไม่ผิดและปลอดภัยกับตัวเอง แต่ยังไม่ใช่คำตอบที่ตรงที่สุด — ESD ตัดระบบทั้งโรงงานซึ่งรวมการปิดวาล์วอยู่แล้ว ถ้าวาล์วต้นทางอยู่ในระยะที่เข้าถึงได้อย่างปลอดภัย ให้ปิดตรงจุดนั้นก่อนเพราะเร็วกว่าและเจาะจงกว่า ถ้าเข้าไม่ถึงค่อยใช้ ESD' }
      ]
    },

    default: {
      icon: '⚪', title: 'กฎพื้นฐานของพื้นที่โรงงานก๊าซชีวภาพ',
      principle: 'ต่อให้เป็นพื้นที่ทั่วไปที่ไม่มีอุปกรณ์อันตรายโดยตรง ก๊าซก็ลอยไปได้ทุกที่ กฎเหล่านี้ใช้กับทุกตารางเมตรในโรงงาน',
      kind: 'choice', multi: true,
      prompt: 'เลือกข้อที่ถูกต้องสำหรับการอยู่ในพื้นที่โรงงาน',
      items: [
        { id: 'det', label: '📟 พกเครื่องตรวจวัดก๊าซติดตัวตลอดเวลา', correct: true, why: 'ก๊าซไม่มีเส้นแบ่งเขต มันลอยไปตามลมได้ทุกที่ พื้นที่ที่ปกติเมื่อเช้าอาจไม่ปกติตอนบ่าย' },
        { id: 'loto', label: '🔒 ทำ LOTO ก่อนเปิดฝาอุปกรณ์ทุกครั้ง', why: 'ไม่ว่าอุปกรณ์จะดูเล็กแค่ไหน ถ้ามีคนสั่งเดินเครื่องขณะมือคุณอยู่ข้างใน ผลลัพธ์เหมือนกันหมด', correct: true },
        { id: 'alone', label: '🚶 ทำงานคนเดียวได้ถ้าเป็นงานเล็กๆ', correct: false, why: 'H₂S ทำให้หมดสติภายในไม่กี่วินาที คนที่หมดสติเรียกใครไม่ได้ ขนาดของงานไม่เกี่ยวกับความเร็วที่ก๊าซทำงาน' },
        { id: 'smell', label: '👃 ถ้าไม่ได้กลิ่นอะไร แปลว่าปลอดภัย', correct: false, why: 'อันตรายที่สุดในบรรดาความเข้าใจผิดทั้งหมด — H₂S ที่ความเข้มข้นสูงทำให้ประสาทรับกลิ่นเป็นอัมพาตทันที คุณจะไม่ได้กลิ่นพอดีตอนที่มันอันตรายถึงชีวิต ส่วนมีเทนไม่มีกลิ่นอยู่แล้วตั้งแต่ต้น' }
      ]
    }
  };

  // ══════════════════════════════════════════════════════════
  // ส่วนแสดงผล
  // ══════════════════════════════════════════════════════════
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
      #ati-overlay{position:fixed;inset:0;background:rgba(4,7,12,.78);backdrop-filter:blur(6px);
        -webkit-backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;}
      #ati-card{background:var(--panel,#0e131c);border:1px solid var(--border,#1c2531);border-radius:14px;
        width:min(620px,100%);max-height:calc(100vh - 32px);overflow-y:auto;
        box-shadow:0 24px 64px rgba(0,0,0,.6);font-size:13px;color:var(--text-0,#eef2f7);}
      .ati-head{display:flex;align-items:flex-start;gap:10px;padding:16px 18px 12px;
        border-bottom:1px solid var(--border-soft,#161d29);position:sticky;top:0;background:var(--panel,#0e131c);z-index:2;}
      .ati-head .ati-ic{font-size:22px;line-height:1.2;flex-shrink:0;}
      .ati-head h3{margin:0;font-size:14.5px;font-weight:800;line-height:1.45;}
      .ati-head .ati-part{font-size:10.5px;color:var(--text-2,#657182);margin-top:3px;font-weight:600;}
      .ati-x{margin-left:auto;background:none;border:none;color:var(--text-2,#657182);font-size:18px;
        cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0;}
      .ati-x:hover{color:var(--text-0,#eef2f7);}
      .ati-body{padding:16px 18px 18px;}
      .ati-principle{background:var(--blue-soft,rgba(59,130,246,.14));border:1px solid rgba(59,130,246,.28);
        border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.7;color:var(--text-1,#9aa7b8);margin-bottom:16px;}
      .ati-principle b{color:#8fb8ff;display:block;font-size:10px;letter-spacing:.5px;
        text-transform:uppercase;margin-bottom:5px;font-weight:800;}
      .ati-sec{font-size:10px;letter-spacing:.5px;text-transform:uppercase;font-weight:800;
        color:var(--text-2,#657182);margin:0 0 9px;}
      .ati-ctl{margin-bottom:14px;}
      .ati-ctl .ati-lab{display:flex;justify-content:space-between;align-items:baseline;gap:8px;
        font-size:12px;font-weight:600;margin-bottom:6px;}
      .ati-ctl .ati-val{font-family:"Sora",sans-serif;font-weight:800;color:var(--blue,#3b82f6);flex-shrink:0;}
      .ati-ctl .ati-hint{font-size:10.5px;color:var(--text-2,#657182);margin-top:4px;line-height:1.5;}
      .ati-ctl input[type=range]{width:100%;accent-color:var(--blue,#3b82f6);}
      .ati-ctl select{width:100%;background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);
        border-radius:8px;padding:9px 11px;color:var(--text-0,#eef2f7);font-size:12.5px;font-family:inherit;}
      .ati-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;
        background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);border-radius:9px;padding:10px 12px;}
      .ati-sw .knobwrap{position:relative;width:40px;height:22px;border-radius:12px;background:#26303e;
        border:1px solid var(--border,#1c2531);flex-shrink:0;transition:background .15s;}
      .ati-sw.on .knobwrap{background:var(--blue,#3b82f6);border-color:var(--blue,#3b82f6);}
      .ati-sw .knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
        background:#fff;transition:left .15s;}
      .ati-sw.on .knob{left:20px;}
      .ati-reads{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:4px 0 14px;}
      .ati-read{background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);border-radius:9px;padding:9px 11px;}
      .ati-read .r-l{font-size:10px;color:var(--text-2,#657182);font-weight:700;letter-spacing:.3px;}
      .ati-read .r-v{font-size:13px;font-weight:800;font-family:"Sora",sans-serif;margin-top:3px;}
      .ati-read.ok .r-v{color:var(--green,#22c55e);}
      .ati-read.warn .r-v{color:var(--yellow,#f59e0b);}
      .ati-read.bad .r-v{color:var(--red,#ef4444);}
      .ati-verdict{border-radius:10px;padding:13px 15px;border:1px solid;line-height:1.7;}
      .ati-verdict .v-t{font-weight:800;font-size:13px;margin-bottom:5px;display:flex;align-items:center;gap:7px;}
      .ati-verdict .v-w{font-size:12.5px;color:var(--text-1,#9aa7b8);}
      .ati-verdict.ok{background:var(--green-soft,rgba(34,197,94,.14));border-color:rgba(34,197,94,.35);}
      .ati-verdict.ok .v-t{color:var(--green,#22c55e);}
      .ati-verdict.warn{background:var(--yellow-soft,rgba(245,158,11,.14));border-color:rgba(245,158,11,.35);}
      .ati-verdict.warn .v-t{color:var(--yellow,#f59e0b);}
      .ati-verdict.bad{background:var(--red-soft,rgba(239,68,68,.14));border-color:rgba(239,68,68,.4);}
      .ati-verdict.bad .v-t{color:var(--red,#ef4444);}
      .ati-step{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;
        background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);border-radius:9px;
        padding:11px 13px;margin-bottom:7px;cursor:pointer;color:var(--text-1,#9aa7b8);
        font-size:12.5px;font-family:inherit;line-height:1.55;}
      .ati-step:hover:not(:disabled){border-color:#33475e;color:var(--text-0,#eef2f7);}
      .ati-step:disabled{cursor:default;}
      .ati-step .s-n{width:20px;height:20px;border-radius:50%;background:#1e2734;color:var(--text-2,#657182);
        font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
      .ati-step.done{background:var(--green-soft,rgba(34,197,94,.14));border-color:rgba(34,197,94,.35);color:var(--text-0,#eef2f7);}
      .ati-step.done .s-n{background:var(--green,#22c55e);color:#04210f;}
      .ati-step.miss{background:var(--red-soft,rgba(239,68,68,.14));border-color:rgba(239,68,68,.4);}
      .ati-step .s-why{display:block;font-size:11.5px;color:var(--text-2,#657182);margin-top:5px;line-height:1.6;}
      .ati-item{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;
        background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);border-radius:9px;
        padding:11px 13px;margin-bottom:7px;cursor:pointer;color:var(--text-1,#9aa7b8);
        font-size:12.5px;font-family:inherit;line-height:1.55;}
      .ati-item:hover:not(.locked){border-color:#33475e;color:var(--text-0,#eef2f7);}
      .ati-item.locked{cursor:default;}
      .ati-item .box{width:17px;height:17px;border-radius:5px;border:1.5px solid var(--text-2,#657182);
        flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:11px;}
      .ati-item.single .box{border-radius:50%;}
      .ati-item.picked{border-color:var(--blue,#3b82f6);background:var(--blue-soft,rgba(59,130,246,.14));color:var(--text-0,#eef2f7);}
      .ati-item.picked .box{border-color:var(--blue,#3b82f6);background:var(--blue,#3b82f6);color:#fff;}
      .ati-item.right{border-color:rgba(34,197,94,.45);background:var(--green-soft,rgba(34,197,94,.14));}
      .ati-item.wrong{border-color:rgba(239,68,68,.45);background:var(--red-soft,rgba(239,68,68,.14));}
      .ati-item .i-why{display:block;font-size:11.5px;color:var(--text-2,#657182);margin-top:6px;line-height:1.6;}
      .ati-btn{background:var(--blue,#3b82f6);border:none;border-radius:9px;padding:10px 18px;color:#fff;
        font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;}
      .ati-btn:disabled{opacity:.45;cursor:default;}
      .ati-btn.ghost{background:transparent;border:1px solid var(--border,#1c2531);color:var(--text-1,#9aa7b8);}
      .ati-row{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap;}
      .ati-note{font-size:10.5px;color:var(--text-2,#657182);margin-top:14px;line-height:1.6;
        border-top:1px solid var(--border-soft,#161d29);padding-top:11px;}
      @media (max-width:560px){ .ati-reads{grid-template-columns:1fr 1fr;} }
    `;
    document.head.appendChild(s);
  }

  // ---------- sim ----------
  function renderSim(def, body) {
    const state = {};
    def.controls.forEach(c => { state[c.id] = c.value; });

    const ctlHtml = def.controls.map(c => {
      if (c.type === 'range') return `<div class="ati-ctl">
          <div class="ati-lab"><span>${esc(c.label)}</span><span class="ati-val" data-val="${c.id}"></span></div>
          <input type="range" data-ctl="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">
          ${c.hint ? `<div class="ati-hint">${esc(c.hint)}</div>` : ''}</div>`;
      if (c.type === 'toggle') return `<div class="ati-ctl">
          <div class="ati-sw${c.value ? ' on' : ''}" data-ctl="${c.id}" role="button" tabindex="0">
            <span>${esc(c.label)}</span><span class="knobwrap"><span class="knob"></span></span></div>
          ${c.hint ? `<div class="ati-hint">${esc(c.hint)}</div>` : ''}</div>`;
      return `<div class="ati-ctl"><div class="ati-lab"><span>${esc(c.label)}</span></div>
          <select data-ctl="${c.id}">${c.options.map(o => `<option value="${esc(o.v)}"${o.v === c.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
    }).join('');

    body.innerHTML = `<p class="ati-sec">ลองปรับค่าดู</p>${ctlHtml}
      <p class="ati-sec" style="margin-top:18px;">ผลที่เกิดขึ้น</p>
      <div class="ati-reads" data-reads></div><div data-verdict></div>`;

    const paint = () => {
      def.controls.forEach(c => {
        if (c.type !== 'range') return;
        const el = body.querySelector(`[data-val="${c.id}"]`);
        if (el) el.textContent = num(state[c.id], 2) + (c.unit || '');
      });
      body.querySelector('[data-reads]').innerHTML = def.readouts(state)
        .map(r => `<div class="ati-read ${r.tone || ''}"><div class="r-l">${esc(r.label)}</div><div class="r-v">${esc(r.value)}</div></div>`).join('');
      const v = def.verdict(state);
      body.querySelector('[data-verdict]').innerHTML =
        `<div class="ati-verdict ${v.tone}"><div class="v-t">${v.tone === 'ok' ? '✅' : v.tone === 'warn' ? '⚠️' : '🛑'} ${esc(v.title)}</div><div class="v-w">${esc(v.why)}</div></div>`;
    };

    body.querySelectorAll('input[type=range][data-ctl]').forEach(el =>
      el.addEventListener('input', () => { state[el.dataset.ctl] = parseFloat(el.value); paint(); }));
    body.querySelectorAll('select[data-ctl]').forEach(el =>
      el.addEventListener('change', () => { state[el.dataset.ctl] = el.value; paint(); }));
    body.querySelectorAll('.ati-sw[data-ctl]').forEach(el => {
      const flip = () => { state[el.dataset.ctl] = !state[el.dataset.ctl]; el.classList.toggle('on', state[el.dataset.ctl]); paint(); };
      el.addEventListener('click', flip);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    });
    paint();
  }

  // ---------- sequence ----------
  function renderSequence(def, body) {
    let idx = 0;
    const order = shuffle(def.steps);
    const draw = (msg) => {
      const done = idx >= def.steps.length;
      body.innerHTML = `<p class="ati-sec">เรียงลำดับให้ถูก — กดทีละขั้นตามลำดับที่ต้องทำจริง (${idx}/${def.steps.length})</p>
        <div data-steps></div><div data-msg></div>
        <div class="ati-row"><button class="ati-btn ghost" data-reset>เริ่มใหม่</button></div>`;
      body.querySelector('[data-steps]').innerHTML = order.map(st => {
        const at = def.steps.findIndex(x => x.id === st.id);
        const isDone = at < idx;
        return `<button class="ati-step${isDone ? ' done' : ''}" data-id="${st.id}"${isDone || done ? ' disabled' : ''}>
            <span class="s-n">${isDone ? '✓' : at < idx ? '' : '?'}</span>
            <span><span>${esc(st.label)}</span>${isDone ? `<span class="s-why">${esc(st.why)}</span>` : ''}</span></button>`;
      }).join('');
      if (done) {
        body.querySelector('[data-msg]').innerHTML =
          `<div class="ati-verdict ok"><div class="v-t">✅ เรียงครบถูกต้องทั้งหมด</div><div class="v-w">ลำดับนี้คือลำดับที่ใช้จริงหน้างาน แต่ละขั้นเปิดทางให้ขั้นถัดไปทำได้อย่างปลอดภัย ข้ามขั้นไหนก็ทำให้ขั้นหลังจากนั้นไม่มีความหมาย</div></div>`;
      } else if (msg) {
        body.querySelector('[data-msg]').innerHTML =
          `<div class="ati-verdict bad"><div class="v-t">🛑 ยังไม่ถึงขั้นนี้</div><div class="v-w">${esc(msg)}</div></div>`;
      }
      body.querySelectorAll('.ati-step[data-id]:not([disabled])').forEach(btn =>
        btn.addEventListener('click', () => {
          const want = def.steps[idx];
          if (btn.dataset.id === want.id) { idx++; draw(null); }
          else {
            btn.classList.add('miss');
            draw(`ก่อนจะถึงขั้นนั้น ต้องทำ "${want.label}" ให้เสร็จก่อน — ${want.why}`);
          }
        }));
      const rs = body.querySelector('[data-reset]');
      if (rs) rs.addEventListener('click', () => { idx = 0; draw(null); });
    };
    draw(null);
  }

  // ---------- choice ----------
  function renderChoice(def, body) {
    const picked = new Set();
    let checked = false;
    const draw = () => {
      body.innerHTML = `<p class="ati-sec">${esc(def.prompt)}</p><div data-items></div>
        <div class="ati-row">
          <button class="ati-btn" data-check${(picked.size === 0 || checked) ? ' disabled' : ''}>ตรวจคำตอบ</button>
          <button class="ati-btn ghost" data-reset>ลองใหม่</button>
        </div><div data-msg></div>`;
      body.querySelector('[data-items]').innerHTML = def.items.map(it => {
        const on = picked.has(it.id);
        let cls = 'ati-item' + (def.multi ? '' : ' single');
        if (checked) cls += ' locked' + ((on === !!it.correct) ? ' right' : ' wrong');
        else if (on) cls += ' picked';
        return `<button class="${cls}" data-id="${it.id}"${checked ? ' disabled' : ''}>
            <span class="box">${on ? (def.multi ? '✓' : '●') : ''}</span>
            <span><span>${esc(it.label)}</span>${checked ? `<span class="i-why">${(on === !!it.correct) ? '✅ ' : '❌ '}${esc(it.why)}</span>` : ''}</span></button>`;
      }).join('');
      if (checked) {
        const allRight = def.items.every(it => picked.has(it.id) === !!it.correct);
        body.querySelector('[data-msg]').innerHTML = allRight
          ? `<div class="ati-verdict ok" style="margin-top:12px;"><div class="v-t">✅ ถูกทั้งหมด</div><div class="v-w">เลือกได้ครบและไม่เลือกตัวลวงเลย</div></div>`
          : `<div class="ati-verdict warn" style="margin-top:12px;"><div class="v-t">⚠️ ยังไม่ครบถูกทุกข้อ</div><div class="v-w">อ่านคำอธิบายใต้แต่ละข้อดู เหตุผลสำคัญกว่าคำตอบ — ของจริงหน้างานจะไม่มีตัวเลือกให้กด</div></div>`;
      }
      body.querySelectorAll('.ati-item[data-id]:not([disabled])').forEach(btn =>
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (!def.multi) { picked.clear(); picked.add(id); }
          else if (picked.has(id)) picked.delete(id); else picked.add(id);
          draw();
        }));
      body.querySelector('[data-check]').addEventListener('click', () => { checked = true; draw(); });
      body.querySelector('[data-reset]').addEventListener('click', () => { picked.clear(); checked = false; draw(); });
    };
    draw();
  }

  // ---------- เปิดหน้าต่าง ----------
  function close() {
    const ov = document.getElementById('ati-overlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(typeKey, partName) {
    const def = INTERACTIONS[typeKey] || INTERACTIONS.default;
    if (!def) return;
    injectStyle();
    close();

    const ov = document.createElement('div');
    ov.id = 'ati-overlay';
    ov.innerHTML = `<div id="ati-card" role="dialog" aria-modal="true">
        <div class="ati-head">
          <span class="ati-ic">${def.icon}</span>
          <div><h3>${esc(def.title)}</h3>${partName ? `<div class="ati-part">📦 ${esc(partName)}</div>` : ''}</div>
          <button class="ati-x" data-close aria-label="ปิด">✕</button>
        </div>
        <div class="ati-body">
          <div class="ati-principle"><b>หลักการทำงาน</b>${esc(def.principle)}</div>
          <div data-slot></div>
          <div class="ati-note">${def.note ? esc(def.note) + ' · ' : ''}บทเรียนนี้ใช้ค่าตัวอย่างเชิงการสอน ไม่ใช่ค่าออกแบบจริงของโรงงาน — ก่อนปฏิบัติงานจริงให้ยึดตามคู่มือและใบอนุญาตทำงานของหน้างานเสมอ</div>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const slot = ov.querySelector('[data-slot]');
    if (def.kind === 'sim') renderSim(def, slot);
    else if (def.kind === 'sequence') renderSequence(def, slot);
    else renderChoice(def, slot);

    ov.querySelector('[data-close]').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
  }

  return { INTERACTIONS, has: k => !!INTERACTIONS[k], open, close };
})();
