import { prisma } from "../db";
import { startSessionFor, normalizeHandle } from "./session";
import { hashPassword, checkPassword, normalizeEmail, isEmailShaped } from "./password";
import { track } from "../engine/analytics";

/**
 * Registration.
 *
 * Every player now creates a real account before entering: a name, an address and
 * a password. There are no anonymous accounts, so progress belongs to a person
 * from the very first chest rather than to one browser's cookie.
 *
 * Errors come back per field, because a form that says only "invalid" makes the
 * player guess which of four things is wrong.
 */

export type FieldError =
  | "HANDLE_TOO_SHORT"
  | "HANDLE_TOO_LONG"
  | "HANDLE_TAKEN"
  | "EMAIL_INVALID"
  | "EMAIL_TAKEN"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_COMMON"
  | "PASSWORD_MISMATCH";

export interface RegisterInput {
  handle: string;
  email: string;
  password: string;
  passwordConfirm: string;
  locale: string;
}

export type RegisterResult =
  | { ok: true; handle: string }
  | { ok: false; errors: Partial<Record<"handle" | "email" | "password" | "passwordConfirm", FieldError>> };

const HANDLE_MIN = 3;
const HANDLE_MAX = 18;

export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  const handle = normalizeHandle(input.handle);
  const email = normalizeEmail(input.email);
  const errors: Partial<Record<"handle" | "email" | "password" | "passwordConfirm", FieldError>> = {};

  if (handle.length < HANDLE_MIN) errors.handle = "HANDLE_TOO_SHORT";
  else if (handle.length > HANDLE_MAX) errors.handle = "HANDLE_TOO_LONG";

  if (!isEmailShaped(email)) errors.email = "EMAIL_INVALID";

  const strength = checkPassword(input.password);
  if (!strength.ok) {
    errors.password =
      strength.reason === "TOO_LONG"
        ? "PASSWORD_TOO_LONG"
        : strength.reason === "TOO_COMMON"
          ? "PASSWORD_TOO_COMMON"
          : "PASSWORD_TOO_SHORT";
  }

  // Confirmed server-side too: the browser is not the authority on anything here.
  if (input.password !== input.passwordConfirm) errors.passwordConfirm = "PASSWORD_MISMATCH";

  // Uniqueness is only worth a query once the shape is right.
  if (!errors.handle) {
    const taken = await prisma.user.findUnique({ where: { handle } });
    if (taken) errors.handle = "HANDLE_TAKEN";
  }
  if (!errors.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) errors.email = "EMAIL_TAKEN";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        handle,
        email,
        passwordHash,
        locale: input.locale === "fr" ? "fr" : "en",
        claimedAt: new Date(),
      },
    });
  } catch (error) {
    // Two people submitting the same name in the same instant: the database is
    // the referee, not the check above.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const target = String((error as { meta?: { target?: string[] } }).meta?.target ?? "");
      return {
        ok: false,
        errors: target.includes("email") ? { email: "EMAIL_TAKEN" } : { handle: "HANDLE_TAKEN" },
      };
    }
    throw error;
  }

  // A new cat starts bare, at the first chamber. The Descent creates its own
  // profile on the first read, so registration has nothing left to hand out.
  await startSessionFor(user.id);
  await track("account.registered", user.id, { locale: user.locale });

  return { ok: true, handle: user.handle };
}
