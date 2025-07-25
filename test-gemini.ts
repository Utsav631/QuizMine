import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("❌ GEMINI_API_KEY is missing in .env file.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Say hello world" }] }],
    });

    const response = result.response;
    console.log("Gemini API is working ✅");
    console.log(response.text());
  } catch (error: any) {
    console.error("Gemini API error ❌");
    console.error(error);
  }
}

run();
