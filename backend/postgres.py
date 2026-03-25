from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
from gtts import gTTS
import numpy as np
import os
import requests
import io
import traceback
import re 

import fitz
from pythainlp.util import normalize as normalize_thai
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Database
from sqlalchemy import create_engine, Column, Integer, String, Text, text
from sqlalchemy.orm import sessionmaker, declarative_base
from pgvector.sqlalchemy import Vector

# --- CONFIGURATION ---
DATABASE_URL = "postgresql://myuser:mypassword@127.0.0.1:5434/vectordb"
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

MAX_DISTANCE_THRESHOLD = 0.55 

# ตั้งค่า AI
OLLAMA_API_URL = "http://localhost:11434/api/generate" # กลับไปใช้พอร์ต 11434 ตามมาตรฐานของ Ollama
OLLAMA_MODEL = "gemma3:4b" 

# --- SETUP MODELS ---
print(f"Loading Embedding Model: {MODEL_NAME}...")
embedding_model = SentenceTransformer(MODEL_NAME)

# --- DATABASE SETUP ---
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class KnowledgeItem(Base):
    __tablename__ = "knowledge_base"
    id = Column(Integer, primary_key=True, index=True)
    academic_year = Column(String(4), nullable=True) # 🌟 เพิ่มคอลัมน์ ปีการศึกษา
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    embedding = Column(Vector(384))

def init_db():
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(bind=engine)

def ask_ollama(prompt):
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1, 
                "top_p": 0.5,
                "num_ctx": 4096
            }
        }
        print(f"📡 Sending to Ollama ({OLLAMA_MODEL})...")
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=120)
        if response.status_code == 200:
            return response.json().get("response", "")
        else:
            print(f"❌ Ollama Error: {response.text}")
            return "ระบบประมวลผล AI ขัดข้อง"
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return "ไม่สามารถเชื่อมต่อกับ Ollama ได้"

# --- FLASK APP SETUP ---
app = Flask(__name__)
CORS(app) 

with app.app_context():
    init_db()
    print("Database connected.")

# 🌟 ตัวแปรเก็บความจำบริบทการแชท (แยกตาม IP ของผู้ใช้)
chat_context = {}

# --- API ENDPOINTS ---

