import { EMAIL_RE, USERNAME_RE } from "./login";
import { MAX_PASSWORD_LEN, MIN_PASSWORD_LEN } from "./password";

export const MAX_DISPLAY_NAME_LEN = 60;

export type RegisterForm = {
  username: string;
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
};

export type RegisterErrors = Partial<Record<keyof RegisterForm, string>>;

/** Same rules and wording as the web's /register. `pwned` is the breach check's verdict (null = unknown). */
export function validateRegisterForm(form: RegisterForm, pwned: boolean | null, takenEmail = ""): RegisterErrors {
  const errors: RegisterErrors = {};
  const username = form.username.trim().toLowerCase();
  const email = form.email.trim().toLowerCase();

  if (!username) errors.username = "Choose a username.";
  else if (!USERNAME_RE.test(username)) errors.username = "3–30 characters: lowercase letters, numbers, underscore.";

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  else if (takenEmail && email === takenEmail)
    errors.email = "This email is already registered. Sign in or reset your password.";

  if (form.displayName.trim().length > MAX_DISPLAY_NAME_LEN)
    errors.displayName = `Display name must be at most ${MAX_DISPLAY_NAME_LEN} characters.`;

  if (!form.password) errors.password = `Password is required (at least ${MIN_PASSWORD_LEN} characters).`;
  else if (form.password.length < MIN_PASSWORD_LEN)
    errors.password = `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  else if (form.password.length > MAX_PASSWORD_LEN)
    errors.password = `Password must be at most ${MAX_PASSWORD_LEN} characters.`;
  else if (pwned === true)
    errors.password = "This password has appeared in a data breach. Please choose a different one.";

  if (!form.confirmPassword) errors.confirmPassword = "Repeat your password.";
  else if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match.";

  if (!form.acceptTerms) errors.acceptTerms = "You must accept the Terms and Privacy Policy.";
  return errors;
}
