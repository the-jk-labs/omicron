import { ApiError, NetworkError } from "@/lib/api/client";

/** A message for the person using the app, whatever failed. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many requests. Wait a moment and try again.";
    return error.message;
  }
  if (error instanceof NetworkError || error instanceof TypeError)
    return "Couldn't reach the server. Check your connection.";
  return error instanceof Error ? error.message : "Something went wrong.";
}
