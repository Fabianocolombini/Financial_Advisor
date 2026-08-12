import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe um email válido e uma senha com pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "Já existe uma conta com este email." }, { status: 409 });
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
  } else {
    await prisma.user.create({
      data: { email, passwordHash },
    });
  }

  return NextResponse.json({ ok: true });
}
