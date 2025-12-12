export interface Pose {
  sanskrit_name: string;
  english_name: string;
  duration_seconds: number;
  instructions: string;
  modification: string;
  focus: string;
  imageUrl?: string;
  videoUrl?: string;
}

export interface YogaSequence {
  sequence_title: string;
  total_duration_minutes: number;
  poses: Pose[];
}

export interface UserPreferences {
  goal: string;
  injuries: string;
  durationMinutes: number;
  experienceLevel: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface LiveConfig {
  sequence: YogaSequence;
  onPoseChange: (index: number) => void;
  onClose: () => void;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}