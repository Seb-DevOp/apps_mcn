import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail, withUser } from "@/lib/api";
import { normalizeHandle } from "@/lib/auth";

const PatchSchema = z.object({
  locale: z.enum(["en", "fr"]).optional(),
  handle: z.string().max(40).optional(),
});

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const body = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const data: { locale?: string; handle?: string } = {};
    if (body.data.locale) data.locale = body.data.locale;

    if (body.data.handle !== undefined) {
      const handle = normalizeHandle(body.data.handle);
      if (handle.length < 3) return fail("HANDLE_TOO_SHORT", 400);
      const taken = await prisma.user.findFirst({
        where: { handle, NOT: { id: user.id } },
      });
      if (taken) return fail("HANDLE_TAKEN", 409);
      data.handle = handle;
    }

    if (Object.keys(data).length === 0) return ok({});
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return ok({ handle: updated.handle, locale: updated.locale });
  });
}
