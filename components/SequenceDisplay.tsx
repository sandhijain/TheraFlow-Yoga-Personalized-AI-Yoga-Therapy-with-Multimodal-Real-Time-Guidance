import React, { useState, useRef, useEffect } from 'react';
import { YogaSequence, Pose } from '../types';
import { Timer, AlertCircle, Sparkles, Download, RefreshCw, Image as ImageIcon, Loader2, Video, Key, Settings2, Volume2, Square, Camera, X, CheckCircle, Radio } from 'lucide-react';
import { generatePoseImage, generatePoseVideo, generatePoseAudio, analyzePoseForm } from '../services/gemini';
import { LiveYogaSession } from './LiveYogaSession';

// Helper to decode raw PCM audio data from Gemini TTS
// The model returns raw PCM (Int16), which needs to be converted to AudioBuffer (Float32)
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface SequenceDisplayProps {
  sequence: YogaSequence;
  onReset: () => void;
  onApiKeyChange: () => void;
}

export const SequenceDisplay: React.FC<SequenceDisplayProps> = ({ sequence, onReset, onApiKeyChange }) => {
  const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
    if (mins > 0) return `${mins} min`;
    return `${secs} sec`;
  };

  if (isLiveSessionActive) {
    return (
      <LiveYogaSession 
        sequence={sequence} 
        onClose={() => setIsLiveSessionActive(false)} 
      />
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto animate-fadeIn">
      
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-serif text-sage-900 mb-2">{sequence.sequence_title}</h1>
        <div className="flex items-center justify-center space-x-4 text-sage-600 mb-6">
          <span className="flex items-center bg-white px-3 py-1 rounded-full shadow-sm border border-sage-100">
            <Timer className="w-4 h-4 mr-2" />
            {sequence.total_duration_minutes} Minutes
          </span>
          <span className="flex items-center bg-white px-3 py-1 rounded-full shadow-sm border border-sage-100">
            <Sparkles className="w-4 h-4 mr-2" />
            {sequence.poses.length} Poses
          </span>
        </div>

        {/* Live Session CTA */}
        <button 
          onClick={() => setIsLiveSessionActive(true)}
          className="group relative inline-flex items-center justify-center px-8 py-4 bg-stone-900 text-white font-semibold rounded-full shadow-xl hover:bg-stone-800 transition-all transform hover:-translate-y-1 overflow-hidden"
        >
           <span className="absolute w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
           <Radio className="w-5 h-5 mr-3 text-red-500 animate-pulse" />
           Start Hands-Free Live Session
        </button>
        <p className="mt-3 text-sm text-stone-500">
          Voice-controlled guidance with real-time form correction.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative border-l-2 border-sage-200 ml-4 sm:ml-8 space-y-12 pb-12">
        {sequence.poses.map((pose, index) => (
          <PoseCard key={index} pose={pose} index={index} formatTime={formatTime} onApiKeyChange={onApiKeyChange} />
        ))}
      </div>

      {/* Actions */}
      <div className="sticky bottom-8 flex justify-center space-x-4 z-20">
        <button 
          onClick={onReset}
          className="flex items-center px-6 py-3 bg-white text-sage-700 font-medium rounded-full shadow-lg border border-sage-200 hover:bg-sage-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          New Sequence
        </button>
        <button 
          onClick={() => window.print()}
          className="flex items-center px-6 py-3 bg-sage-700 text-white font-medium rounded-full shadow-lg hover:bg-sage-800 transition-colors"
        >
          <Download className="w-4 h-4 mr-2" />
          Save / Print
        </button>
      </div>
    </div>
  );
};

interface PoseCardProps {
  pose: Pose;
  index: number;
  formatTime: (s: number) => string;
  onApiKeyChange: () => void;
}

