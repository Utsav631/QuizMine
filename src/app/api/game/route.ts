import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/nextauth";
import { quizCreationSchema } from "@/schemas/forms/quiz";
import { NextResponse } from "next/server";
import { z } from "zod";
import axios from "axios";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be logged in to create a game." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { topic, type, amount } = quizCreationSchema.parse(body);

    // ✅ Validate topic (prevent empty topic errors)
    if (!topic || topic.trim() === "") {
      return NextResponse.json(
        { error: "Topic is required." },
        { status: 400 }
      );
    }

    const game = await prisma.game.create({
      data: {
        gameType: type,
        timeStarted: new Date(),
        userId: session.user.id,
        topic,
      },
    });

    await prisma.topic_count.upsert({
      where: { topic },
      create: { topic, count: 1 },
      update: { count: { increment: 1 } },
    });

    // ✅ Ensure API_URL is set
    if (!process.env.API_URL) {
      return NextResponse.json(
        { error: "API_URL is not set in environment variables." },
        { status: 500 }
      );
    }

    const { data } = await axios.post(
      `${process.env.API_URL}/api/questions`,
      { amount, topic, type }
    );

    if (type === "mcq") {
      const manyData = data.questions.map((question: any) => {
        const options = [
          question.option1,
          question.option2,
          question.option3,
          question.answer,
        ].sort(() => Math.random() - 0.5);
        return {
          question: question.question,
          answer: question.answer,
          options: JSON.stringify(options),
          gameId: game.id,
          questionType: "mcq",
        };
      });

      await prisma.question.createMany({ data: manyData });
    } else if (type === "open_ended") {
      await prisma.question.createMany({
        data: data.questions.map((question: any) => ({
          question: question.question,
          answer: question.answer,
          gameId: game.id,
          questionType: "open_ended",
        })),
      });
    }

    return NextResponse.json({ gameId: game.id }, { status: 200 });

  } catch (error) {
    console.error(error); // ✅ Log actual error for debugging
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be logged in to view a game." },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const gameId = url.searchParams.get("gameId");
    if (!gameId) {
      return NextResponse.json(
        { error: "You must provide a game id." },
        { status: 400 }
      );
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { questions: true },
    });

    if (!game) {
      return NextResponse.json(
        { error: "Game not found." },
        { status: 404 }
      );
    }

    // ✅ Correct status code
    return NextResponse.json({ game }, { status: 200 });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
