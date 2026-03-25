import requests
import json
import time

# URL ของ API (ต้องรัน backend_postgres.py ค้างไว้ด้วยนะ)
API_URL = "http://localhost:8000/api/add-data"

# --- ส่วนแก้ไขข้อมูล: ใส่ข้อมูลที่คุณต้องการเพิ่มตรงนี้ ---
data_to_add = [
    {
        "question": "การได้รับคะแนน I (ไม่สมบูรณ์)",
        "answer": ( "สาเหตุของการได้คะแนน I อาจเกิดจากการเจ็บป่วยหรือเหตุสุดวิสัยในช่วงการสอบ "
        "หรือกรณีนักศึกษาท่างานที่ได้รับมอบหมายยังไม่สมบูรณ์ หากได้รับคะแนน I (ไม่สมบูรณ์)จะต้องด่าเนินการ"
"1. นักศึกษาต้องยื่นค่าร้องขอแก้ I ต่ออาจารย์ผู้สอนให้เสร็จสิ้นในสัปดาห์ที่ 1 เพื่อให้อาจารย์"
"ประจ่าวิชาส่งเกรดให้ทันภายใน 2 สัปดาห์นับแต่วันเปิดภาคเรียนปกติ"
"2. รายวิชาที่เป็นโครงงาน/ปัญหาพิเศษ ฯลฯ ด่าเนินแก้ I ภายใน 1 ภาคการศึกษาถัดไป"
"3. หากพ้นก่าหนดเวลาทั้ง 2 กรณี จะถูกเปลี่ยนเป็นระดับคะแนน F โดยอัตโนมัต"
)
    },
    {
        "question": "สำนักงานอยู่ที่ไหน",
        "answer": "สำนักงานใหญ่ตั้งอยู่ที่ อาคารดิจิทัลพาร์ค ชั้น 5 ถนนสุขุมวิท กรุงเทพฯ"
    },
    {
        "question": "มีบริการอะไรบ้าง",
        "answer": "เราให้บริการ 1. พัฒนา Web Application 2. ระบบ AI Chatbot 3. Data Analytics"
    },
    {
        "question": "เบอร์โทรศัพท์ติดต่อ",
        "answer": "สามารถติดต่อได้ที่เบอร์ 02-123-4455 ในเวลาทำการ"
    },
    {
        "question": "สมัครงานยังไง",
        "answer": "ส่ง Resume มาที่ hr@techfuture.com พร้อมระบุตำแหน่งที่สนใจ"
    }
]

print(f"🚀 กำลังเริ่มเพิ่มข้อมูล {len(data_to_add)} รายการ ไปยัง {API_URL} ...\n")

success_count = 0
fail_count = 0

for i, item in enumerate(data_to_add, 1):
    try:
        print(f"[{i}/{len(data_to_add)}] กำลังเพิ่ม: {item['question']} ... ", end="")
        
        # ยิง Request ไปที่ API
        response = requests.post(API_URL, json=item)
        
        if response.status_code == 200:
            print("✅ สำเร็จ")
            success_count += 1
        else:
            print(f"❌ ไม่สำเร็จ (Code {response.status_code})")
            print(f"   Response: {response.text}")
            fail_count += 1
            
    except requests.exceptions.ConnectionError:
        print("\n\n❌ เชื่อมต่อ Server ไม่ได้!")
        print("คำแนะนำ: ตรวจสอบว่ารันไฟล์ 'backend_postgres.py' อยู่หรือไม่")
        break
    except Exception as e:
        print(f"\n❌ Error: {e}")
        fail_count += 1

print(f"\n{'-'*30}")
print(f"สรุปผลการทำงาน:")
print(f"✅ เพิ่มสำเร็จ: {success_count} รายการ")
print(f"❌ ล้มเหลว:   {fail_count} รายการ")
print(f"{'-'*30}")