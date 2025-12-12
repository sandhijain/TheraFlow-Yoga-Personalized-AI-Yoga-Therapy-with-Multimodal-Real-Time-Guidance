import React, { useEffect, useRef, useState } from 'react';
import { YogaSequence } from '../types';
import { connectToYogaSession, base64ToUint8Array } from '../services/gemini';
import { Mic, X, Loader2, Volume2, Video as VideoIcon, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { LiveServerMessage } from '@google/genai';

interface LiveYogaSessionProps {
  sequence: YogaSequence;
  onClose: () => void;
}

// Decode helper specifically for Live API (24kHz standard)
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

// Encode helper for Audio Input (Float32 -> Int16 PCM Base64)
function createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  // Custom manual base64 encoding to avoid stack overflow on large arrays
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Helper to convert blob/canvas to base64 string
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // Remove data URL prefix
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const LiveYogaSession: React.FC<LiveYogaSessionProps> = ({ sequence, onClose }) => {
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<string>("Ready to Start");
  
  // Refs for Media & Audio
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // Store the session promise
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Cleanup refs
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const currentPose = sequence.poses[currentPoseIndex];

  // Initial Camera Setup for Preview
  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error("Camera permission error:", e);
        setStatus("Camera access required.");
      }
    }
    initCamera();

    return () => cleanup();
  }, []);

  // CRITICAL FIX: Re-attach stream when switching to Live View
  useEffect(() => {
    if (isSessionActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.error("Error playing video:", e));
    }
  }, [isSessionActive]);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
  };

  const handleStartSession = async () => {
    setIsSessionActive(true);
    setStatus("Connecting to AI...");

    try {
      // Initialize Audio Contexts after user gesture
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      // Explicitly resume contexts to prevent "suspended" state
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextRef.current = outputCtx;

      // Start Gemini Live Session
      const sessionPromise = connectToYogaSession(sequence, {
        onOpen: () => {
          setIsConnected(true);
          setStatus("Connected");
          
          // 1. Audio Input Pipeline
          if (streamRef.current) {
            const source = inputCtx.createMediaStreamSource(streamRef.current);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            source.connect(processor);
            processor.connect(inputCtx.destination);
          }

          // 2. Video Input Loop (Sending frames)
          // Increased rate to 500ms (2 FPS) for better responsiveness to "Check Form"
          frameIntervalRef.current = window.setInterval(() => {
            if (videoRef.current && canvasRef.current) {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Draw raw frame (not mirrored here, model wants raw)
                  ctx.drawImage(video, 0, 0);
                  canvas.toBlob(async (blob) => {
                    if (blob) {
                      const base64 = await blobToBase64(blob);
                      sessionPromise.then(session => 
                        session.sendRealtimeInput({ 
                          media: { 
                            mimeType: 'image/jpeg', 
                            data: base64 
                          } 
                        })
                      );
                    }
                  }, 'image/jpeg', 0.5); // Slightly lower quality for speed
                }
              }
            }
          }, 500); 
        },
        onMessage: async (msg: LiveServerMessage) => {
          // Handle Audio Output
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            setIsSpeaking(true);
            const ctx = audioContextRef.current!;
            // Ensure time sync
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            
            const buffer = await decodeAudioData(base64ToUint8Array(audioData), ctx);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) setIsSpeaking(false);
            });
            
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
          }

          // Handle Tool Calls (Voice Navigation)
          const toolCall = msg.toolCall;
          if (toolCall) {
             for (const fc of toolCall.functionCalls) {
               if (fc.name === 'setPoseIndex') {
                 const newIndex = Number(fc.args['index']);
                 if (!isNaN(newIndex) && newIndex >= 0 && newIndex < sequence.poses.length) {
                   setCurrentPoseIndex(newIndex);
                   sessionPromise.then(session => session.sendToolResponse({
                     functionResponses: {
                       id: fc.id,
                       name: fc.name,
                       response: { result: "OK, pose updated." }
                     }
                   }));
                 } else {
                    sessionPromise.then(session => session.sendToolResponse({
                     functionResponses: {
                       id: fc.id,
                       name: fc.name,
                       response: { result: "Error: Pose index out of bounds." }
                     }
                   }));
                 }
               }
             }
          }
        },
        onClose: () => {
          setIsConnected(false);
          setStatus("Session Ended");
        },
        onError: (e) => {
          console.error(e);
          setStatus("Connection Error");
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error(e);
      setStatus("Failed to start session.");
    }
  };

  if (!isSessionActive) {
     return (
        <div className="fixed inset-0 z-50 bg-sage-50 flex items-center justify-center p-4">
           <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl overflow-hidden border border-sage-100">
              <div className="relative bg-black aspect-video w-full">
                 <video 
                   ref={videoRef} 
                   autoPlay 
                   muted 
                   playsInline 
                   className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                 />
                 <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <p className="text-white font-medium drop-shadow-md">Camera Preview</p>
                 </div>
              </div>
              <div className="p-8 text-center">
                 <h2 className="text-2xl font-serif text-stone-900 mb-2">Ready for Hands-Free Yoga?</h2>
                 <p className="text-stone-600 mb-6">
                    Position your device so your full body is visible. The AI will watch your form and guide you via voice.
                 </p>
                 <div className="flex gap-4 justify-center">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors">
                       Cancel
                    </button>
                    <button onClick={handleStartSession} className="px-6 py-3 rounded-xl bg-sage-700 text-white font-semibold shadow-lg hover:bg-sage-800 transition-transform transform hover:-translate-y-0.5">
                       Start Session
                    </button>
                 </div>
              </div>
           </div>
        </div>
     );
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900 text-white flex flex-col md:flex-row">
      {/* Header (Top Overlay) */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
         <div className="flex items-center space-x-3 px-4">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-serif text-lg tracking-wide opacity-90">Live Studio</span>
         </div>
         <button 
           onClick={onClose}
           className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
         >
           <X className="w-6 h-6" />
         </button>
      </div>

      {/* --- Split Screen Layout --- */}

      {/* LEFT PANEL: Instructor / Info */}
      <div className="flex-1 flex flex-col justify-center px-8 md:px-12 py-20 bg-stone-900 border-b md:border-b-0 md:border-r border-white/10 relative overflow-y-auto">
         
         {/* Navigation Helper */}
         <div className="flex items-center justify-between mb-8 text-stone-400 text-sm font-semibold tracking-widest uppercase">
            <button 
              onClick={() => setCurrentPoseIndex(prev => Math.max(0, prev - 1))}
              disabled={currentPoseIndex === 0}
              className="hover:text-white disabled:opacity-30 transition-colors flex items-center"
            >
               <ArrowLeft className="w-4 h-4 mr-2" /> Prev
            </button>
            <span>Pose {currentPoseIndex + 1} / {sequence.poses.length}</span>
            <button 
              onClick={() => setCurrentPoseIndex(prev => Math.min(sequence.poses.length - 1, prev + 1))}
              disabled={currentPoseIndex === sequence.poses.length - 1}
              className="hover:text-white disabled:opacity-30 transition-colors flex items-center"
            >
               Next <ArrowRight className="w-4 h-4 ml-2" />
            </button>
         </div>

         {/* Main Typography */}
         <div className="mb-10 text-center md:text-left animate-fadeIn">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-4 leading-tight text-white">
               {currentPose.english_name}
            </h1>
            <p className="text-xl md:text-2xl text-sage-300 font-light italic mb-8">
               {currentPose.sanskrit_name}
            </p>
            
            <div className="space-y-6">
               <div className="flex items-start gap-4">
                  <Volume2 className="w-6 h-6 text-stone-500 shrink-0 mt-1" />
                  <p className="text-lg md:text-xl leading-relaxed text-stone-200">
                     {currentPose.instructions}
                  </p>
               </div>
               
               <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-900/20 border border-amber-500/30">
                  <CheckCircle className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
                  <div>
                     <span className="block text-amber-500 font-bold text-xs uppercase tracking-wide mb-1">Safety Mod</span>
                     <p className="text-base text-amber-100">
                        {currentPose.modification}
                     </p>
                  </div>
               </div>
            </div>
         </div>

         {/* Status Indicator */}
         <div className="mt-auto flex items-center justify-center md:justify-start gap-3">
             <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${isSpeaking ? 'bg-sage-500/20 border-sage-500 text-sage-200' : 'bg-stone-800 border-stone-700 text-stone-400'}`}>
                {isSpeaking ? <Volume2 className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
                <span className="text-sm font-medium">
                   {isSpeaking ? "Instructor Speaking..." : "Listening..."}
                </span>
             </div>
         </div>
      </div>

      {/* RIGHT PANEL: Mirror / Vision */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
         {/* The Mirror Feed */}
         <video 
           ref={videoRef} 
           autoPlay 
           muted 
           playsInline
           className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
         />
         <canvas ref={canvasRef} className="hidden" />
         
         {/* Live Vision Indicator */}
         <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 z-10">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="text-xs font-semibold tracking-wide text-white/90">LIVE VISION ACTIVE</span>
         </div>
         
         {/* Helper Overlay for User */}
         <div className="absolute bottom-8 text-center w-full px-4 pointer-events-none">
            <p className="text-white/70 text-sm font-medium drop-shadow-md bg-black/40 inline-block px-4 py-2 rounded-full backdrop-blur-sm">
               "TheraFlow, check my form."
            </p>
         </div>
      </div>

    </div>
  );
};