import { Component, signal, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare const THREE: any;

interface Message {
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
  score?: number;
  confidence?: number;
}

interface ApiResponse {
  answer: string;
  similarity_score: number;
  confidence: number;
}

interface UploadResponse {
  status: string;
  message: string;
}

interface KnowledgeItem {
  id: number;
  academic_year?: string; // เพิ่มฟิลด์ปีการศึกษา
  question: string;
  answer: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  template: `
    <div class="flex flex-col h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-gray-100 font-sans relative">
      
      <header class="absolute top-0 w-full flex items-center justify-between px-6 py-4 border-b border-slate-700/30 bg-slate-900/50 backdrop-blur-md z-30">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 class="text-xl font-bold tracking-wider bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent hidden md:block">Tech Future</h1>
          <span class="text-xs text-indigo-300 font-semibold bg-indigo-900/40 px-3 py-1 rounded-full border border-indigo-500/30 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" [ngClass]="isSpeaking() ? 'bg-green-400 animate-pulse' : 'bg-blue-400'"></span>
            AI Assistant
          </span>
        </div>
        
        <div class="flex bg-slate-800/80 rounded-lg p-1 backdrop-blur-sm border border-slate-700/50">
          <button (click)="switchView('chat')" [class.bg-indigo-600]="currentView() === 'chat'" [class.text-white]="currentView() === 'chat'" class="px-4 py-1.5 rounded-md text-sm transition-all hover:text-white flex items-center gap-2 text-slate-400">
            <span>💬</span> แชทบอท
          </button>
          <button (click)="switchView('admin')" [class.bg-indigo-600]="currentView() === 'admin'" [class.text-white]="currentView() === 'admin'" class="px-4 py-1.5 rounded-md text-sm transition-all hover:text-white flex items-center gap-2 text-slate-400">
            <span>⚙️</span> ฐานข้อมูล
          </button>
        </div>
      </header>

      <main class="flex-1 w-full h-full relative">
        
        <div [class.hidden]="currentView() !== 'chat'" class="absolute inset-0 w-full h-full flex flex-col justify-end pb-24">
          
          <div class="absolute inset-0 z-0">
            <div #rendererContainer class="w-full h-full cursor-move outline-none"></div>
          </div>

          <label class="absolute top-20 right-6 z-20 bg-slate-800/80 hover:bg-indigo-600 backdrop-blur-md px-4 py-2 rounded-lg border border-slate-600 cursor-pointer transition-colors text-xs text-gray-200 shadow-lg group">
            <span>เปลี่ยนโมเดล</span>
            <input type="file" accept=".glb" class="hidden" (change)="onGlbFileSelected($event)">
          </label>

          @if (isModelLoading()) {
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-20">
              <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500 border-r-2 border-r-transparent mb-3"></div>
              <span class="text-sm font-medium text-indigo-400 animate-pulse">กำลังโหลด AI Avatar...</span>
            </div>
          }

          <!-- Floating Chat Display -->
          @if (messages().length > 0 && messages()[messages().length - 1].sender === 'bot' && (messages()[messages().length - 1].isLoading || isSpeaking() || messages()[messages().length - 1].text.includes('❌'))) {
            <div class="z-10 w-full max-w-4xl mx-auto px-4 mb-8 animate-fade-in-up">
              <div class="bg-slate-900/85 backdrop-blur-lg border border-slate-700/50 p-6 rounded-2xl shadow-2xl transition-all duration-300">
                
                @if (messages()[messages().length - 1].isLoading) {
                  <div class="flex items-center justify-center gap-1.5 py-6">
                    <span class="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce"></span>
                    <span class="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce delay-100"></span>
                    <span class="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce delay-200"></span>
                    <span class="ml-3 text-sm text-indigo-300 font-medium tracking-wide">กำลังค้นหาข้อมูล...</span>
                  </div>
                } @else if (isSpeaking()) {
                  <div class="min-h-[100px] flex items-center justify-center text-center">
                    <div [innerHTML]="currentSubtitle()" class="markdown-content text-indigo-100 text-lg md:text-xl font-medium leading-relaxed drop-shadow-md animate-fade-in"></div>
                  </div>
                } @else {
                  <!-- โชว์ข้อความ Error หากเซิร์ฟเวอร์มีปัญหา -->
                  <div class="min-h-[100px] flex items-center justify-center text-center">
                    <div [innerHTML]="formatMessage(messages()[messages().length - 1].text)" class="markdown-content text-red-400 text-lg font-medium leading-relaxed drop-shadow-md animate-fade-in"></div>
                  </div>
                }

              </div>
            </div>
          } @else if (messages().length === 0) {
            <div class="z-10 w-full max-w-md mx-auto px-4 mb-8 animate-fade-in pointer-events-none text-center">
               <h2 class="text-2xl font-bold text-white mb-2 drop-shadow-lg">สวัสดีครับ มีอะไรให้ช่วยไหม?</h2>
               <p class="text-slate-300 text-sm drop-shadow-md">พิมพ์หรือกดพูดคำถามด้านล่างเพื่อคุยกับ AI</p>
            </div>
          }

        </div>

        <!-- Chat Input Area - Fixed Bottom -->
        <div [class.hidden]="currentView() !== 'chat'" class="absolute bottom-0 w-full p-4 md:p-6 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent z-30">
          <div class="max-w-4xl mx-auto">
            <form (submit)="sendMessage()" class="relative flex items-center gap-2 bg-slate-800/70 backdrop-blur-xl rounded-full p-2 border border-slate-600/50 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all shadow-2xl">
              
              <input type="text" [(ngModel)]="userInput" name="userInput" placeholder="พิมพ์ข้อความคำถามที่นี่..."
                class="w-full bg-transparent text-gray-100 px-5 py-3 focus:outline-none placeholder-slate-400 text-base"
                [disabled]="isLoading() || isSpeaking()" autocomplete="off">
              
              <!-- Microphone Button -->
              <button type="button" (click)="toggleVoiceRecognition()" [disabled]="isLoading() || isSpeaking()"
                class="w-12 h-12 flex items-center justify-center rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex-shrink-0"
                [ngClass]="isRecording() ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-indigo-400'">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd" />
                </svg>
              </button>

              <!-- Send Button -->
              <button type="submit" [disabled]="!userInput.trim() || isLoading() || isSpeaking()"
                class="w-12 h-12 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex-shrink-0 mr-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-1 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>

            </form>
          </div>
        </div>

        <!-- VIEW 2: ADMIN -->
        <div [class.hidden]="currentView() !== 'admin'" class="w-full h-full overflow-y-auto pt-24 pb-10 px-4 md:px-8 bg-slate-900 custom-scrollbar absolute inset-0 z-20">
          <div class="max-w-5xl mx-auto space-y-8 animate-fade-in-up">
            
            <!-- 1. ส่วนอัปโหลด PDF -->
            <div class="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg relative overflow-hidden group">
              <div class="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              <h2 class="text-lg font-semibold mb-4 text-indigo-400 flex items-center gap-2">
                <span class="bg-indigo-500/10 p-1.5 rounded-lg border border-indigo-500/20">📄</span> นำเข้าข้อมูลจาก PDF
              </h2>
              <div class="flex flex-col md:flex-row gap-4 items-center">
                <!-- เพิ่มช่องกรอกปีการศึกษา สำหรับ PDF -->
                <div class="w-full md:w-1/4 relative">
                  <input type="text" [(ngModel)]="uploadAcademicYear" placeholder="ปีการศึกษา (เช่น 2567)" 
                    class="w-full bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all placeholder-slate-500"/>
                </div>
                <div class="w-full md:w-2/4 relative">
                  <input type="file" (change)="onFileSelected($event)" accept=".pdf"
                    class="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-indigo-400 hover:file:bg-slate-600 file:cursor-pointer file:transition-colors cursor-pointer bg-slate-900/50 rounded-lg border border-slate-600 focus:outline-none focus:border-indigo-500"/>
                </div>
                <button (click)="uploadPDF()" [disabled]="!selectedFile || uploadStatus() === 'uploading'"
                  class="w-full md:w-1/4 whitespace-nowrap bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  @if (uploadStatus() === 'uploading') {
                    <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังอัปโหลด...
                  } @else { 🚀 อัปโหลด }
                </button>
              </div>
              @if (uploadMessage()) {
                <div class="mt-4 p-3 rounded-lg border text-sm flex items-center gap-2 animate-fade-in"
                  [class.bg-green-900_20]="uploadStatus() === 'success'" [class.text-green-400]="uploadStatus() === 'success'" [class.border-green-800]="uploadStatus() === 'success'"
                  [class.bg-red-900_20]="uploadStatus() === 'error'" [class.text-red-400]="uploadStatus() === 'error'" [class.border-red-800]="uploadStatus() === 'error'">
                  <span>{{ uploadStatus() === 'success' ? '✅' : '❌' }}</span> {{ uploadMessage() }}
                </div>
              }
            </div>

            <!-- 2. ส่วนเพิ่มข้อมูล Manual -->
            <div class="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
              <h2 class="text-lg font-semibold mb-4 text-indigo-400 flex items-center gap-2">
                <span class="bg-indigo-500/10 p-1.5 rounded-lg border border-indigo-500/20">📝</span> เพิ่มข้อมูลถาม-ตอบ (Manual)
              </h2>
              <div class="grid gap-4 md:grid-cols-12">
                <div class="md:col-span-3">
                  <input [(ngModel)]="newAcademicYear" placeholder="ปีการศึกษา (ไม่บังคับ)" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all outline-none">
                </div>
                <div class="md:col-span-4">
                  <input [(ngModel)]="newQuestion" placeholder="คำถาม (เช่น ห้องสมุดปิดกี่โมง)" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all outline-none">
                </div>
                <div class="md:col-span-5">
                  <input [(ngModel)]="newAnswer" placeholder="คำตอบ" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all outline-none">
                </div>
              </div>
              <button (click)="addData()" [disabled]="!newQuestion || !newAnswer || isProcessing()" class="mt-4 bg-slate-700 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg transition-all border border-slate-600 hover:border-indigo-500 hover:shadow-lg disabled:opacity-50">+ บันทึกข้อมูล</button>
            </div>

            <!-- 3. ตารางข้อมูล -->
            <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
              <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h2 class="text-lg font-semibold text-white flex items-center gap-2">
                  💾 ข้อมูลในระบบ <span class="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{{ knowledgeList().length }}</span>
                </h2>
                <button (click)="loadKnowledge()" class="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">🔄 รีเฟรช</button>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr class="bg-slate-900/50 text-slate-400 uppercase text-xs tracking-wider">
                      <th class="p-4 w-16 font-medium">ID</th>
                      <th class="p-4 w-24 font-medium text-center">ปีการศึกษา</th>
                      <th class="p-4 w-1/3 font-medium">คำถาม / เนื้อหา</th>
                      <th class="p-4 font-medium">คำตอบ / แหล่งที่มา</th>
                      <th class="p-4 w-24 text-center font-medium">ลบ</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-700">
                    @for (item of knowledgeList(); track item.id) {
                      <tr class="hover:bg-slate-700/30 transition-colors group">
                        <td class="p-4 text-slate-500 font-mono text-xs">#{{item.id}}</td>
                        <td class="p-4 text-slate-400 text-center font-semibold">
                          @if(item.academic_year) { <span class="bg-slate-700 px-2 py-1 rounded">{{item.academic_year}}</span> } 
                          @else { - }
                        </td>
                        <td class="p-4 text-indigo-300 font-medium"><div class="line-clamp-2">{{item.question}}</div></td>
                        <td class="p-4 text-slate-300"><div class="line-clamp-2 text-slate-400 group-hover:text-slate-200 transition-colors">{{item.answer}}</div></td>
                        <td class="p-4 text-center"><button (click)="deleteData(item.id)" class="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-all" title="ลบข้อมูล">🗑️</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  `,
  styles: [`
    ::ng-deep .markdown-content { white-space: pre-wrap; word-break: break-word; line-height: 1.8; }
    ::ng-deep .markdown-content p { margin-bottom: 0.5em; }
    ::ng-deep .markdown-content strong { color: #818cf8; font-weight: 600; }
    ::ng-deep .markdown-content pre { background-color: #0f172a; border: 1px solid #334155; border-radius: 0.5rem; padding: 1rem; margin: 0.75rem 0; overflow-x: auto; font-family: 'Fira Code', monospace; font-size: 0.85em; color: #e2e8f0; }
    ::ng-deep .markdown-content code { background-color: rgba(99, 102, 241, 0.15); color: #a5b4fc; padding: 0.1em 0.3em; border-radius: 0.3em; font-family: monospace; font-size: 0.9em; }
    ::ng-deep .markdown-content pre code { background-color: transparent; padding: 0; color: inherit; }

    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
    
    .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .animate-fade-in { animation: fadeIn 0.3s ease-out; }
    .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
    
    @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .delay-100 { animation-delay: 100ms; }
    .delay-200 { animation-delay: 200ms; }
  `]
})
export class App implements OnInit, OnDestroy {
  // --- Chat & UI States ---
  currentView = signal<'chat' | 'admin'>('chat');
  messages = signal<Message[]>([]);
  userInput = '';
  isLoading = signal(false);
  
