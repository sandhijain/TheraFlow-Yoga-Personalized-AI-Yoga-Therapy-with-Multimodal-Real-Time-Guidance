import { GoogleGenAI, Type, Modality, LiveServerMessage, FunctionDeclaration } from "@google/genai";
import { UserPreferences, YogaSequence } from "../types";

// Define the schema using the SDK's Type enum
const poseSchema = {
  type: Type.OBJECT,
  properties: {
    sanskrit_name: { 
      type: Type.STRING,
      description: "The pose's Sanskrit name (e.g., Balasana)."
    },
    english_name: { 
      type: Type.STRING, 
      description: "The pose's common English name (e.g., Child's Pose)."
    },
    duration_seconds: { 
      type: Type.INTEGER,
      description: "The time to hold the pose in seconds."
    },
    instructions: { 
      type: Type.STRING,
      description: "Clear, concise verbal cues and alignment instructions."
    },
    modification: { 
      type: Type.STRING,
      description: "A specific, therapeutic modification based on the user's contraindications."
    },
    focus: { 
      type: Type.STRING,
      description: "The primary therapeutic purpose of this pose."
    },
  },
  required: ["sanskrit_name", "english_name", "duration_seconds", "instructions", "modification", "focus"],
};

const sequenceSchema = {
  type: Type.OBJECT,
  properties: {
    sequence_title: { 
      type: Type.STRING,
      description: "A descriptive title for the generated yoga flow."
    },
    total_duration_minutes: { 
      type: Type.INTEGER,
      description: "The total duration of the sequence in minutes."
    },
    poses: { 
      type: Type.ARRAY, 
      items: poseSchema,
      description: "An ordered array of yoga poses."
    },
  },
  required: ["sequence_title", "total_duration_minutes", "poses"],
};

// Helper to decode base64 string to Uint8Array
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const generateYogaSequence = async (prefs: UserPreferences): Promise<YogaSequence> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an expert Certified Yoga Therapist (C-IAYT) specializing in trauma-informed and therapeutic sequencing.
    Your highest priority is user safety. You must generate a yoga sequence that addresses all user constraints and goals.

    CORE SAFETY RULES:
    1. Contraindication Override: If the user mentions pain or injury, you MUST prioritize safety over the goal. Exclude poses that could worsen the condition.
    2. Time Constraint: The sum of the 'duration_seconds' for all poses must approximately equal the 'total_duration_minutes' requested by the user.
    3. Modification Requirement: Every pose MUST include a specific safety modification in the 'modification' field tailored to the user's specific stated injury. If no injury is mentioned, provide a general comfort modification.
  `;

  const prompt = `
    Create a therapeutic yoga sequence with the following parameters:
    - User Goal: ${prefs.goal}
    - Injuries/Conditions: ${prefs.injuries || "None reported"}
    - Experience Level: ${prefs.experienceLevel}
    - Total Duration: ${prefs.durationMinutes} minutes

    Ensure the sequence flows logically (warm-up, peak, cool-down) and strictly adheres to safety guidelines for the listed injuries.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: sequenceSchema,
        temperature: 0.2, // Low temperature for consistent, safe outputs
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text received from Gemini.");
    }

    return JSON.parse(text) as YogaSequence;
  } catch (error) {
    console.error("Error generating sequence:", error);
    throw error;
  }
};

export const generatePoseImage = async (
  englishName: string, 
  modification: string, 
  size: '1K' | '2K' | '4K' = '1K'
): Promise<string | null> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  // Constructed prompt based on user request requirements
  const prompt = `Serene, soft-focus, realistic photograph of a yoga practitioner (neutral gender/age) on a simple wooden floor with warm, diffused natural light. The practitioner is performing the yoga pose: ${englishName}. Important safety modification visible: ${modification}.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "4:3",
          imageSize: size
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating pose image:", error);
    throw error;
  }
};

export const generatePoseVideo = async (
  englishName: string, 
  modification: string,
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string | null> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Serene, soft-focus, realistic video of a yoga practitioner performing the yoga pose: ${englishName}. Important safety modification visible: ${modification}. The setting is a simple wooden floor with warm, diffused natural light.`;

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio
      }
    });

    // Poll until the operation is done
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (videoUri) {
      // Append key to URL as per requirement
      return `${videoUri}&key=${apiKey}`;
    }
    return null;
  } catch (error) {
    console.error("Error generating pose video:", error);
    throw error;
  }
};

export const generatePoseAudio = async (text: string): Promise<Uint8Array | null> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: `Speak in a slow, soothing, and therapeutic tone suitable for yoga instruction: ${text}` }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, calming voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64ToUint8Array(base64Audio);
    }
    return null;
  } catch (error) {
    console.error("Error generating pose audio:", error);
    throw error;
  }
};

export const analyzePoseForm = async (
  imageBase64: string,
  poseName: string,
  instructions: string,
  modification: string
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  // Remove data URL prefix if present to get pure base64
  const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  const prompt = `
    You are an expert yoga therapist with a keen eye for safety and alignment.
    Analyze this image of a user attempting to do the pose: "${poseName}".
    
    Context provided to user:
    - Instructions: "${instructions}"
    - Required Modification: "${modification}"
    
    Please provide brief, supportive, and safety-focused feedback (max 3 sentences):
    1. Is their general alignment correct based on the pose?
    2. Are they applying the safety modification?
    3. Is there any immediate risk of injury visible?
    
    Start with "Observation:"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: "image/png" // Assuming canvas export is png
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || "Could not analyze the image. Please try again with better lighting.";
  } catch (error) {
    console.error("Error analyzing pose form:", error);
    throw error;
  }
};

// --- Live API Integration ---

export const connectToYogaSession = async (
  sequence: YogaSequence,
  callbacks: {
    onOpen: () => void;
    onMessage: (message: LiveServerMessage) => void;
    onClose: () => void;
    onError: (e: ErrorEvent) => void;
  }
) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  const setPoseIndexTool: FunctionDeclaration = {
    name: "setPoseIndex",
    description: "Move the user to a specific pose in the sequence. Call this when the user says 'Next', 'Previous', or asks to move to a specific step.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        index: {
          type: Type.INTEGER,
          description: "The 0-based index of the pose to move to."
        }
      },
      required: ["index"]
    }
  };

  const systemPrompt = `
    You are a Live Yoga Instructor named "TheraFlow AI".
    You are guiding a student through a therapeutic sequence.
    
    Sequence Plan:
    ${sequence.poses.map((p, i) => `${i}. ${p.english_name}. Mod: ${p.modification}`).join('\n')}

    CRITICAL INSTRUCTIONS FOR COMPUTER VISION:
    1. You are receiving a continuous stream of images from the user's camera.
    2. If the user asks "Check my form", "Am I doing this right?", or "How does this look?", you MUST immediately analyze the latest image you received.
    3. Provide specific, corrective feedback based on the CURRENT POSE. E.g., "Lift your chest higher," or "Keep that knee bent."
    4. If the user is doing the pose correctly, give positive reinforcement.

    GENERAL INTERACTION:
    - Be concise. The user is holding a pose.
    - If they say "Next", use the 'setPoseIndex' tool to move forward.
    - Keep your tone soothing but authoritative on safety.
  `;

  return await ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-09-2025",
    callbacks: {
      onopen: callbacks.onOpen,
      onmessage: callbacks.onMessage,
      onclose: () => callbacks.onClose(),
      onerror: callbacks.onError,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: [setPoseIndexTool] }],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } // Gentle voice
      }
    }
  });
};