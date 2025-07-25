import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface OutputFormat {
  [key: string]: string | string[] | OutputFormat;
}

export async function strict_output(
  system_prompt: string,
  user_prompt: string | string[],
  output_format: OutputFormat,
  default_category: string = "",
  output_value_only: boolean = false,
  model: string = "gemini-1.5-flash", // Use latest supported model
  temperature: number = 0,
  num_tries: number = 3,
  verbose: boolean = false
): Promise<
  {
    question: string;
    answer: string;
    option1?: string;
    option2?: string;
    option3?: string;
  }[]
> {
  const list_input = Array.isArray(user_prompt);
  const dynamic_elements = /<.*?>/.test(JSON.stringify(output_format));
  const list_output = /\[.*?\]/.test(JSON.stringify(output_format));

  let lastErrorMessage = "";

  const modelInstance = genAI.getGenerativeModel({ model });

  for (let i = 0; i < num_tries; i++) {
    let output_format_prompt = `
Respond ONLY in strict JSON matching this structure:
${JSON.stringify(output_format)}.
Do not add extra text. No markdown. No escape characters.`.trim();

    if (list_output) {
      output_format_prompt += `\nIf any field is a list, pick the best matching element.`;
    }

    if (dynamic_elements) {
      output_format_prompt += `\nAny < > text must be dynamically generated. Example: '<location>' => 'garden'.`;
    }

    if (list_input) {
      output_format_prompt += `\nGenerate a list of JSON objects, one per input.`;
    }

    const userPromptString = list_input ? user_prompt.join("\n") : user_prompt.toString();
    const fullPrompt = `${system_prompt}\n${output_format_prompt}\n${lastErrorMessage}\n${userPromptString}`;

    try {
      const result = await modelInstance.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: { temperature },
      });

      const rawResponse = result.response.text();

      let res = rawResponse.replace(/'/g, '"').replace(/(\w)"(\w)/g, "$1'$2");

      if (verbose) {
        console.log("Full prompt:\n", fullPrompt);
        console.log("Gemini raw response:\n", res);
      }

      let output: any = JSON.parse(res);

      if (list_input && !Array.isArray(output)) {
        throw new Error("Expected a list of JSON objects but got non-list output.");
      }

      if (!list_input) {
        output = [output];
      }

      for (let index = 0; index < output.length; index++) {
        for (const key in output_format) {
          if (/<.*?>/.test(key)) continue; // skip dynamic keys

          if (!(key in output[index])) {
            throw new Error(`Missing key "${key}" at index ${index}`);
          }

          if (Array.isArray(output_format[key])) {
            const choices = output_format[key] as string[];

            if (Array.isArray(output[index][key])) {
              output[index][key] = output[index][key][0];
            }

            if (!choices.includes(output[index][key]) && default_category) {
              output[index][key] = default_category;
            }

            if (output[index][key].includes(":")) {
              output[index][key] = output[index][key].split(":")[0];
            }
          }
        }

        if (output_value_only) {
          output[index] = Object.values(output[index]);
          if (output[index].length === 1) {
            output[index] = output[index][0];
          }
        }
      }

      return list_input ? output : output[0];
    } catch (e: any) {
      lastErrorMessage = `\n\nPrevious attempt failed:\n${e.message}`;
      console.error("strict_output attempt failed:", e.message);
    }
  }

  throw new Error(`strict_output failed after ${num_tries} attempts.\n${lastErrorMessage}`);
}
