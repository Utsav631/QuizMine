import { strict_output } from "@/lib/gpt";
import { getAuthSession } from "@/lib/nextauth";
import { getQuestionsSchema } from "@/schemas/questions";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const maxDuration = 500;

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    // Optional: Uncomment to enforce auth
    // if (!session?.user) {
    //   return NextResponse.json(
    //     { error: "You must be logged in to create a game." },
    //     { status: 401 }
    //   );
    // }

    const body = await req.json();
    const { amount, topic, type } = getQuestionsSchema.parse(body);

    if (amount > 10) {
      return NextResponse.json(
        { error: "You can request up to 10 questions at a time." },
        { status: 400 }
      );
    }

    let questions: any;

    try {
      const baseSystemPrompt = `
You are a helpful AI. 
Respond ONLY in valid JSON. 
Do not include explanations, markdown, or extra text.
Return exactly the structure requested. No deviations.
`;

      if (type === "open_ended") {
        questions = await strict_output(
          baseSystemPrompt + `
Generate hard open-ended questions about ${topic}.
Each answer must be max 15 words.
`,
          new Array(amount).fill(
            `Generate a random hard open-ended question about ${topic}`
          ),
          {
            question: "question",
            answer: "answer with max length of 15 words",
          }
        );
      } else if (type === "mcq") {
        questions = await strict_output(
          baseSystemPrompt + `
Generate hard MCQ questions about ${topic}.
Each option and answer must be max 15 words.
`,
          new Array(amount).fill(
            `Generate a random hard MCQ question about ${topic}`
          ),
          {
            question: "question",
            answer: "answer with max length of 15 words",
            option1: "option1 with max length of 15 words",
            option2: "option2 with max length of 15 words",
            option3: "option3 with max length of 15 words",
          }
        );
      }
    } catch (err: any) {
      console.error("strict_output failed:");
      console.error("Error message:", err.message);
      console.error("Full error:", err);

      // Safer fallback: Return empty array to avoid frontend crash
      return NextResponse.json(
        { questions: [], error: "AI generation failed. Check server logs." },
        { status: 200 }
      );
    }

    return NextResponse.json({ questions }, { status: 200 });

  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues },
        { status: 400 }
      );
    } else {
      console.error("Unexpected server error:", JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: "An unexpected error occurred." },
        { status: 500 }
      );
    }
  }
}
