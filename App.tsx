import React, { useState, useEffect } from 'react';
import { UserPreferences, YogaSequence } from './types';
import { generateYogaSequence } from './services/gemini';
import { YogaForm } from './components/YogaForm';
import { SequenceDisplay } from './components/SequenceDisplay';
import { Flower, Key, ExternalLink, ArrowRight } from 'lucide-react';

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [sequence, setSequence] = useState<YogaSequence | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      // Check if the AIStudio wrapper is injected (e.g. in the preview environment)
      if (window.aistudio?.hasSelectedApiKey) {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } catch (e) {
          console.error("Error checking API key:", e);
          // Fallback to true if checking fails, let the API call fail if invalid
          setHasApiKey(true);
        }
      } else {
        // Fallback for environments without the wrapper (e.g. local dev).
        // In production/preview, the wrapper is required for billing.
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        // Assume success to avoid race conditions
        setHasApiKey(true);
      } catch (e) {
        console.error("Error selecting API key:", e);
      }
    }
  };

  const handleFormSubmit = async (prefs: UserPreferences) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateYogaSequence(prefs);
      setSequence(result);
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("Requested entity was not found")) {
        // Reset key selection if we get a specific 404/auth related error
        setHasApiKey(false);
        setError("API Key session expired or invalid. Please select your key again.");
      } else {
        setError("We encountered an issue connecting to the AI Therapist. Please check your connection and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSequence(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-sage-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-sage-100">
          <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8 text-sage-600" />
          </div>
          <h1 className="text-2xl font-serif text-sage-900 mb-4">Connect API Key</h1>
          <p className="text-stone-600 mb-8 leading-relaxed">
            To generate personalized sequences and photorealistic visualizations with Gemini 3 Pro, please select a paid Google Cloud Project API key.
          </p>
          
          <button
            onClick={handleSelectApiKey}
            className="w-full py-3 px-6 bg-sage-700 text-white rounded-xl font-medium shadow-lg hover:bg-sage-800 transition-all flex items-center justify-center mb-6"
          >
            Select API Key
            <ArrowRight className="ml-2 w-4 h-4" />
          </button>

          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-sage-500 hover:text-sage-700 flex items-center justify-center underline decoration-sage-300 underline-offset-4"
          >
            Learn about billing requirements
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sage-50 pb-20">
      
      {/* Navigation / Header */}
      <nav className="bg-white border-b border-sage-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Flower className="h-8 w-8 text-sage-600 mr-2" />
              <span className="font-serif text-xl font-medium text-sage-900">TheraFlow Yoga</span>
            </div>
            <div className="flex items-center text-sm text-sage-500 font-medium">
               AI-Powered Therapy
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {error && (
          <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded-md animate-fadeIn">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
                {error.includes("API Key") && (
                   <button onClick={handleSelectApiKey} className="mt-2 text-xs font-bold text-red-700 underline">
                     Reselect API Key
                   </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!sequence ? (
          <div className="animate-fade-in-up">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-serif text-sage-900 mb-4">Therapeutic Yoga, Tailored for You</h1>
              <p className="text-lg text-stone-600 max-w-2xl mx-auto">
                Generate professional-grade, trauma-informed yoga sequences based on your specific injuries, time constraints, and therapeutic goals.
              </p>
            </div>
            <YogaForm onSubmit={handleFormSubmit} isLoading={isLoading} />
            
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-center px-4">
               <div className="p-6">
                 <div className="w-12 h-12 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4 text-sage-600 font-bold text-xl">1</div>
                 <h3 className="font-semibold text-lg mb-2">Define Constraints</h3>
                 <p className="text-stone-500 text-sm">Input injuries, pain points, or energy levels. Safety is our algorithm's #1 priority.</p>
               </div>
               <div className="p-6">
                 <div className="w-12 h-12 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4 text-sage-600 font-bold text-xl">2</div>
                 <h3 className="font-semibold text-lg mb-2">AI Generation</h3>
                 <p className="text-stone-500 text-sm">Powered by Gemini 3, we create a structured flow with warm-ups, peaks, and cooldowns.</p>
               </div>
               <div className="p-6">
                 <div className="w-12 h-12 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4 text-sage-600 font-bold text-xl">3</div>
                 <h3 className="font-semibold text-lg mb-2">Practice Safely</h3>
                 <p className="text-stone-500 text-sm">Follow step-by-step instructions with custom modifications for your specific body.</p>
               </div>
            </div>
          </div>
        ) : (
          <SequenceDisplay sequence={sequence} onReset={handleReset} onApiKeyChange={handleSelectApiKey} />
        )}
      </main>
    </div>
  );
};

export default App;