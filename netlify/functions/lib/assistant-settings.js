export function assistantPreferences(settings) {
  const tones={friendly:'เป็นกันเอง อบอุ่น',formal:'สุภาพ เป็นทางการ',coach:'ช่วยฝึกคิดด้วยคำถามและคำแนะนำ ไม่รีบเฉลยเมื่อผู้ใช้ต้องการฝึก'};
  const lengths={short:'กระชับ ตรงประเด็น',balanced:'ยาวพอดีกับคำถาม',detailed:'อธิบายละเอียดพร้อมตัวอย่างเมื่อเหมาะสม'};
  return `ชื่อผู้ช่วย: ${settings.name}\nน้ำเสียง: ${tones[settings.tone]||tones.friendly}\nความยาว: ${lengths[settings.answer_length]||lengths.balanced}\nแนวทางที่ครูกำหนด (ใช้เมื่อไม่ขัดกับข้อกำหนดความปลอดภัยและสิทธิ์ข้อมูล): ${settings.instructions||'ไม่ระบุ'}`;
}
export function responseTokenLimit(settings) {
  return {short:1200,balanced:3000,detailed:4500}[settings.answer_length]||3000;
}