@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    db = SessionLocal()
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({"error": "กรุณาส่งข้อความ (message)"}), 400
            
        user_query = data['message'].strip()
        user_ip = request.remote_addr or "default_user"
        
        print(f"\n{'='*60}")
        print(f"📩 คำถามจากผู้ใช้: {user_query}")

        # 🌟 1. ระบบจำบริบท (Context Memory)
        # เช็คว่าผู้ใช้พิมพ์มาแค่ปี พ.ศ. (เช่น "2567", "ปี 2566", "ปี2566") หรือไม่
        is_just_year = re.fullmatch(r'(?:ปี\s*)?(25\d{2})', user_query)
        if is_just_year:
            last_query = chat_context.get(user_ip, "")
            if last_query:
                # ถ้าระบุแค่ปี ให้นำปีไปต่อท้ายคำถามเดิม เพื่อให้ AI นำไปค้นหาเรื่องเดิมต่อ
                user_query = f"{last_query} {user_query}"
                print(f"🔄 นำปีการศึกษาไปรวมกับคำถามเดิมเป็น: {user_query}")
        else:
            # ถ้าไม่ใช่การพิมพ์แค่ปี ให้จดจำคำถามนี้ไว้เป็นบริบทล่าสุด
            chat_context[user_ip] = user_query
        
        # 🌟 2. ดักจับตัวเลขปี พ.ศ. จากคำถามทั้งหมด
        user_year_match = re.search(r'(25\d{2})', user_query)
        user_year = user_year_match.group(1) if user_year_match else None
        
        # 🌟 3. ตัดปีการศึกษาออกจากประโยคก่อนไปค้นหา Vector เพื่อป้องกันความคลาดเคลื่อน (Embedding Shift)
        search_query = re.sub(r'(?:ปี\s*)?25\d{2}', '', user_query).strip()
        if not search_query: # กันเหนียวเผื่อตัดแล้วไม่เหลืออะไรเลย
            search_query = user_query

        query_vector = embedding_model.encode(search_query).tolist()
        distance_col = KnowledgeItem.embedding.cosine_distance(query_vector).label("distance")
        
        # สร้าง Query เริ่มต้น
        base_query = db.query(KnowledgeItem, distance_col)
        
        # 🌟 4. ถ้าผู้ใช้ระบุปีมาด้วย ให้ค้นหาเฉพาะเอกสารของปีนั้น หรือเอกสารทั่วไป(ไม่มีปี)
        if user_year:
            print(f"🔍 พบการระบุปีการศึกษา: {user_year} ทำการ Filter ฐานข้อมูล...")
            base_query = base_query.filter((KnowledgeItem.academic_year == user_year) | (KnowledgeItem.academic_year == None) | (KnowledgeItem.academic_year == ''))
            
        results = base_query.order_by(distance_col).limit(3).all()

        match_found = False
        distance = 2.0 
        retrieved_info = ""

        if results:
            best_item, dist = results[0]
            distance = float(dist)
            
            if distance <= MAX_DISTANCE_THRESHOLD:
                
                # ลอจิกความฉลาด: ถ้าเอกสารนี้ 'มีปีการศึกษา' แต่ 'ผู้ใช้ไม่ได้ระบุปีมาในคำถาม'
                if best_item.academic_year and not user_year:
                    print("⚠️ เอกสารต้องการปีการศึกษา แต่ผู้ใช้ไม่ได้ระบุ!")
                    final_answer = f"เพื่อให้ได้ข้อมูลที่ถูกต้องและเป็นปัจจุบันที่สุด ไม่ทราบว่าต้องการสอบถามข้อมูลของ **ปีการศึกษาใด** ครับ? (เช่น 2566 หรือ 2567)"
                    return jsonify({
                        "answer": final_answer, 
                        "similarity_score": distance,
                        "confidence": 100
                    })

                match_found = True
                # รวบรวมข้อมูลอ้างอิง
                combined_info = "\n---\n".join([
                    f"[ปีการศึกษา {item.academic_year or 'ทั่วไป'}] {item.answer}" for item, d in results[:2] 
                    if float(d) <= MAX_DISTANCE_THRESHOLD
                ])
                retrieved_info = combined_info
                print(f"✅ Match Found! Using RAG Mode")
            else:
                print(f"⚠️ Distance too high! Using General Mode")

        final_answer = ""
        
        if match_found:
            prompt = (
                f"คุณคือผู้ช่วย AI สกัดข้อมูลและตอบคำถามจากเอกสารของมหาวิทยาลัย\n"
                f"คำสั่งอย่างเคร่งครัด:\n"
                f"1. ให้ตอบคำถามโดยใช้ข้อมูลจาก [ข้อมูลอ้างอิง] เท่านั้น ห้ามแต่งข้อมูลขึ้นเอง\n"
                f"2. หากข้อมูลอ้างอิงมีการแบ่งเนื้อหาเป็นข้อๆ (เช่น 1., 2., 3.) ให้คุณตอบเป็นข้อๆ ตามต้นฉบับ ห้ามเขียนรวบยอด\n"
                f"3. หากไม่พบคำตอบในข้อมูลอ้างอิง ให้ตอบว่า 'ขออภัย ไม่พบข้อมูลที่ตรงกับคำถามในเอกสาร'\n\n"
                f"--- [ข้อมูลอ้างอิง] ---\n"
                f"{retrieved_info}\n"
                f"----------------------\n\n"
                f"คำถาม: {user_query}\n"
                f"คำตอบ (ภาษาไทย จัดรูปแบบให้อ่านง่ายตามต้นฉบับ): "
            )
            final_answer = ask_ollama(prompt)
        else:
            final_answer = "ขออภัยครับ ผมเป็นผู้ช่วย AI ของมหาวิทยาลัย สามารถตอบได้เฉพาะข้อมูลที่เกี่ยวข้องกับงานทะเบียน กฎระเบียบ หรือข้อมูลของมหาวิทยาลัยตามที่อ้างอิงจากระบบเท่านั้นครับ หากมีคำถามเกี่ยวกับเรื่องเหล่านี้ สามารถพิมพ์ถามมาได้เลยครับ"

        confidence_score = max(0, min(100, round((1.0 - distance) * 100, 2)))
        
        return jsonify({
            "answer": final_answer, 
            "similarity_score": distance,
            "confidence": confidence_score
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route("/api/upload-pdf", methods=["POST"])
def upload_pdf():
    db = SessionLocal()
    try:
        if 'file' not in request.files:
            return jsonify({"status": "error", "message": "ไม่พบไฟล์ที่อัปโหลด"}), 400
            
        file = request.files['file']
        # 🌟 รับค่าปีการศึกษาจาก FormData
        academic_year = request.form.get('academic_year', '').strip()
        
        if file.filename == '':
            return jsonify({"status": "error", "message": "ไม่ได้เลือกไฟล์"}), 400

        contents = file.read()
        full_text = ""
        with fitz.open(stream=contents, filetype="pdf") as doc:
            for page in doc:
                text = page.get_text("text")
                if text:
                    text = normalize_thai(text)
                    full_text += text + "\n"
            
        if not full_text.strip():
            return jsonify({"status": "error", "message": "ไม่สามารถอ่านข้อความจาก PDF ได้"}), 400

        full_text = full_text.replace('\u200b', '') 
        thai_am_fixes = {'ส าเร็จ': 'สำเร็จ', 'ก าหนด': 'กำหนด', 'ท า': 'ทำ', 'ต ่า': 'ต่ำ', 'ค า': 'คำ', 'จ า': 'จำ', 'น า': 'นำ', 'ล า': 'ลำ'}
        for wrong, right in thai_am_fixes.items():
            full_text = full_text.replace(wrong, right)
            
        full_text = re.sub(r' +', ' ', full_text)
        full_text = re.sub(r'\n{3,}', '\n\n', full_text)

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,        
            chunk_overlap=200,      
            separators=["\n\n", "\n", " ", ""],  
            length_function=len,
        )
        chunks = text_splitter.split_text(full_text)
        
        count = 0
        for i, chunk in enumerate(chunks):
            if len(chunk.strip()) < 50:
                continue
                
            vector = embedding_model.encode(chunk).tolist()
            doc_title = f"📑 ข้อมูลจากเอกสาร: {file.filename} (ส่วนที่ {count + 1})"
            
            new_item = KnowledgeItem(
                academic_year=academic_year if academic_year else None, # 🌟 บันทึกปีการศึกษา
                question=doc_title,      
                answer=f"ข้อมูลอ้างอิง: {file.filename}\n\n{chunk}",  
                embedding=vector 
            )
            db.add(new_item)
            count += 1
            
        db.commit()
        return jsonify({
            "status": "success", 
            "message": f"นำเข้าข้อมูลเรียบร้อย ({count} ส่วน) ปีการศึกษา {academic_year or 'ทั่วไป'}", 
            "chunks": count
        })

    except Exception as e:
        db.rollback()
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db.close()

@app.route("/api/add-data", methods=["POST"])
def add_data():
    db = SessionLocal()
    try:
        data = request.get_json()
        if not data or 'question' not in data or 'answer' not in data:
            return jsonify({"status": "error", "message": "ข้อมูลไม่ครบถ้วน"}), 400

        academic_year = data.get('academic_year', '').strip()

        vector = embedding_model.encode(data['question']).tolist()
        new_item = KnowledgeItem(
            academic_year=academic_year if academic_year else None, # 🌟 บันทึกปีการศึกษา
            question=data['question'], 
            answer=data['answer'], 
            embedding=vector
        )
        db.add(new_item)
        db.commit()
        return jsonify({"status": "success", "message": "เพิ่มข้อมูลเรียบร้อยแล้ว"})
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db.close()

@app.route("/api/view-data", methods=["GET"])
def view_data():
    db = SessionLocal()
    try:
        items = db.query(KnowledgeItem).order_by(KnowledgeItem.id.desc()).limit(30).all()
        result = [
            {
                "id": i.id, 
                "academic_year": i.academic_year, # 🌟 ส่งปีการศึกษากลับไปให้ Frontend โชว์
                "question": i.question, 
                "answer": i.answer
            } 
            for i in items
        ]
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db.close()

@app.route("/api/delete-data/<int:item_id>", methods=["DELETE"])
def delete_data(item_id):
    db = SessionLocal()
    try:
        item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
        if not item:
            return jsonify({"status": "error", "message": "ไม่พบข้อมูลที่ต้องการลบ"}), 404
            
        db.delete(item)
        db.commit()
        return jsonify({"status": "success", "message": f"ลบข้อมูล ID {item_id} เรียบร้อยแล้ว"})
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db.close()

@app.route("/api/tts", methods=["POST"])
def text_to_speech():
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "ต้องระบุ text"}), 400
        
        text = data['text']
        
        tts = gTTS(text=text, lang='th', slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        return send_file(audio_buffer, mimetype='audio/mpeg', as_attachment=False)
    
    except Exception as e:
        print(f"❌ TTS Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)