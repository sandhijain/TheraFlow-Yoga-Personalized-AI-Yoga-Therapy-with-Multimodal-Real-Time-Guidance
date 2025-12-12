import React, { useState } from 'react';
import { UserPreferences } from '../types';
import { Activity, Clock, ShieldAlert, Heart, ArrowRight } from 'lucide-react';

interface YogaFormProps {
  onSubmit: (prefs: UserPreferences) => void;
  isLoading: boolean;
}

export const YogaForm: React.FC<YogaFormProps> = ({ onSubmit, isLoading }) => {
  const [goal, setGoal] = useState('');
  const [injuries, setInjuries] = useState('');
  const [duration, setDuration] = useState(15);
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      goal: goal || 'General relaxation and mobility',
      injuries: injuries || 'None',
      durationMinutes: duration,
      experienceLevel: level,
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-sage-100">
      <div className="bg-sage-600 p-6 sm:p-8 text-white">
        <h2 className="text-2xl sm:text-3xl font-serif font-light mb-2">Design Your Practice</h2>
        <p className="text-sage-100">Tell us about your needs, and our AI Therapist will craft a safe, personalized sequence.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
        
        {/* Goal Section */}
        <div className="space-y-3">
          <label className="flex items-center text-lg font-medium text-sage-800">
            <Heart className="w-5 h-5 mr-2 text-sage-500" />
            Your Intention or Goal
          </label>
          <input
            type="text"
            className="w-full p-4 rounded-lg bg-sage-50 border border-sage-200 focus:border-sage-500 focus:ring-2 focus:ring-sage-200 transition-all outline-none"
            placeholder="e.g., Lower back relief, Better sleep, Morning energy..."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Injuries Section */}
        <div className="space-y-3">
          <label className="flex items-center text-lg font-medium text-sage-800">
            <ShieldAlert className="w-5 h-5 mr-2 text-amber-500" />
            Injuries or Pain Points
          </label>
          <textarea
            className="w-full p-4 rounded-lg bg-amber-50 border border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all outline-none min-h-[100px]"
            placeholder="e.g., Right knee sensitivity, recent shoulder surgery, chronic lumbar pain..."
            value={injuries}
            onChange={(e) => setInjuries(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-sm text-stone-500 italic">
            * We prioritize safety. Mentioning injuries will trigger specific modifications for every pose.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {/* Duration Section */}
          <div className="space-y-3">
            <label className="flex items-center text-lg font-medium text-sage-800">
              <Clock className="w-5 h-5 mr-2 text-sage-500" />
              Duration: <span className="ml-2 font-bold text-sage-700">{duration} min</span>
            </label>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full h-2 bg-sage-200 rounded-lg appearance-none cursor-pointer accent-sage-600"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-stone-400">
              <span>5m</span>
              <span>30m</span>
              <span>60m</span>
            </div>
          </div>

          {/* Level Section */}
          <div className="space-y-3">
            <label className="flex items-center text-lg font-medium text-sage-800">
              <Activity className="w-5 h-5 mr-2 text-sage-500" />
              Experience Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  disabled={isLoading}
                  className={`py-2 px-1 text-sm font-medium rounded-md transition-all ${
                    level === lvl
                      ? 'bg-sage-600 text-white shadow-md'
                      : 'bg-sage-50 text-sage-700 hover:bg-sage-100'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-lg flex items-center justify-center transition-all ${
              isLoading
                ? 'bg-sage-300 cursor-not-allowed text-white'
                : 'bg-stone-800 text-white hover:bg-stone-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generative Sequence...
              </>
            ) : (
              <>
                Generate Therapy Sequence
                <ArrowRight className="ml-2 w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};