import { GoogleGenerativeAI } from '@google/generative-ai';
import { doc, increment, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';

interface GeminiUsageParams {
    firestore: Firestore;
    restaurantId: string;
    prompt: string;
    model?: string;
    apiKey?: string;
}

interface GeminiUsageResult {
    text: string;
    model: string;
}

/**
 * Wrap Gemini generation and atomically increment ai_credits_used
 * in restaurants/{restaurantId}/usage/ai_credits_used.
 */
export async function generateGeminiWithUsage(params: GeminiUsageParams): Promise<GeminiUsageResult> {
    const apiKey = params.apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key is missing.');

    const modelName = params.model || 'gemini-2.0-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(params.prompt);
    const text = result.response.text();

    if (text && text.trim().length > 0) {
        const usageRef = doc(params.firestore, 'restaurants', params.restaurantId, 'usage', 'ai_credits_used');
        await setDoc(
            usageRef,
            {
                ai_credits_used: increment(1),
                last_used_at: serverTimestamp(),
                last_model: modelName,
            },
            { merge: true },
        );
    }

    return {
        text,
        model: modelName,
    };
}