const PoseCard: React.FC<PoseCardProps> = ({ pose, index, formatTime, onApiKeyChange }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(pose.imageUrl || null);
  const [videoUrl, setVideoUrl] = useState<string | null>(pose.videoUrl || null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showKeyButton, setShowKeyButton] = useState(false);
  
  // Audio State
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Form Analysis (Camera) State
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Generation Settings
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      stopCamera();
    };
  }, []);

  const handleError = (error: any, type: 'image' | 'video' | 'audio' | 'analysis') => {
    const msg = error.message || String(error);
    if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
      setGenerationError(`Access denied: Your API key doesn't support ${type}.`);
      setShowKeyButton(true);
    } else if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      setGenerationError(`Model unavailable: Please verify your API key access.`);
      setShowKeyButton(true);
    } else {
      setGenerationError(`Unable to process ${type}. Please try again.`);
      setShowKeyButton(false);
    }
  };

  const handleGenerateImage = async () => {
    setGenerationError(null);
    setShowKeyButton(false);
    setIsGeneratingImage(true);
    try {
      const url = await generatePoseImage(pose.english_name, pose.modification, imageSize);
      if (url) {
        setImageUrl(url);
      } else {
        throw new Error("No image data returned");
      }
    } catch (e) {
      handleError(e, 'image');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    setGenerationError(null);
    setShowKeyButton(false);
    setIsGeneratingVideo(true);
    try {
      const url = await generatePoseVideo(pose.english_name, pose.modification, videoAspectRatio);
      if (url) {
        setVideoUrl(url);
      } else {
        throw new Error("No video URL returned");
      }
    } catch (e) {
      handleError(e, 'video');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleToggleAudio = async () => {
    setGenerationError(null);
    setShowKeyButton(false);

    // Stop if currently playing
    if (isPlayingAudio) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      setIsPlayingAudio(false);
      return;
    }

    // Initialize Audio Context on user interaction
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    }
    
    // Ensure context is running (sometimes suspended by browser)
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    let currentAudioData = audioData;

    // Fetch if not cached
    if (!currentAudioData) {
      setIsGeneratingAudio(true);
      try {
        const textToSpeak = `${pose.english_name}. ${pose.instructions} ${pose.modification ? `Modification: ${pose.modification}` : ''}`;
        currentAudioData = await generatePoseAudio(textToSpeak);
        if (currentAudioData) {
          setAudioData(currentAudioData);
        } else {
          throw new Error("No audio returned");
        }
      } catch (e) {
        handleError(e, 'audio');
        setIsGeneratingAudio(false);
        return;
      } finally {
        setIsGeneratingAudio(false);
      }
    }

    // Play Audio
    if (currentAudioData && audioContextRef.current) {
      try {
        const buffer = await decodeAudioData(currentAudioData, audioContextRef.current);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        
        source.onended = () => {
          setIsPlayingAudio(false);
          sourceNodeRef.current = null;
        };

        sourceNodeRef.current = source;
        source.start();
        setIsPlayingAudio(true);
      } catch (e) {
        console.error("Audio decoding error:", e);
        setGenerationError("Failed to play audio.");
      }
    }
  };

  // --- Camera & Analysis Logic ---
  const startCamera = async () => {
    setGenerationError(null);
    setAnalysisResult(null);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setGenerationError("Could not access camera. Please allow permissions.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const handleCaptureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    // Draw current frame to canvas
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL('image/png');
    
    // Stop camera immediately after capture to be nice
    stopCamera();

    setIsAnalyzing(true);
    try {
      const feedback = await analyzePoseForm(
        imageBase64, 
        pose.english_name, 
        pose.instructions, 
        pose.modification
      );
      setAnalysisResult(feedback);
    } catch (e) {
      handleError(e, 'analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="relative pl-8 sm:pl-12">
      {/* Timeline Dot */}
      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-sage-500 ring-4 ring-sage-50" />
      
      <div className="bg-white rounded-xl p-6 shadow-sm border border-sage-100 hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start mb-4 gap-2">
          <div>
            <div className="text-sm font-bold text-sage-500 uppercase tracking-wider mb-1">Step {index + 1}</div>
            <h3 className="text-xl font-serif font-medium text-stone-800">{pose.english_name}</h3>
            <p className="text-stone-500 italic font-serif">{pose.sanskrit_name}</p>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row gap-2">
             <span className="inline-flex items-center px-3 py-1 rounded-lg bg-sage-100 text-sage-700 font-medium text-sm">
               <Timer className="w-4 h-4 mr-1.5" />
               {formatTime(pose.duration_seconds)}
             </span>
             
             {/* Audio Playback Button */}
             <button
                onClick={handleToggleAudio}
                disabled={isGeneratingAudio || isGeneratingImage || isGeneratingVideo || showCamera}
                className={`inline-flex items-center px-3 py-1 rounded-lg font-medium text-sm transition-colors border ${
                  isPlayingAudio
                    ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
             >
                {isGeneratingAudio ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : isPlayingAudio ? (
                  <Square className="w-4 h-4 mr-1.5 fill-current" />
                ) : (
                  <Volume2 className="w-4 h-4 mr-1.5" />
                )}
                {isGeneratingAudio ? 'Loading...' : isPlayingAudio ? 'Stop' : 'Listen'}
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div>
            <h4 className="font-semibold text-stone-700 mb-2">Instructions</h4>
            <p className="text-stone-600 leading-relaxed text-sm mb-4">{pose.instructions}</p>
            
            {/* Form Correction / Analysis Result */}
            {analysisResult && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg animate-fadeIn">
                <h4 className="flex items-center text-blue-800 font-semibold mb-2">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Form Analysis
                </h4>
                <p className="text-sm text-blue-700 whitespace-pre-wrap leading-relaxed">{analysisResult}</p>
                <button 
                  onClick={() => setAnalysisResult(null)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Clear Analysis
                </button>
              </div>
            )}

            {/* Camera View */}
            {showCamera && (
              <div className="mb-4 relative rounded-lg overflow-hidden bg-black border border-stone-300">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto aspect-video object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                  <button 
                    onClick={stopCamera}
                    className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-sm transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={handleCaptureAndAnalyze}
                    className="px-6 py-2 bg-sage-600 hover:bg-sage-500 text-white rounded-full font-medium shadow-lg transition-colors flex items-center"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Capture & Analyze
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 mb-4">
              
              {/* Check Form Button */}
              {!showCamera && !isAnalyzing && !analysisResult && (
                <button
                  onClick={startCamera}
                  disabled={isGeneratingImage || isGeneratingVideo || isPlayingAudio}
                  className="w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Check My Form
                </button>
              )}
              
              {isAnalyzing && (
                 <div className="w-full flex items-center justify-center px-4 py-3 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg border border-blue-100">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing posture with Gemini 2.5...
                 </div>
              )}

              {/* Image Generation Control */}
              {!imageUrl && !showCamera && (
                <div className="p-3 bg-sage-50/50 rounded-lg border border-sage-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-sage-600 uppercase tracking-wider">Image Quality</span>
                    <div className="flex bg-white rounded-md border border-sage-200 p-0.5">
                      {(['1K', '2K', '4K'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => setImageSize(size)}
                          disabled={isGeneratingImage || isGeneratingVideo || isPlayingAudio}
                          className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                            imageSize === size 
                            ? 'bg-sage-600 text-white shadow-sm' 
                            : 'text-sage-600 hover:bg-sage-50'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || isGeneratingVideo || isPlayingAudio}
                    className="w-full inline-flex items-center justify-center px-3 py-2 bg-white text-sage-700 text-sm font-medium rounded-lg border border-sage-200 hover:bg-sage-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating {imageSize}...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Generate Image
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Video Generation Control */}
              {!videoUrl && !showCamera && (
                <div className="p-3 bg-stone-50/50 rounded-lg border border-stone-100">
                   <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Video Format</span>
                    <div className="flex bg-white rounded-md border border-stone-200 p-0.5">
                      <button
                        onClick={() => setVideoAspectRatio('16:9')}
                        disabled={isGeneratingImage || isGeneratingVideo || isPlayingAudio}
                        className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                          videoAspectRatio === '16:9' 
                          ? 'bg-stone-700 text-white shadow-sm' 
                          : 'text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        Landscape
                      </button>
                      <button
                        onClick={() => setVideoAspectRatio('9:16')}
                        disabled={isGeneratingImage || isGeneratingVideo || isPlayingAudio}
                        className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                          videoAspectRatio === '9:16' 
                          ? 'bg-stone-700 text-white shadow-sm' 
                          : 'text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        Portrait
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerateVideo}
                    disabled={isGeneratingImage || isGeneratingVideo || isPlayingAudio}
                    className="w-full inline-flex items-center justify-center px-3 py-2 bg-white text-stone-700 text-sm font-medium rounded-lg border border-stone-200 hover:bg-stone-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isGeneratingVideo ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Video (~1m)...
                      </>
                    ) : (
                      <>
                        <Video className="w-4 h-4 mr-2" />
                        Generate Video
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {generationError && (
              <div className="mb-4 text-xs">
                <span className="text-red-500 flex items-center mb-2">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {generationError}
                </span>
                {showKeyButton && (
                  <button 
                    onClick={onApiKeyChange}
                    className="flex items-center text-sage-600 font-semibold underline hover:text-sage-800"
                  >
                    <Key className="w-3 h-3 mr-1" />
                    Update API Key
                  </button>
                )}
              </div>
            )}
            
            {imageUrl && !showCamera && (
              <div className="mb-4 rounded-lg overflow-hidden border border-sage-100 shadow-sm animate-fadeIn relative group">
                <img src={imageUrl} alt={pose.english_name} className="w-full h-auto object-cover" />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white text-xs px-2 py-1 rounded">
                   Generated by Gemini ({imageSize})
                </div>
              </div>
            )}

            {videoUrl && !showCamera && (
               <div className={`mb-4 rounded-lg overflow-hidden border border-sage-100 shadow-sm animate-fadeIn relative ${videoAspectRatio === '9:16' ? 'max-w-[200px] mx-auto' : ''}`}>
                  <video 
                    src={videoUrl} 
                    controls 
                    className="w-full h-auto"
                    poster={imageUrl || undefined}
                  />
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
                     Veo Video ({videoAspectRatio})
                  </div>
               </div>
            )}
          </div>
          
          <div className="space-y-4">
             <div className="bg-sage-50 rounded-lg p-3 border border-sage-100">
                <h4 className="font-semibold text-sage-700 text-sm mb-1 flex items-center">
                   <Sparkles className="w-3 h-3 mr-1.5" />
                   Therapeutic Focus
                </h4>
                <p className="text-sage-800 text-sm">{pose.focus}</p>
             </div>

             <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <h4 className="font-semibold text-amber-700 text-sm mb-1 flex items-center">
                   <AlertCircle className="w-3 h-3 mr-1.5" />
                   Safety Modification
                </h4>
                <p className="text-amber-800 text-sm font-medium">{pose.modification}</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
