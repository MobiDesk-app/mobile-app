import { z } from "zod";

// Mirrors agent/src/rtc/fileProtocol.ts. Requests are outbound (plain type,
// we control what we send); responses are inbound off the data channel, so
// they're the real trust boundary here and get schema-validated.

export type FileRequest =
  | { type: "list"; requestId: string; path: string | null }
  | { type: "download"; requestId: string; path: string }
  | { type: "cancel-download"; requestId: string };

const fileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  size: z.number(),
  modifiedAt: z.string(),
});
export type FileEntry = z.infer<typeof fileEntrySchema>;

export const fileResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("list-result"),
    requestId: z.string(),
    path: z.string().nullable(),
    entries: z.array(fileEntrySchema),
  }),
  z.object({ type: z.literal("list-error"), requestId: z.string(), message: z.string() }),
  z.object({ type: z.literal("download-start"), requestId: z.string(), name: z.string(), size: z.number() }),
  z.object({ type: z.literal("download-error"), requestId: z.string(), message: z.string() }),
  z.object({ type: z.literal("download-complete"), requestId: z.string() }),
]);
export type FileResponse = z.infer<typeof fileResponseSchema>;