  // --- Subtitle & Audio States ---
  isSpeaking = signal(false); 
  currentSubtitle = signal<any>(''); 
  private chunkTimings: { start: number, end: number, text: string }[] = []; 
  private audioPlayer: HTMLAudioElement | null = null;

  // --- Voice Recognition States ---
  isRecording = signal(false);
  private speechRecognition: any = null;

  // --- Admin Data States ---
  knowledgeList = signal<KnowledgeItem[]>([]);
  newAcademicYear = '';
  newQuestion = '';
  newAnswer = '';
  isProcessing = signal(false);

  // --- PDF Upload States ---
  selectedFile: File | null = null;
  uploadAcademicYear = '';
  uploadStatus = signal<'idle' | 'uploading' | 'success' | 'error'>('idle');
  uploadMessage = signal('');

  // --- 3D Model States ---
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef;
  isModelLoading = signal(true);
  private scene: any;
  private camera: any;
  private renderer: any;
  private model: any;
  private controls: any;
  private animationId: number = 0;
  
  // --- Animation States ---
  private mixer: any;
  private idleAction: any;
  private talkAction: any;
  private clock: any;

  private defaultModelUrl = '/assets/model.glb';
  private apiUrl = 'http://localhost:8000/api';

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loadThreeJsScripts().then(() => {
      this.initThreeJs();
      this.loadModel(this.defaultModelUrl);
    });
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) {
      this.renderer.dispose();
      this.rendererContainer.nativeElement.innerHTML = '';
    }
    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
  }

  switchView(view: 'chat' | 'admin') {
    this.currentView.set(view);
    if (view === 'chat') {
      setTimeout(() => this.onWindowResize(), 100);
    } else if (view === 'admin') {
      this.loadKnowledge();
    }
  }

  // ==========================================
  // --- ระบบแปลงเสียงเป็นข้อความ (Speech to Text) ---
  // ==========================================
  toggleVoiceRecognition() {
    if (this.isRecording()) {
      if (this.speechRecognition) {
        this.speechRecognition.stop();
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('ขออภัยครับ เบราว์เซอร์ของคุณไม่รองรับการสั่งงานด้วยเสียง แนะนำให้ใช้งานผ่าน Google Chrome หรือ Microsoft Edge ครับ');
      return;
    }

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.lang = 'th-TH'; 
    this.speechRecognition.interimResults = false; 

    this.speechRecognition.onstart = () => {
      this.isRecording.set(true);
      this.userInput = 'กำลังฟังเสียงของคุณ...';
    };

    this.speechRecognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      this.userInput = transcript; 
      
      if (this.userInput.trim() !== '') {
        this.sendMessage();
      }
    };

    this.speechRecognition.onerror = (event: any) => {
      console.error('Voice recognition error:', event.error);
      this.isRecording.set(false);
      this.userInput = ''; 
    };

    this.speechRecognition.onend = () => {
      this.isRecording.set(false);
      if (this.userInput === 'กำลังฟังเสียงของคุณ...') {
        this.userInput = '';
      }
    };

    this.speechRecognition.start();
  }

  formatMessage(text: string): SafeHtml {
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');
    let formatted = text.replace(/```([\s\S]*?)```/g, (match, code) => {
      const cleanCode = code.replace(/^[a-z]+\n/, '');
      return `<pre><code>${cleanCode}</code></pre>`;
    });
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\n/g, '<br/>'); 
    return this.sanitizer.bypassSecurityTrustHtml(formatted);
  }

  async sendMessage() {
    if (!this.userInput.trim() || this.isLoading() || this.isSpeaking()) return;
    const text = this.userInput;
    this.userInput = '';
    
    this.messages.update(msgs => [...msgs, { text, sender: 'user', timestamp: new Date() }]);
    this.isLoading.set(true);
    
    const idx = this.messages().length;
    this.messages.update(msgs => [...msgs, { text: '', sender: 'bot', timestamp: new Date(), isLoading: true }]);

    try {
      const res = await firstValueFrom(this.http.post<ApiResponse>(`${this.apiUrl}/chat`, { message: text }));
      
      let finalAnswer = res.answer.trim();
      finalAnswer = finalAnswer.replace(/^(คำถาม|คำถามคือ):?.*?\n/gi, '').trim();
      finalAnswer = finalAnswer.replace(/^(คำตอบ|ตอบ):?\s*/gi, '').trim();
      if (/^1\.\s+/.test(finalAnswer) && !/2\.\s+/.test(finalAnswer)) {
        finalAnswer = finalAnswer.replace(/^1\.\s+/, '');
      }

      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        newMsgs[idx] = {
          text: finalAnswer,
          sender: 'bot',
          timestamp: new Date(),
          isLoading: false,
          score: res.similarity_score,
          confidence: res.confidence
        };
        return newMsgs;
      });

      await this.playTTS(finalAnswer);

    } catch (err) {
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        newMsgs[idx] = { text: "❌ ขออภัย ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้", sender: 'bot', timestamp: new Date(), isLoading: false };
        return newMsgs;
      });
    } finally { 
      this.isLoading.set(false); 
    }
  }

  // ==========================================
  // --- ระบบเล่นเสียง TTS & ซับไตเติล ---
  // ==========================================
  
  private prepareSubtitles(text: string) {
    let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let chunks: string[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      chunks.push(lines.slice(i, i + 2).join('\n'));
    }
    if (chunks.length === 0) chunks.push(text);

    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    let currentPercentage = 0;
    
    this.chunkTimings = chunks.map(chunk => {
      const chunkPercent = chunk.length / totalChars;
      const start = currentPercentage;
      const end = currentPercentage + chunkPercent;
      currentPercentage = end;
      return { start, end, text: chunk };
    });

    if (this.chunkTimings.length > 0) {
      this.currentSubtitle.set(this.formatMessage(this.chunkTimings[0].text));
    }
  }

  private async playTTS(text: string) {
    try {
      const audioBlob = await firstValueFrom(
        this.http.post(`${this.apiUrl}/tts`, { text }, { responseType: 'blob' })
      );

      this.prepareSubtitles(text);

      const audioUrl = URL.createObjectURL(audioBlob);
      this.audioPlayer = new Audio(audioUrl);

      this.audioPlayer.ontimeupdate = () => {
        if (this.audioPlayer && this.audioPlayer.duration && this.audioPlayer.duration !== Infinity) {
          const progress = this.audioPlayer.currentTime / this.audioPlayer.duration;
          
          const activeChunk = this.chunkTimings.find(c => progress >= c.start && progress <= c.end) 
                           || this.chunkTimings[this.chunkTimings.length - 1];
          
          this.currentSubtitle.set(this.formatMessage(activeChunk.text));
        }
      };

      this.audioPlayer.onplay = () => {
        this.isSpeaking.set(true);
        this.playTalkAnimation();
      };

      this.audioPlayer.onended = () => {
        this.isSpeaking.set(false);
        this.stopTalkingAnimation();
        URL.revokeObjectURL(audioUrl); 
      };

      await this.audioPlayer.play();

    } catch (error) {
      console.error('Error playing TTS:', error);
      this.isSpeaking.set(false);
      this.stopTalkingAnimation();
    }
  }

  private stopTalkingAnimation() {
    if (this.talkAction) {
      this.talkAction.fadeOut(0.3);
      setTimeout(() => {
        if (!this.isSpeaking() && this.mixer) {
          this.mixer.stopAllAction(); 
        }
      }, 300);
    }
  }

  private playTalkAnimation() {
    if (this.talkAction) {
      this.talkAction.reset().fadeIn(0.3).play(); 
    }
  }


  // ==========================================
  // --- Admin API Methods ---
  // ==========================================
  async loadKnowledge() {
    try { const data = await firstValueFrom(this.http.get<KnowledgeItem[]>(`${this.apiUrl}/view-data`)); this.knowledgeList.set(data); } catch(e){}
  }

  async addData() {
    if(!this.newQuestion || !this.newAnswer) return;
    this.isProcessing.set(true);
    try { 
      await firstValueFrom(this.http.post(`${this.apiUrl}/add-data`, {
        academic_year: this.newAcademicYear,
        question: this.newQuestion, 
        answer: this.newAnswer
      })); 
      this.newAcademicYear=''; 
      this.newQuestion=''; 
      this.newAnswer=''; 
      this.loadKnowledge(); 
    } catch(e){ alert('Failed'); } finally { this.isProcessing.set(false); }
  }

  async deleteData(id: number) {
    if(!confirm('ยืนยันการลบข้อมูลนี้?')) return;
    try { await firstValueFrom(this.http.delete(`${this.apiUrl}/delete-data/${id}`)); this.loadKnowledge(); } catch(e){ alert('Failed'); }
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    this.uploadStatus.set('idle');
    this.uploadMessage.set('');
  }

  async uploadPDF() {
    if (!this.selectedFile) return;
    this.uploadStatus.set('uploading');
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('academic_year', this.uploadAcademicYear);

    try {
      const res = await firstValueFrom(this.http.post<UploadResponse>(`${this.apiUrl}/upload-pdf`, formData));
      this.uploadStatus.set('success');
      this.uploadMessage.set(res.message);
      this.selectedFile = null;
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      this.loadKnowledge();
    } catch (err: any) {
      this.uploadStatus.set('error');
      this.uploadMessage.set(err.error?.message || err.error?.error || 'เกิดข้อผิดพลาดในการอัปโหลด');
    }
  }

  // ==========================================
  // --- Three.JS 3D Viewer Implementation ---
  // ==========================================

  private loadThreeJsScripts(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof THREE !== 'undefined') { resolve(); return; }
      const threeScript = document.createElement('script');
      threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      threeScript.onload = () => {
        const gltfScript = document.createElement('script');
        gltfScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
        const dracoScript = document.createElement('script');
        dracoScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js';
        const orbitScript = document.createElement('script');
        orbitScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';

        gltfScript.onload = () => { document.head.appendChild(dracoScript); };
        dracoScript.onload = () => { document.head.appendChild(orbitScript); };
        orbitScript.onload = () => resolve();
        document.head.appendChild(gltfScript);
      };
      document.head.appendChild(threeScript);
    });
  }

  private initThreeJs() {
    this.clock = new THREE.Clock();

    const container = this.rendererContainer.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.background = null; 

    this.camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 1.5, 7);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(5, 5, 5);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x818cf8, 0.5);
    dirLight2.position.set(-5, 2, -5);
    this.scene.add(dirLight2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = Math.PI / 2.5;
    this.controls.maxPolarAngle = Math.PI / 2;
    
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    
    this.animate();
  }

  private loadModel(url: string) {
    this.isModelLoading.set(true);

    if (this.model) {
      this.scene.remove(this.model);
    }

    const loader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      url,
      (gltf: any) => {
        const newModel = gltf.scene;
        
        const box = new THREE.Box3().setFromObject(newModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        newModel.position.x = -center.x;
        newModel.position.y = -center.y;
        newModel.position.z = -center.z;

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const targetSize = 2.5; 
          const scale = targetSize / maxDim;
          newModel.scale.set(scale, scale, scale);
          newModel.position.multiplyScalar(scale);
        }

        newModel.position.y -= 0.2;

        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.scene.add(newModel);
        this.model = newModel;
        
        if (gltf.animations && gltf.animations.length > 0) {
           this.mixer = new THREE.AnimationMixer(newModel);
           
           this.idleAction = this.mixer.clipAction(gltf.animations[0]);
           
           if (gltf.animations.length > 1) {
             this.talkAction = this.mixer.clipAction(gltf.animations[1]); 
           } else {
             this.talkAction = this.idleAction;
           }
        }

        this.isModelLoading.set(false);
      },
      undefined,
      (error: any) => {
        console.error('ThreeJS Load Error:', error);
        this.isModelLoading.set(false);
      }
    );
  }

  onGlbFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.glb')) {
      const fileUrl = URL.createObjectURL(file);
      this.loadModel(fileUrl);
    }
  }

  private onWindowResize() {
    if (!this.camera || !this.renderer || !this.rendererContainer) return;
    const container = this.rendererContainer.nativeElement;
    if (container.clientWidth === 0) return;
    
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    
    if (this.controls) this.controls.update();

    if (this.mixer && this.clock) {
        const delta = this.clock.getDelta();
        this.mixer.update(delta);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}